"""
FastAPI сервер - REST API для управления квестом
"""
import os
import shutil
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import asyncio
import json

from database import init_db, get_db, Device, Sound, Scenario, Settings
from queen_driver import QueenBusDevice
from scenario_engine import ScenarioEngine

# Глобальные объекты
queen = QueenBusDevice()
engine: Optional[ScenarioEngine] = None
ws_clients: List[WebSocket] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    # Startup
    init_db()
    os.makedirs("sounds", exist_ok=True)
    engine = ScenarioEngine(queen, get_db)

    # Подключение к Arduino
    try:
        db = next(get_db())
        port_setting = db.query(Settings).filter(Settings.key == "rs485_port").first()
        baud_setting = db.query(Settings).filter(Settings.key == "rs485_baudrate").first()
        id_setting = db.query(Settings).filter(Settings.key == "rs485_device_id").first()

        if port_setting:
            queen.port = port_setting.value
        if baud_setting:
            queen.baudrate = int(baud_setting.value)
        if id_setting:
            queen.device_id = int(id_setting.value)

        if queen.connect():
            queen.start_polling(interval=0.1)
            queen.on_input_change = lambda inputs: asyncio.create_task(broadcast_state())
    except Exception as e:
        print(f"Arduino connection failed: {e}")

    # Запускаем фоновую рассылку состояния
    task = asyncio.create_task(state_broadcast_loop())

    yield

    # Shutdown
    task.cancel()
    queen.disconnect()


app = FastAPI(title="Quest Control System", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ===================== WEBSOCKET =====================

async def broadcast_state():
    """Разослать текущее состояние всем клиентам"""
    if not ws_clients:
        return
    state = get_current_state()
    msg = json.dumps({"type": "state", "data": state})
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except:
            dead.append(ws)
    for ws in dead:
        ws_clients.remove(ws)


async def state_broadcast_loop():
    """Периодически рассылаем состояние (раз в 200мс)"""
    while True:
        await asyncio.sleep(0.2)
        await broadcast_state()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        # Сразу отправляем текущее состояние
        await ws.send_text(json.dumps({"type": "state", "data": get_current_state()}))
        while True:
            data = await ws.receive_text()
            # Обработка команд через WebSocket
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_clients.remove(ws)


def get_current_state():
    """Текущее состояние всех пинов"""
    return {
        "connected": queen.connected,
        "inputs": queen.inputs,
        "outputs": queen.outputs,
        "pwm_power": queen.pwm_power,
        "pwm_strobo": queen.pwm_strobo,
        "analog": queen.analog,
        "running_scenarios": list(engine.running.keys()) if engine else []
    }


# ===================== ГЛАВНАЯ СТРАНИЦА =====================

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


# ===================== УСТРОЙСТВА =====================

class DeviceCreate(BaseModel):
    name: str
    type: str  # output | pwm | input | analog
    pin: int
    icon: str = "⚡"
    group: str = ""
    description: str = ""


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    pin: Optional[int] = None
    icon: Optional[str] = None
    group: Optional[str] = None
    description: Optional[str] = None


@app.get("/api/devices")
async def get_devices(db: Session = Depends(get_db)):
    return db.query(Device).all()


@app.post("/api/devices")
async def create_device(device: DeviceCreate, db: Session = Depends(get_db)):
    db_device = Device(**device.dict())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device


@app.put("/api/devices/{device_id}")
async def update_device(device_id: int, device: DeviceUpdate, db: Session = Depends(get_db)):
    db_device = db.query(Device).filter(Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    for key, value in device.dict(exclude_none=True).items():
        setattr(db_device, key, value)
    db.commit()
    db.refresh(db_device)
    return db_device


@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: int, db: Session = Depends(get_db)):
    db_device = db.query(Device).filter(Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(db_device)
    db.commit()
    return {"ok": True}


# ===================== УПРАВЛЕНИЕ ПИНАМИ =====================

class PinCommand(BaseModel):
    pin: int
    state: Optional[int] = None
    power: Optional[int] = None
    strobo: Optional[int] = 0


@app.post("/api/control/output")
async def control_output(cmd: PinCommand):
    """Управление цифровым выходом"""
    queen.set_output(cmd.pin, cmd.state or 0)
    return {"ok": True, "pin": cmd.pin, "state": cmd.state}


@app.post("/api/control/pwm")
async def control_pwm(cmd: PinCommand):
    """Управление PWM"""
    queen.set_pwm(cmd.pin, cmd.power or 0, cmd.strobo or 0)
    return {"ok": True, "pin": cmd.pin, "power": cmd.power, "strobo": cmd.strobo}


@app.get("/api/state")
async def get_state():
    """Текущее состояние"""
    return get_current_state()


# ===================== ЗВУКИ =====================

@app.get("/api/sounds")
async def get_sounds(db: Session = Depends(get_db)):
    return db.query(Sound).all()


@app.post("/api/sounds/upload")
async def upload_sound(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = file.filename
    filepath = f"sounds/{filename}"
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Определяем длительность
    duration = 0.0
    try:
        import pygame
        sound = pygame.mixer.Sound(filepath)
        duration = sound.get_length()
    except:
        pass

    name = os.path.splitext(filename)[0]
    db_sound = Sound(name=name, filename=filename, duration=duration)
    db.add(db_sound)
    db.commit()
    db.refresh(db_sound)
    return db_sound


@app.delete("/api/sounds/{sound_id}")
async def delete_sound(sound_id: int, db: Session = Depends(get_db)):
    db_sound = db.query(Sound).filter(Sound.id == sound_id).first()
    if not db_sound:
        raise HTTPException(status_code=404, detail="Sound not found")
    try:
        os.remove(f"sounds/{db_sound.filename}")
    except:
        pass
    db.delete(db_sound)
    db.commit()
    return {"ok": True}


@app.post("/api/sounds/{sound_id}/play")
async def play_sound(sound_id: int, db: Session = Depends(get_db)):
    db_sound = db.query(Sound).filter(Sound.id == sound_id).first()
    if not db_sound:
        raise HTTPException(status_code=404, detail="Sound not found")
    if engine:
        engine.play_sound(db_sound.filename)
    return {"ok": True}


@app.post("/api/sounds/stop")
async def stop_all_sounds():
    if engine:
        engine.stop_sound()
    return {"ok": True}


# ===================== СЦЕНАРИИ =====================

class ScenarioCreate(BaseModel):
    name: str
    description: str = ""
    actions: list = []


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    actions: Optional[list] = None


@app.get("/api/scenarios")
async def get_scenarios(db: Session = Depends(get_db)):
    scenarios = db.query(Scenario).all()
    result = []
    for s in scenarios:
        result.append({
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "actions": s.actions,
            "is_active": engine.is_running(s.id) if engine else False,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        })
    return result


@app.get("/api/scenarios/{scenario_id}")
async def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    s = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "actions": s.actions,
        "is_active": engine.is_running(s.id) if engine else False,
    }


@app.post("/api/scenarios")
async def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db)):
    from datetime import datetime
    db_scenario = Scenario(
        name=scenario.name,
        description=scenario.description,
        actions=scenario.actions,
        updated_at=datetime.utcnow()
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    return db_scenario


@app.put("/api/scenarios/{scenario_id}")
async def update_scenario(scenario_id: int, scenario: ScenarioUpdate, db: Session = Depends(get_db)):
    from datetime import datetime
    db_scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    for key, value in scenario.dict(exclude_none=True).items():
        setattr(db_scenario, key, value)
    db_scenario.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_scenario)
    return db_scenario


