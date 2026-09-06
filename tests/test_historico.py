from conftest import auth_headers


def test_historico_incluye_canceladas(client):
    h = auth_headers(client)
    puesto = client.get("/api/puestos", headers=h).json()[0]["id"]
    body = {"puesto_id": puesto, "fecha": "2026-10-05",
            "hora_inicio": "09:00", "hora_fin": "11:00",
            "tipo": "agente", "servicio_id": 1, "departamento_id": 1}
    client.post("/api/reservas", headers=h, json=body)
    rid = client.post("/api/reservas", headers=h, json={**body, "fecha": "2026-10-06", "tipo": "visita"}).json()["id"]
    client.post(f"/api/reservas/{rid}/cancelar", headers=h)

    all_res = client.get("/api/historico", headers=h).json()
    assert len(all_res) == 2

    f = client.get("/api/historico", headers=h, params={"tipo": "visita"}).json()
    assert len(f) == 1 and f[0]["cancelada"] is True

    f2 = client.get("/api/historico", headers=h, params={"fecha_desde": "2026-10-06"}).json()
    assert len(f2) == 1
