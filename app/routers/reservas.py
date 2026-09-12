from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth import require_staff
from app.db import get_db
from app.models import Departamento, Puesto, Reserva, Servicio, Usuario
from app.schemas import ReservaCreate, ReservaLote, ReservaOut, ReservaRecurrente

router = APIRouter(prefix="/api", tags=["reservas"])

TIPOS = ("agente", "staff", "visita")


def _load(db: Session, reserva_id: int) -> Reserva:
    return db.query(Reserva).options(
        joinedload(Reserva.puesto), joinedload(Reserva.servicio),
        joinedload(Reserva.departamento), joinedload(Reserva.usuario),
    ).filter(Reserva.id == reserva_id).first()


def _reservas_activas(db: Session, puesto_id: int, fecha: date, h_ini, h_fin):
    return db.query(Reserva).filter(
        Reserva.puesto_id == puesto_id,
        Reserva.fecha == fecha,
        Reserva.cancelada.is_(False),
        Reserva.hora_inicio < h_fin,
        Reserva.hora_fin > h_ini,
    ).first()


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
    if data.tipo not in TIPOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo no válido")
    if not db.get(Puesto, data.puesto_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    _validar_combinacion(db, data.servicio_id, data.departamento_id)
    # ponytail: check-then-insert sin lock; para carga alta usar
    # SELECT ... FOR UPDATE o índice único parcial (puesto_id, fecha) WHERE NOT cancelada
    if _reservas_activas(db, data.puesto_id, data.fecha, data.hora_inicio, data.hora_fin):
        raise HTTPException(status.HTTP_409_CONFLICT, "El puesto ya está reservado en ese tramo")
    reserva = Reserva(**data.model_dump(), usuario_id=usuario.id)
    db.add(reserva); db.commit(); db.refresh(reserva)
    return _load(db, reserva.id)


def _validar_combinacion(db: Session, servicio_id: int, departamento_id: int) -> None:
    if not db.get(Servicio, servicio_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servicio no existe")
    dep = db.get(Departamento, departamento_id)
    if not dep:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Departamento no existe")
    if dep.servicio_id is not None and dep.servicio_id != servicio_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El departamento no pertenece a ese servicio")


@router.post("/reservas/lote", response_model=list[ReservaOut], status_code=status.HTTP_201_CREATED)
def create_reservas_lote(data: ReservaLote, db: Session = Depends(get_db), usuario=Depends(require_staff)):
    if data.hora_fin <= data.hora_inicio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "hora_fin debe ser mayor que hora_inicio")
    if data.tipo not in TIPOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo no válido")
    ids = list(dict.fromkeys(data.puesto_ids))
    if not ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin puestos")
    if not (data.comentario or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indica el motivo de la reserva")
    _validar_combinacion(db, data.servicio_id, data.departamento_id)
    puestos = db.query(Puesto).filter(Puesto.id.in_(ids)).all()
    if len(puestos) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Algún puesto no existe")
    inactivos = [p.codigo for p in puestos if not p.activo]
    if inactivos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Puestos deshabilitados: {', '.join(inactivos)}")
    ocupados = [p.codigo for p in puestos
                if _reservas_activas(db, p.id, data.fecha, data.hora_inicio, data.hora_fin)]
    if ocupados:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ocupados: {', '.join(ocupados)}")
    creadas = []
    for p in puestos:
        r = Reserva(puesto_id=p.id, fecha=data.fecha, hora_inicio=data.hora_inicio,
                    hora_fin=data.hora_fin, tipo=data.tipo, servicio_id=data.servicio_id,
                    departamento_id=data.departamento_id, comentario=data.comentario.strip(),
                    usuario_id=usuario.id)
        db.add(r)
        db.flush()
        creadas.append(r)
    db.commit()
    return [_load(db, r.id) for r in creadas]


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


def _con_relaciones(q):
    return q.options(joinedload(Reserva.puesto), joinedload(Reserva.servicio),
                     joinedload(Reserva.departamento), joinedload(Reserva.usuario))


@router.get("/mis-reservas", response_model=list[ReservaOut])
def mis_reservas(db: Session = Depends(get_db), usuario=Depends(require_staff)):
    hoy = date.today()
    return (_con_relaciones(db.query(Reserva))
            .filter(Reserva.usuario_id == usuario.id, Reserva.cancelada.is_(False),
                    Reserva.fecha >= hoy)
            .order_by(Reserva.fecha, Reserva.hora_inicio).all())


@router.get("/reservas/usuario/{usuario_id}", response_model=list[ReservaOut])
def reservas_de_usuario(usuario_id: int, desde: date | None = None,
                        db: Session = Depends(get_db), _=Depends(require_staff)):
    desde = desde or date.today()
    return (_con_relaciones(db.query(Reserva))
            .filter(Reserva.usuario_id == usuario_id, Reserva.cancelada.is_(False),
                    Reserva.fecha >= desde)
            .order_by(Reserva.fecha, Reserva.hora_inicio).all())


@router.post("/reservas/recurrente", response_model=list[ReservaOut], status_code=status.HTTP_201_CREATED)
def create_reserva_recurrente(data: ReservaRecurrente, db: Session = Depends(get_db),
                              usuario=Depends(require_staff)):
    if data.hora_fin <= data.hora_inicio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "hora_fin debe ser mayor que hora_inicio")
    if data.tipo not in TIPOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo no válido")
    if not 1 <= data.repeticiones <= 12:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Repeticiones entre 1 y 12")
    puesto = db.get(Puesto, data.puesto_id)
    if not puesto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    if not puesto.activo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Puesto deshabilitado")
    _validar_combinacion(db, data.servicio_id, data.departamento_id)
    fechas = [data.fecha + timedelta(weeks=i) for i in range(data.repeticiones)]
    ocupadas = [f.isoformat() for f in fechas
                if _reservas_activas(db, data.puesto_id, f, data.hora_inicio, data.hora_fin)]
    if ocupadas:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ocupado: {', '.join(ocupadas)}")
    creadas = []
    for f in fechas:
        r = Reserva(puesto_id=data.puesto_id, fecha=f, hora_inicio=data.hora_inicio,
                    hora_fin=data.hora_fin, tipo=data.tipo, servicio_id=data.servicio_id,
                    departamento_id=data.departamento_id,
                    comentario=(data.comentario or "").strip() or None,
                    usuario_id=usuario.id)
        db.add(r)
        db.flush()
        creadas.append(r)
    db.commit()
    return [_load(db, r.id) for r in creadas]


@router.get("/ocupacion")
def ocupacion(desde: date | None = None, hasta: date | None = None,
              db: Session = Depends(get_db), _=Depends(require_staff)):
    hoy = date.today()
    desde = desde or hoy.replace(day=1)
    hasta = hasta or hoy
    if hasta < desde:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rango no válido")
    filas = (db.query(Reserva.fecha, Reserva.puesto_id, Puesto.planta)
             .join(Puesto, Puesto.id == Reserva.puesto_id)
             .filter(Reserva.cancelada.is_(False),
                     Reserva.fecha >= desde, Reserva.fecha <= hasta).all())
    por_fecha: dict[str, set] = {}
    por_planta: dict[str, dict[str, set]] = {}
    for f, pid, planta in filas:
        k = f.isoformat()
        por_fecha.setdefault(k, set()).add(pid)
        por_planta.setdefault(k, {}).setdefault(str(planta), set()).add(pid)
    dias = [(desde + timedelta(days=i)).isoformat() for i in range((hasta - desde).days + 1)]
    return {k: {"total": len(por_fecha.get(k, ())),
                "plantas": {pl: len(s) for pl, s in por_planta.get(k, {}).items()}}
            for k in dias}
