# Nest — Reserva de Puestos de Oficina

Herramienta web interna para reservar puestos de trabajo por fecha y tramo
horario. Plano interactivo, históricos completos y administración de catálogos
y usuarios.

## Funcionalidades

- **Login** con JWT y contraseñas PBKDF2 (10 000 iteraciones + salt).
- **Reserva** en plano interactivo por planta/zona, fechas y tramos horarios,
  con detección de solapamientos.
- **Reserva masiva** de varios puestos y **reserva recurrente** (hasta 12 semanas).
- **Mis reservas**: próximas, con cancelación.
- **Calendario** mensual con % de ocupación por día.
- **Histórico** filtrable (fecha, servicio, departamento, puesto, tipo) y
  **exportación CSV**.
- **Reporting**: ocupación por servicio, departamento, tipo, planta/zona,
  día de semana y usuarios (pistas de filtro).
- **Favorito**: marca tu puesto habitual con ★.
- **Administración** (solo admin): usuarios, servicios y departamentos, puestos
  (altas en lote, activar/desactivar, orden de zonas y plantas), copias de seguridad.
- **Multilingüe**: español (por defecto), inglés y francés. Selector en el login
  y en la barra lateral; el idioma se guarda en el navegador.

## Stack técnico

- **Backend**: FastAPI, SQLAlchemy 2, PyJWT, Pydantic v2, `pathlib`+stdlib.
- **Base de datos**: SQLite (por defecto) o **PostgreSQL**, intercambiables.
- **Frontend**: SPA en JS vanilla + Tailwind (CDN), sin build.
- **Tests**: pytest + TestClient (47 tests).

## Requisitos

- Python 3.11+

## Puesta en marcha (desarrollo)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed        # crea la BD (nido.db) y los datos iniciales
bash run.sh               # http://localhost:8000
```

Login por defecto: **`admin` / `admin123`** → **cámbiala en Admin → Usuarios**.

## Configuración (`.env`)

La app lee un `.env` en la raíz si existe (archivo ignorado por git):

```
SECRET_KEY=<clave aleatoria>        # si no existe, se genera sola y se persiste en .env
DATABASE_URL=sqlite:///nido.db      # o postgresql://usuario:clave@host:5432/nido
```

> `SECRET_KEY` se autogenera la primera vez, así que no hace falta crearla a mano.
> Nunca uses la misma para varios entornos.

## PostgreSQL

Instala `postgresql-client` en el servidor (los backups usan `pg_dump`) y define:

```
DATABASE_URL=postgresql://nido:TU_PASSWORD@127.0.0.1:5432/nido
```

Crea la BD e inicializa:

```bash
sudo -u postgres createuser nido --pwprompt
sudo -u postgres createdb -O nido nido
python -m app.seed          # mismo seed para SQLite y PostgreSQL
```

## Tests

```bash
source .venv/bin/activate && pytest -q
```

## Copias de seguridad

Automáticas al arrancar y cada día a las **03:00** en `backups/` (se conservan
las 7 últimas). También manualmente en Admin → Sistema → "Crear copia ahora".

- SQLite: copia del fichero `nido.db`.
- PostgreSQL: `pg_dump` (formato custom); restaurar con
  `pg_restore --clean -d nido nido-XXXX.dump`.

## Despliegue en servidor real

Guía paso a paso (usuario de sistema, systemd, nginx + HTTPS, firewall, etc.)
en **[DEPLOY.md](DEPLOY.md)**.

## Cambiar el plano / puestos

Editar `FLOORS` en `app/config.py`, borrar `nido.db` y re-ejecutar
`python -m app.seed`. Para cubrir un layout distinto con la interfaz, añade
o elimina zonas desde Admin → Puestos.

## Seguridad

- HTTPS obligatorio en producción: el token viaja en la cabecera `Authorization`.
- `/docs`, `/redoc` y `/openapi.json` están deshabilitados.
- No se guarda la contraseña en claro ni el hash del usuario en respuestas API.
- Las reservas nunca se borran: se marcan como **canceladas** (histórico completo).
- Roles: `admin` (gestión total) y `staff` (reservas y consultas).