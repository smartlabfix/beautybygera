const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const state = {
  data: null,
  weekly: {},
  overrides: {},
  blockedDates: [],
  filter: 'upcoming',
  reviewFilter: 'pending',
  specialDate: null,
  specialSlots: [],
};

/* ---------- utils ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function todayStr() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function weekdayOf(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function fmtLong(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${DAYS[weekdayOf(ds)]} ${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}
function money(n) { return `${Number(n)}€`; }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : (opts.headers || {}),
    ...opts,
  });
  if (res.status === 401) { showLogin(); throw new Error('Sesión caducada'); }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || 'Error inesperado');
  return data;
}

/* ---------- auth ---------- */
function showLogin() {
  $('#loginScreen').style.display = 'grid';
  $('#adminApp').hidden = true;
}
function showApp() {
  $('#loginScreen').style.display = 'none';
  $('#adminApp').hidden = false;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginError');
  err.classList.remove('on');
  const btn = $('#loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    showApp();
    await loadAll();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.add('on');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin();
});

/* ---------- data ---------- */
async function loadAll() {
  const data = await api('/api/admin/data');
  state.data = data;
  state.weekly = normalizeWeekly(data.weekly);
  state.overrides = { ...(data.overrides || {}) };
  state.blockedDates = [...(data.blockedDates || [])];
  renderAll();
}

function normalizeWeekly(w) {
  const out = {};
  for (let d = 0; d < 7; d++) out[d] = [...(w?.[d] ?? w?.[String(d)] ?? [])].sort();
  return out;
}

function renderAll() {
  renderStats();
  renderBookings();
  renderWeekly();
  renderOverrides();
  renderBlocked();
  renderGalleryAdmin();
  renderReviewsAdmin();
  fillSettings();
  renderServicesAdmin();
  renderHeroPreview();
  $('#todayChip').textContent = capitalize(fmtLong(todayStr()).replace(/ de \d{4}$/, ''));
  $('#tabTitle').textContent = $('#tabTitle').dataset.t || $('#tabTitle').textContent;
}

