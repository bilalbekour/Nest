from conftest import auth_headers


def admin_h(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_update_usuario(client):
    h = admin_h(client)
    u = client.post("/api/usuarios", headers=h, json={"username": "edit1", "password": "p1",
                    "nombre": "Edit Uno", "rol": "staff"}).json()
    r = client.put(f"/api/usuarios/{u['id']}", headers=h, json={"nombre": "Editado", "rol": "admin"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Editado" and r.json()["rol"] == "admin"


def test_update_usuario_password(client):
    h = admin_h(client)
    client.post("/api/usuarios", headers=h, json={"username": "edit2", "password": "old",
                "nombre": "Edit Dos", "rol": "staff"})
    u = client.get("/api/usuarios", headers=h).json()
    uid = [x["id"] for x in u if x["username"] == "edit2"][0]
    assert client.put(f"/api/usuarios/{uid}", headers=h, json={"password": "new"}).status_code == 200
    r = client.post("/api/auth/login", json={"username": "edit2", "password": "new"})
    assert r.status_code == 200


def test_update_usuario_404_y_rol_invalido(client):
    h = admin_h(client)
    assert client.put("/api/usuarios/9999", headers=h, json={"nombre": "X", "color": "#123456"}).status_code == 404
    u = client.post("/api/usuarios", headers=h, json={"username": "edit3", "password": "p",
                    "nombre": "E", "rol": "staff"}).json()
    assert client.put(f"/api/usuarios/{u['id']}", headers=h, json={"rol": "jefe"}).status_code == 400


def test_update_usuario_forbidden_staff(client):
    h = auth_headers(client)
    u = client.get("/api/usuarios", headers=admin_h(client)).json()[0]
    assert client.put(f"/api/usuarios/{u['id']}", headers=h, json={"nombre": "X"}).status_code == 403


def test_delete_usuario(client):
    h = admin_h(client)
    u = client.post("/api/usuarios", headers=h, json={"username": "del1", "password": "p",
                    "nombre": "Del", "rol": "staff"}).json()
    assert client.delete(f"/api/usuarios/{u['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/usuarios/{u['id']}", headers=h).status_code == 404


def test_delete_usuario_propio_y_con_reservas(client):
    h = admin_h(client)
    admin_id = [u["id"] for u in client.get("/api/usuarios", headers=h).json() if u["username"] == "admin"][0]
    assert client.delete(f"/api/usuarios/{admin_id}", headers=h).status_code == 400
    hs = auth_headers(client)
    me = client.post("/api/auth/login", json={"username": "staff1", "password": "pass1234"}).json()["usuario"]
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    client.post("/api/reservas", headers=hs, json={"puesto_id": puesto, "fecha": "2026-09-07",
                "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                "servicio_id": serv, "departamento_id": dep})
    assert client.delete(f"/api/usuarios/{me['id']}", headers=h).status_code == 400


def test_update_y_delete_servicio(client):
    h = admin_h(client)
    s = client.post("/api/servicios", headers=h, json={"nombre": "Tmp", "color": "#111111"}).json()
    assert client.put(f"/api/servicios/{s['id']}", headers=h, json={"nombre": "Tmp2", "color": "#222222"}).status_code == 200
    assert client.put("/api/servicios/9999", headers=h, json={"nombre": "X", "color": "#123456"}).status_code == 404
    assert client.delete(f"/api/servicios/{s['id']}", headers=h).status_code == 204


def test_delete_servicio_con_reservas_cascada_y_duplicado(client):
    h = admin_h(client)
    hs = auth_headers(client)
    servs = client.get("/api/servicios", headers=hs).json()
    serv, otro = servs[0], servs[1]
    assert client.put(f"/api/servicios/{otro['id']}", headers=h, json={"nombre": serv["nombre"], "color": "#AAAAAA"}).status_code == 400
    dep = client.get("/api/departamentos", headers=hs).json()[0]["id"]
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    client.post("/api/reservas", headers=hs, json={"puesto_id": puesto, "fecha": "2026-09-07",
                "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                "servicio_id": serv["id"], "departamento_id": dep})
    assert client.delete(f"/api/servicios/{serv['id']}", headers=h).status_code == 204
    assert client.get("/api/historico", headers=h).json() == []
    assert serv["id"] not in [s["id"] for s in client.get("/api/servicios", headers=h).json()]


def test_update_y_delete_departamento(client):
    h = admin_h(client)
    serv = client.get("/api/servicios", headers=h).json()[0]["id"]
    assert client.post("/api/departamentos", headers=h, json={"nombre": "SinServ"}).status_code == 422
    assert client.post("/api/departamentos", headers=h, json={"nombre": "X", "servicio_id": 9999, "color": "#123456"}).status_code == 404
    d = client.post("/api/departamentos", headers=h, json={"nombre": "TmpD", "servicio_id": serv, "color": "#333333"}).json()
    assert d["servicio_id"] == serv
    assert client.put(f"/api/departamentos/{d['id']}", headers=h, json={"nombre": "TmpD2", "color": "#444444"}).status_code == 200
    assert client.delete(f"/api/departamentos/{d['id']}", headers=h).status_code == 204
    assert client.delete("/api/departamentos/9999", headers=h).status_code == 404


def test_delete_departamento_con_reservas_cascada(client):
    h = admin_h(client)
    hs = auth_headers(client)
    dep = client.get("/api/departamentos", headers=hs).json()[0]
    serv = client.get("/api/servicios", headers=hs).json()[0]["id"]
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    client.post("/api/reservas", headers=hs, json={"puesto_id": puesto, "fecha": "2026-09-07",
                "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                "servicio_id": serv, "departamento_id": dep["id"]})
    assert client.delete(f"/api/departamentos/{dep['id']}", headers=h).status_code == 204
    assert client.get("/api/historico", headers=h).json() == []


def test_delete_servicio_cascada_departamentos(client):
    h = admin_h(client)
    s = client.post("/api/servicios", headers=h, json={"nombre": "TmpS", "color": "#555555"}).json()
    d = client.post("/api/departamentos", headers=h, json={"nombre": "TmpSD", "servicio_id": s["id"], "color": "#666666"}).json()
    assert client.delete(f"/api/servicios/{s['id']}", headers=h).status_code == 204
    assert s["id"] not in [x["id"] for x in client.get("/api/servicios", headers=h).json()]
    assert d["id"] not in [x["id"] for x in client.get("/api/departamentos", headers=h).json()]


def test_reserva_departamento_de_otro_servicio_400(client):
    h = admin_h(client)
    hs = auth_headers(client)
    s1 = client.post("/api/servicios", headers=h, json={"nombre": "S1", "color": "#777777"}).json()
    s2 = client.post("/api/servicios", headers=h, json={"nombre": "S2", "color": "#888888"}).json()
    d1 = client.post("/api/departamentos", headers=h, json={"nombre": "D1", "servicio_id": s1["id"], "color": "#999999"}).json()
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    body = {"puesto_id": puesto, "fecha": "2026-09-07", "hora_inicio": "09:00",
            "hora_fin": "10:00", "tipo": "staff", "servicio_id": s2["id"], "departamento_id": d1["id"]}
    assert client.post("/api/reservas", headers=hs, json=body).status_code == 400
    body["servicio_id"] = s1["id"]
    assert client.post("/api/reservas", headers=hs, json=body).status_code == 201
    assert client.post("/api/reservas", headers=hs, json={**body, "hora_inicio": "10:00",
                       "hora_fin": "11:00", "servicio_id": 9999}).status_code == 404


def test_patch_puesto_activo_visible_deshabilitado(client):
    h = admin_h(client)
    hs = auth_headers(client)
    pid = client.get("/api/puestos", headers=hs).json()[0]["id"]
    assert client.patch(f"/api/puestos/{pid}", headers=h, json={"activo": False}).status_code == 200
    todos = client.get("/api/puestos", headers=hs).json()
    assert len(todos) == 210
    assert [p for p in todos if p["id"] == pid][0]["activo"] is False
    assert client.patch(f"/api/puestos/{pid}", headers=h, json={"activo": True}).status_code == 200
    assert client.patch("/api/puestos/9999", headers=h, json={"activo": False}).status_code == 404


def test_create_puesto_lote(client):
    h = admin_h(client)
    body = {"planta": 3, "zona": "ZI", "fila": 1, "lados": {"1": 2, "2": 1}}
    r = client.post("/api/puestos/lote", headers=h, json=body)
    assert r.status_code == 201
    creados = r.json()
    assert len(creados) == 6
    assert creados[0]["codigo"] == "P3-ZI-F1-L1-1"
    assert creados[0]["activo"] is True
    hs = auth_headers(client)
    assert len(client.get("/api/puestos", headers=hs).json()) == 216
    r2 = client.post("/api/puestos/lote", headers=h, json={"planta": 3, "zona": "zi", "fila": 1, "lados": {"1": 1, "2": 0}})
    assert r2.status_code == 201
    assert r2.json()[0]["codigo"] == "P3-ZI-F1-L1-5"


def test_create_puesto_lote_invalido(client):
    h = admin_h(client)
    hs = auth_headers(client)
    assert client.post("/api/puestos/lote", headers=h, json={"planta": 3, "zona": "", "fila": 1, "lados": {"1": 1}}).status_code == 400
    assert client.post("/api/puestos/lote", headers=h, json={"planta": 3, "zona": "ZI", "fila": 0, "lados": {"1": 1}}).status_code == 400
    assert client.post("/api/puestos/lote", headers=h, json={"planta": 3, "zona": "ZI", "fila": 1, "lados": {"3": 1}}).status_code == 400
    assert client.post("/api/puestos/lote", headers=h, json={"planta": 3, "zona": "ZI", "fila": 1, "lados": {"1": 0}}).status_code == 400
    assert client.post("/api/puestos/lote", headers=hs, json={"planta": 3, "zona": "ZI", "fila": 1, "lados": {"1": 1}}).status_code == 403


def test_create_puesto_individual(client):
    h = admin_h(client)
    r = client.post("/api/puestos", headers=h, json={"planta": 3, "zona": "ZD", "fila": 2, "lado": 1})
    assert r.status_code == 201
    assert r.json()["codigo"] == "P3-ZD-F2-L1-1"
    dup = client.post("/api/puestos", headers=h, json={"planta": 3, "zona": "ZD", "fila": 2, "lado": 1, "posicion": 1})
    assert dup.status_code == 400
    assert client.post("/api/puestos", headers=h, json={"planta": 3, "zona": "ZD", "fila": 2, "lado": 5}).status_code == 400


def _reserva_en(client, hs, puesto_id):
    servs = client.get("/api/servicios", headers=hs).json()
    deps = client.get("/api/departamentos", headers=hs).json()
    s = servs[0]
    d = [x for x in deps if x["servicio_id"] == s["id"]][0]
    return client.post("/api/reservas", headers=hs, json={"puesto_id": puesto_id, "fecha": "2026-09-07",
                       "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                       "servicio_id": s["id"], "departamento_id": d["id"]})


def test_delete_puesto(client):
    h = admin_h(client)
    hs = auth_headers(client)
    p = client.post("/api/puestos", headers=h, json={"planta": 5, "zona": "ZX", "fila": 1, "lado": 1}).json()
    assert client.delete(f"/api/puestos/{p['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/puestos/{p['id']}", headers=h).status_code == 404
    p2 = client.post("/api/puestos", headers=h, json={"planta": 5, "zona": "ZX", "fila": 1, "lado": 1}).json()
    _reserva_en(client, hs, p2["id"])
    assert client.delete(f"/api/puestos/{p2['id']}", headers=h).status_code == 400
    assert client.delete(f"/api/puestos/{p2['id']}", headers=hs).status_code == 403


def test_delete_zona(client):
    h = admin_h(client)
    hs = auth_headers(client)
    lote = client.post("/api/puestos/lote", headers=h, json={"planta": 9, "zona": "ZX", "fila": 1, "lados": {"1": 1, "2": 0}}).json()
    assert len(lote) == 2
    _reserva_en(client, hs, lote[0]["id"])
    assert client.delete("/api/zonas?planta=9&zona=ZX", headers=h).status_code == 204
    rest = [p for p in client.get("/api/puestos", headers=h).json() if p["planta"] == 9]
    assert rest == []
    assert client.get("/api/historico", headers=h).json() == []
    assert client.delete("/api/zonas?planta=9&zona=ZX", headers=h).status_code == 404
    assert client.delete("/api/zonas?planta=9&zona=ZX", headers=hs).status_code == 403


def test_delete_planta(client):
    h = admin_h(client)
    hs = auth_headers(client)
    lote = client.post("/api/puestos/lote", headers=h, json={"planta": 8, "zona": "ZA", "fila": 1, "lados": {"1": 1, "2": 1}}).json()
    assert len(lote) == 4
    assert client.delete("/api/plantas/8", headers=h).status_code == 204
    rest = [p for p in client.get("/api/puestos", headers=h).json() if p["planta"] == 8]
    assert rest == []
    assert client.delete("/api/plantas/8", headers=h).status_code == 404
    assert client.delete("/api/plantas/8", headers=hs).status_code == 403


def test_orden_zonas(client):
    h = admin_h(client)
    hs = auth_headers(client)
    assert client.get("/api/ajustes/orden_zonas", headers=hs).json() == {}
    r = client.put("/api/ajustes/orden_zonas", headers=h, json={"orden": {"2": ["ZD", "ZI"]}})
    assert r.status_code == 200 and r.json() == {"2": ["ZD", "ZI"]}
    assert client.get("/api/ajustes/orden_zonas", headers=hs).json() == {"2": ["ZD", "ZI"]}
    assert client.put("/api/ajustes/orden_zonas", headers=h, json={"orden": {"2": ["ZI"]}}).status_code == 400
    assert client.put("/api/ajustes/orden_zonas", headers=h, json={"orden": {"2": ["ZI", "ZD", "ZX"]}}).status_code == 400
    assert client.put("/api/ajustes/orden_zonas", headers=h, json={"orden": {"9": ["ZI"]}}).status_code == 400
    assert client.put("/api/ajustes/orden_zonas", headers=hs, json={"orden": {"2": ["ZI", "ZD"]}}).status_code == 403
    assert client.get("/api/ajustes/orden_zonas").status_code == 401


def test_color_requerido_y_formato(client):
    h = admin_h(client)
    assert client.post("/api/servicios", headers=h, json={"nombre": "SinColor"}).status_code == 422
    assert client.post("/api/servicios", headers=h, json={"nombre": "Mal1", "color": "red"}).status_code == 400
    assert client.post("/api/servicios", headers=h, json={"nombre": "Mal2", "color": "#12345"}).status_code == 400
    assert client.post("/api/servicios", headers=h, json={"nombre": "Mal3", "color": "#GGGGGG"}).status_code == 400
    s = client.post("/api/servicios", headers=h, json={"nombre": "ConColor", "color": "#A1B2C3"}).json()
    assert s["color"] == "#A1B2C3"
    serv = client.get("/api/servicios", headers=h).json()[0]["id"]
    assert client.post("/api/departamentos", headers=h, json={"nombre": "DSin", "servicio_id": serv}).status_code == 422
    d = client.post("/api/departamentos", headers=h, json={"nombre": "DCon", "servicio_id": serv, "color": "#1A2B3C"}).json()
    assert d["color"] == "#1A2B3C"
    assert client.put(f"/api/servicios/{s['id']}", headers=h, json={"nombre": "ConColor", "color": "mal"}).status_code == 400
    r = client.put(f"/api/servicios/{s['id']}", headers=h, json={"nombre": "ConColor", "color": "#FFFFFF"})
    assert r.status_code == 200 and r.json()["color"] == "#FFFFFF"


def test_reserva_incluye_colores(client):
    h = admin_h(client)
    hs = auth_headers(client)
    s = client.post("/api/servicios", headers=h, json={"nombre": "ColS", "color": "#112233"}).json()
    d = client.post("/api/departamentos", headers=h, json={"nombre": "ColD", "servicio_id": s["id"], "color": "#445566"}).json()
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    r = client.post("/api/reservas", headers=hs, json={"puesto_id": puesto, "fecha": "2026-09-07",
                    "hora_inicio": "09:00", "hora_fin": "10:00", "tipo": "staff",
                    "servicio_id": s["id"], "departamento_id": d["id"]}).json()
    assert r["servicio"]["color"] == "#112233"
    assert r["departamento"]["color"] == "#445566"
