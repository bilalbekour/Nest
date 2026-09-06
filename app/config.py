import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'nido.db'}")

# ponytail: layout config-driven; si cambia el plano, editar aquí y re-sembrar puestos
FLOORS = {
    2: [
        ("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
        ("ZD", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]]),
    ],
    1: [("ZI", [[4, 4], [4, 4], [4, 4], [4, 4], [3, 0]])],
    0: [],
}