@app.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    db_scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if engine and engine.is_running(scenario_id):
        engine.stop_scenario(scenario_id)
    db.delete(db_scenario)
    db.commit()
    return {"ok": True}


@app.post("/api/scenarios/{scenario_id}/start")
async def start_scenario(scenario_id: int, db: Session = Depends(get_db)):
    db_scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if engine:
        engine.start_scenario(scenario_id, db_scenario.actions)
    await broadcast_state()
    return {"ok": True}


@app.post("/api/scenarios/{scenario_id}/stop")
async def stop_scenario(scenario_id: int):
    if engine:
        engine.stop_scenario(scenario_id)
    await broadcast_state()
    return {"ok": True}


@app.post("/api/scenarios/stop_all")
async def stop_all_scenarios():
    if engine:
        engine.stop_all()
    await broadcast_state()
    return {"ok": True}


# ===================== НАСТРОЙКИ =====================

class SettingUpdate(BaseModel):
    value: str


@app.get("/api/settings")
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).all()
    return {s.key: s.value for s in settings}


@app.put("/api/settings/{key}")
async def update_setting(key: str, setting: SettingUpdate, db: Session = Depends(get_db)):
    db_setting = db.query(Settings).filter(Settings.key == key).first()
    if db_setting:
        db_setting.value = setting.value
    else:
        db_setting = Settings(key=key, value=setting.value)
        db.add(db_setting)
    db.commit()
    return {"ok": True}


@app.post("/api/settings/reconnect")
async def reconnect_arduino(db: Session = Depends(get_db)):
    """Переподключиться к Arduino с новыми настройками"""
    queen.disconnect()
    settings = {s.key: s.value for s in db.query(Settings).all()}
    queen.port = settings.get("rs485_port", "/dev/serial0")
    queen.baudrate = int(settings.get("rs485_baudrate", "115200"))
    queen.device_id = int(settings.get("rs485_device_id", "16"))
    success = queen.connect()
    if success:
        queen.start_polling(0.1)
    return {"ok": success, "port": queen.port}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