/* ---------- tabs ---------- */
const TAB_META = {
  agenda: ['Agenda', 'Todas tus citas en un vistazo'],
  availability: ['Disponibilidad', 'Define tus horas y cierra los días que no trabajes'],
  gallery: ['Galería', 'Las fotos que se ven en la web'],
  reviews: ['Reseñas', 'Aprueba, responde y ordena las opiniones de tus clientas'],
  settings: ['Ajustes', 'Textos, precios y seguridad del panel'],
};
function switchTab(tab) {
  $$('.side-link[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
  const [t, s] = TAB_META[tab] || ['Panel', ''];
  $('#tabTitle').textContent = t;
  $('#tabSub').textContent = s;
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
}
$$('.side-link[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* ---------- stats ---------- */
function renderStats() {
  const today = todayStr();
  const nowMonth = today.slice(0, 7);
  const active = state.data.bookings.filter((b) => b.status !== 'cancelled');
  const upcoming = active.filter((b) => b.date >= today);
  const todays = active.filter((b) => b.date === today);
  const pending = upcoming.filter((b) => b.status === 'pending');
  const revenue = active.filter((b) => b.date.startsWith(nowMonth)).reduce((s, b) => s + Number(b.price || 0), 0);
  $('#stats').innerHTML = `
    <div class="stat accent"><div class="k">Hoy</div><div class="v">${todays.length}</div><div class="s">${todays.length === 1 ? 'cita agendada' : 'citas agendadas'}</div></div>
    <div class="stat"><div class="k">Próximas</div><div class="v">${upcoming.length}</div><div class="s">de hoy en adelante</div></div>
    <div class="stat"><div class="k">Por confirmar</div><div class="v">${pending.length}</div><div class="s">te falta responder</div></div>
    <div class="stat"><div class="k">Ingresos · ${MONTHS_LONG[Number(nowMonth.slice(5, 7)) - 1]}</div><div class="v">${revenue}€</div><div class="s">reservas no canceladas</div></div>`;
}

/* ---------- bookings ---------- */
$('#agendaFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  $$('#agendaFilter button').forEach((b) => b.classList.toggle('active', b === btn));
  state.filter = btn.dataset.filter;
  renderBookings();
});

function renderBookings() {
  const today = todayStr();
  let list = [...state.data.bookings];
  if (state.filter === 'upcoming') list = list.filter((b) => b.status !== 'cancelled' && b.date >= today);
  else if (state.filter === 'pending') list = list.filter((b) => b.status === 'pending' && b.date >= today);
  else if (state.filter === 'cancelled') list = list.filter((b) => b.status === 'cancelled');
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const box = $('#bookingsList');
  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><b>Sin citas por aquí</b>${state.filter === 'upcoming' ? 'Cuando alguien reserve desde la web aparecerá aquí.' : 'No hay citas en este filtro.'}</div>`;
    return;
  }
  box.innerHTML = list.map((b) => {
    const [y, m, d] = b.date.split('-').map(Number);
    const wa = String(b.phone || '').replace(/[^\d]/g, '');
    const statusLabel = b.status === 'confirmed' ? 'Confirmada' : b.status === 'cancelled' ? 'Cancelada' : 'Pendiente';
    return `<div class="booking-row">
      <div class="bdate"><div class="d">${d}</div><div class="m">${MONTHS[m - 1]}</div></div>
      <div class="bmain">
        <b>${esc(b.name)} <span class="pill ${b.status}">${statusLabel}</span></b>
        <div class="meta">
          <span class="svc-name">${esc(b.serviceName)} · ${money(b.price)}</span>
          <span>${esc(b.time)} h</span>
          <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>
          ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ''}
        </div>
        ${b.notes ? `<div class="notes">“${esc(b.notes)}”</div>` : ''}
      </div>
      <div class="bactions">
        ${b.status !== 'confirmed' ? `<button class="mini-btn" data-act="confirm" data-id="${b.id}" title="Confirmar">✓</button>` : ''}
        ${b.status !== 'cancelled' ? `<button class="mini-btn" data-act="cancel" data-id="${b.id}" title="Cancelar">⊘</button>` : ''}
        <button class="mini-btn danger" data-act="delete" data-id="${b.id}" title="Eliminar">🗑</button>
      </div>
    </div>`;
  }).join('');
}

$('#bookingsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  try {
    if (act === 'delete') {
      if (!confirm('¿Eliminar esta cita definitivamente?')) return;
      await api('/api/admin/bookings/' + id, { method: 'DELETE' });
    } else {
      await api('/api/admin/bookings/' + id, { method: 'PATCH', body: JSON.stringify({ status: act === 'confirm' ? 'confirmed' : 'cancelled' }) });
    }
    toast(act === 'confirm' ? 'Cita confirmada ✦' : act === 'cancel' ? 'Cita cancelada' : 'Cita eliminada');
    await loadAll();
  } catch (ex) { toast(ex.message); }
});

/* ---------- availability ---------- */
function renderWeekly() {
  const grid = $('#weeklyGrid');
  const order = [1, 2, 3, 4, 5, 6, 0];
  grid.innerHTML = order.map((d) => {
    const slots = state.weekly[d] || [];
    return `<div class="wrow" data-day="${d}">
      <div class="wday">${DAYS[d]}<small>${slots.length ? slots.length + ' huecos' : 'cerrado'}</small></div>
      <div class="slot-chips">
        ${slots.map((t) => `<span class="chip">${t}<button data-remove="${t}" data-day="${d}" title="Quitar">✕</button></span>`).join('')}
        <span class="weekly-add">
          <input type="time" step="900" data-add-input="${d}" aria-label="Nueva hora">
          <button class="icon-plus" data-add="${d}" title="Añadir hora">+</button>
        </span>
      </div>
    </div>`;
  }).join('');
}

$('#weeklyGrid').addEventListener('click', (e) => {
  const rm = e.target.closest('button[data-remove]');
  if (rm) {
    const d = Number(rm.dataset.day);
    state.weekly[d] = state.weekly[d].filter((t) => t !== rm.dataset.remove);
    renderWeekly();
    return;
  }
  const add = e.target.closest('button[data-add]');
  if (add) {
    const d = Number(add.dataset.add);
    const input = $(`input[data-add-input="${d}"]`);
    const val = input.value;
    if (!/^\d{2}:\d{2}$/.test(val)) { toast('Elige una hora válida'); return; }
    if (!state.weekly[d].includes(val)) {
      state.weekly[d] = [...state.weekly[d], val].sort();
      renderWeekly();
    } else toast('Esa hora ya está en el día');
  }
});

$('#saveWeekly').addEventListener('click', async () => {
  try {
    const res = await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ weekly: state.weekly }) });
    state.weekly = normalizeWeekly(res.weekly);
    renderWeekly();
    toast('Horario semanal guardado ✦');
  } catch (ex) { toast(ex.message); }
});

function renderOverrides() {
  const entries = Object.keys(state.overrides).sort();
  const box = $('#overridesList');
  if (!entries.length) { box.innerHTML = '<div class="hint" style="margin-top:.6rem">Sin días especiales configurados.</div>'; return; }
  box.innerHTML = entries.map((date) => {
    const slots = state.overrides[date]?.slots || [];
    const label = slots.length ? `${slots.length} huecos · ${slots.join(', ')}` : 'Cerrado todo el día';
    return `<div class="mini-row"><span><b>${esc(fmtLong(date))}</b> — ${esc(label)}</span><button data-unoverride="${date}">quitar</button></div>`;
  }).join('');
}

$('#overridesList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-unoverride]');
  if (!btn) return;
  delete state.overrides[btn.dataset.unoverride];
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ overrides: state.overrides }) });
    renderOverrides();
    toast('Excepción eliminada');
  } catch (ex) { toast(ex.message); }
});

function renderBlocked() {
  const box = $('#blockedList');
  if (!state.blockedDates.length) { box.innerHTML = '<span class="hint">Sin días bloqueados.</span>'; return; }
  box.innerHTML = state.blockedDates.map((d) => `<span class="chip">${esc(d)}<button data-unblock="${d}" title="Desbloquear">✕</button></span>`).join('');
}
$('#blockedList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-unblock]');
  if (!btn) return;
  state.blockedDates = state.blockedDates.filter((d) => d !== btn.dataset.unblock);
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ blockedDates: state.blockedDates }) });
    renderBlocked();
    toast('Día desbloqueado');
  } catch (ex) { toast(ex.message); }
});

$('#addBlock').addEventListener('click', async () => {
  const d = $('#blockDate').value;
  if (!d) { toast('Elige una fecha'); return; }
  if (!state.blockedDates.includes(d)) state.blockedDates.push(d);
  state.blockedDates.sort();
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ blockedDates: state.blockedDates }) });
    renderBlocked();
    $('#blockDate').value = '';
    toast('Día bloqueado');
  } catch (ex) { toast(ex.message); }
});

/* special editor */
$('#loadSpecial').addEventListener('click', () => {
  const d = $('#specialDate').value;
  if (!d) { toast('Elige una fecha'); return; }
  state.specialDate = d;
  const existing = state.overrides[d];
  state.specialSlots = existing ? [...(existing.slots || [])] : [...(state.weekly[weekdayOf(d)] || [])];
  $('#specialEditor').hidden = false;
  $('#specialTitle').textContent = capitalize(fmtLong(d));
  $('#specialType').textContent = existing ? (state.specialSlots.length ? 'horario especial' : 'cerrado') : 'copia del horario semanal';
  renderSpecialSlots();
});

function renderSpecialSlots() {
  const box = $('#specialSlots');
  if (!state.specialSlots.length) {
    box.innerHTML = '<span class="hint">Sin horas: ese día quedará cerrado.</span>';
  } else {
    box.innerHTML = state.specialSlots.map((t) => `<span class="chip">${t}<button data-sremove="${t}">✕</button></span>`).join('')
      + '<span class="chip muted-chip">guarda para aplicar</span>';
  }
}
$('#specialSlots').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sremove]');
  if (!b) return;
  state.specialSlots = state.specialSlots.filter((t) => t !== b.dataset.sremove);
  renderSpecialSlots();
});
$('#addSpecialTime').addEventListener('click', () => {
  const val = $('#specialTime').value;
  if (!/^\d{2}:\d{2}$/.test(val)) { toast('Elige una hora'); return; }
  if (!state.specialSlots.includes(val)) { state.specialSlots = [...state.specialSlots, val].sort(); renderSpecialSlots(); }
});

$$('#specialEditor [data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const morning = ['10:00', '11:00', '12:00'];
    const evening = ['16:00', '17:00', '18:00', '19:00'];
    const p = btn.dataset.preset;
    state.specialSlots = p === 'manana' ? [...morning] : p === 'tarde' ? [...evening] : [...morning, ...evening];
    renderSpecialSlots();
    toast('Horario cargado. Pulsa “Guardar día” para publicarlo.');
  });
});
$('#saveSpecial').addEventListener('click', async () => {
  if (!state.specialDate) return;
  state.overrides[state.specialDate] = { slots: [...state.specialSlots].sort() };
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ overrides: state.overrides }) });
    renderOverrides();
    $('#specialType').textContent = state.specialSlots.length ? 'horario especial' : 'cerrado';
    toast('Día especial guardado ✦');
  } catch (ex) { toast(ex.message); }
});
$('#resetSpecial').addEventListener('click', async () => {
  if (!state.specialDate) return;
  delete state.overrides[state.specialDate];
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ overrides: state.overrides }) });
    state.specialSlots = [...(state.weekly[weekdayOf(state.specialDate)] || [])];
    renderSpecialSlots(); renderOverrides();
    $('#specialType').textContent = 'copia del horario semanal';
    toast('Excepción eliminada');
  } catch (ex) { toast(ex.message); }
});
$('#closeSpecial').addEventListener('click', async () => {
  const d = $('#specialDate').value;
  if (!d) { toast('Elige una fecha'); return; }
  state.overrides[d] = { slots: [] };
  state.specialDate = d;
  state.specialSlots = [];
  try {
    await api('/api/admin/availability', { method: 'PUT', body: JSON.stringify({ overrides: state.overrides }) });
    renderOverrides(); renderSpecialSlots();
    $('#specialEditor').hidden = false;
    $('#specialTitle').textContent = capitalize(fmtLong(d));
    $('#specialType').textContent = 'cerrado';
    toast('Día cerrado');
  } catch (ex) { toast(ex.message); }
});

/* ---------- gallery ---------- */
function renderGalleryAdmin() {
  const box = $('#galleryAdmin');
  const items = state.data.gallery || [];
  if (!items.length) { box.innerHTML = '<div class="hint" style="grid-column:1/-1">Aún no has subido fotos. La galería de la web muestra marcadores de posición elegantes hasta que subas las tuyas.</div>'; return; }
  box.innerHTML = items.map((it) => `
    <div class="gcard" data-id="${it.id}">
      <div class="thumb"><img src="${esc(it.file)}" alt=""></div>
      <div class="gbody">
        <input data-caption="${it.id}" value="${esc(it.caption || '')}" placeholder="Pie de foto (opcional)" maxlength="140">
        <div class="gactions">
          <button class="mini-btn" data-hero="${it.id}" title="Usar como foto de portada">★</button>
          <button class="mini-btn danger" data-del="${it.id}" title="Eliminar">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato no compatible. Usa JPG, PNG o WebP.')); };
    img.src = url;
  });
}

