# Reserva de Puestos

Herramienta interna para reservar puestos de oficina por fecha y tramo.

## Requisitos

- Python 3.11+

## Puesta en marcha (desarrollo)

1. `python -m venv .venv && source .venv/bin/activate`
2. `pip install -r requirements.txt`
3. `python -m app.seed`   # crea la BD y datos iniciales
4. `bash run.sh`          # http://localhost:8000
5. Login por defecto: `admin` / `admin123` (¡cambiar!)

## Tests

```bash
source .venv/bin/activate && pytest -q
```

## Copias de seguridad

Automáticas al arrancar y cada día a las 03:00 en `backups/` (se conservan las 7 últimas).
También desde Admin → Sistema → "Crear copia ahora".

## Cambiar el plano / puestos

Editar `FLOORS` en `app/config.py`, borrar `nido.db` y re-ejecutar
`python -m app.seed`.

## Notas

- Frontend sin build: Tailwind CDN + JS vanilla servido por FastAPI.
- Las contraseñas se guardan con PBKDF2 (stdlib).
- Las reservas no se borran nunca: se marcan como canceladas (histórico completo).