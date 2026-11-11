# Beauty By Gera · Web de reservas

Web completa para el estudio de pestañas **Beauty By Gera**: la clienta elige efecto, ve el precio, consulta el calendario con huecos reales y reserva en 30 segundos. Todo se gestiona desde un panel privado.

## Arrancar

```bat
start.bat
```

O en terminal:

```bash
node server.mjs
```

- Web pública: <http://localhost:4180>
- Panel: <http://localhost:4180/admin>

La contraseña actual está en **`ACCESO-PANEL.txt`**, en esta misma carpeta. Entra y cámbiala en *Ajustes → Seguridad*; después borra ese archivo. Si la olvidas, cierra el servidor y ejecuta `reset-password.bat`.

> No necesita instalar nada: usa Node.js y sus módulos nativos. Los datos se guardan en `data/store.json` y las fotos en `public/uploads/`.

## Qué incluye

**Web pública**
- Portada con estética 2026 (tipografía editorial, degradados rosa-champán, glassmorphism).
- Los 8 efectos con su precio: Clásico 55 € · Volumen, Volumen Ruso, 2D, 3D, Muñeca, Húmedo y Ojo de Gato 60 €.
- Calendario real: solo muestra días con huecos libres, y las horas desaparecen al reservarse.
- Formulario con nombre, teléfono, email y notas. Confirmación con resumen y botón para enviarlo por WhatsApp.
- Galería automática con las fotos que subas, con visor a pantalla completa.
- Mapa del estudio con botón «Cómo llegar» (OpenStreetMap, sin claves ni cuotas).
- Reseñas de clientas con estrellas, media de valoración y enlace a tus reseñas de Google.
- Botón flotante de WhatsApp y barra de reserva fija en móvil.

**Panel de administración**
- **Agenda**: citas ordenadas, filtros (próximas / por confirmar / todas / canceladas), confirmar, cancelar, borrar y contacto directo por teléfono o WhatsApp. Estadísticas de hoy, próximas, pendientes e ingresos del mes.
- **Disponibilidad**: horario semanal por día (añadir/quitar horas), días especiales con horario distinto o cerrados, y bloqueo de vacaciones.
- **Galería**: subida múltiple por arrastre, optimización automática de las fotos, pies de foto, elegir foto de portada y eliminar.
- **Reseñas**: aprobar, rechazar o borrar opiniones y responder públicamente (tu respuesta se ve en la web).
- **Ajustes**: textos de portada, teléfono, WhatsApp, Instagram, dirección, aviso de reserva, precios y duración de cada efecto, y cambio de contraseña.
- **Ajustes → Ubicación y mapa**: escribes la dirección, pulsas «Buscar dirección» y el mapa se coloca solo. También admite latitud/longitud manuales.

## Cómo se usa el día a día

1. Entra al panel y revisa **Agenda** por la mañana.
2. Confirma las citas pendientes con el ✓.
3. En **Disponibilidad** define tu semana tipo. Si un día cambia, usa *Días especiales*; si te vas, *Vacaciones*.
4. Sube fotos nuevas a **Galería** cuando tengas trabajos bonitos.
5. Mantén los precios y el teléfono actualizados en **Ajustes**.

## Cambiar datos de contacto

En **Ajustes** están el teléfono visible, el WhatsApp (con prefijo, p. ej. `+34600123456`) y el Instagram. Los valores actuales son de ejemplo: cámbialos antes de enseñar la web.

En **Ajustes → Ubicación y mapa** escribe la dirección completa del estudio y pulsa «Buscar dirección». En **Ajustes → Reseñas** puedes pegar el enlace de tu ficha de Google y decidir si las reseñas se publican solas o las revisas antes.

## Copias de seguridad

Copia estas dos rutas y tendrás todo:

- `data/store.json` → citas, horarios, precios, textos y galería.
- `public/uploads/` → fotos.

## Publicarla en internet (siguiente paso)

**Para enseñársela a tu clienta ahora mismo:**

```bat
preview.bat
```

Abre un túnel HTTPS público temporal (la dirección aparece en la ventana). El panel queda cerrado desde internet. Detalles y límites en [DEPLOY.md](DEPLOY.md).

**Para una URL fija gratis:** despliegue en Render (plan Free) con el `Dockerfile` incluido. Instrucciones paso a paso en [DEPLOY.md](DEPLOY.md).

**Para reservas reales:** hace falta disco persistente. Las opciones sensatas son un VPS barato o la capa Always Free de Oracle Cloud, con HTTPS y backups. También está explicado en [DEPLOY.md](DEPLOY.md).

En cualquier caso necesitas:

1. Un dominio (ej. `beautybygera.com`).
2. Un servidor pequeño o hosting con Node (Render, Railway, VPS…).
3. HTTPS (certificado gratuito con Caddy o Let's Encrypt).

El proyecto ya escucha en `0.0.0.0`, así que también puedes probarlo en tu red local abriendo `http://TU-IP-LOCAL:4180` desde el móvil.

## Estructura

```
server.mjs          Servidor HTTP + API (sin dependencias)
public/index.html   Web pública
public/styles.css   Diseño
public/app.js       Reserva y calendario
public/admin.html   Panel
public/admin.js     Lógica del panel
public/admin.css    Estilos del panel
data/store.json     Base de datos (se crea sola)
public/uploads/     Fotos subidas
```
