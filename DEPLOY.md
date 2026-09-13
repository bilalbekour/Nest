# Deploy en un servidor real

Guía paso a paso para poner Nido en producción. La app es FastAPI + SQLite + frontend
estático servido por FastAPI (sin build). Un solo proceso `uvicorn` y, recomendado, un
nginx delante para HTTPS.

## 1. Requisitos del servidor

- Linux (probado en Debian/Ubuntu), 1 CPU/512 MB RAM sobran con holgura.
- Python 3.11+ (`sudo apt install python3 python3-venv`).
- Dominio apuntando al servidor (para HTTPS con Let's Encrypt).

## 2. Crear el usuario de aplicación

Ejecuta la app como usuario propio, no como root:

```bash
sudo useradd -r -m -s /usr/sbin/nologin nido
```

## 3. Copiar el código

```bash
sudo mkdir -p /opt/nido
# desde la máquina de desarrollo:
scp -r . nido@server:/tmp/nido   # (o: git clone https://... /opt/nido)
```

La ubicación real debe ser `/opt/nido` y propietario `nido`:

```bash
sudo rsync -a --delete /tmp/nido/ /opt/nido/
sudo chown -R nido:nido /opt/nido
```

## 4. Entorno virtual y dependencias

```bash
cd /opt/nido
sudo -u nido python3 -m venv .venv
sudo -u nido .venv/bin/pip install --upgrade pip
sudo -u nido .venv/bin/pip install -r requirements.txt
```

## 5. Base de datos: SQLite (por defecto) o PostgreSQL

Por defecto se usa SQLite (`/opt/nido/nido.db`), suficiente para un solo servidor.

```bash
sudo -u nido .venv/bin/python -m app.seed   # crea nido.db y puestos por defecto
```

Para usar **PostgreSQL** (recomendado con varios servidores o más carga):

```bash
sudo apt install postgresql postgresql-client
sudo -u postgres createuser nido --pwprompt   # define una contraseña
sudo -u postgres createdb -O nido nido
```

Y define la conexión en el entorno (`.env` o `Environment=` del servicio):

```
DATABASE_URL=postgresql://nido:TU_PASSWORD@127.0.0.1:5432/nido
```

La app detecta el backend solo (conexión, PRAGMA de FKs y módulo de backups incluido).
Los backups con Postgres usan `pg_dump` (formato custom); se restauran con
`pg_restore --clean -d nido nido-XXXX.dump`. El seed es el mismo
(`python -m app.seed`).

> `.env` se genera solo: en el primer arranque `config.py` crea una `SECRET_KEY`
> aleatoria y la guarda ahí (no hace falta crearla a mano). Nunca commitees `.env`.

## 6. Cambiar la contraseña por defecto

Tras el primer arranque, entra con `admin` / `admin123` y cambia la contraseña en
Admin → Usuarios. Elimina o cambia la contraseña de cualquier otro usuario previsto.

## 7. Servicio systemd

Crea `/etc/systemd/system/nido.service`:

```ini
[Unit]
Description=Reserva de Puestos (Nido)
After=network.target

[Service]
User=nido
Group=nido
WorkingDirectory=/opt/nido
EnvironmentFile=/opt/nido/.env
ExecStart=/opt/nido/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

> Átate a `127.0.0.1`: nginx hace de puerta de entrada. Si no vas a usar nginx,
> usa `--host 0.0.0.0` y habilita `ufw allow 8000`.

Actívalo:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nido
sudo systemctl status nido
```

Comprueba que responde: `curl http://127.0.0.1:8000/` → `200`.

## 8. nginx + HTTPS (recomendado)

Instala nginx y certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Crea `/etc/nginx/sites-available/nido`:

```nginx
server {
    listen 80;
    server_name nest.ejemplo.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nest.ejemplo.com;

    # el apartado ssl lo rellena certbot con --install-only
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activa y emite el certificado:

```bash
sudo ln -s /etc/nginx/sites-available/nido /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d nest.ejemplo.com
```

## 9. Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 10. Copias de seguridad

La app guarda copias en `/opt/nido/backups/` (al arrancar y cada día a las 03:00,
se conservan las 7 últimas). Si el disco muere se pierde todo, así que sácalas del
servidor. Ejemplo con cron diario:

```cron
0 4 * * * rsync -a --delete /opt/nido/backups/ respaldo@otro-servidor:/backups/nido/ >> /tmp/rsync-nido.log 2>&1
```

Restaurar una copia: detener el servicio, `cp backups/nido-XXXX.db nido.db`, arrancar.

## 11. Actualizar

```bash
cd /opt/nido
sudo systemctl stop nido
sudo git pull            # o re-copiar el código
sudo chown -R nido:nido .
sudo systemctl start nido
```

Recomendación: antes de actualizar, crear una copia manual en Admin → Sistema.

## Notas de seguridad

- **HTTPS obligatorio**: el token se envía en la cabecera `Authorization`; sin TLS
  viaja en claro.
- No abras `/docs` ninguna: están deshabilitados (`docs_url=None`).
- Revisa los logs periódicamente: `journalctl -u nido -n 200`.
- Las reservas nunca se borran (se marcan canceladas); el histórico es permanente.