async function resizeToDataUrl(file, max = 1600, quality = 0.86, mime = 'image/jpeg') {
  if (file.size > 30 * 1024 * 1024) throw new Error('La foto pesa demasiado (máximo 30 MB).');
  let src;
  try { src = await createImageBitmap(file); }
  catch { src = await loadImageElement(file); }
  const srcW = src.width || src.naturalWidth || 0;
  const srcH = src.height || src.naturalHeight || 0;
  if (!srcW || !srcH) throw new Error('No se pudo leer la imagen.');
  const scale = Math.min(1, max / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  return canvas.toDataURL(mime, quality);
}

async function makeFavicon(file) {
  let src;
  try { src = await createImageBitmap(file); } catch { src = await loadImageElement(file); }
  const sw = src.width || src.naturalWidth || 0;
  const sh = src.height || src.naturalHeight || 0;
  if (!sw || !sh) throw new Error('No se pudo leer la imagen.');
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f3ec';
  ctx.fillRect(0, 0, 64, 64);
  const k = Math.min(58 / sw, 58 / sh);
  ctx.drawImage(src, (64 - sw * k) / 2, (64 - sh * k) / 2, sw * k, sh * k);
  if (src.close) src.close();
  return c.toDataURL('image/png');
}

async function applyBrand() {
  try {
    const site = await (await fetch('/api/site')).json();
    const logo = site.settings?.logo;
    if (!logo) return;
    const loginLogo = $('#loginLogo');
    if (loginLogo) { loginLogo.src = logo; loginLogo.hidden = false; }
    const mark = document.querySelector('.login-mark');
    if (mark) mark.style.display = 'none';
    const sideLogo = $('#sideLogo');
    if (sideLogo) { sideLogo.src = logo; sideLogo.hidden = false; }
    document.querySelector('.side-brand')?.classList.add('has-logo');
  } catch {}
}

async function uploadFiles(files, opts = {}) {
  const status = $('#uploadStatus');
  let ok = 0, fail = 0, lastError = '';
  for (const file of files) {
    if (!file.type.startsWith('image/')) { fail++; continue; }
    status.textContent = `Optimizando ${file.name}…`;
    try {
      const dataUrl = await resizeToDataUrl(file, opts.max || 1600, 0.86);
      await api('/api/admin/gallery', { method: 'POST', body: JSON.stringify({ dataUrl, caption: '', hero: !!opts.hero }) });
      ok++;
    } catch (ex) { fail++; lastError = ex.message; console.error(ex); }
  }
  status.textContent = ok
    ? `${ok} foto${ok === 1 ? '' : 's'} subida${ok === 1 ? '' : 's'}${fail ? ` · ${fail} con error` : ''} ✦`
    : (fail ? `No se pudo subir: ${lastError || 'prueba con otra imagen'}` : '');
  await loadAll();
  if (ok) toast('Galería actualizada ✦');
}

$('#galleryInput').addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });

