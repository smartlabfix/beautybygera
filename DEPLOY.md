# Publicar Beauty By Gera

El objetivo de esta guía es que la web deje de depender de tu PC. Hay dos caminos: uno gratis e inmediato para **enseñarla**, y otro para **recibir reservas reales** sin perder datos.

## Opción A — Render gratis (para que la clienta la vea)

Render puede servir el proyecto tal cual, sin instalar nada. La web queda en una URL fija de `onrender.com`.

### 1. Cuentas
- Crea una cuenta gratis en <https://render.com> (no pide tarjeta).
- Crea una cuenta en <https://github.com> si no la tienes.

### 2. Subir el proyecto
- Descomprime `beauty-by-gera-deploy.zip`.
- Crea un repositorio **privado** en GitHub y sube **el contenido** de la carpeta (no la carpeta en sí).
- También puedes arrastrar los archivos desde la web de GitHub.

### 3. Crear el servicio
En Render:
1. **New → Web Service**.
2. Conecta el repositorio.
3. Render detecta el `Dockerfile` (runtime Docker).
4. Plan **Free**, región **Frankfurt**.
5. Añade estas variables de entorno:
   - `PREVIEW_MODE` = `1`
   - `ADMIN_PASSWORD` = una contraseña larga y propia (se usa al crear la base; no se muestra en logs)
6. **Create Web Service**.

En unos minutos tendrás una URL tipo `https://beauty-by-gera.onrender.com`. Esa es la que le pasas a tu clienta.

### Limitaciones del plan gratis (importante)
- **Se duerme** tras 15 minutos sin visitas. La primera visita puede tardar ~30 segundos.
- **Disco efímero**: cada reinicio o despliegue borra las reservas nuevas y las fotos que se suban desde el panel. Lo que va dentro de la imagen (textos, servicios, logo, fotos actuales y reseñas) sí se conserva, porque está en `data/seed.json` y `public/uploads/`.
- Si cambias la contraseña desde el panel, tras un reinicio volverá a la definida en `ADMIN_PASSWORD`.
- Para una **demostración** es perfecto. Para que la clienta gestione reservas de verdad, usa la opción B o C.

### Panel en el hosting
Con `PREVIEW_MODE=1` el panel queda bloqueado desde internet (403), igual que ahora. Si quieres que Gera pueda abrirlo desde su casa:
- Cambia `PREVIEW_MODE` a `0`.
- Define `ADMIN_PASSWORD` con una contraseña fuerte.
- El panel estará en `https://TU-URL.onrender.com/admin`.

## Opción B — Oracle Cloud Always Free (persistente y 0 €/mes)

Una VM gratuita con disco persistente. Requiere crear cuenta (pide tarjeta solo para verificar, no cobra) y unos minutos de configuración:

1. Crea una instancia Always Free (Ubuntu, 1 GB).
2. Abre el puerto 80/443 en la red de Oracle.
3. Instala Node 20+ y Caddy.
4. Copia el proyecto (sin `data/store.json` ni `.tools`).
5. Arranca con systemd:
   ```ini
   [Service]
   WorkingDirectory=/opt/beauty-by-gera
   ExecStart=/usr/bin/node server.mjs
   Environment=PORT=4180
   Environment=PREVIEW_MODE=0
   Restart=always
   ```
6. Caddy como reverse proxy a `127.0.0.1:4180` para HTTPS automático.
7. Copia de seguridad diaria de `data/store.json` y `public/uploads/`.

Aquí las reservas y las fotos **sí persisten**.

## Opción C — VPS barato (3–5 €/mes)

Mismo despliegue que la opción B en Hetzner, DigitalOcean o Contabo. Es la vía más sencilla para producción real con dominio propio y backups.

## Qué se sube y qué no

- **Sí**: `server.mjs`, `package.json`, `Dockerfile`, `render.yaml`, `public/` (incluye `public/uploads/`), `data/seed.json`, documentación.
- **No**: `data/store.json` (base real con citas), `.tools/`, `shots/`, `ACCESO-PANEL.txt`, `ENLACE-PUBLICO.txt`, logs.

El servidor crea `data/store.json` al arrancar. Si existe `data/seed.json`, lo usa como contenido inicial (textos, precios, fotos, reseñas). Si no, usa los valores por defecto.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `PORT` | Puerto HTTP. Render la define automáticamente. |
| `PREVIEW_MODE=1` | Bloquea el panel a accesos externos. Útil para demo pública. |
| `ADMIN_PASSWORD` | Contraseña inicial del panel cuando se crea la base. |
| `DATA_DIR` | Carpeta de `store.json` (por defecto `./data`). |
| `UPLOADS_DIR` | Carpeta de fotos (por defecto `./public/uploads`). |

## Antes de enseñarla

- Revisa en **Ajustes** el teléfono, WhatsApp e Instagram reales.
- Cambia la contraseña del panel por una que recuerdes.
- Haz una reserva de prueba y bórrala desde **Agenda**.
- Comprueba el mapa y las fotos de los efectos.
