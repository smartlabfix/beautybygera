import http from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const UPLOADS = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(PUBLIC, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4180);
const PREVIEW_MODE = process.env.PREVIEW_MODE === '1';
const NOTIFY = {
  resendKey: process.env.RESEND_API_KEY || '',
  emailTo: process.env.NOTIFY_EMAIL || '',
  emailFrom: process.env.NOTIFY_FROM || 'Beauty By Gera <onboarding@resend.dev>',
  waPhone: process.env.CALLMEBOT_PHONE || '',
  waKey: process.env.CALLMEBOT_APIKEY || '',
  resendBase: process.env.RESEND_BASE || 'https://api.resend.com',
  callmeBase: process.env.CALLMEBOT_BASE || 'https://api.callmebot.com',
  publicUrl: process.env.PUBLIC_URL || '',
};

const DEFAULT_PASSWORD = 'Gera2026!';
const INITIAL_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

const SERVICES_SEED = [
  { id: 'clasico', name: 'Efecto Clásico', price: 55, icon: '✦', tag: 'Natural', dur: '1 h 45 min', desc: 'Una extensión por pestaña natural. Mirada limpia, definida y siempre favorecedora.' },
  { id: 'volumen', name: 'Volumen', price: 60, icon: '❋', tag: 'Con cuerpo', dur: '2 h', desc: 'Abanicos ligeros que multiplican la densidad sin perder naturalidad.' },
  { id: 'ruso', name: 'Volumen Ruso', price: 60, icon: '✺', tag: 'Máximo glam', dur: '2 h 30 min', desc: 'Abanicos de 3 a 6 fibras hechos a mano. Densidad de alfombra roja.' },
  { id: '2d', name: '2D', price: 60, icon: '❃', tag: 'Equilibrado', dur: '2 h', desc: 'Dos fibras por pestaña: el punto medio perfecto entre volumen y naturalidad.' },
  { id: '3d', name: '3D', price: 60, icon: '✿', tag: 'Intenso', dur: '2 h 15 min', desc: 'Tres fibras por pestaña para una mirada profunda y muy fotogénica.' },
  { id: 'muneca', name: 'Efecto Muñeca', price: 60, icon: '❀', tag: 'Doll eyes', dur: '2 h', desc: 'Centro más largo y puntas cortas: ojos grandes, redondos y dulces.' },
  { id: 'humedo', name: 'Efecto Húmedo', price: 60, icon: '✧', tag: 'Wet look', dur: '2 h', desc: 'Puntas agrupadas y brillo sutil. Ese look de recién salida de la ducha.' },
  { id: 'gato', name: 'Ojo de Gato', price: 60, icon: '❥', tag: 'Alargado', dur: '2 h', desc: 'Las fibras más largas en el rabillo. Mirada felina, elevada y magnética.' },
];

function seedStore() {
  const weekly = {};
  for (let d = 0; d < 7; d++) weekly[d] = [];
  weekly[2] = ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'];
  weekly[3] = ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'];
  weekly[4] = ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'];
  weekly[5] = ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'];
  weekly[6] = ['10:00', '11:00', '12:00'];
  return {
    settings: {
      heroTitle: 'Tu mirada, en versión película.',
      heroSubtitle: 'Pestañas hechas a medida en un estudio íntimo. Diseñamos el efecto que mejor habla de ti — y lo reservas en 30 segundos.',
      phone: '+34 600 000 000',
      whatsapp: '+34600000000',
      instagram: '@beautybygera',
      address: 'Estudio privado · Cita previa',
      notice: 'Primera visita: diagnóstico gratuito de mirada. Cancelación sin coste hasta 24 h antes.',
      heroImage: '',
      logo: '',
      favicon: '',
      mapLat: null,
      mapLng: null,
      mapZoom: 16,
      googleReviewUrl: '',
      reviewsEnabled: true,
      reviewsAutoApprove: false,
      notify: {
        emailEnabled: true,
        whatsappEnabled: true,
        emailTo: '',
        emailFrom: '',
        resendKey: '',
        waPhone: '',
        waKey: '',
      },
    },
    services: SERVICES_SEED,
    weekly,
    overrides: {},
    blockedDates: [],
    bookings: [],
    gallery: [],
    auth: { password: hashPassword(INITIAL_PASSWORD), secret: crypto.randomBytes(32).toString('hex') },
  };
}