const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
dz.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) uploadFiles([...e.dataTransfer.files]); });

$('#galleryAdmin').addEventListener('click', async (e) => {
  const del = e.target.closest('button[data-del]');
  if (del) {
    if (!confirm('¿Eliminar esta foto de la galería?')) return;
    try { await api('/api/admin/gallery/' + del.dataset.del, { method: 'DELETE' }); await loadAll(); toast('Foto eliminada'); } catch (ex) { toast(ex.message); }
    return;
  }
  const hero = e.target.closest('button[data-hero]');
  if (hero) {
    const item = state.data.gallery.find((g) => g.id === hero.dataset.hero);
    if (!item) return;
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ heroImage: item.file }) });
      await loadAll(); toast('Foto de portada actualizada ✦');
    } catch (ex) { toast(ex.message); }
  }
});

$('#galleryAdmin').addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-caption]');
  if (!input) return;
  try {
    await api('/api/admin/gallery/' + input.dataset.caption, { method: 'PATCH', body: JSON.stringify({ caption: input.value }) });
    const item = state.data.gallery.find((g) => g.id === input.dataset.caption);
    if (item) item.caption = input.value;
    toast('Pie de foto guardado');
  } catch (ex) { toast(ex.message); }
});

/* ---------- reviews admin ---------- */
function starsHtml(n) {
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span class="${i <= n ? '' : 'off'}">★</span>`;
  return out;
}

function renderReviewsAdmin() {
  const all = state.data.reviews || [];
  const pending = all.filter((r) => r.status === 'pending').length;
  const approved = all.filter((r) => r.status === 'approved');
  const avg = approved.length ? Math.round((approved.reduce((s, r) => s + Number(r.rating || 0), 0) / approved.length) * 10) / 10 : 0;

  $('#reviewStatsAdmin').innerHTML = `
    <div class="stat accent"><div class="k">Media publicada</div><div class="v">${approved.length ? String(avg).replace('.', ',') : '—'}</div><div class="s">${approved.length} reseña${approved.length === 1 ? '' : 's'} visible${approved.length === 1 ? '' : 's'}</div></div>
    <div class="stat"><div class="k">Por aprobar</div><div class="v">${pending}</div><div class="s">esperando revisión</div></div>
    <div class="stat"><div class="k">Total recibidas</div><div class="v">${all.length}</div><div class="s">desde el inicio</div></div>`;

  let list = all;
  if (state.reviewFilter === 'pending') list = all.filter((r) => r.status === 'pending');
  else if (state.reviewFilter === 'approved') list = all.filter((r) => r.status === 'approved');

  const box = $('#reviewsAdmin');
  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><b>Sin reseñas aquí</b>${state.reviewFilter === 'pending' ? 'Cuando una clienta deje una reseña, aparecerá aquí para que la apruebes.' : 'No hay reseñas en este filtro.'}</div>`;
    return;
  }

  box.innerHTML = list.map((r) => {
    const svc = state.data.services.find((s) => s.id === r.serviceId);
    const dt = new Date(r.createdAt);
    const ds = Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const statusLabel = r.status === 'approved' ? 'Publicada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente';
    const pill = r.status === 'approved' ? 'confirmed' : r.status === 'rejected' ? 'cancelled' : 'pending';
    return `<div class="review-row">
      <div>
        <div class="who"><b>${esc(r.name)}</b><span class="pill ${pill}">${statusLabel}</span><span class="rstars">${starsHtml(Number(r.rating) || 0)}</span></div>
        <p>“${esc(r.text)}”</p>
        <div class="rmeta">${svc ? esc(svc.name) + ' · ' : ''}${esc(ds)}</div>
        ${r.status === 'approved' ? `<div class="replybox"><input id="reply-${r.id}" value="${esc(r.reply || '')}" placeholder="Responder públicamente (opcional)" maxlength="500"><button class="mini-btn" data-reply="${r.id}" title="Guardar respuesta">✓</button></div>` : ''}
      </div>
      <div class="reractions">
        ${r.status !== 'approved' ? `<button class="mini-btn" data-approve="${r.id}" title="Aprobar y publicar">✓</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="mini-btn" data-reject="${r.id}" title="Rechazar">⊘</button>` : ''}
        <button class="mini-btn danger" data-delreview="${r.id}" title="Eliminar">🗑</button>
      </div>
    </div>`;
  }).join('');
}

