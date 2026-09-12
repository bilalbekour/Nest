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


class UsuarioUpdate(BaseModel):
    nombre: str | None = None
    rol: str | None = None
    password: str | None = None


class ServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    color: str | None = None


class ServicioCreate(BaseModel):
    nombre: str
    color: str


class DepartamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    servicio_id: int | None = None
    color: str | None = None


class DepartamentoCreate(BaseModel):
    nombre: str
    servicio_id: int | None = None
    color: str


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


class PuestoActivo(BaseModel):
    activo: bool


class PuestoCreate(BaseModel):
    planta: int
    zona: str
    fila: int
    lado: int
    posicion: int | None = None


class PuestoLote(BaseModel):
    planta: int
    zona: str
    fila: int
    lados: dict[int, int]


class OrdenZonasIn(BaseModel):
    orden: dict[str, list[str]]


class ReservaCreate(BaseModel):
    puesto_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str
    servicio_id: int
    departamento_id: int
    comentario: str | None = None


class ReservaLote(BaseModel):
    puesto_ids: list[int]
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str
    servicio_id: int
    departamento_id: int
    comentario: str | None = None


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
    comentario: str | None = None
    creado_en: datetime
