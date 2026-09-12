from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import FLOORS
from app.db import Base, SessionLocal, engine
from app.models import Departamento, Puesto, Servicio, Usuario


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
        mm = Servicio(nombre="MasMovil", color="#2962FF")
        vf = Servicio(nombre="Vodafone", color="#D32F2F")
        db.add_all([mm, vf])
        db.flush()
        db.add_all([
            Departamento(nombre="BO Reclamaciones", servicio_id=mm.id, color="#E67E22"),
            Departamento(nombre="BO Altas", servicio_id=mm.id, color="#27AE60"),
            Departamento(nombre="BO Bajas", servicio_id=mm.id, color="#8E44AD"),
            Departamento(nombre="Retenciones", servicio_id=vf.id, color="#C2185B"),
            Departamento(nombre="Portas", servicio_id=vf.id, color="#00897B"),
            Departamento(nombre="Fidelización", servicio_id=vf.id, color="#795548"),
        ])
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
    print("Seed completado. Login inicial: admin/admin123 (cambiar tras el primer acceso).")
