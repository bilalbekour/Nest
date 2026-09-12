import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import BASE_DIR, DATABASE_URL

BACKUP_DIR = BASE_DIR / "backups"
MANTENER = 7


def _origen() -> Path | None:
    if not DATABASE_URL.startswith("sqlite:///"):
        return None
    p = Path(DATABASE_URL.removeprefix("sqlite:///"))
    if not p.is_absolute():
        p = BASE_DIR / p
    return p if p.exists() else None


def snapshot(prefijo="manual") -> str:
    origen = _origen()
    if not origen:
        raise RuntimeError("Sin BD sqlite que copiar")
    BACKUP_DIR.mkdir(exist_ok=True)
    nombre = f"nido-{prefijo}-{datetime.now():%Y%m%d-%H%M%S}.db"
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
    for viejo in sorted(BACKUP_DIR.glob("nido-*.db"))[:-MANTENER]:
        viejo.unlink(missing_ok=True)
    return nombre


def lista() -> list[str]:
    if not BACKUP_DIR.exists():
        return []
    return sorted((p.name for p in BACKUP_DIR.glob("nido-*.db")), reverse=True)
