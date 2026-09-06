from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin, require_staff
from app.db import get_db
from app.models import Departamento, Puesto, Servicio, Usuario
from app.schemas import (DepartamentoCreate, DepartamentoOut, PuestoOut,
                         ServicioCreate, ServicioOut, UsuarioCreate, UsuarioOut)

router = APIRouter(prefix="/api", tags=["catalogos"])


@router.get("/servicios", response_model=list[ServicioOut], dependencies=[Depends(require_staff)])
def list_servicios(db: Session = Depends(get_db)):
    return db.query(Servicio).order_by(Servicio.nombre).all()


@router.post("/servicios", response_model=ServicioOut, dependencies=[Depends(require_admin)])
def create_servicio(data: ServicioCreate, db: Session = Depends(get_db)):
    if db.query(Servicio).filter_by(nombre=data.nombre).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Servicio ya existe")
    obj = Servicio(nombre=data.nombre)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.get("/departamentos", response_model=list[DepartamentoOut], dependencies=[Depends(require_staff)])
def list_departamentos(db: Session = Depends(get_db)):
    return db.query(Departamento).order_by(Departamento.nombre).all()


@router.post("/departamentos", response_model=DepartamentoOut, dependencies=[Depends(require_admin)])
def create_departamento(data: DepartamentoCreate, db: Session = Depends(get_db)):
    if db.query(Departamento).filter_by(nombre=data.nombre).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Departamento ya existe")
    obj = Departamento(nombre=data.nombre)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.get("/puestos", response_model=list[PuestoOut], dependencies=[Depends(require_staff)])
def list_puestos(db: Session = Depends(get_db)):
    return db.query(Puesto).filter_by(activo=True).order_by(Puesto.codigo).all()


@router.get("/usuarios", response_model=list[UsuarioOut], dependencies=[Depends(require_admin)])
def list_usuarios(db: Session = Depends(get_db)):
    return db.query(Usuario).all()


@router.post("/usuarios", response_model=UsuarioOut, dependencies=[Depends(require_admin)])
def create_usuario(data: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(Usuario).filter_by(username=data.username).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Usuario ya existe")
    obj = Usuario(username=data.username, password_hash=hash_password(data.password),
                  nombre=data.nombre, rol=data.rol)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
