# Reserva de Puestos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Herramienta web interna para reservar puestos de oficina por fecha y tramo horario, con login, plano interactivo e histórico persistente.

**Architecture:** FastAPI sirve el frontend estático (SPA JS vanilla + Tailwind CDN) y una API REST bajo `/api`. Persistencia en SQLite con SQLAlchemy. Autenticación JWT (PyJWT) con contraseñas hash PBKDF2 (stdlib). Los puestos se siembran desde una configuración del layout. Las reservas nunca se eliminan: cancelar = marcar `cancelada=True`.

**Tech Stack:** FastAPI, Uvicorn, SQLAlchemy, SQLite, PyJWT, Pydantic v2, pytest + TestClient (frontend sin build).

---

## Estructura de archivos

```
Nido/
  requirements.txt
  .env                       # SECRET, DB URL
  run.sh                     # arranca uvicorn
  app/
    __init__.py
    config.py                # SECRET, DB path, FLOORS layout
    db.py                    # engine, SessionLocal, Base, get_db
    models.py                # Usuario, Servicio, Departamento, Puesto, Reserva
    schemas.py               # Pydantic models de entrada/salida
    auth.py                  # hash contraseña, JWT, dependencias (require_staff, require_admin, get_current_user)
    seed.py                  # seed admin + servicios/departamentos + 210 puestos
    main.py                  # app FastAPI, incluye routers, sirve frontend
  frontend/
    index.html               # SPA completa (login + 3 vistas + modal)
    app.js                   # lógica: fetch, render plano, reservas, historico, admin
  tests/
    conftest.py              # TestClient + BD temporal
    test_auth.py
    test_reservas.py
    test_catalogos.py
    test_historico.py
  docs/superpowers/specs/2026-09-06-reserva-puestos-design.md
```

## Configuración del layout (app/config.py)

```python
# (planta): [ (zona, filas), ... ]  fila = [desks_lado1, desks_lado2]
FLOORS = {
    2: [
        ("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
        ("ZD", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
    ],
    1: [("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]])],
    0: [],
}
```

Cada número = nº de despachos en un lado del pasillo. Cada despacho = 2 posiciones.
70 posiciones/zona = 4 filas × (4+4) despachos × 2 + 1 fila × 3 despachos × 2.

---

### Task 1: Scaffold del proyecto

**Files:**
- Create: `requirements.txt`
- Create: `.env`
- Create: `run.sh`
- Create: `app/__init__.py`, `app/config.py`, `app/db.py`

- [ ] **Step 1: Escribir requirements.txt y archivos base**

`requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
PyJWT==2.10.1
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: Crear `.env`** (no commitear)

```
SECRET_KEY=change-me-por-favor
DATABASE_URL=sqlite:///./nido.db
```

- [ ] **Step 3: Crear `run.sh`**

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- [ ] **Step 4: Crear `app/__init__.py`** (vacío)

- [ ] **Step 5: Crear `app/config.py`**

```python
import os
from pathlib import Path
from dotenv import load_dotenv  # añadir python-dotenv a requirements si se usa; si no, defaults

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'nido.db'}")

