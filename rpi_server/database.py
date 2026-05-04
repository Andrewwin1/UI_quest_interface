"""
База данных - модели и схема
"""
from sqlalchemy import create_engine, Column, Integer, String, JSON, Boolean, DateTime, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./quest.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Device(Base):

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # Название: "Дверной замок", "Свет в коридоре"
    type = Column(String, nullable=False)  # output | pwm | input | analog
    pin = Column(Integer, nullable=False)  # 0-14
    icon = Column(String, default="⚡")  # Иконка для интерфейса
    group = Column(String, default="")  # Группа устройств
    description = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Sound(Base):
    """Звуковой файл"""
    __tablename__ = "sounds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)  # имя файла в /sounds/
    duration = Column(Float, default=0)  # секунды
    created_at = Column(DateTime, default=datetime.utcnow)


class Scenario(Base):
    """Сценарий"""
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    actions = Column(JSON, default=[])  # Список действий
    is_active = Column(Boolean, default=False)  # Сейчас выполняется?
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Settings(Base):
    """Настройки системы"""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(String, nullable=False)


def init_db():
    Base.metadata.create_all(bind=engine)
    # Дефолтные настройки
    db = SessionLocal()
    try:
        defaults = [
            ("rs485_port", "/dev/serial0"),
            ("rs485_baudrate", "115200"),
            ("rs485_device_id", "16"),
            ("sound_volume", "80"),
        ]
        for key, value in defaults:
            if not db.query(Settings).filter(Settings.key == key).first():
                db.add(Settings(key=key, value=value))
        db.commit()
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
