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


def test_reserva_lote_ok(client):
    from conftest import auth_headers
    h = auth_headers(client)
    servs = client.get("/api/servicios", headers=h).json()
    deps = client.get("/api/departamentos", headers=h).json()
    s = servs[0]
    d = [x for x in deps if x["servicio_id"] == s["id"]][0]
    puestos = [p["id"] for p in client.get("/api/puestos", headers=h).json()[:4]]
    body = {"puesto_ids": puestos, "fecha": "2026-09-07", "hora_inicio": "09:00",
            "hora_fin": "11:00", "tipo": "visita", "servicio_id": s["id"],
            "departamento_id": d["id"], "comentario": "Visita de clientes"}
    r = client.post("/api/reservas/lote", headers=h, json=body)
    assert r.status_code == 201
    creadas = r.json()
    assert len(creadas) == 4
    assert all(x["comentario"] == "Visita de clientes" for x in creadas)
    assert len(client.get("/api/historico", headers=h).json()) == 4


def test_reserva_lote_validaciones(client):
    from conftest import auth_headers
    h = auth_headers(client)
    s = client.get("/api/servicios", headers=h).json()[0]
    d = client.get("/api/departamentos", headers=h).json()[0]
    p1 = client.get("/api/puestos", headers=h).json()[0]["id"]
    base = {"puesto_ids": [p1], "fecha": "2026-09-07", "hora_inicio": "09:00",
            "hora_fin": "11:00", "tipo": "staff", "servicio_id": s["id"],
            "departamento_id": d["id"], "comentario": "Formación"}
    assert client.post("/api/reservas/lote", headers=h, json={**base, "comentario": "  "}).status_code == 400
    assert client.post("/api/reservas/lote", headers=h, json={**base, "puesto_ids": []}).status_code == 400
    assert client.post("/api/reservas/lote", headers=h, json={**base, "tipo": "otro"}).status_code == 400
    assert client.post("/api/reservas/lote", headers=h, json={**base, "puesto_ids": [9999]}).status_code == 404


def test_reserva_lote_conflicto_sin_parciales(client):
    from conftest import auth_headers
    h = auth_headers(client)
    s = client.get("/api/servicios", headers=h).json()[0]
    d = client.get("/api/departamentos", headers=h).json()[0]
    puestos = [p["id"] for p in client.get("/api/puestos", headers=h).json()[:3]]
    uno = {"puesto_id": puestos[0], "fecha": "2026-09-07", "hora_inicio": "09:00",
           "hora_fin": "11:00", "tipo": "staff", "servicio_id": s["id"], "departamento_id": d["id"]}
    assert client.post("/api/reservas", headers=h, json=uno).status_code == 201
    lote = {"puesto_ids": puestos, "fecha": "2026-09-07", "hora_inicio": "10:00",
            "hora_fin": "12:00", "tipo": "staff", "servicio_id": s["id"],
            "departamento_id": d["id"], "comentario": "Jornada"}
    r = client.post("/api/reservas/lote", headers=h, json=lote)
    assert r.status_code == 409
    assert len(client.get("/api/historico", headers=h).json()) == 1