# ponytail: layout config-driven; si cambia el plano, editar aquí y re-sembrar puestos
FLOORS = {
    2: [
        ("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
        ("ZD", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
    ],
    1: [("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]])],
    0: [],
}
```

Nota: añadir `python-dotenv` a requirements si se carga `.env`; si no, se puede
leer de entorno directamente (simplificación aceptada si el deploy usa env).

- [ ] **Step 6: Crear `app/db.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 7: Instalar dependencias y verificar**

Run: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
Run: `python -c "import app.config, app.db"`
Expected: sin errores de import.

- [ ] **Step 8: Commit**

```bash
git add requirements.txt run.sh app/
git commit -m "chore: scaffold del proyecto FastAPI"
```

---

### Task 2: Modelos y seed

**Files:**
- Create: `app/models.py`
- Create: `app/schemas.py`
- Create: `app/seed.py`

- [ ] **Step 1: Crear `app/models.py`**

```python
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nombre: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str] = mapped_column(String(10), default="staff")  # admin | staff


class Servicio(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)


class Departamento(Base):
    __tablename__ = "departamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)


class Puesto(Base):
    __tablename__ = "puestos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    planta: Mapped[int] = mapped_column(Integer)
    zona: Mapped[str] = mapped_column(String(4))   # ZI | ZD
    fila: Mapped[int] = mapped_column(Integer)
    lado: Mapped[int] = mapped_column(Integer)     # 1 | 2
    posicion: Mapped[int] = mapped_column(Integer)  # ordinal por lado
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(primary_key=True)
    puesto_id: Mapped[int] = mapped_column(ForeignKey("puestos.id"))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    tipo: Mapped[str] = mapped_column(String(10))  # agente | staff | visita
    servicio_id: Mapped[int] = mapped_column(ForeignKey("servicios.id"))
    departamento_id: Mapped[int] = mapped_column(ForeignKey("departamentos.id"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    cancelada: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    puesto = relationship("Puesto")
    servicio = relationship("Servicio")
    departamento = relationship("Departamento")
    usuario = relationship("Usuario")
```

- [ ] **Step 2: Crear `app/schemas.py`**

```python
from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict


class LoginIn(BaseModel):
    username: str
    password: str


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nombre: str
    rol: str


class UsuarioCreate(BaseModel):
    username: str
    password: str
    nombre: str
    rol: str = "staff"


class ServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


class ServicioCreate(BaseModel):
    nombre: str


class DepartamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


class DepartamentoCreate(BaseModel):
    nombre: str


class PuestoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    planta: int
    zona: str
    fila: int
    lado: int
    posicion: int
    activo: bool


class ReservaCreate(BaseModel):
    puesto_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str  # agente | staff | visita
    servicio_id: int
    departamento_id: int


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    puesto: PuestoOut
    fecha: date
    hora_inicio: time
    hora_fin: time
    tipo: str
    servicio: ServicioOut
    departamento: DepartamentoOut
    usuario: UsuarioOut
    cancelada: bool
    creado_en: datetime
```

- [ ] **Step 3: Crear `app/seed.py`**

```python
from sqlalchemy.orm import Session

from app.config import FLOORS
from app.db import Base, engine, SessionLocal
from app.models import Departamento, Puesto, Servicio, Usuario
from app.auth import hash_password


def seed_puestos(db: Session) -> None:
    if db.query(Puesto).count():
        return
    for planta, zonas in FLOORS.items():
        for zona, filas in zonas:
            for fila_idx, (lado1, lado2) in enumerate(filas, start=1):
                for lado, desks in ((1, lado1), (2, lado2)):
                    pos = 1
                    for _ in range(desks):
                        for _ in range(2):  # cada despacho = 2 posiciones
                            db.add(Puesto(
                                codigo=f"P{planta}-{zona}-F{fila_idx}-L{lado}-{pos}",
                                planta=planta, zona=zona, fila=fila_idx,
                                lado=lado, posicion=pos,
                            ))
                            pos += 1
    db.commit()


def seed_base(db: Session) -> None:
    if not db.query(Usuario).filter_by(username="admin").first():
        db.add(Usuario(username="admin", password_hash=hash_password("admin123"),
                       nombre="Administrador", rol="admin"))
    if not db.query(Servicio).count():
        for nombre in ("Telefonía", "Soporte TI", "Atención Cliente"):
            db.add(Servicio(nombre=nombre))
    if not db.query(Departamento).count():
        for nombre in ("Operaciones", "Comercial", "TI"):
            db.add(Departamento(nombre=nombre))
    db.commit()


def seed_all() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_base(db)
        seed_puestos(db)
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()
    print("Seed completado. admin/admin123")
```

- [ ] **Step 4: Verificar seed**

Run: `rm -f nido.db && python -m app.seed && python -c "from app.db import SessionLocal; from app.models import Puesto; print(SessionLocal().query(Puesto).count())"`
Expected: `210`

- [ ] **Step 5: Commit**

```bash
git add app/models.py app/schemas.py app/seed.py
git commit -m "feat: modelos, esquemas y seed de puestos/admin"
```

---

### Task 3: Autenticación JWT

**Files:**
- Create: `app/auth.py`
- Test: `tests/conftest.py`, `tests/test_auth.py`

- [ ] **Step 1: Crear `app/auth.py`**

```python
import hashlib
import os
import time
from functools import wraps
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
    salt_hex, digest_hex = stored.split("$")
    return hash_password(password, bytes.fromhex(salt_hex)) == stored


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
```

- [ ] **Step 2: Crear `tests/conftest.py`**

```python
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_nido.db"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine, SessionLocal
from app.main import app
from app.seed import seed_all


@pytest.fixture()
def client():
    Base.metadata.create_all(engine)
    seed_all()
    yield TestClient(app)
    Base.metadata.drop_all(engine)
    if os.path.exists("test_nido.db"):
        os.remove("test_nido.db")


def auth_headers(client: TestClient, username="staff1", password="pass1234") -> dict:
    client.post("/api/usuarios", json={"username": username, "password": password,
                                       "nombre": "Staff Uno", "rol": "staff"})
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    return {"Authorization": f"Bearer {r.json()['token']}"}
```

La fixture `client` asume que `app.main` existe (Task 4). Si falla el import,
completar Task 4 antes de ejecutar los tests.

- [ ] **Step 3: Escribir `app/main.py` mínimo (para que conftest importe) y el router de auth**

En `app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="Reserva de Puestos")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

Añadir `app/routers/` con `auth.py` (router de login). Como la app principal se
completa en Task 4, el router de auth se incluye ahí.

- [ ] **Step 4: Escribir test de auth**

`tests/test_auth.py`:

```python
def test_login_ok(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_bad_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "mala"})
    assert r.status_code == 401
```

- [ ] **Step 5: Crear el router de login**

`app/routers/auth.py`:

```python
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
    return {"token": create_token(usuario), "usuario": {"id": usuario.id, "username": usuario.username, "nombre": usuario.nombre, "rol": usuario.rol}}
```

- [ ] **Step 6: Incluir el router en `app/main.py`**

```python
from fastapi import FastAPI
from app.routers import auth as auth_router

app = FastAPI(title="Reserva de Puestos")
app.include_router(auth_router.router)
```

- [ ] **Step 7: Ejecutar tests**

Run: `source .venv/bin/activate && pytest tests/test_auth.py -v`
Expected: 2 PASS.

- [ ] **Step 8: Commit**

```bash
git add app/auth.py app/main.py app/routers/ tests/
git commit -m "feat: autenticación JWT y login"
```

---

### Task 4: CRUD de catálogos (servicios, departamentos, usuarios, puestos)

**Files:**
- Create: `app/routers/catalogos.py`

- [ ] **Step 1: Escribir el router**

`app/routers/catalogos.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin, require_staff
from app.db import get_db
from app.models import Departamento, Puesto, Servicio, Usuario
from app.schemas import (DepartamentoCreate, DepartamentoOut, PuestoOut,
                         ServicioCreate, ServicioOut, UsuarioCreate, UsuarioOut)

router = APIRouter(prefix="/api", tags=["catalogos"])


def _get_or_404(db, model, id_, message):
    obj = db.get(model, id_)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, message)
    return obj


@router.get("/servicios", response_model=list[ServicioOut], dependencies=[Depends(require_staff)])
def list_servicios(db: Session = Depends(get_db)):
    return db.query(Servicio).order_by(Servicio.nombre).all()


@router.post("/servicios", response_model=ServicioOut, dependencies=[Depends(require_admin)])
def create_servicio(data: ServicioCreate, db: Session = Depends(get_db)):
    if db.query(Servicio).filter_by(nombre=data.nombre).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Servicio ya existe")
    obj = Servicio(nombre=data.nombre)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.get("/departamentos", response_model=list[DepartamentoOut], dependencies=[Depends(require_staff)])
def list_departamentos(db: Session = Depends(get_db)):
    return db.query(Departamento).order_by(Departamento.nombre).all()


@router.post("/departamentos", response_model=DepartamentoOut, dependencies=[Depends(require_admin)])
def create_departamento(data: DepartamentoCreate, db: Session = Depends(get_db)):
    if db.query(Departamento).filter_by(nombre=data.nombre).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Departamento ya existe")
    obj = Departamento(nombre=data.nombre)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.get("/puestos", response_model=list[PuestoOut], dependencies=[Depends(require_staff)])
def list_puestos(db: Session = Depends(get_db)):
    return db.query(Puesto).filter_by(activo=True).order_by(Puesto.codigo).all()


@router.get("/usuarios", response_model=list[UsuarioOut], dependencies=[Depends(require_admin)])
def list_usuarios(db: Session = Depends(get_db)):
    return db.query(Usuario).all()


@router.post("/usuarios", response_model=UsuarioOut, dependencies=[Depends(require_admin)])
def create_usuario(data: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(Usuario).filter_by(username=data.username).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Usuario ya existe")
    obj = Usuario(username=data.username, password_hash=hash_password(data.password),
                  nombre=data.nombre, rol=data.rol)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
```

- [ ] **Step 2: Incluir el router en `app/main.py` y completar la app**

`app/main.py`:

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import auth as auth_router
from app.routers import catalogos as catalogos_router
from app.routers import reservas as reservas_router
from app.routers import historico as historico_router

app = FastAPI(title="Reserva de Puestos")
app.include_router(auth_router.router)
app.include_router(catalogos_router.router)
app.include_router(reservas_router.router)
app.include_router(historico_router.router)

# Sirve el frontend (se crea en Task 7/8/9)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
```

Nota: `reservas_router` y `historico_router` se crean en Tasks 5 y 6. Hasta
entonces, no importarlos (o crear stubs con `router = APIRouter()`).

- [ ] **Step 3: Test de catálogos**

`tests/test_catalogos.py`:

```python
def test_list_servicios_unauth(client):
    assert client.get("/api/servicios").status_code == 401


def test_list_servicios_admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/servicios", headers=h).status_code == 200


def test_create_servicio_admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.post("/api/servicios", headers=h, json={"nombre": "Nuevo"}).status_code == 200


def test_create_servicio_denied_sin_auth(client):
    assert client.post("/api/servicios", json={"nombre": "Nuevo"}).status_code == 401
```

- [ ] **Step 4: Ejecutar tests**

Run: `pytest tests/test_catalogos.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routers/catalogos.py app/main.py tests/test_catalogos.py
git commit -m "feat: CRUD de servicios, departamentos, puestos y usuarios"
```

---

### Task 5: Reservas (crear, listar por fecha, cancelar, solapamiento)

**Files:**
- Create: `app/routers/reservas.py`
- Test: `tests/test_reservas.py`

- [ ] **Step 1: Escribir el router**

`app/routers/reservas.py`:

```python
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_staff
from app.db import get_db
from app.models import Puesto, Reserva
from app.schemas import ReservaCreate, ReservaOut

router = APIRouter(prefix="/api", tags=["reservas"])


def _reservas_activas(db: Session, puesto_id: int, fecha: date, h_ini, h_fin, excluir_id=None):
    q = db.query(Reserva).filter(
        Reserva.puesto_id == puesto_id,
        Reserva.fecha == fecha,
        Reserva.cancelada.is_(False),
        Reserva.hora_inicio < h_fin,
        Reserva.hora_fin > h_ini,
    )
    if excluir_id:
        q = q.filter(Reserva.id != excluir_id)
    return q.first()


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
    if not db.get(Puesto, data.puesto_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Puesto no existe")
    if _reservas_activas(db, data.puesto_id, data.fecha, data.hora_inicio, data.hora_fin):
        raise HTTPException(status.HTTP_409_CONFLICT, "El puesto ya está reservado en ese tramo")
    reserva = Reserva(**data.model_dump(), usuario_id=usuario.id)
    db.add(reserva); db.commit(); db.refresh(reserva)
    return _load(db, reserva.id)


def _load(db: Session, reserva_id: int) -> Reserva:
    return db.query(Reserva).options(
        joinedload(Reserva.puesto), joinedload(Reserva.servicio),
        joinedload(Reserva.departamento), joinedload(Reserva.usuario),
    ).filter(Reserva.id == reserva_id).first()


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
```

- [ ] **Step 2: Tests de reservas**

`tests/test_reservas.py`:

```python
def _head(client, u="staff1", p="pass1234"):
    r = client.post("/api/auth/login", json={"username": u, "password": p})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_create_reserva(client):
    h = _head(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    r = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "agente", "servicio_id": 1, "departamento_id": 1})
    assert r.status_code == 201
    assert r.json()["cancelada"] is False


def test_overlap_rejected(client):
    h = _head(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    body = {"puesto_id": puesto, "fecha": "2026-09-10",
            "hora_inicio": "09:00", "hora_fin": "13:00",
            "tipo": "agente", "servicio_id": 1, "departamento_id": 1}
    assert client.post("/api/reservas", headers=h, json=body).status_code == 201
    assert client.post("/api/reservas", headers=h, json=body).status_code == 409


def test_hora_fin_menor_que_ini(client):
    h = _head(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    r = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "13:00", "hora_fin": "09:00",
        "tipo": "agente", "servicio_id": 1, "departamento_id": 1})
    assert r.status_code == 400


def test_cancelar_reserva(client):
    h = _head(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    rid = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "visita", "servicio_id": 1, "departamento_id": 1}).json()["id"]
    r = client.post(f"/api/reservas/{rid}/cancelar", headers=h)
    assert r.status_code == 200
    assert r.json()["cancelada"] is True


def test_cancelar_ajeno_denegado(client):
    h1 = _head(client, "staff1", "pass1234")
    h2 = _head(client, "staff2", "pass1234")
    puesto = client.get("/api/puestos", headers=h1).json()[0]["id"]
    rid = client.post("/api/reservas", headers=h1, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "staff", "servicio_id": 1, "departamento_id": 1}).json()["id"]
    assert client.post(f"/api/reservas/{rid}/cancelar", headers=h2).status_code == 403
```

- [ ] **Step 3: Ejecutar tests**

Run: `pytest tests/test_reservas.py -v`
Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routers/reservas.py tests/test_reservas.py
git commit -m "feat: reservas con validación de solapamiento y cancelación"
```

---

### Task 6: Histórico con filtros

**Files:**
- Create: `app/routers/historico.py`
- Test: `tests/test_historico.py`

- [ ] **Step 1: Escribir el router**

`app/routers/historico.py`:

```python
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
```

- [ ] **Step 2: Test de histórico**

`tests/test_historico.py`:

```python
def test_historico_filtros(client):
    h = _head(client)  # reutilizar helper de test_reservas
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-10-05",
        "hora_inicio": "09:00", "hora_fin": "11:00",
        "tipo": "agente", "servicio_id": 1, "departamento_id": 1})
    rid = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-10-06",
        "hora_inicio": "09:00", "hora_fin": "11:00",
        "tipo": "visita", "servicio_id": 2, "departamento_id": 2}).json()["id"]
    client.post(f"/api/reservas/{rid}/cancelar", headers=h)

    assert len(client.get("/api/historico", headers=h).json()) == 2  # incluye cancelada
    f = client.get("/api/historico", headers=h, params={"tipo": "visita"}).json()
    assert len(f) == 1 and f[0]["cancelada"] is True
    f2 = client.get("/api/historico", headers=h, params={"fecha_desde": "2026-10-06"}).json()
    assert len(f2) == 1
