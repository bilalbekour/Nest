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
    engine.dispose()
    if os.path.exists("test_nido.db"):
        os.remove("test_nido.db")


def auth_headers(client: TestClient, username="staff1", password="pass1234") -> dict:
    client.post("/api/usuarios", json={"username": username, "password": password,
                                       "nombre": "Staff Uno", "rol": "staff"})
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    return {"Authorization": f"Bearer {r.json()['token']}"}
