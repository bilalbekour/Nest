import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_admin, require_staff
from app.backup import lista, snapshot
from app.db import get_db
from app.models import Ajuste, Puesto
from app.schemas import OrdenZonasIn

router = APIRouter(prefix="/api/ajustes", tags=["ajustes"])

CLAVE_ORDEN = "orden_zonas"


def _leer_orden(db: Session) -> dict:
    row = db.get(Ajuste, CLAVE_ORDEN)
    if not row:
        return {}
    try:
        return json.loads(row.valor)
    except (ValueError, TypeError):
        return {}


@router.get("/orden_zonas", dependencies=[Depends(require_staff)])
def get_orden_zonas(db: Session = Depends(get_db)):
    return _leer_orden(db)


@router.put("/orden_zonas", dependencies=[Depends(require_admin)])
def set_orden_zonas(data: OrdenZonasIn, db: Session = Depends(get_db)):
    zonas_reales: dict[str, set] = {}
    for (planta, zona) in db.query(Puesto.planta, Puesto.zona).distinct().all():
        zonas_reales.setdefault(str(planta), set()).add(zona)
    for planta, zonas in data.orden.items():
        if planta not in zonas_reales:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Planta sin puestos: {planta}")
        if set(zonas) != zonas_reales[planta] or len(zonas) != len(set(zonas)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"El orden debe incluir todas las zonas de la planta {planta} una vez")
    actual = _leer_orden(db)
    actual.update(data.orden)
    row = db.get(Ajuste, CLAVE_ORDEN)
    if row:
        row.valor = json.dumps(actual)
    else:
        db.add(Ajuste(clave=CLAVE_ORDEN, valor=json.dumps(actual)))
    db.commit()
    return actual


@router.post("/backup", dependencies=[Depends(require_admin)])
def crear_backup():
    try:
        return {"archivo": snapshot("manual")}
    except RuntimeError as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


@router.get("/backups", dependencies=[Depends(require_admin)])
def listar_backups():
    return lista()