function mergeSeed(seed) {
  const base = seedStore();
  return {
    ...base,
    ...seed,
    settings: { ...base.settings, ...(seed.settings || {}) },
    services: Array.isArray(seed.services) && seed.services.length ? seed.services : base.services,
    weekly: seed.weekly || base.weekly,
    overrides: seed.overrides || {},
    blockedDates: seed.blockedDates || [],
    gallery: seed.gallery || [],
    reviews: seed.reviews || [],
    bookings: [],
    auth: base.auth,
  };
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function verifyPassword(pw, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- store ---------- */
let store = null;
let freshStore = false;
let writeChain = Promise.resolve();

async function loadStore() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS, { recursive: true });
  if (existsSync(DB_FILE)) {
    const raw = await readFile(DB_FILE, 'utf8');
    store = JSON.parse(raw);
    const baseSettings = seedStore().settings;
    store.settings = {
      ...baseSettings,
      ...store.settings,
      notify: { ...baseSettings.notify, ...(store.settings.notify || {}) },
    };
    store.services = Array.isArray(store.services) && store.services.length ? store.services : SERVICES_SEED;
    store.weekly = store.weekly || {};
    store.overrides = store.overrides || {};
    store.blockedDates = store.blockedDates || [];
    store.bookings = store.bookings || [];
    store.gallery = store.gallery || [];
    store.reviews = store.reviews || [];
    store.auth = store.auth || { password: hashPassword(INITIAL_PASSWORD) };
    if (!store.auth.secret) store.auth.secret = crypto.randomBytes(32).toString('hex');
  } else {
    let seed = null;
    const seedFile = path.join(DATA_DIR, 'seed.json');
    if (existsSync(seedFile)) {
      try { seed = JSON.parse(await readFile(seedFile, 'utf8')); }
      catch (err) { console.error('[seed] seed.json no válido:', err.message); }
    }
    store = seed ? mergeSeed(seed) : seedStore();
    freshStore = true;
    await persist();
  }
}
function persist() {
  writeChain = writeChain.then(async () => {
    await writeFile(DB_FILE, JSON.stringify(store, null, 2), 'utf8');
  });
  return writeChain;
}

