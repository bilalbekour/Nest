from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nombre: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str] = mapped_column(String(10), default="staff")


class Servicio(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)


class Ajuste(Base):
    __tablename__ = "ajustes"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[str] = mapped_column(Text, default="{}")


class Departamento(Base):
    __tablename__ = "departamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    servicio_id: Mapped[int | None] = mapped_column(ForeignKey("servicios.id"), nullable=True)

    servicio: Mapped["Servicio | None"] = relationship(lazy="joined")


class Puesto(Base):
    __tablename__ = "puestos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    planta: Mapped[int] = mapped_column(Integer)
    zona: Mapped[str] = mapped_column(String(4))
    fila: Mapped[int] = mapped_column(Integer)
    lado: Mapped[int] = mapped_column(Integer)
    posicion: Mapped[int] = mapped_column(Integer)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(primary_key=True)
    puesto_id: Mapped[int] = mapped_column(ForeignKey("puestos.id"), index=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    tipo: Mapped[str] = mapped_column(String(10))
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"))
    departamento_id: Mapped[int] = mapped_column(ForeignKey("departamentos.id"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    cancelada: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    puesto: Mapped["Puesto"] = relationship()
    servicio: Mapped["Servicio"] = relationship()
    departamento: Mapped["Departamento"] = relationship()
    usuario: Mapped["Usuario"] = relationship()