$('#reviewFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rfilter]');
  if (!b) return;
  $$('#reviewFilter button').forEach((x) => x.classList.toggle('active', x === b));
  state.reviewFilter = b.dataset.rfilter;
  renderReviewsAdmin();
});

$('#reviewsAdmin').addEventListener('click', async (e) => {
  const ap = e.target.closest('button[data-approve]');
  const rj = e.target.closest('button[data-reject]');
  const dl = e.target.closest('button[data-delreview]');
  const rp = e.target.closest('button[data-reply]');
  try {
    if (ap) {
      await api('/api/admin/reviews/' + ap.dataset.approve, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
      toast('Reseña publicada ✦'); await loadAll();
    } else if (rj) {
      await api('/api/admin/reviews/' + rj.dataset.reject, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
      toast('Reseña rechazada'); await loadAll();
    } else if (dl) {
      if (!confirm('¿Eliminar esta reseña definitivamente?')) return;
      await api('/api/admin/reviews/' + dl.dataset.delreview, { method: 'DELETE' });
      toast('Reseña eliminada'); await loadAll();
    } else if (rp) {
      const input = $('#reply-' + rp.dataset.reply);
      await api('/api/admin/reviews/' + rp.dataset.reply, { method: 'PATCH', body: JSON.stringify({ reply: input.value }) });
      toast('Respuesta guardada ✦'); await loadAll();
    }
  } catch (ex) { toast(ex.message); }
});

/* ---------- settings ---------- */
function fillSettings() {
  const s = state.data.settings;
  $('#setHeroTitle').value = s.heroTitle || '';
  $('#setHeroSubtitle').value = s.heroSubtitle || '';
  $('#setPhone').value = s.phone || '';
  $('#setWhatsapp').value = s.whatsapp || '';
  $('#setInstagram').value = s.instagram || '';
  $('#setAddress').value = s.address || '';
  $('#setNotice').value = s.notice || '';
  $('#setGoogleReviewUrl').value = s.googleReviewUrl || '';
  $('#setReviewsEnabled').checked = s.reviewsEnabled !== false;
  $('#setReviewsAuto').checked = s.reviewsAutoApprove === true;
  $('#setLat').value = s.mapLat === null || s.mapLat === undefined ? '' : s.mapLat;
  $('#setLng').value = s.mapLng === null || s.mapLng === undefined ? '' : s.mapLng;
  renderAdminMap(s);
  $('#logoPreview').innerHTML = s.logo
    ? `<img src="${esc(s.logo)}" alt="Logo actual">`
    : '<span class="hint">Sin logo: se usa la marca tipográfica “Beauty By Gera”.</span>';
}

$('#saveSettings').addEventListener('click', async () => {
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        heroTitle: $('#setHeroTitle').value,
        heroSubtitle: $('#setHeroSubtitle').value,
        phone: $('#setPhone').value,
        whatsapp: $('#setWhatsapp').value,
        instagram: $('#setInstagram').value,
        address: $('#setAddress').value,
        notice: $('#setNotice').value,
        mapLat: $('#setLat').value.trim() === '' ? null : Number($('#setLat').value),
        mapLng: $('#setLng').value.trim() === '' ? null : Number($('#setLng').value),
        googleReviewUrl: $('#setGoogleReviewUrl').value,
        reviewsEnabled: $('#setReviewsEnabled').checked,
        reviewsAutoApprove: $('#setReviewsAuto').checked,
      }),
    });
    toast('Ajustes guardados ✦');
    await loadAll();
  } catch (ex) { toast(ex.message); }
});

