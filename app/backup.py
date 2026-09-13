import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import BASE_DIR, DATABASE_URL

BACKUP_DIR = BASE_DIR / "backups"
MANTENER = 7


def _tipo_backend() -> str | None:
    if DATABASE_URL.startswith("sqlite:///"):
        return "sqlite"
    if DATABASE_URL.startswith("postgres"):
        return "postgres"
    return None


def _origen() -> Path | None:
    p = Path(DATABASE_URL.removeprefix("sqlite:///"))
    if not p.is_absolute():
        p = BASE_DIR / p
    return p if p.exists() else None


def snapshot(prefijo="manual") -> str:
    BACKUP_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    if _tipo_backend() == "sqlite":
        origen = _origen()
        if not origen:
            raise RuntimeError("BD sqlite no encontrada")
        nombre = f"nido-{prefijo}-{ts}.db"
        destino = BACKUP_DIR / nombre
        src = sqlite3.connect(f"file:{origen}?mode=ro", uri=True)
        try:
            dst = sqlite3.connect(destino)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    elif _tipo_backend() == "postgres":
        nombre = f"nido-{prefijo}-{ts}.dump"
        destino = BACKUP_DIR / nombre
        proc = subprocess.run(
            ["pg_dump", "--format=custom", "--no-owner", "--file", str(destino), DATABASE_URL],
            capture_output=True, text=True, timeout=600,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"pg_dump falló: {(proc.stderr or '').strip()}")
    else:
        raise RuntimeError(f"Backups no soportados para {DATABASE_URL}")
    for viejo in sorted(BACKUP_DIR.glob("nido-*"))[:-MANTENER]:
        viejo.unlink(missing_ok=True)
    return nombre


def lista() -> list[str]:
    if not BACKUP_DIR.exists():
        return []
    return sorted((p.name for p in BACKUP_DIR.glob("nido-*")), reverse=True)
