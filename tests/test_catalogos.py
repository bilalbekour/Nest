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


def test_create_usuario_y_auth_headers(client):
    from conftest import auth_headers
    h = auth_headers(client, username="staff99", password="pass99")
    r = client.get("/api/puestos", headers=h)
    assert r.status_code == 200
    assert len(r.json()) == 210
