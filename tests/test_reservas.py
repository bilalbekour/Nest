from conftest import auth_headers


def test_create_reserva(client):
    h = auth_headers(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    r = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "agente", "servicio_id": 1, "departamento_id": 1})
    assert r.status_code == 201
    assert r.json()["cancelada"] is False


def test_overlap_rejected(client):
    h = auth_headers(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    body = {"puesto_id": puesto, "fecha": "2026-09-10",
            "hora_inicio": "09:00", "hora_fin": "13:00",
            "tipo": "agente", "servicio_id": 1, "departamento_id": 1}
    assert client.post("/api/reservas", headers=h, json=body).status_code == 201
    assert client.post("/api/reservas", headers=h, json=body).status_code == 409


def test_hora_fin_menor_que_ini(client):
    h = auth_headers(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    r = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "13:00", "hora_fin": "09:00",
        "tipo": "agente", "servicio_id": 1, "departamento_id": 1})
    assert r.status_code == 400


def test_cancelar_reserva(client):
    h = auth_headers(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    rid = client.post("/api/reservas", headers=h, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "visita", "servicio_id": 1, "departamento_id": 1}).json()["id"]
    r = client.post(f"/api/reservas/{rid}/cancelar", headers=h)
    assert r.status_code == 200
    assert r.json()["cancelada"] is True


def test_cancelar_ajeno_denegado(client):
    h1 = auth_headers(client, "staff1", "pass1234")
    h2 = auth_headers(client, "staff2", "pass1234")
    puesto = client.get("/api/puestos", headers=h1).json()[0]["id"]
    rid = client.post("/api/reservas", headers=h1, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "13:00",
        "tipo": "staff", "servicio_id": 1, "departamento_id": 1}).json()["id"]
    assert client.post(f"/api/reservas/{rid}/cancelar", headers=h2).status_code == 403


def test_list_reservas_por_fecha(client):
    h = auth_headers(client)
    p1 = client.get("/api/puestos", headers=h).json()[0]["id"]
    p2 = client.get("/api/puestos", headers=h).json()[1]["id"]
    body = {"fecha": "2026-09-10", "hora_inicio": "09:00", "hora_fin": "11:00",
            "tipo": "agente", "servicio_id": 1, "departamento_id": 1}
    client.post("/api/reservas", headers=h, json={**body, "puesto_id": p1})
    client.post("/api/reservas", headers=h, json={**body, "puesto_id": p2})
    r = client.get("/api/reservas", headers=h, params={"fecha": "2026-09-10"})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_admin_cancela_reserva_ajena(client):
    h1 = auth_headers(client, "staff1", "pass1234")
    r_admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h_admin = {"Authorization": f"Bearer {r_admin.json()['token']}"}
    puesto = client.get("/api/puestos", headers=h1).json()[0]["id"]
    rid = client.post("/api/reservas", headers=h1, json={
        "puesto_id": puesto, "fecha": "2026-09-10",
        "hora_inicio": "09:00", "hora_fin": "11:00",
        "tipo": "staff", "servicio_id": 1, "departamento_id": 1}).json()["id"]
    r = client.post(f"/api/reservas/{rid}/cancelar", headers=h_admin)
    assert r.status_code == 200
    assert r.json()["cancelada"] is True


def test_cancelar_inexistente(client):
    h = auth_headers(client)
    assert client.post("/api/reservas/999999/cancelar", headers=h).status_code == 404
