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
| `PUBLIC_URL` | URL pública para los enlaces de los avisos (ej. `https://beautybygera.onrender.com`). |
| `RESEND_API_KEY` | Clave de Resend para avisar por email. |
| `NOTIFY_EMAIL` | Email donde quieres recibir las citas. |
| `NOTIFY_FROM` | Remitente verificado (por defecto `onboarding@resend.dev`). |
| `CALLMEBOT_PHONE` | Tu WhatsApp con prefijo (ej. `+34600111222`). |
| `CALLMEBOT_APIKEY` | Clave que te da CallMeBot. |
| `CRON_SECRET` | Clave para el endpoint de recordatorios automáticos. |
| `BREVO_API_KEY` | Clave de Brevo para enviar emails a clientas sin dominio propio. |
| `BREVO_FROM` | Email verificado en Brevo que aparecerá como remitente. |
| `BREVO_FROM_NAME` | Nombre del remitente (por defecto `Beauty By Gera`). |

## Avisos de nuevas citas

Cada reserva puede avisarte por **email**, por **WhatsApp** o por ambos. Los avisos se envían después de guardar la cita; si el proveedor falla, la reserva no se pierde.

Puedes configurarlo de dos formas:

- **Desde el panel** → *Ajustes → Avisos de nuevas citas*: activas el canal, pegas las claves y usas los botones **Probar**. Es lo más cómodo.
- **Desde Render → Environment**: las variables mandan y sobreviven a reinicios. En el plan gratis, lo que guardes solo en el panel se pierde cuando el servicio se reinicia o redespliega, así que usa el panel para probar y las variables para dejarlo fijo.

### Email con Resend (recomendado)
1. Crea una cuenta gratis en <https://resend.com> (100 emails/día).
2. En **API Keys**, crea una clave y cópiala.
3. En Render → **Environment** añade:
   - `RESEND_API_KEY` = la clave
   - `NOTIFY_EMAIL` = tu email
   - `NOTIFY_FROM` = `Beauty By Gera <onboarding@resend.dev>` (para pruebas)
4. Guarda y redespliega.

Con `onboarding@resend.dev` solo puedes enviarte emails a la dirección con la que creaste Resend. Para enviar a otra, verifica tu dominio en Resend y usa un remitente como `citas@beautybygera.com`.

### WhatsApp con CallMeBot
1. Guarda el número **+34 644 66 32 62** en tus contactos.
2. Envíale por WhatsApp el mensaje: `I allow callmebot to send me messages`
3. Te responderá con una **API key**.
4. En Render → **Environment** añade:
   - `CALLMEBOT_PHONE` = tu número con prefijo (`+34...`)
   - `CALLMEBOT_APIKEY` = la clave que te dio
5. Guarda y redespliega.

CallMeBot es un servicio gratuito no oficial: puede tardar o limitar envíos. Para algo crítico, usa email o una API oficial.

### Comprobar
En el panel → **Ajustes → Avisos de nuevas citas** verás si cada canal está **Activado**. Haz una reserva de prueba y revisa el email/WhatsApp; luego bórrala en Agenda.

## Recordatorios a clientas

En **Ajustes → Recordatorios a clientas** puedes activarlos y elegir **24 h** o **12 h** antes.

- **Email automático**: se envía a la dirección que dejó la clienta. Hay dos proveedores:
  - **Brevo** (recomendado si no tienes dominio): crea cuenta gratis, verifica tu email como remitente y define `BREVO_API_KEY` y `BREVO_FROM`. Permite escribir a cualquier clienta.
  - **Resend**: necesita un **dominio verificado**; con `onboarding@resend.dev` solo puedes escribirte a ti, no a las clientas.
- **WhatsApp**: CallMeBot no puede escribir a números que no hayan autorizado el bot, así que en Agenda tienes un botón **⏰** que abre WhatsApp con el recordatorio ya escrito para enviarlo con un toque. Para envío automático real hace falta la API oficial de Meta (cuenta Business, número verificado y plantilla aprobada).

### Que los recordatorios se ejecuten siempre
Render Free **duerme** el servicio tras 15 minutos sin visitas, y entonces el proceso interno no corre. Solución gratuita:

1. Define `CRON_SECRET` en Render → Environment.
2. Crea una tarea gratuita en <https://cron-job.org> cada 10 minutos contra:
   `https://TU-URL.onrender.com/api/cron/reminders?key=TU_CRON_SECRET`
3. Cada llamada despierta el servicio y envía los recordatorios que toquen.

El endpoint responde 403 si la clave no coincide y `{sent:n}` si todo va bien.

## Evitar que Render se duerma

El plan Free duerme el servicio tras 15 minutos sin visitas. Para mantenerlo despierto sin pagar:

1. El repositorio incluye `.github/workflows/keepalive.yml`, que hace una petición cada 5 minutos.
2. En GitHub → pestaña **Actions** → workflow **keepalive** → **Enable workflow** y, si quieres, **Run workflow** una vez para probar.
3. GitHub Actions es gratis en repositorios públicos. En privados consume minutos, pero con una ejecución de segundos cada 5 minutos entra en la cuota gratuita.

Limitaciones: GitHub puede retrasar las tareas programadas y las desactiva tras 60 días sin actividad en el repo. Si necesitas algo garantizado, usa **cron-job.org** cada 5 minutos contra `/api/health` o pasa al plan **Starter** de Render (7 $/mes), que no duerme.

## Antes de enseñarla

- Revisa en **Ajustes** el teléfono, WhatsApp e Instagram reales.
- Cambia la contraseña del panel por una que recuerdes.
- Haz una reserva de prueba y bórrala desde **Agenda**.
- Comprueba el mapa y las fotos de los efectos.
