from fastapi import FastAPI

from app.routers import auth as auth_router
from app.routers import catalogos as catalogos_router
from app.routers import reservas as reservas_router

app = FastAPI(title="Reserva de Puestos")
app.include_router(auth_router.router)
app.include_router(catalogos_router.router)
app.include_router(reservas_router.router)
