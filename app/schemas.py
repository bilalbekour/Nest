from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict


class LoginIn(BaseModel):
    username: str
    password: str


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nombre: str
    rol: str


class UsuarioCreate(BaseModel):
    username: str
    password: str
    nombre: str
    rol: str = "staff"


class ServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


class ServicioCreate(BaseModel):
    nombre: str


class DepartamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


class DepartamentoCreate(BaseModel):
    nombre: str


class PuestoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    planta: int
    zona: str
    fila: int
    lado: int
    posicion: int
    activo: bool


class ReservaCreate(BaseModel):
    puesto_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str
    servicio_id: int
    departamento_id: int


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    puesto: PuestoOut
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str
    servicio: ServicioOut
    departamento: DepartamentoOut
    usuario: UsuarioOut
    cancelada: bool
    creado_en: datetime
