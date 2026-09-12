from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin, require_staff
from app.db import get_db
from app.models import Departamento, Puesto, Reserva, Servicio, Usuario
from app.schemas import (DepartamentoCreate, DepartamentoOut, PuestoActivo,
                         PuestoCreate, PuestoLote, PuestoOut, ServicioCreate,
                         ServicioOut, UsuarioCreate, UsuarioOut, UsuarioUpdate)

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


@router.put("/servicios/{servicio_id}", response_model=ServicioOut, dependencies=[Depends(require_admin)])
def update_servicio(servicio_id: int, data: ServicioCreate, db: Session = Depends(get_db)):
    obj = db.get(Servicio, servicio_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servicio no existe")
    dup = db.query(Servicio).filter(Servicio.nombre == data.nombre, Servicio.id != obj.id).first()
    if dup:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Servicio ya existe")
    obj.nombre = data.nombre
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/servicios/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_servicio(servicio_id: int, db: Session = Depends(get_db)):
    obj = db.get(Servicio, servicio_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servicio no existe")
    dep_ids = [d.id for d in db.query(Departamento).filter_by(servicio_id=obj.id).all()]
    if dep_ids:
        db.query(Reserva).filter(Reserva.departamento_id.in_(dep_ids)).delete(synchronize_session=False)
        db.query(Departamento).filter(Departamento.id.in_(dep_ids)).delete(synchronize_session=False)
    db.query(Reserva).filter_by(servicio_id=obj.id).delete(synchronize_session=False)
    db.delete(obj); db.commit()
    return None


@router.get("/departamentos", response_model=list[DepartamentoOut], dependencies=[Depends(require_staff)])
def list_departamentos(db: Session = Depends(get_db)):
    return db.query(Departamento).order_by(Departamento.nombre).all()


@router.post("/departamentos", response_model=DepartamentoOut, dependencies=[Depends(require_admin)])
def create_departamento(data: DepartamentoCreate, db: Session = Depends(get_db)):
    if data.servicio_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El departamento debe pertenecer a un servicio")
    if not db.get(Servicio, data.servicio_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servicio no existe")
    if db.query(Departamento).filter_by(nombre=data.nombre).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Departamento ya existe")
    obj = Departamento(nombre=data.nombre, servicio_id=data.servicio_id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.put("/departamentos/{departamento_id}", response_model=DepartamentoOut, dependencies=[Depends(require_admin)])
def update_departamento(departamento_id: int, data: DepartamentoCreate, db: Session = Depends(get_db)):
    obj = db.get(Departamento, departamento_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departamento no existe")
    dup = db.query(Departamento).filter(Departamento.nombre == data.nombre, Departamento.id != obj.id).first()
    if dup:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Departamento ya existe")
    obj.nombre = data.nombre
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/departamentos/{departamento_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_departamento(departamento_id: int, db: Session = Depends(get_db)):
    obj = db.get(Departamento, departamento_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departamento no existe")
    db.query(Reserva).filter_by(departamento_id=obj.id).delete()
    db.delete(obj); db.commit()
    return None


@router.get("/puestos", response_model=list[PuestoOut])
def list_puestos(db: Session = Depends(get_db), _=Depends(require_staff)):
    return db.query(Puesto).order_by(Puesto.codigo).all()


@router.patch("/puestos/{puesto_id}", response_model=PuestoOut, dependencies=[Depends(require_admin)])
def set_puesto_activo(puesto_id: int, data: PuestoActivo, db: Session = Depends(get_db)):
    obj = db.get(Puesto, puesto_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    obj.activo = data.activo
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/puestos/{puesto_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_puesto(puesto_id: int, db: Session = Depends(get_db)):
    obj = db.get(Puesto, puesto_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    if db.query(Reserva).filter_by(puesto_id=obj.id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede eliminar: tiene reservas asociadas")
    db.delete(obj); db.commit()
    return None


@router.delete("/zonas", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_zona(planta: int, zona: str, db: Session = Depends(get_db)):
    zona = (zona or "").strip().upper()
    ids = [p.id for p in db.query(Puesto).filter_by(planta=planta, zona=zona).all()]
    if not ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zona no existe")
    db.query(Reserva).filter(Reserva.puesto_id.in_(ids)).delete(synchronize_session=False)
    db.query(Puesto).filter(Puesto.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return None


@router.delete("/plantas/{planta}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_planta(planta: int, db: Session = Depends(get_db)):
    ids = [p.id for p in db.query(Puesto).filter_by(planta=planta).all()]
    if not ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Planta no existe")
    db.query(Reserva).filter(Reserva.puesto_id.in_(ids)).delete(synchronize_session=False)
    db.query(Puesto).filter(Puesto.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return None


def _siguiente_posicion(db: Session, planta: int, zona: str, fila: int, lado: int) -> int:
    mx = db.query(func.max(Puesto.posicion)).filter_by(
        planta=planta, zona=zona, fila=fila, lado=lado).scalar()
    return (mx or 0) + 1


def _validar_ubicacion(planta: int, zona: str, fila: int, lado: int) -> str:
    zona = (zona or "").strip().upper()
    if not zona or planta < 0 or fila < 1 or lado not in (1, 2):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datos de puesto no válidos")
    return zona


@router.post("/puestos", response_model=PuestoOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_puesto(data: PuestoCreate, db: Session = Depends(get_db)):
    zona = _validar_ubicacion(data.planta, data.zona, data.fila, data.lado)
    pos = data.posicion or _siguiente_posicion(db, data.planta, zona, data.fila, data.lado)
    codigo = f"P{data.planta}-{zona}-F{data.fila}-L{data.lado}-{pos}"
    if db.query(Puesto).filter_by(codigo=codigo).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Puesto ya existe")
    obj = Puesto(codigo=codigo, planta=data.planta, zona=zona,
                 fila=data.fila, lado=data.lado, posicion=pos)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.post("/puestos/lote", response_model=list[PuestoOut], status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_puestos_lote(data: PuestoLote, db: Session = Depends(get_db)):
    if set(data.lados) - {1, 2} or any(n < 0 for n in data.lados.values()) or sum(data.lados.values()) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datos de lote no válidos")
    zona = _validar_ubicacion(data.planta, data.zona, data.fila, 1)
    creados = []
    for lado in (1, 2):
        for _ in range(data.lados.get(lado, 0)):
            for _ in range(2):  # cada despacho = 2 posiciones
                pos = _siguiente_posicion(db, data.planta, zona, data.fila, lado)
                codigo = f"P{data.planta}-{zona}-F{data.fila}-L{lado}-{pos}"
                if db.query(Puesto).filter_by(codigo=codigo).first():
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Puesto ya existe: {codigo}")
                obj = Puesto(codigo=codigo, planta=data.planta, zona=zona,
                             fila=data.fila, lado=lado, posicion=pos)
                db.add(obj)
                db.flush()
                creados.append(obj)
    db.commit()
    for obj in creados:
        db.refresh(obj)
    return creados


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


@router.put("/usuarios/{usuario_id}", response_model=UsuarioOut, dependencies=[Depends(require_admin)])
def update_usuario(usuario_id: int, data: UsuarioUpdate, db: Session = Depends(get_db)):
    obj = db.get(Usuario, usuario_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no existe")
    if data.rol is not None and data.rol not in ("admin", "staff"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rol no válido")
    if data.nombre is not None:
        obj.nombre = data.nombre
    if data.rol is not None:
        obj.rol = data.rol
    if data.password:
        obj.password_hash = hash_password(data.password)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_usuario(usuario_id: int, db: Session = Depends(get_db), admin: Usuario = Depends(require_admin)):
    obj = db.get(Usuario, usuario_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no existe")
    if obj.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes eliminar tu propio usuario")
    if db.query(Reserva).filter_by(usuario_id=obj.id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede eliminar: tiene reservas asociadas")
    db.delete(obj); db.commit()
    return None
