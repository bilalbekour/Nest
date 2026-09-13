import os
import secrets
import warnings
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
load_dotenv(ENV_FILE)


def _secret_key() -> str:
    key = os.environ.get("SECRET_KEY", "")
    if key and key != "dev-secret-change-me":
        return key
    key = secrets.token_urlsafe(48)
    try:
        line = f"SECRET_KEY={key}\n"
        texto = ENV_FILE.read_text() if ENV_FILE.exists() else ""
        texto = "".join(l for l in texto.splitlines(keepends=True)
                        if not l.startswith("SECRET_KEY=")) + line
        ENV_FILE.write_text(texto)
    except OSError:
        warnings.warn("No se pudo escribir .env; SECRET_KEY solo se mantiene en memoria")
    os.environ["SECRET_KEY"] = key
    warnings.warn(f"SECRET_KEY no configurado; se generó uno aleatorio y se guardó en {ENV_FILE}")
    return key


SECRET_KEY = _secret_key()
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
