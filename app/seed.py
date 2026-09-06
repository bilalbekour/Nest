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