```

Helper `_head` definido en `tests/test_reservas.py`; montarlo en
`tests/conftest.py` (mover `_head` a conftest y reutilizarlo en ambos archivos).

- [ ] **Step 3: Ajustar conftest** — añadir a `tests/conftest.py`:

```python
def _head(client, u="staff1", p="pass1234"):
    r = client.post("/api/auth/login", json={"username": u, "password": p})
    return {"Authorization": f"Bearer {r.json()['token']}"}
```

Y usar `from conftest import _head` en los tests (o eliminar el helper duplicado).

- [ ] **Step 4: Ejecutar todos los tests**

Run: `pytest -v`
Expected: todos PASS (auth 2, catálogos 4, reservas 5, histórico 1).

- [ ] **Step 5: Commit**

```bash
git add app/routers/historico.py tests/
git commit -m "feat: histórico con filtros"
```

---

### Task 7: Frontend — login + vista de reserva con plano interactivo

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/app.js`

- [ ] **Step 1: Crear `frontend/index.html`**

SPA con Tailwind CDN, pantallas `#login`, `#reservar`, `#historico`, `#admin`,
modal de reserva. Mostrar el plano por planta con filas de despachos
(reutilizando el layout validado: despacho = 2 posiciones, pasillo central).

Estructura mínima (resumen; el detalle JS está en app.js):

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reserva de Puestos</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 min-h-screen">
  <nav id="nav" class="hidden bg-white shadow p-4 flex items-center justify-between">
    <div class="font-bold text-slate-700">Reserva de Puestos</div>
    <div id="nav-user" class="text-slate-600 text-sm"></div>
    <div class="flex gap-2">
      <button data-view="reservar" class="btn-nav bg-emerald-600 text-white px-3 py-1 rounded">Reservar</button>
      <button data-view="historico" class="btn-nav bg-slate-600 text-white px-3 py-1 rounded">Histórico</button>
      <button data-view="admin" id="btn-admin" class="btn-nav hidden bg-slate-800 text-white px-3 py-1 rounded">Admin</button>
      <button id="btn-logout" class="bg-red-600 text-white px-3 py-1 rounded">Salir</button>
    </div>
  </nav>

  <main class="p-4 max-w-6xl mx-auto">
    <section id="login" class="max-w-sm mx-auto mt-24 bg-white shadow rounded p-6">
      <h1 class="text-xl font-bold mb-4 text-slate-800">Acceso</h1>
      <input id="username" placeholder="Usuario" class="w-full border rounded px-3 py-2 mb-2">
      <input id="password" type="password" placeholder="Contraseña" class="w-full border rounded px-3 py-2 mb-3">
      <p id="login-error" class="text-red-600 text-sm mb-2 hidden">Credenciales inválidas</p>
      <button id="btn-login" class="w-full bg-emerald-600 text-white rounded py-2">Entrar</button>
    </section>

    <section id="reservar" class="hidden">
      <div class="bg-white shadow rounded p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-500">Fecha</label>
          <input id="fecha" type="date" class="border rounded px-3 py-2">
        </div>
        <div>
          <label class="block text-xs text-slate-500">Desde</label>
          <input id="desde" type="time" value="08:00" class="border rounded px-3 py-2">
        </div>
        <div>
          <label class="block text-xs text-slate-500">Hasta</label>
          <input id="hasta" type="time" value="19:00" class="border rounded px-3 py-2">
        </div>
        <button id="btn-render" class="bg-emerald-600 text-white rounded px-4 py-2">Mostrar plano</button>
      </div>
      <div id="plan" class="flex flex-col gap-4"></div>
    </section>

    <section id="historico" class="hidden">...</section>
    <section id="admin" class="hidden">...</section>
  </main>

  <div id="modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded shadow-lg p-6 w-full max-w-md">
      <h3 class="font-bold mb-3 text-slate-800">Reservar <span id="modal-puesto"></span></h3>
      <select id="m-tipo" class="w-full border rounded px-3 py-2 mb-2">
        <option value="agente">Agente</option>
        <option value="staff">Staff</option>
        <option value="visita">Visita</option>
      </select>
      <select id="m-servicio" class="w-full border rounded px-3 py-2 mb-2"></select>
      <select id="m-departamento" class="w-full border rounded px-3 py-2 mb-3"></select>
      <div class="flex gap-2 justify-end">
        <button id="modal-cancel" class="px-3 py-2 rounded bg-slate-200">Cerrar</button>
        <button id="modal-save" class="px-3 py-2 rounded bg-emerald-600 text-white">Guardar</button>
      </div>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear `frontend/app.js`**