/* ---------- helpers ---------- */
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function madridNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { date, minutes };
}
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function isDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function isTimeStr(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function dateInMonth(dateStr, ym) { return dateStr.startsWith(ym + '-'); }

function baseSlotsFor(dateStr) {
  if (store.blockedDates.includes(dateStr)) return [];
  const ov = store.overrides[dateStr];
  if (ov && Array.isArray(ov.slots)) return [...ov.slots].sort();
  return [...(store.weekly[weekdayOf(dateStr)] || [])].sort();
}
function activeBookingsFor(dateStr) {
  return store.bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
}
function freeSlotsFor(dateStr) {
  const now = madridNow();
  const booked = new Set(activeBookingsFor(dateStr).map((b) => b.time));
  const buffer = 45;
  return baseSlotsFor(dateStr).filter((t) => {
    if (booked.has(t)) return false;
    if (dateStr < now.date) return false;
    if (dateStr === now.date && timeToMin(t) < now.minutes + buffer) return false;
    return true;
  });
}

const reviewLimits = new Map();

async function geocodeAddress(address) {
  const q = String(address || '').trim();
  if (q.length < 4) return null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'es');
    const r = await fetch(url, {
      headers: { 'User-Agent': 'BeautyByGeraStudio/1.0 (panel local del estudio)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const lat = Number(arr[0].lat);
    const lon = Number(arr[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, display: String(arr[0].display_name || '') };
  } catch { return null; }
}

/* ---------- avisos de nueva cita ---------- */
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function bookingDateLabel(dateStr) {
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}
function bookingMessage(b, adminUrl) {
  const lines = [
    '✦ Nueva cita en Beauty By Gera',
    '',
    `Efecto: ${b.serviceName}`,
    `Fecha: ${bookingDateLabel(b.date)}`,
    `Hora: ${b.time} h`,
    `Precio: ${b.price}€`,
    `Clienta: ${b.name}`,
    `Teléfono: ${b.phone}`,
  ];
  if (b.email) lines.push(`Email: ${b.email}`);
  if (b.notes) lines.push(`Notas: ${b.notes}`);
  if (adminUrl) lines.push('', `Panel: ${adminUrl}`);
  return lines.join('\n');
}

function getNotifyConfig() {
  const n = store.settings.notify || {};
  return {
    emailKey: n.resendKey || NOTIFY.resendKey,
    emailTo: n.emailTo || NOTIFY.emailTo,
    emailFrom: n.emailFrom || NOTIFY.emailFrom,
    waPhone: n.waPhone || NOTIFY.waPhone,
    waKey: n.waKey || NOTIFY.waKey,
    emailOn: n.emailEnabled !== false,
    waOn: n.whatsappEnabled !== false,
  };
}

async function notifyEmail(b, adminUrl) {
  const c = getNotifyConfig();
  if (!c.emailOn || !c.emailKey || !c.emailTo) return { ok: false, error: 'sin configurar' };
  try {
    const text = bookingMessage(b, adminUrl);
    const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#241318">
      <h2 style="font-family:Georgia,serif;color:#7d2f45;margin:0 0 12px">Nueva cita</h2>
      <p style="margin:0 0 12px"><b>${escHtml(b.serviceName)}</b> · ${escHtml(bookingDateLabel(b.date))} · ${escHtml(b.time)} h · ${escHtml(String(b.price))}€</p>
      <p style="margin:0 0 6px"><b>Clienta:</b> ${escHtml(b.name)}</p>
      <p style="margin:0 0 6px"><b>Teléfono:</b> ${escHtml(b.phone)}</p>
      ${b.email ? `<p style="margin:0 0 6px"><b>Email:</b> ${escHtml(b.email)}</p>` : ''}
      ${b.notes ? `<p style="margin:0 0 6px"><b>Notas:</b> ${escHtml(b.notes)}</p>` : ''}
      ${adminUrl ? `<p style="margin-top:16px"><a href="${escHtml(adminUrl)}" style="color:#d8748e">Abrir el panel</a></p>` : ''}
    </div>`;
    const r = await fetch(NOTIFY.resendBase + '/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.emailKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: c.emailFrom,
        to: [c.emailTo],
        subject: `Nueva cita · ${b.name} · ${bookingDateLabel(b.date)} ${b.time}`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) { console.warn('[notify] email respondió', r.status); return { ok: false, error: 'HTTP ' + r.status }; }
    return { ok: true };
  } catch (err) {
    console.warn('[notify] email falló:', err.message, err.cause?.message || '');
    return { ok: false, error: err.message };
  }
}

async function notifyWhatsApp(b, adminUrl) {
  const c = getNotifyConfig();
  if (!c.waOn || !c.waPhone || !c.waKey) return { ok: false, error: 'sin configurar' };
  try {
    const url = new URL(NOTIFY.callmeBase + '/whatsapp.php');
    url.searchParams.set('phone', c.waPhone);
    url.searchParams.set('text', bookingMessage(b, adminUrl));
    url.searchParams.set('apikey', c.waKey);
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) { console.warn('[notify] whatsapp respondió', r.status); return { ok: false, error: 'HTTP ' + r.status }; }
    return { ok: true };
  } catch (err) {
    console.warn('[notify] whatsapp falló:', err.message, err.cause?.message || '');
    return { ok: false, error: err.message };
  }
}

async function notifyBooking(b, req) {
  let adminUrl = '';
  try {
    if (NOTIFY.publicUrl) adminUrl = NOTIFY.publicUrl.replace(/\/$/, '') + '/admin';
    else {
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (host) adminUrl = `${proto}://${host}/admin`;
    }
  } catch {}
  await Promise.allSettled([notifyEmail(b, adminUrl), notifyWhatsApp(b, adminUrl)]);
}

/* ---------- http ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

const loginAttempts = new Map(); // ip -> {count, reset}

/* Sesiones firmadas: sobreviven a reinicios del servidor. */
function signToken(expiresAt) {
  const sig = crypto.createHmac('sha256', store.auth.secret).update(String(expiresAt)).digest('base64url');
  return `${expiresAt}.${sig}`;
}
function isAuthed(req) {
  const token = parseCookies(req).bgg_session;
  if (!token) return false;
  const [expStr, sig] = String(token).split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  const expected = crypto.createHmac('sha256', store.auth.secret).update(String(exp)).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  json(res, 401, { error: 'No autorizado' });
  return false;
}

// En demo pública el panel solo se abre desde el propio ordenador.
function blockedInPreview(req) {
  if (!PREVIEW_MODE) return false;
  return Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['x-forwarded-for']);
}

function publicSettings() {
  const { notify, ...rest } = store.settings;
  return rest;
}

function publicSite() {
  const approved = store.reviews.filter((r) => r.status === 'approved');
  const count = approved.length;
  const avg = count ? Math.round((approved.reduce((s, r) => s + Number(r.rating || 0), 0) / count) * 10) / 10 : 0;
  return {
    settings: publicSettings(),
    services: store.services.map((s) => ({ ...s, image: s.image || '' })),
    gallery: store.gallery,
    reviews: approved.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 24),
    reviewStats: { count, avg },
    monthsWithData: [...new Set(store.bookings.filter(b => b.status !== 'cancelled').map(b => b.date.slice(0, 7)))],
  };
}

