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
    assert client.put("/api/usuarios/9999", headers=h, json={"nombre": "X"}).status_code == 404
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
    s = client.post("/api/servicios", headers=h, json={"nombre": "Tmp"}).json()
    assert client.put(f"/api/servicios/{s['id']}", headers=h, json={"nombre": "Tmp2"}).status_code == 200
    assert client.put("/api/servicios/9999", headers=h, json={"nombre": "X"}).status_code == 404
    assert client.delete(f"/api/servicios/{s['id']}", headers=h).status_code == 204


def test_delete_servicio_con_reservas_cascada_y_duplicado(client):
    h = admin_h(client)
    hs = auth_headers(client)
    servs = client.get("/api/servicios", headers=hs).json()
    serv, otro = servs[0], servs[1]
    assert client.put(f"/api/servicios/{otro['id']}", headers=h, json={"nombre": serv["nombre"]}).status_code == 400
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
    assert client.post("/api/departamentos", headers=h, json={"nombre": "SinServ"}).status_code == 400
    assert client.post("/api/departamentos", headers=h, json={"nombre": "X", "servicio_id": 9999}).status_code == 404
    d = client.post("/api/departamentos", headers=h, json={"nombre": "TmpD", "servicio_id": serv}).json()
    assert d["servicio_id"] == serv
    assert client.put(f"/api/departamentos/{d['id']}", headers=h, json={"nombre": "TmpD2"}).status_code == 200
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
    s = client.post("/api/servicios", headers=h, json={"nombre": "TmpS"}).json()
    d = client.post("/api/departamentos", headers=h, json={"nombre": "TmpSD", "servicio_id": s["id"]}).json()
    assert client.delete(f"/api/servicios/{s['id']}", headers=h).status_code == 204
    assert s["id"] not in [x["id"] for x in client.get("/api/servicios", headers=h).json()]
    assert d["id"] not in [x["id"] for x in client.get("/api/departamentos", headers=h).json()]


def test_reserva_departamento_de_otro_servicio_400(client):
    h = admin_h(client)
    hs = auth_headers(client)
    s1 = client.post("/api/servicios", headers=h, json={"nombre": "S1"}).json()
    s2 = client.post("/api/servicios", headers=h, json={"nombre": "S2"}).json()
    d1 = client.post("/api/departamentos", headers=h, json={"nombre": "D1", "servicio_id": s1["id"]}).json()
    puesto = client.get("/api/puestos", headers=hs).json()[0]["id"]
    body = {"puesto_id": puesto, "fecha": "2026-09-07", "hora_inicio": "09:00",
            "hora_fin": "10:00", "tipo": "staff", "servicio_id": s2["id"], "departamento_id": d1["id"]}
    assert client.post("/api/reservas", headers=hs, json=body).status_code == 400
    body["servicio_id"] = s1["id"]
    assert client.post("/api/reservas", headers=hs, json=body).status_code == 201
    assert client.post("/api/reservas", headers=hs, json={**body, "hora_inicio": "10:00",
                       "hora_fin": "11:00", "servicio_id": 9999}).status_code == 404


def test_patch_puesto_y_list_todos(client):
    h = admin_h(client)
    hs = auth_headers(client)
    pid = client.get("/api/puestos", headers=hs).json()[0]["id"]
    assert client.patch(f"/api/puestos/{pid}", headers=h, json={"activo": False}).status_code == 200
    assert len(client.get("/api/puestos", headers=hs).json()) == 209
    todos = client.get("/api/puestos?todos=true", headers=h).json()
    assert len(todos) == 210
    assert [p for p in todos if p["id"] == pid][0]["activo"] is False
    assert client.get("/api/puestos?todos=true", headers=hs).status_code == 403
    assert client.patch(f"/api/puestos/{pid}", headers=h, json={"activo": True}).status_code == 200
    assert len(client.get("/api/puestos", headers=hs).json()) == 210
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