Estado: `state = { token, usuario, puestos, reservas, fecha, desde, hasta }`:

```js
const $ = (id) => document.getElementById(id);
const state = { token: null, usuario: null, puestos: [], reservas: [], fecha: null };

function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  if (opts.json) headers["Content-Type"] = "application/json";
  const body = opts.json ? JSON.stringify(opts.json) : undefined;
  return fetch(path, { method: opts.method || "GET", headers, body })
    .then(async (r) => {
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.detail || "Error");
      return d;
    });
}

// ---- Login / logout ----
$("btn-login").onclick = () => {
  api("/api/auth/login", { method: "POST", json: { username: $("username").value, password: $("password").value } })
    .then((d) => { state.token = d.token; state.usuario = d.usuario; enter(); })
    .catch(() => $("login-error").classList.remove("hidden"));
};
$("btn-logout").onclick = () => { state.token = null; state.usuario = null; location.reload(); };

function enter() {
  $("login").classList.add("hidden");
  $("nav").classList.remove("hidden");
  $("nav-user").textContent = `${state.usuario.nombre} (${state.usuario.rol === "admin" ? "admin" : "staff"})`;
  $("btn-admin").classList.toggle("hidden", state.usuario.rol !== "admin");
  $("fecha").value = new Date().toISOString().slice(0, 10);
  show("reservar");
  Promise.all([api("/api/puestos"), api("/api/servicios"), api("/api/departamentos")])
    .then(([puestos, servicios, depts]) => {
      state.puestos = puestos; state.servicios = servicios; state.departamentos = depts;
      fillSelect($("m-servicio"), servicios); fillSelect($("m-departamento"), depts);
      renderPlan();
    });
}
function show(view) { ["reservar", "historico", "admin"].forEach(v => $(v).classList.toggle("hidden", v !== view)); }
document.querySelectorAll(".btn-nav").forEach(b => b.onclick = () => { show(b.dataset.view); if (b.dataset.view === "historico") loadHistorico(); if (b.dataset.view === "admin") loadAdmin(); });
function fillSelect(el, items) { el.innerHTML = items.map(i => `<option value="${i.id}">${i.nombre}</option>`).join(""); }

// ---- Plano ----
$("btn-render").onclick = () => {
  state.fecha = $("fecha").value; state.desde = $("desde").value; state.hasta = $("hasta").value;
  renderPlan();
};

function renderPlan() {
  if (!state.fecha) { state.fecha = $("fecha").value; state.desde = $("desde").value; state.hasta = $("hasta").value; }
  api(`/api/reservas?fecha=${state.fecha}`).then((reservas) => {
    state.reservas = reservas;
    const plan = $("plan");
    plan.innerHTML = "";
    for (const [planta, zonas] of Object.entries(agruparZonas())) {
      const card = document.createElement("div");
      card.className = "bg-white shadow rounded p-4";
      card.innerHTML = `<h3 class="font-bold text-slate-700 mb-3">Planta ${planta}</h3>`;
      const rowBox = document.createElement("div");
      rowBox.className = "flex gap-0";
      card.appendChild(rowBox);
      zonas.forEach((zona, zi) => {
        const box = document.createElement("div");
        box.className = "flex-1 p-2 rounded " + (zi === 0 ? "mr-2" : "ml-2");
        box.style.background = "#f8fafc";
        box.style.border = "2px solid #ddd";
        box.innerHTML = `<div class="text-center font-semibold text-emerald-700 mb-2">${zona.nombre} — ${zona.puestos.length} puestos</div>`;
        box.appendChild(renderZona(zona, planta));
        rowBox.appendChild(box);
      });
      if (planta === 1) rowBox.appendChild(renderPasillo("PASILLO + ASCENSOR"));
      else rowBox.innerHTML = `<div class="flex-1"></div>` + rowBox.innerHTML; // pasillo central entre zonas (Planta 2)
      plan.appendChild(card);
    }
  });
}

// Agrupa state.puestos por planta/zona
function agruparZonas() {
  const map = {};
  for (const p of state.puestos) {
    const k = `${p.planta}-${p.zona}`;
    if (!map[k]) map[k] = { planta: p.planta, nombre: zonaNombre(p), puestos: [] };
    map[k].puestos.push(p);
  }
  return map;
}
```

