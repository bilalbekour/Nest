from conftest import auth_headers


def admin_h(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_favorito(client):
    h = admin_h(client)
    hs = auth_headers(client)
    pid = client.get("/api/puestos", headers=hs).json()[0]["id"]
    assert client.put("/api/usuarios/yo/favorito", headers=hs, json={"puesto_id": pid}).status_code == 200
    me = client.post("/api/auth/login", json={"username": "staff1", "password": "pass1234"}).json()["usuario"]
    assert me["favorito_puesto_id"] == pid
    assert client.put("/api/usuarios/yo/favorito", headers=hs, json={"puesto_id": 9999}).status_code == 404
    assert client.put("/api/usuarios/yo/favorito", headers=hs, json={"puesto_id": None}).status_code == 200
    me = client.post("/api/auth/login", json={"username": "staff1", "password": "pass1234"}).json()["usuario"]
    assert me["favorito_puesto_id"] is None


def _reserva(hs_client, hs, puesto_id, fecha, serv, dep):
    return hs_client.post("/api/reservas", headers=hs, json={"puesto_id": puesto_id, "fecha": fecha,
                         "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                         "servicio_id": serv, "departamento_id": dep})


def test_mis_reservas(client):
    h = admin_h(client)
    hs = auth_headers(client)
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    puestos = [p["id"] for p in client.get("/api/puestos", headers=hs).json()[:3]]
    _reserva(client, hs, puestos[0], "2026-09-20", serv, dep)
    _reserva(client, hs, puestos[1], "2026-08-01", serv, dep)
    r3 = _reserva(client, hs, puestos[2], "2026-09-21", serv, dep).json()
    client.post(f"/api/reservas/{r3['id']}/cancelar", headers=hs)
    mis = client.get("/api/mis-reservas", headers=hs).json()
    assert len(mis) == 1 and mis[0]["puesto"]["id"] == puestos[0]
    assert client.get("/api/mis-reservas").status_code == 401


def test_recurrente(client):
    h = admin_h(client)
    hs = auth_headers(client)
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    pid = client.get("/api/puestos", headers=hs).json()[0]["id"]
    body = {"puesto_id": pid, "fecha": "2026-09-07", "hora_inicio": "09:00", "hora_fin": "10:00",
            "tipo": "staff", "servicio_id": serv, "departamento_id": dep,
            "comentario": "Lunes", "repeticiones": 4}
    r = client.post("/api/reservas/recurrente", headers=hs, json=body)
    assert r.status_code == 201
    fechas = sorted(x["fecha"] for x in r.json())
    assert fechas == ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]
    assert client.post("/api/reservas/recurrente", headers=hs, json=body).status_code == 409
    assert len(client.get("/api/historico", headers=hs).json()) == 4
    assert client.post("/api/reservas/recurrente", headers=hs, json={**body, "repeticiones": 0}).status_code == 400
    assert client.post("/api/reservas/recurrente", headers=hs, json={**body, "repeticiones": 13}).status_code == 400


def test_ocupacion(client):
    hs = auth_headers(client)
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    puestos = client.get("/api/puestos", headers=hs).json()
    p2 = [p["id"] for p in puestos if p["planta"] == 2][:2]
    p1 = [p["id"] for p in puestos if p["planta"] == 1][:1]
    _reserva(client, hs, p2[0], "2026-09-07", serv, dep)
    _reserva(client, hs, p2[1], "2026-09-07", serv, dep)
    _reserva(client, hs, p2[0], "2026-09-07", serv, dep)
    _reserva(client, hs, p1[0], "2026-09-08", serv, dep)
    r = client.get("/api/ocupacion?desde=2026-09-07&hasta=2026-09-08", headers=hs).json()
    assert r["2026-09-07"]["total"] == 2
    assert r["2026-09-07"]["plantas"] == {"2": 2}
    assert r["2026-09-08"] == {"total": 1, "plantas": {"1": 1}}
    assert client.get("/api/ocupacion?desde=2026-09-08&hasta=2026-09-07", headers=hs).status_code == 400


def test_export_csv(client):
    hs = auth_headers(client)
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    pid = client.get("/api/puestos", headers=hs).json()[0]["id"]
    _reserva(client, hs, pid, "2026-09-07", serv, dep)
    r = client.get("/api/historico/export?fecha_desde=2026-09-07&fecha_hasta=2026-09-07", headers=hs)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    lineas = r.text.strip().split("\n")
    assert len(lineas) == 2
    assert lineas[0].startswith("fecha;puesto;")
    assert "2026-09-07" in lineas[1]


def test_backup(client):
    h = admin_h(client)
    hs = auth_headers(client)
    assert client.post("/api/ajustes/backup", headers=hs).status_code == 403
    r = client.post("/api/ajustes/backup", headers=h)
    assert r.status_code == 200
    assert r.json()["archivo"] in client.get("/api/ajustes/backups", headers=h).json()
