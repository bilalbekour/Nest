import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import auth as auth_router
from app.routers import ajustes as ajustes_router
from app.routers import catalogos as catalogos_router
from app.routers import historico as historico_router
from app.routers import reservas as reservas_router


def _bucle_backup():
    import time
    from datetime import datetime

    from app.backup import snapshot

    hecho = None
    while True:
        ahora = datetime.now()
        hoy = ahora.date().isoformat()
        if ahora.hour >= 3 and hecho != hoy:
            try:
                snapshot("diaria")
                hecho = hoy
            except Exception:
                pass
        time.sleep(1800)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.backup import snapshot
        snapshot("arranque")
    except Exception:
        pass
    threading.Thread(target=_bucle_backup, daemon=True).start()
    yield


app = FastAPI(title="Reserva de Puestos", lifespan=lifespan)
app.include_router(auth_router.router)
app.include_router(ajustes_router.router)
app.include_router(catalogos_router.router)
app.include_router(reservas_router.router)
app.include_router(historico_router.router)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