Continuar el archivo con el resto de helpers (ver Task 7/8/9):

- `zonaNombre(p)` → `p.planta === 2 ? (p.zona === "ZI" ? "Zona Izquierda" : "Zona Derecha") : "Zona Izquierda"`.
- `renderZona(zona)` → para cada fila (1..5): dos hileras de despachos
  (lado 1 y lado 2) separadas por `<div class="w-3"></div>` (pasillo). Por fila
  y lado, agrupar los puestos en pares consecutivos que forman un despacho.
  Cada despacho → `renderDespacho(parDePuestos)`.
- `renderDespacho([p1, p2])` → devuelve un `<div>` con borde; encima el panel
  de las 2 posiciones (SVG mesa + 2 sillas como el mockup validado) con el
  código de cada posición; color de fondo según `estadoDespacho(p1, p2)`.
- `estadoDespacho(ps)` → `libre | ocupado | tuyo`. Ocupado si alguna reserva de
  `state.reservas` cubre ese puesto y se solapa con `[state.desde, state.hasta]`.
  "tuyo" si `reserva.usuario.id === state.usuario.id`. Devuelve también la
  reserva para el tooltip.
- `ocupadoEn(tramo, reserva)` → `reserva.hora_inicio < state.hasta && reserva.hora_fin > state.desde`.
- Click en despacho libre → abre el modal (`abrirModal(puesto_id)`); al guardar
  (botón `#modal-save`) hace `POST /api/reservas` con `{ puesto_id, fecha: state.fecha,
  hora_inicio: state.desde, hora_fin: state.hasta, tipo, servicio_id, departamento_id }`
  y refresca `renderPlan()`. Click en despacho "tuyo" → botón cancelar
  (`POST /api/reservas/{id}/cancelar`) + refresco.

