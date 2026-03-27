"""
Движок выполнения сценариев
Типы действий:
  - wait: задержка в мс
  - output: включить/выключить выход
  - pwm: установить PWM
  - sound: воспроизвести звук
  - wait_input: ждать сигнала от входа
  - stop_sound: остановить звук
  - run_scenario: запустить другой сценарий
"""
import asyncio
import time
from typing import Optional, Dict, Any, List
from threading import Thread, Event
import pygame


class ScenarioEngine:
    def __init__(self, queen_driver, db_getter):
        self.driver = queen_driver
        self.get_db = db_getter
        self.running: Dict[int, Thread] = {}
        self.stop_events: Dict[int, Event] = {}

        # Инициализируем pygame для звука
        pygame.mixer.init()
        self.current_sounds: Dict[str, pygame.mixer.Sound] = {}

    def start_scenario(self, scenario_id: int, actions: List[Dict]) -> bool:
        """Запустить сценарий в отдельном потоке"""
        if scenario_id in self.running:
            self.stop_scenario(scenario_id)

        stop_event = Event()
        self.stop_events[scenario_id] = stop_event
        thread = Thread(
            target=self._run,
            args=(scenario_id, actions, stop_event),
            daemon=True
        )
        self.running[scenario_id] = thread
        thread.start()
        return True

    def stop_scenario(self, scenario_id: int):
        """Остановить сценарий"""
        if scenario_id in self.stop_events:
            self.stop_events[scenario_id].set()
        if scenario_id in self.running:
            self.running[scenario_id].join(timeout=2.0)
            del self.running[scenario_id]
            del self.stop_events[scenario_id]

    def stop_all(self):
        """Остановить все сценарии"""
        for sid in list(self.running.keys()):
            self.stop_scenario(sid)

    def is_running(self, scenario_id: int) -> bool:
        return scenario_id in self.running

    def _run(self, scenario_id: int, actions: List[Dict], stop_event: Event):
        """Основной цикл выполнения сценария"""
        try:
            for action in actions:
                if stop_event.is_set():
                    break
                self._execute_action(action, stop_event)
        finally:
            # Убираем из списка запущенных
            if scenario_id in self.running:
                del self.running[scenario_id]
            if scenario_id in self.stop_events:
                del self.stop_events[scenario_id]

    def _execute_action(self, action: Dict[str, Any], stop_event: Event):
        """Выполнить одно действие"""
        action_type = action.get("type")

        if action_type == "wait":
            ms = action.get("ms", 1000)
            stop_event.wait(timeout=ms / 1000.0)

        elif action_type == "output":
            pin = action.get("pin", 0)
            state = action.get("state", 0)
            self.driver.set_output(pin, state)

        elif action_type == "pwm":
            pin = action.get("pin", 0)
            power = action.get("power", 0)
            strobo = action.get("strobo", 0)
            fade_ms = action.get("fade", 0)

            if fade_ms > 0:
                # Плавное изменение яркости
                current = self.driver.pwm_power[pin]
                steps = min(50, fade_ms // 20)
                if steps > 0:
                    step_val = (power - current) / steps
                    step_time = fade_ms / steps / 1000.0
                    for i in range(steps):
                        if stop_event.is_set():
                            break
                        self.driver.set_pwm(pin, int(current + step_val * i), strobo)
                        time.sleep(step_time)
            self.driver.set_pwm(pin, power, strobo)

        elif action_type == "sound":
            filename = action.get("file", "")
            volume = action.get("volume", 100) / 100.0
            loop = action.get("loop", False)
            try:
                sound = pygame.mixer.Sound(f"sounds/{filename}")
                sound.set_volume(volume)
                loops = -1 if loop else 0
                sound.play(loops=loops)
                self.current_sounds[filename] = sound
            except Exception as e:
                print(f"Sound error: {e}")

        elif action_type == "stop_sound":
            filename = action.get("file", "")
            if filename:
                if filename in self.current_sounds:
                    self.current_sounds[filename].stop()
                    del self.current_sounds[filename]
            else:
                pygame.mixer.stop()
                self.current_sounds.clear()

        elif action_type == "wait_input":
            pin = action.get("pin", 0)
            expected = action.get("state", 1)
            timeout_ms = action.get("timeout", 30000)
            deadline = time.time() + timeout_ms / 1000.0

            while time.time() < deadline and not stop_event.is_set():
                if self.driver.get_input(pin) == expected:
                    break
                time.sleep(0.05)

        elif action_type == "repeat":
            # Повторить блок N раз
            count = action.get("count", 1)
            sub_actions = action.get("actions", [])
            for _ in range(count):
                if stop_event.is_set():
                    break
                for sub in sub_actions:
                    if stop_event.is_set():
                        break
                    self._execute_action(sub, stop_event)

        elif action_type == "loop":
            # Бесконечный цикл пока не остановят
            sub_actions = action.get("actions", [])
            while not stop_event.is_set():
                for sub in sub_actions:
                    if stop_event.is_set():
                        break
                    self._execute_action(sub, stop_event)

    def play_sound(self, filename: str, volume: float = 1.0):
        """Воспроизвести звук напрямую"""
        try:
            sound = pygame.mixer.Sound(f"sounds/{filename}")
            sound.set_volume(volume)
            sound.play()
        except Exception as e:
            print(f"Sound error: {e}")

    def stop_sound(self, filename: str = ""):
        """Остановить звук"""
        if filename and filename in self.current_sounds:
            self.current_sounds[filename].stop()
        else:
            pygame.mixer.stop()
