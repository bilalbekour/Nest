from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth import require_staff
from app.db import get_db
from app.models import Puesto, Reserva
from app.schemas import ReservaCreate, ReservaOut

router = APIRouter(prefix="/api", tags=["reservas"])


def _load(db: Session, reserva_id: int) -> Reserva:
    return db.query(Reserva).options(
        joinedload(Reserva.puesto), joinedload(Reserva.servicio),
        joinedload(Reserva.departamento), joinedload(Reserva.usuario),
    ).filter(Reserva.id == reserva_id).first()


def _reservas_activas(db: Session, puesto_id: int, fecha: date, h_ini, h_fin, excluir_id=None):
    q = db.query(Reserva).filter(
        Reserva.puesto_id == puesto_id,
        Reserva.fecha == fecha,
        Reserva.cancelada.is_(False),
        Reserva.hora_inicio < h_fin,
        Reserva.hora_fin > h_ini,
    )
    if excluir_id:
        q = q.filter(Reserva.id != excluir_id)
    return q.first()


@router.get("/reservas", response_model=list[ReservaOut])
def list_reservas(fecha: date, db: Session = Depends(get_db), _=Depends(require_staff)):
    return (
        db.query(Reserva)
        .options(joinedload(Reserva.puesto), joinedload(Reserva.servicio),
                 joinedload(Reserva.departamento), joinedload(Reserva.usuario))
        .filter(Reserva.fecha == fecha, Reserva.cancelada.is_(False))
        .order_by(Reserva.puesto_id)
        .all()
    )


@router.post("/reservas", response_model=ReservaOut, status_code=status.HTTP_201_CREATED)
def create_reserva(data: ReservaCreate, db: Session = Depends(get_db), usuario=Depends(require_staff)):
    if data.hora_fin <= data.hora_inicio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "hora_fin debe ser mayor que hora_inicio")
    if not db.get(Puesto, data.puesto_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    if _reservas_activas(db, data.puesto_id, data.fecha, data.hora_inicio, data.hora_fin):
        raise HTTPException(status.HTTP_409_CONFLICT, "El puesto ya está reservado en ese tramo")
    reserva = Reserva(**data.model_dump(), usuario_id=usuario.id)
    db.add(reserva); db.commit(); db.refresh(reserva)
    return _load(db, reserva.id)


@router.post("/reservas/{reserva_id}/cancelar", response_model=ReservaOut)
def cancelar(reserva_id: int, db: Session = Depends(get_db), usuario=Depends(require_staff)):
    reserva = db.get(Reserva, reserva_id)
    if not reserva:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no existe")
    if usuario.rol != "admin" and reserva.usuario_id != usuario.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el autor (o admin) puede cancelar")
    reserva.cancelada = True
    db.commit()
    return _load(db, reserva.id)
