from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_staff
from app.db import get_db
from app.models import Reserva
from app.schemas import ReservaOut

router = APIRouter(prefix="/api/historico", tags=["historico"])


@router.get("", response_model=list[ReservaOut])
def historico(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    servicio_id: int | None = None,
    departamento_id: int | None = None,
    puesto_id: int | None = None,
    tipo: str | None = Query(None, pattern="^(agente|staff|visita)$"),
    db: Session = Depends(get_db),
    _=Depends(require_staff),
):
    q = db.query(Reserva).options(
        joinedload(Reserva.puesto), joinedload(Reserva.servicio),
        joinedload(Reserva.departamento), joinedload(Reserva.usuario),
    )
    if fecha_desde:
        q = q.filter(Reserva.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Reserva.fecha <= fecha_hasta)
    if servicio_id:
        q = q.filter(Reserva.servicio_id == servicio_id)
    if departamento_id:
        q = q.filter(Reserva.departamento_id == departamento_id)
    if puesto_id:
        q = q.filter(Reserva.puesto_id == puesto_id)
    if tipo:
        q = q.filter(Reserva.tipo == tipo)
    return q.order_by(Reserva.fecha.desc(), Reserva.hora_inicio).all()