La lógica de histórico y admin se añade en Tasks 8 y 9.

- [ ] **Step 3: Verificar login + render del plano manualmente**

Run: `source .venv/bin/activate && python -m app.seed && bash run.sh`
Abrir http://localhost:8000, login con `admin/admin123`, ver el plano de la
fecha de hoy con puestos en verde, reservar un puesto, verlo en rojo.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/app.js
git commit -m "feat: frontend login y vista de reserva con plano interactivo"
```

---

### Task 8: Frontend — histórico con filtros

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`

- [ ] **Step 1: Completar la sección `#historico` en index.html**

Tabla con columnas: Fecha, Puesto, Desde, Hasta, Tipo, Servicio, Departamento,
Reservado por, Estado (Activa/Cancelada). Filtros: fecha desde/hasta,
servicio, departamento, tipo.

- [ ] **Step 2: Implementar la lógica en app.js**

`loadHistorico(filters)` → `GET /api/historico?...` (serializar params) →
render tabla. Los filtros de servicios/departamentos se cargan de
`GET /api/servicios` y `GET /api/departamentos`.

- [ ] **Step 3: Verificar manualmente**

Login, crear 2-3 reservas (alguna cancelada), ir a Histórico, filtrar por tipo y
fecha, comprobar que salen los registros esperados.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: frontend histórico con filtros"
```

---

### Task 9: Frontend — admin (usuarios, servicios, departamentos)

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`

