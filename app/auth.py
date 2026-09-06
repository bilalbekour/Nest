import hashlib
import hmac
import os
import time
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import SECRET_KEY
from app.db import get_db
from app.models import Usuario

ALGORITHM = "HS256"


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, _digest_hex = stored.split("$")
    return hmac.compare_digest(hash_password(password, bytes.fromhex(salt_hex)), stored)


def create_token(usuario: Usuario) -> str:
    payload = {"sub": str(usuario.id), "rol": usuario.rol, "exp": int(time.time()) + 60 * 60 * 12}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user(request: Request, db: Session = Depends(get_db)) -> Usuario:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token requerido")
    try:
        payload = decode_token(auth.removeprefix("Bearer "))
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    usuario = db.get(Usuario, int(payload["sub"]))
    if not usuario:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no existe")
    return usuario


def require_staff(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if usuario.rol not in ("admin", "staff"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo staff puede reservar")
    return usuario


def require_admin(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if usuario.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admin")
    return usuario
