from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_staff
from app.db import get_db
from app.models import Reserva
from app.schemas import ReservaOut

router = APIRouter(prefix="/api/historico", tags=["historico"])


def _filtrar(db: Session, fecha_desde=None, fecha_hasta=None, servicio_id=None,
             departamento_id=None, puesto_id=None, tipo=None):
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
    return q


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
    q = _filtrar(db, fecha_desde, fecha_hasta, servicio_id, departamento_id, puesto_id, tipo)
    return q.order_by(Reserva.fecha.desc(), Reserva.hora_inicio).all()


@router.get("/export", dependencies=[Depends(require_staff)])
def export_historico(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    servicio_id: int | None = None,
    departamento_id: int | None = None,
    puesto_id: int | None = None,
    tipo: str | None = Query(None, pattern="^(agente|staff|visita)$"),
    db: Session = Depends(get_db),
):
    import csv
    import io

    from fastapi.responses import PlainTextResponse

    filas = _filtrar(db, fecha_desde, fecha_hasta, servicio_id,
                     departamento_id, puesto_id, tipo).order_by(
        Reserva.fecha.desc(), Reserva.hora_inicio).all()
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")

    def _celda(v):
        s = str(v or "")
        return "'" + s if s.startswith(("=", "+", "-", "@")) else s

    w.writerow(["fecha", "puesto", "planta", "zona", "desde", "hasta", "tipo",
                "servicio", "departamento", "reservado_por", "estado", "comentario"])
    for r in filas:
        w.writerow([_celda(r.fecha.isoformat()), _celda(r.puesto.codigo),
                    _celda(r.puesto.planta), _celda(r.puesto.zona),
                    _celda(r.hora_inicio.strftime("%H:%M")), _celda(r.hora_fin.strftime("%H:%M")),
                    _celda(r.tipo), _celda(r.servicio.nombre), _celda(r.departamento.nombre),
                    _celda(r.usuario.nombre), _celda("Cancelada" if r.cancelada else "Activa"),
                    _celda(r.comentario)])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=historico.csv"})