- [ ] **Step 1: Completar la sección `#admin` en index.html**

Tres bloques: Servicios (lista + input + botón añadir), Departamentos (igual),
Usuarios (lista + formulario crear con username, password, nombre, rol).
Solo visible si `usuario.rol === 'admin'` (botón en nav).

- [ ] **Step 2: Implementar handlers en app.js**

`GET/ POST /api/servicios`, `GET/POST /api/departamentos`, `GET/POST /api/usuarios`.
Tras crear, refrescar las listas.

- [ ] **Step 3: Verificar manualmente**

Login como admin, añadir un servicio/departamento/usuario nuevo y comprobar que
aparece en el modal de reserva y en las listas.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: frontend admin de catálogos y usuarios"
```

---

### Task 10: README con instrucciones de despliegue

**Files:**
- Create: `README.md`

- [ ] **Step 1: Escribir README.md**

```markdown
# Reserva de Puestos

Herramienta interna para reservar puestos de oficina por fecha y tramo.

## Requisitos
- Python 3.11+

## Puesta en marcha (desarrollo)
1. `python -m venv .venv && source .venv/bin/activate`
2. `pip install -r requirements.txt`
3. `python -m app.seed`   # crea la BD y datos iniciales
4. `bash run.sh`           # http://localhost:8000
5. Login por defecto: `admin` / `admin123` (¡cambiar!)

## Cambiar el plano / puestos
Editar `FLOORS` en `app/config.py`, borrar `nido.db` y re-ejecutar
`python -m app.seed`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README con instrucciones"
```

---

## Verificación final

Run: `source .venv/bin/activate && pytest -v`
Expected: 12 tests PASS.

Run: `bash run.sh` y recorrer el flujo completo manual (login → reservar →
cancelar → histórico → admin).

## Ponytail notes (qué se omite deliberadamente)

- Password hash PBKDF2 stdlib en vez de bcrypt/argon2: suficiente para tool interna.
- Frontend sin framework ni build (Tailwind CDN + JS vanilla).
- Reservas recurrentes, notificaciones y export a Excel/PDF: fuera de alcance.
- Seed con `admin/admin123`: avisar de cambiarlo en producción.