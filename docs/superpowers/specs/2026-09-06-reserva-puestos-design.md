# Tool de Reserva de Puestos — Diseño

Fecha: 2026-09-06

## Propósito

Herramienta web interna para reservar puestos de trabajo presenciales los días
que los empleados acuden a la oficina. Reservas por puesto concreto y tramo
horario libre. Histórico persistente para revisión futura.

## Contexto de la oficina

- Más de 50 personas en plantilla.
- Edificio: bajo + 2 plantas.
- **Planta 2** (completa): zona izquierda y derecha (2 zonas idénticas).
- **Planta 1** (solo lado izquierdo): 1 zona. Separada por pasillo,
  ascensor y escaleras.
- **Bajo**: recepción/RRHH (izquierda) y sala de descanso (derecha). Sin
  posiciones reservables.
- Total posiciones reservables: según layout (ver abajo — pendiente de
  confirmar si 70 u 76 por zona).

## Layout de cada zona

- Cada zona tiene un **único pasillo vertical central**.
- A cada lado del pasillo hay filas (lineales) de despachos enfrentados.
- Cada despacho (lineal) = **1 mesa grande + 2 posiciones** (mesa + 2 sillas).
- Por fila completa: 4 despachos a cada lado del pasillo (8 posiciones por
  lado, 16 por fila). La última fila tiene 3 despachos por lado.

Definición de zona configurable (`FLOORS` en código):

- `P2` (planta 2): 2 zonas — `ZI` (izquierda) y `ZD` (derecha), cada zona:
  4 filas de `[4,4]` despachos (64 posiciones) + 1 fila final de `[3,0]`
  despachos (6 posiciones) = **70 posiciones** por zona → **140 en P2**.
- `P1` (planta 1): 1 zona — `ZI` → **70 posiciones**.
- `P0` (bajo): sin posiciones.

**Total: 210 posiciones** (P2 = 140 + P1 = 70).

El `[3,0]` significa que la última fila solo tiene despachos en uno de los
lados del pasillo. Los puestos se generan programáticamente desde esta
definición (si cambia el conteo real, se ajusta la config y se re-siembran).

Estructura de código de puesto: `P{planta}-{zona}-F{fila}-L{lado}-{n}`,
ej. `P2-ZI-F1-L1-1`. Lados: `L1`/`L2`. `n` = ordinal de posición por lado.

## Arquitectura

- **Backend:** FastAPI + SQLite (SQLAlchemy). Sirve el frontend estático y la
  API bajo `/api`.
- **Autenticación:** JWT. Contraseñas con bcrypt. Solo usuarios con rol
  `staff` pueden crear reservas. Un usuario `admin` gestiona usuarios,
  servicios, departamentos y puestos.
- **Frontend:** JS vanilla + Tailwind (CDN). SPA con 3 pantallas + login.
  Sin framework JS, sin paso de build.

## Modelos de datos

- `Usuario`: id, username, password_hash, rol (`admin`|`staff`), nombre.
- `Servicio`: id, nombre.
- `Departamento`: id, nombre.
- `Puesto`: id, codigo (`P2-ZI-F1-L1-1`), planta (2|1), zona (`ZI`|`ZD`),
  fila (1-5), lado (1|2), posicion (ordinal por lado), activo.
- `Reserva`: id, puesto_id, fecha, hora_inicio, hora_fin, tipo
  (`agente`|`staff`|`visita`), servicio_id, departamento_id, usuario_id
  (quien reserva), cancelada (bool), creado_en.
  - Las reservas **nunca se eliminan**: cancelar = marcar `cancelada=True`.
  - Validación: no puede solaparse con otra reserva activa del mismo puesto en
    la misma fecha y rango horario.

## Endpoints API

- `POST /api/auth/login` → JWT.
- `GET /api/auth/me` → perfil del usuario logueado.
- `GET /api/reservas?fecha=YYYY-MM-DD` → reservas activas de esa fecha.
- `POST /api/reservas` → crear reserva (rol staff).
- `POST /api/reservas/{id}/cancelar` → cancelar (solo el autor o admin).
- `GET /api/historico?fecha_desde&fecha_hasta&servicio&departamento&puesto&tipo`
  → reservas activas y canceladas.
- `GET /api/puestos` → lista de puestos con su geometría.
- CRUD `/api/servicios`, `/api/departamentos` (admin).
- Gestión de usuarios `/api/usuarios` (admin).

## Frontend

- **Login:** usuario + contraseña.
- **Reservar:** selector de fecha + selector de tramo (hora inicio/fin) → se
  pinta el plano con los puestos coloreados según ocupación en ese tramo.
  Click en puesto libre → modal (tipo, servicio, departamento) → guardar.
  El Staff puede cancelar sus propias reservas.
- **Histórico:** tabla con filtros (fecha, servicio, departamento, puesto,
  tipo) y exportación visual. Muestra activas y canceladas.
- **Admin:** gestión de usuarios, servicios, departamentos, puestos.

## Layout visual (plano)

Reutilizar el plano validado durante el brainstorming: despachos con 2
posiciones (mesa + 2 sillas), filas enfrentadas y pasillo vertical central.

## Fase 1 (MVP)

1. Login + autenticación JWT.
2. CRUD básico de servicios/departamentos vía admin (o seed inicial).
3. Sembrado de puestos por código generado.
4. Vista de reserva por fecha + plano interactivo + crear/cancelar reservas.
5. Histórico con filtros.

## Pendiente de confirmar

- Ninguno pendiente. Se implementa con 70 posiciones por zona
  (4 filas [4,4] + fila final [3,0]).

## Fuera de alcance (por ahora)

- Notificaciones (email/grupo).
- Reservas recurrentes.
- Múltiples plantas de gestión compleja (doble zona solo P2).
- Exportar a Excel/PDF (se añadirá si se pide).