/* ---------- routes ---------- */
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/site' && req.method === 'GET') return json(res, 200, publicSite());

  if (p === '/api/availability' && req.method === 'GET') {
    const ym = url.searchParams.get('month') || madridNow().date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return json(res, 400, { error: 'Mes no válido' });
    const [y, m] = ym.split('-').map(Number);
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = {};
    for (let d = 1; d <= total; d++) {
      const ds = `${ym}-${String(d).padStart(2, '0')}`;
      const free = freeSlotsFor(ds);
      if (free.length) days[ds] = { total: baseSlotsFor(ds).length, free: free.length };
    }
    return json(res, 200, { month: ym, label: `${MONTH_NAMES[m - 1]} ${y}`, days });
  }

  if (p === '/api/slots' && req.method === 'GET') {
    const date = url.searchParams.get('date');
    if (!isDateStr(date)) return json(res, 400, { error: 'Fecha no válida' });
    return json(res, 200, { date, slots: freeSlotsFor(date) });
  }

  if (p === '/api/bookings' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    const service = store.services.find((s) => s.id === body.serviceId);
    if (!service) return json(res, 400, { error: 'Elige un efecto válido' });
    if (!isDateStr(body.date)) return json(res, 400, { error: 'Fecha no válida' });
    if (!isTimeStr(body.time)) return json(res, 400, { error: 'Hora no válida' });
    const name = String(body.name || '').trim().slice(0, 80);
    const phone = String(body.phone || '').trim().slice(0, 30);
    const email = String(body.email || '').trim().slice(0, 120);
    const notes = String(body.notes || '').trim().slice(0, 500);
    if (name.length < 2) return json(res, 400, { error: 'Escribe tu nombre' });
    if (phone.replace(/[^\d]/g, '').length < 9) return json(res, 400, { error: 'Teléfono no válido' });
    if (!baseSlotsFor(body.date).includes(body.time)) return json(res, 400, { error: 'Ese horario no está disponible ese día.' });
    if (!freeSlotsFor(body.date).includes(body.time)) return json(res, 409, { error: 'Ese hueco acaba de ocuparse. Elige otra hora.' });
    const booking = {
      id: crypto.randomBytes(8).toString('hex'),
      serviceId: service.id, serviceName: service.name, price: service.price,
      date: body.date, time: body.time, name, phone, email, notes,
      status: 'pending', createdAt: new Date().toISOString(),
    };
    store.bookings.push(booking);
    await persist();
    await notifyBooking(booking, req);
    return json(res, 201, { ok: true, booking, whatsapp: store.settings.whatsapp });
  }

  if (p === '/api/reviews' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'x';
    const now = Date.now();
    const recent = (reviewLimits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= 3) return json(res, 429, { error: 'Ya has enviado varias reseñas. Gracias ✦' });
    let body;
    try { body = JSON.parse(await readBody(req, 32 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    const name = String(body.name || '').trim().slice(0, 40);
    const text = String(body.text || '').trim().slice(0, 600);
    const rating = Math.round(Number(body.rating));
    const serviceId = store.services.some((s) => s.id === body.serviceId) ? body.serviceId : '';
    if (name.length < 2) return json(res, 400, { error: 'Escribe tu nombre' });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return json(res, 400, { error: 'Elige de 1 a 5 estrellas' });
    if (text.length < 4) return json(res, 400, { error: 'Cuéntanos un poco más' });
    const auto = store.settings.reviewsAutoApprove === true;
    const review = {
      id: crypto.randomBytes(8).toString('hex'),
      name, rating, text, serviceId,
      status: auto ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
    };
    store.reviews.push(review);
    recent.push(now);
    reviewLimits.set(ip, recent);
    await persist();
    return json(res, 201, {
      ok: true,
      published: auto,
      message: auto ? '¡Gracias! Tu reseña ya está publicada ✦' : '¡Gracias! Tu reseña se publicará en cuanto la revise Gera ✦',
    });
  }

  /* ---- admin ---- */
  if (p === '/api/admin/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'x';
    const now = Date.now();
    const rec = loginAttempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + 15 * 60 * 1000; }
    if (rec.count >= 10) return json(res, 429, { error: 'Demasiados intentos. Prueba en unos minutos.' });
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (!verifyPassword(body.password || '', store.auth.password)) {
      rec.count += 1;
      loginAttempts.set(ip, rec);
      return json(res, 401, { error: 'Contraseña incorrecta' });
    }
    loginAttempts.delete(ip);
    const token = signToken(Date.now() + 12 * 60 * 60 * 1000);
    return json(res, 200, { ok: true }, {
      'Set-Cookie': `bgg_session=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Strict`,
    });
  }

  if (p === '/api/admin/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'bgg_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict' });
  }

  if (p === '/api/admin/session' && req.method === 'GET') {
    return json(res, 200, { authed: isAuthed(req) });
  }

  if (p === '/api/admin/data' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    return json(res, 200, {
      settings: publicSettings(), services: store.services.map((s) => ({ ...s, image: s.image || '' })), weekly: store.weekly,
      overrides: store.overrides, blockedDates: store.blockedDates,
      bookings: store.bookings.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      gallery: store.gallery,
      reviews: store.reviews.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      notify: (() => {
        const c = getNotifyConfig();
        return {
          email: Boolean(c.emailOn && c.emailKey && c.emailTo),
          whatsapp: Boolean(c.waOn && c.waPhone && c.waKey),
          emailEnabled: c.emailOn,
          whatsappEnabled: c.waOn,
          emailTo: c.emailTo,
          emailFrom: c.emailFrom,
          waPhone: c.waPhone,
          hasResendKey: Boolean(c.emailKey),
          hasWaKey: Boolean(c.waKey),
        };
      })(),
    });
  }

  if (p === '/api/admin/settings' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    const strings = ['heroTitle', 'heroSubtitle', 'phone', 'whatsapp', 'instagram', 'address', 'notice', 'heroImage', 'googleReviewUrl', 'logo', 'favicon'];
    for (const k of strings) if (typeof body[k] === 'string') store.settings[k] = body[k].slice(0, 600);
    for (const k of ['mapLat', 'mapLng']) {
      if (body[k] === null) store.settings[k] = null;
      else if (Number.isFinite(Number(body[k]))) store.settings[k] = Number(body[k]);
    }
    if (Number.isFinite(Number(body.mapZoom))) store.settings.mapZoom = Math.min(19, Math.max(3, Math.round(Number(body.mapZoom))));
    if (typeof body.reviewsEnabled === 'boolean') store.settings.reviewsEnabled = body.reviewsEnabled;
    if (typeof body.reviewsAutoApprove === 'boolean') store.settings.reviewsAutoApprove = body.reviewsAutoApprove;
    if (body.notify && typeof body.notify === 'object') {
      const n = store.settings.notify;
      for (const k of ['emailTo', 'emailFrom', 'waPhone']) {
        if (typeof body.notify[k] === 'string') n[k] = body.notify[k].trim().slice(0, 300);
      }
      for (const k of ['resendKey', 'waKey']) {
        if (body.notify[k] === null) n[k] = '';
        else if (typeof body.notify[k] === 'string' && body.notify[k].trim()) n[k] = body.notify[k].trim().slice(0, 500);
      }
      if (typeof body.notify.emailEnabled === 'boolean') n.emailEnabled = body.notify.emailEnabled;
      if (typeof body.notify.whatsappEnabled === 'boolean') n.whatsappEnabled = body.notify.whatsappEnabled;
    }
    let geocoded = null;
    if (body.geocode === true) {
      geocoded = await geocodeAddress(store.settings.address);
      if (geocoded) { store.settings.mapLat = geocoded.lat; store.settings.mapLng = geocoded.lon; }
    }
    await persist();
    return json(res, 200, { ok: true, settings: publicSettings(), geocoded });
  }

  if (p === '/api/admin/notify/test' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const sample = {
      serviceName: 'Efecto Clásico', price: 55, date: madridNow().date, time: '10:00',
      name: 'Prueba de aviso', phone: store.settings.phone || '600000000', email: '', notes: 'Aviso de prueba desde el panel.',
    };
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const origin = NOTIFY.publicUrl || (host ? `${proto}://${host}` : 'http://localhost:' + PORT);
    const adminUrl = origin.replace(/\/$/, '') + '/admin';
    const result = channel === 'whatsapp' ? await notifyWhatsApp(sample, adminUrl) : await notifyEmail(sample, adminUrl);
    if (!result.ok) return json(res, 400, { ok: false, error: result.error || 'No se pudo enviar' });
    return json(res, 200, { ok: true });
  }

  if (p === '/api/admin/services' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (!Array.isArray(body.services)) return json(res, 400, { error: 'Formato no válido' });
    for (const incoming of body.services) {
      const svc = store.services.find((s) => s.id === incoming.id);
      if (!svc) continue;
      if (Number.isFinite(Number(incoming.price))) svc.price = Math.max(0, Math.round(Number(incoming.price)));
      if (typeof incoming.desc === 'string') svc.desc = incoming.desc.slice(0, 300);
      if (typeof incoming.dur === 'string') svc.dur = incoming.dur.slice(0, 40);
    }
    await persist();
    return json(res, 200, { ok: true, services: store.services });
  }

  if (p === '/api/admin/availability' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 256 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (body.weekly && typeof body.weekly === 'object') {
      const next = {};
      for (let d = 0; d < 7; d++) {
        const raw = body.weekly[d] ?? body.weekly[String(d)];
        next[d] = Array.isArray(raw) ? [...new Set(raw.filter(isTimeStr))].sort() : [];
      }
      store.weekly = next;
    }
    if (body.overrides && typeof body.overrides === 'object') {
      const next = {};
      for (const [date, val] of Object.entries(body.overrides)) {
        if (!isDateStr(date)) continue;
        next[date] = { slots: Array.isArray(val?.slots) ? [...new Set(val.slots.filter(isTimeStr))].sort() : [] };
      }
      store.overrides = next;
    }
    if (Array.isArray(body.blockedDates)) {
      store.blockedDates = [...new Set(body.blockedDates.filter(isDateStr))].sort();
    }
    await persist();
    return json(res, 200, { ok: true, weekly: store.weekly, overrides: store.overrides, blockedDates: store.blockedDates });
  }

  let m = p.match(/^\/api\/admin\/bookings\/([a-f0-9]+)$/);
  if (m && (req.method === 'PATCH' || req.method === 'DELETE')) {
    if (!requireAuth(req, res)) return;
    const booking = store.bookings.find((b) => b.id === m[1]);
    if (!booking) return json(res, 404, { error: 'Cita no encontrada' });
    if (req.method === 'DELETE') {
      store.bookings = store.bookings.filter((b) => b.id !== m[1]);
      await persist();
      return json(res, 200, { ok: true });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (['pending', 'confirmed', 'cancelled'].includes(body.status)) booking.status = body.status;
    if (typeof body.notes === 'string') booking.notes = body.notes.slice(0, 500);
    await persist();
    return json(res, 200, { ok: true, booking });
  }

  m = p.match(/^\/api\/admin\/reviews\/([a-f0-9]+)$/);
  if (m && req.method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const review = store.reviews.find((r) => r.id === m[1]);
    if (!review) return json(res, 404, { error: 'Reseña no encontrada' });
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (['pending', 'approved', 'rejected'].includes(body.status)) review.status = body.status;
    if (typeof body.reply === 'string') review.reply = body.reply.slice(0, 500);
    await persist();
    return json(res, 200, { ok: true, review });
  }
  if (m && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const exists = store.reviews.some((r) => r.id === m[1]);
    if (!exists) return json(res, 404, { error: 'Reseña no encontrada' });
    store.reviews = store.reviews.filter((r) => r.id !== m[1]);
    await persist();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/admin/logo' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 12 * 1024 * 1024)); } catch { return json(res, 400, { error: 'Imagen demasiado grande' }); }
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
    if (!match) return json(res, 400, { error: 'Formato de imagen no válido' });
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return json(res, 413, { error: 'El logo supera 6 MB' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const file = `logo_${Date.now()}.${ext}`;
    await writeFile(path.join(UPLOADS, file), buf);
    const prev = store.settings.logo;
    store.settings.logo = `/uploads/${file}`;
    let newFavicon = '';
    const favMatch = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.favicon || ''));
    if (favMatch) {
      const fbuf = Buffer.from(favMatch[1], 'base64');
      if (fbuf.length < 300 * 1024) {
        const prevFav = store.settings.favicon;
        newFavicon = `favicon_${Date.now()}.png`;
        await writeFile(path.join(UPLOADS, newFavicon), fbuf);
        store.settings.favicon = `/uploads/${newFavicon}`;
        if (prevFav && prevFav.startsWith('/uploads/favicon_')) { try { await unlink(path.join(UPLOADS, path.basename(prevFav))); } catch {} }
      }
    }
    await persist();
    if (prev && prev.startsWith('/uploads/logo_')) { try { await unlink(path.join(UPLOADS, path.basename(prev))); } catch {} }
    return json(res, 200, { ok: true, logo: store.settings.logo, favicon: store.settings.favicon });
  }
  if (p === '/api/admin/logo' && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const prev = store.settings.logo;
    const prevFav = store.settings.favicon;
    store.settings.logo = '';
    store.settings.favicon = '';
    await persist();
    if (prev && prev.startsWith('/uploads/logo_')) { try { await unlink(path.join(UPLOADS, path.basename(prev))); } catch {} }
    if (prevFav && prevFav.startsWith('/uploads/favicon_')) { try { await unlink(path.join(UPLOADS, path.basename(prevFav))); } catch {} }
    return json(res, 200, { ok: true });
  }

  const svcImg = p.match(/^\/api\/admin\/services\/([a-z0-9-]+)\/image$/);
  if (svcImg && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    const svc = store.services.find((s) => s.id === svcImg[1]);
    if (!svc) return json(res, 404, { error: 'Efecto no encontrado' });
    let body;
    try { body = JSON.parse(await readBody(req, 10 * 1024 * 1024)); } catch { return json(res, 400, { error: 'Imagen demasiado grande' }); }
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
    if (!match) return json(res, 400, { error: 'Formato de imagen no válido' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return json(res, 413, { error: 'La imagen supera 6 MB' });
    const file = `svc_${svc.id}_${Date.now()}.${ext}`;
    await writeFile(path.join(UPLOADS, file), buf);
    const prev = svc.image;
    svc.image = `/uploads/${file}`;
    await persist();
    if (prev && prev.startsWith('/uploads/svc_' + svc.id + '_')) {
      try { await unlink(path.join(UPLOADS, path.basename(prev))); } catch {}
    }
    return json(res, 200, { ok: true, service: { ...svc, image: svc.image } });
  }
  if (svcImg && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const svc = store.services.find((s) => s.id === svcImg[1]);
    if (!svc) return json(res, 404, { error: 'Efecto no encontrado' });
    const prev = svc.image;
    svc.image = '';
    await persist();
    if (prev && prev.startsWith('/uploads/svc_')) { try { await unlink(path.join(UPLOADS, path.basename(prev))); } catch {} }
    return json(res, 200, { ok: true });
  }

  if (p === '/api/admin/gallery' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 10 * 1024 * 1024)); } catch { return json(res, 400, { error: 'Imagen demasiado grande (máx. 6 MB)' }); }
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
    if (!match) return json(res, 400, { error: 'Formato de imagen no válido' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return json(res, 413, { error: 'La imagen supera 6 MB' });
    const file = `g_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
    await writeFile(path.join(UPLOADS, file), buf);
    const item = { id: crypto.randomBytes(6).toString('hex'), file: `/uploads/${file}`, caption: String(body.caption || '').slice(0, 140), createdAt: new Date().toISOString() };
    if (body.hero !== true) store.gallery.push(item);
    await persist();
    return json(res, 201, { ok: true, item });
  }

  m = p.match(/^\/api\/admin\/gallery\/([a-f0-9]+)$/);
  if (m && req.method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const item = store.gallery.find((g) => g.id === m[1]);
    if (!item) return json(res, 404, { error: 'No encontrada' });
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (typeof body.caption === 'string') item.caption = body.caption.slice(0, 140);
    await persist();
    return json(res, 200, { ok: true, item });
  }
  if (m && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const item = store.gallery.find((g) => g.id === m[1]);
    if (!item) return json(res, 404, { error: 'No encontrada' });
    store.gallery = store.gallery.filter((g) => g.id !== m[1]);
    try { await unlink(path.join(PUBLIC, item.file.replace(/^\//, ''))); } catch {}
    await persist();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/admin/password' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { error: 'Datos no válidos' }); }
    if (!verifyPassword(body.current || '', store.auth.password)) return json(res, 403, { error: 'La contraseña actual no coincide' });
    if (String(body.next || '').length < 8) return json(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    store.auth.password = hashPassword(body.next);
    store.auth.secret = crypto.randomBytes(32).toString('hex');
    await persist();
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'bgg_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict' });
  }

  return json(res, 404, { error: 'No encontrado' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.startsWith('/uploads/')) {
    const up = path.normalize(path.join(UPLOADS, rel.slice('/uploads/'.length)));
    if (!up.startsWith(UPLOADS)) return send(res, 403, 'Forbidden');
    try {
      const data = await readFile(up);
      return send(res, 200, data, {
        'Content-Type': MIME[path.extname(up).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      });
    } catch { return send(res, 404, 'Not found'); }
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const filePath = path.normalize(path.join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    });
  } catch {
    if (!path.extname(rel)) {
      try {
        const data = await readFile(path.join(PUBLIC, 'index.html'));
        return send(res, 200, data, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      } catch {}
    }
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, preview: PREVIEW_MODE });
    if (blockedInPreview(req) && (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.startsWith('/admin.') || url.pathname.startsWith('/api/admin'))) {
      return send(res, 403, '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;background:#fffaf7;color:#7d2f45;text-align:center"><div><h1 style="font-family:Georgia,serif;font-size:2rem">Panel no disponible en la demo</h1><p>El panel de administración solo se abre desde el ordenador del estudio.</p><a href="/" style="color:#d8748e">Volver a la web</a></div></body>', { 'Content-Type': 'text/html; charset=utf-8' });
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) json(res, err.status || 500, { error: 'Error interno' });
  }
});

await loadStore();
// En hosting, la variable ADMIN_PASSWORD manda: garantiza que siempre sea la vigente.
if (process.env.ADMIN_PASSWORD) {
  store.auth.password = hashPassword(process.env.ADMIN_PASSWORD);
  await persist();
}
server.listen({ port: PORT, host: '::', ipv6Only: false }, () => {
  console.log(`\n  ✦ Beauty By Gera`);
  console.log(`  Web pública:  http://localhost:${PORT}/`);
  console.log(`  Panel admin:  http://localhost:${PORT}/admin`);
  if (freshStore && !process.env.ADMIN_PASSWORD) console.log(`  Contraseña inicial del panel: ${DEFAULT_PASSWORD}  (cámbiala en Ajustes)`);
  else if (freshStore) console.log('  Contraseña inicial: definida por ADMIN_PASSWORD');
  else console.log('  Contraseña del panel: la que hayas configurado. Si la olvidas: reset-password.bat');
  console.log('');
  if (PREVIEW_MODE) console.log('  Modo demo público: el panel solo acepta acceso local.\n');
});