function renderAdminMap(s) {
  const box = $('#mapPreview');
  const lat = Number(s.mapLat);
  const lng = Number(s.mapLng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
    const d = 0.006;
    box.innerHTML = `<iframe title="Vista previa del mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d * 0.72},${lng + d},${lat + d * 0.72}&layer=mapnik&marker=${lat},${lng}"></iframe>`;
    $('#geoResult').textContent = `Coordenadas guardadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } else {
    box.innerHTML = '<span class="hint">Sin coordenadas todavía. Escribe la dirección y pulsa “Buscar dirección”.</span>';
    $('#geoResult').textContent = '';
  }
}

$('#geocodeBtn').addEventListener('click', async () => {
  const address = $('#setAddress').value.trim();
  if (address.length < 4) { toast('Escribe la dirección completa del estudio'); return; }
  const btn = $('#geocodeBtn');
  btn.disabled = true; btn.textContent = 'Buscando…';
  try {
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ address, geocode: true }) });
    if (res.geocoded) toast('Dirección encontrada en el mapa ✦');
    else toast('No se encontró. Añade ciudad o código postal.');
    await loadAll();
  } catch (ex) { toast(ex.message); }
  finally { btn.disabled = false; btn.textContent = 'Buscar dirección'; }
});

function renderServicesAdmin() {
  $('#servicesAdmin').innerHTML = state.data.services.map((s) => `
    <div class="srow" data-id="${s.id}">
      <div><div class="sn">${esc(s.name)}</div><div class="sd">${esc(s.tag || '')}</div></div>
      <div class="euro"><input type="number" min="0" step="1" data-price="${s.id}" value="${Number(s.price)}"></div>
      <input data-dur="${s.id}" value="${esc(s.dur || '')}" placeholder="Duración">
      <div class="sfoto">
        <span class="sthumb">${s.image ? `<img src="${esc(s.image)}" alt="">` : '<span>sin foto</span>'}</span>
        <label class="mini-btn upload-btn" title="Subir foto del efecto">＋<input type="file" data-simg="${s.id}" accept="image/jpeg,image/png,image/webp" hidden></label>
        ${s.image ? `<button class="mini-btn danger" data-sdel="${s.id}" title="Quitar foto">✕</button>` : ''}
      </div>
    </div>`).join('');
}

$('#servicesAdmin').addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-simg]');
  if (!input) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const dataUrl = await resizeToDataUrl(file, 1200, 0.86);
    await api('/api/admin/services/' + input.dataset.simg + '/image', { method: 'POST', body: JSON.stringify({ dataUrl }) });
    toast('Foto del efecto actualizada ✦');
    await loadAll();
  } catch (ex) { toast(ex.message); }
});

$('#servicesAdmin').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-sdel]');
  if (!btn) return;
  if (!confirm('¿Quitar la foto de este efecto?')) return;
  try {
    await api('/api/admin/services/' + btn.dataset.sdel + '/image', { method: 'DELETE' });
    toast('Foto quitada');
    await loadAll();
  } catch (ex) { toast(ex.message); }
});

$('#saveServices').addEventListener('click', async () => {
  const services = state.data.services.map((s) => ({
    id: s.id,
    price: Number($(`input[data-price="${s.id}"]`).value),
    dur: $(`input[data-dur="${s.id}"]`).value,
  }));
  try {
    await api('/api/admin/services', { method: 'PUT', body: JSON.stringify({ services }) });
    toast('Precios actualizados ✦');
    await loadAll();
  } catch (ex) { toast(ex.message); }
});

function renderHeroPreview() {
  const url = state.data.settings.heroImage;
  $('#heroPreview').innerHTML = url ? `<img src="${esc(url)}" alt="Portada actual">` : '<span class="hint">Ahora mismo la portada usa la ilustración de marca.</span>';
}

$('#heroInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const dataUrl = await resizeToDataUrl(f, 1800, 0.88);
    const res = await api('/api/admin/gallery', { method: 'POST', body: JSON.stringify({ dataUrl, hero: true }) });
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ heroImage: res.item.file }) });
    await loadAll();
    toast('Portada actualizada ✦');
  } catch (ex) { toast(ex.message); }
});

$('#clearHero').addEventListener('click', async () => {
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ heroImage: '' }) });
    await loadAll(); toast('Portada restablecida');
  } catch (ex) { toast(ex.message); }
});

$('#logoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await resizeToDataUrl(file, 700, 0.95, 'image/png');
    let favicon = '';
    try { favicon = await makeFavicon(file); } catch {}
    await api('/api/admin/logo', { method: 'POST', body: JSON.stringify({ dataUrl, favicon }) });
    toast('Logo actualizado ✦');
    await loadAll();
    await applyBrand();
  } catch (ex) { toast(ex.message); }
});

$('#clearLogo').addEventListener('click', async () => {
  if (!confirm('¿Quitar el logo y volver a la marca tipográfica?')) return;
  try {
    await api('/api/admin/logo', { method: 'DELETE' });
    toast('Logo quitado');
    setTimeout(() => location.reload(), 600);
  } catch (ex) { toast(ex.message); }
});

$('#savePassword').addEventListener('click', async () => {
  const err = $('#pwError');
  err.classList.remove('on');
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ current: $('#pwCurrent').value, next: $('#pwNext').value }) });
    toast('Contraseña cambiada. Vuelve a entrar.');
    setTimeout(() => { showLogin(); $('#pwCurrent').value = ''; $('#pwNext').value = ''; }, 1200);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.add('on');
  }
});

/* ---------- boot ---------- */
(async () => {
  try {
    const s = await api('/api/admin/session');
    if (s.authed) { showApp(); await loadAll(); }
    else showLogin();
  } catch { showLogin(); }
  const tab = (location.hash || '').replace('#', '');
  await applyBrand();
  if (TAB_META[tab]) switchTab(tab);
  else switchTab('agenda');
})();
