from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin, require_staff
from app.db import get_db
from app.models import Departamento, Puesto, Reserva, Servicio, Usuario
from app.schemas import (DepartamentoCreate, DepartamentoOut, PuestoActivo,
                         PuestoOut, ServicioCreate, ServicioOut, UsuarioCreate,
                         UsuarioOut, UsuarioUpdate)

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
def list_puestos(todos: bool = False, db: Session = Depends(get_db), usuario: Usuario = Depends(require_staff)):
    if todos and usuario.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admin")
    q = db.query(Puesto).order_by(Puesto.codigo)
    if not todos:
        q = q.filter_by(activo=True)
    return q.all()


@router.patch("/puestos/{puesto_id}", response_model=PuestoOut, dependencies=[Depends(require_admin)])
def set_puesto_activo(puesto_id: int, data: PuestoActivo, db: Session = Depends(get_db)):
    obj = db.get(Puesto, puesto_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    obj.activo = data.activo
    db.commit(); db.refresh(obj)
    return obj


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
