from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import auth as auth_router
from app.routers import catalogos as catalogos_router
from app.routers import historico as historico_router
from app.routers import reservas as reservas_router

app = FastAPI(title="Reserva de Puestos")
app.include_router(auth_router.router)
app.include_router(catalogos_router.router)
app.include_router(reservas_router.router)
app.include_router(historico_router.router)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
