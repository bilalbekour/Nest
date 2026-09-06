from fastapi import FastAPI

from app.routers import auth as auth_router

app = FastAPI(title="Reserva de Puestos")
app.include_router(auth_router.router)
