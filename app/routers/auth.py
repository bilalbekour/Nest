from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_token, verify_password
from app.db import get_db
from app.models import Usuario
from app.schemas import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter_by(username=data.username).first()
    if not usuario or not verify_password(data.password, usuario.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    return {"token": create_token(usuario),
            "usuario": {"id": usuario.id, "username": usuario.username,
                        "nombre": usuario.nombre, "rol": usuario.rol,
                        "favorito_puesto_id": usuario.favorito_puesto_id}}
