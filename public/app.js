const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  site: null,
  services: [],
  selected: null,
  month: null,      // 'YYYY-MM'
  days: {},
  date: null,       // 'YYYY-MM-DD'
  time: null,
  monthLabel: '',
};

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const WEEKDAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function todayStr() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function curMonth() { return todayStr().slice(0, 7); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} de ${MONTHS[m - 1]}`;
}
function money(n) { return `${Number(n)}€`; }

/* ---------- load site ---------- */
async function boot() {
  const res = await fetch('/api/site');
  const data = await res.json();
  state.site = data;
  state.services = data.services;
  const rsel = $('#rService');
  if (rsel) rsel.innerHTML = '<option value="">—</option>' + state.services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  applySettings(data.settings);
  renderServices();
  renderGallery(data.gallery);
  renderReviews(data.reviews || [], data.reviewStats || { count: 0, avg: 0 });
  renderMap(data.settings);
  state.month = curMonth();
  await loadMonth(state.month);
  revealOnScroll();
  $('#year').textContent = new Date().getFullYear();
}

function applySettings(s) {
  if (!s) return;
  if (s.heroTitle) {
    const h1 = $('.hero h1');
    // Keep the gradient treatment: split the last word
    h1.innerHTML = esc(s.heroTitle).replace(/(\S+)(\s*)$/, '<span class="grad">$1</span>');
  }
  if (s.heroSubtitle) $('#heroSubtitle').textContent = s.heroSubtitle;
  if (s.notice) $('#asideNote').textContent = s.notice;
  if (s.heroImage) {
    const img = $('#heroImage');
    img.src = s.heroImage; img.hidden = false;
    $('#heroPlaceholder').style.display = 'none';
  }
  const logo = $('#brandLogo');
  if (s.logo) {
    logo.src = s.logo;
    logo.hidden = false;
    document.querySelector('.brand')?.classList.add('has-logo');
  }
  if (s.favicon) {
    const fav = document.getElementById('favicon');
    if (fav) fav.href = s.favicon;
  }
  const phone = s.phone || '';
  $('#footPhone').textContent = phone; $('#footPhone').href = 'tel:' + phone.replace(/[^\d+]/g, '');
  $('#footInsta').textContent = s.instagram || '';
  $('#footInsta').href = 'https://instagram.com/' + String(s.instagram || '').replace(/^@/, '');
  $('#footAddress').textContent = s.address || '';
  const wa = String(s.whatsapp || '').replace(/[^\d]/g, '');
  const float = $('#waFloat');
  if (wa) float.href = `https://wa.me/${wa}`;
  else float.hidden = true;
  const min = Math.min(...state.services.map((x) => Number(x.price)));
  $('#mbPrice').textContent = money(min);
}

/* ---------- services ---------- */
function renderServices() {
  const grid = $('#servicesGrid');
  grid.innerHTML = '';
  state.services.forEach((svc) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svc reveal';
    btn.dataset.id = svc.id;
    const media = svc.image
      ? `<span class="svc-media"><img src="${esc(svc.image)}" alt="${esc(svc.name)}" loading="lazy"></span>`
      : '';
    btn.innerHTML = `
      ${media}
      <span class="ico">${esc(svc.icon || '✦')}</span>
      <span class="tag">${esc(svc.tag || '')}</span>
      <h3>${esc(svc.name)}</h3>
      <p>${esc(svc.desc || '')}</p>
      <span class="foot">
        <span><span class="price">${money(svc.price)}</span><br><span class="dur">${esc(svc.dur || '')}</span></span>
        <span class="pick">Elegir →</span>
      </span>`;
    btn.addEventListener('click', () => selectService(svc, true));
    grid.appendChild(btn);
  });
}

function selectService(svc, scroll) {
  state.selected = svc;
  $$('.svc').forEach((el) => el.classList.toggle('is-selected', el.dataset.id === svc.id));
  $('#pickedName').textContent = svc.name;
  $('#pickedDur').textContent = svc.dur || '';
  $('#pickedPrice').textContent = money(svc.price);
  $('#pickedDur2').textContent = svc.dur || '';
  $('#mbPrice').textContent = money(svc.price);
  updateSteps();
  if (scroll) {
    setTimeout(() => $('#reserva').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
}

function updateSteps() {
  $$('.step').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('done', (n === 1 && state.selected) || (n === 2 && state.time));
    el.classList.toggle('active', (n === 1 && !state.selected) || (n === 2 && state.selected && !state.time) || (n === 3 && state.time));
  });
}

/* ---------- calendar ---------- */
async function loadMonth(month) {
  state.month = month;
  const res = await fetch('/api/availability?month=' + encodeURIComponent(month));
  const data = await res.json();
  state.days = data.days || {};
  state.monthLabel = data.label || month;
  renderCalendar();
}

function renderCalendar() {
  const [y, m] = state.month.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWd = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (firstWd + 6) % 7; // monday-first
  const today = todayStr();

  $('#calTitle').textContent = `${MONTHS[m - 1]} ${y}`;
  $('#prevMonth').disabled = state.month <= curMonth();

  const grid = $('#calDays');
  grid.innerHTML = '';
  for (let i = 0; i < offset; i++) {
    const s = document.createElement('span');
    s.className = 'day empty';
    grid.appendChild(s);
  }
  for (let d = 1; d <= total; d++) {
    const ds = `${state.month}-${String(d).padStart(2, '0')}`;
    const info = state.days[ds];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'day ' + (info ? 'has' : 'off');
    if (ds === today) el.classList.add('today');
    if (ds === state.date) el.classList.add('sel');
    el.innerHTML = `<span>${d}</span>${info ? '<i class="dot"></i>' : ''}`;
    if (info) {
      el.title = `${info.free} hueco${info.free === 1 ? '' : 's'} disponible${info.free === 1 ? '' : 's'}`;
      el.addEventListener('click', () => pickDate(ds));
    } else {
      el.disabled = true;
      el.title = 'Sin disponibilidad';
    }
    grid.appendChild(el);
  }
}

async function pickDate(ds) {
  state.date = ds;
  state.time = null;
  renderCalendar();
  const zone = $('#slotsZone');
  zone.hidden = false;
  $('#slotsTitle').textContent = capitalize(fmtDate(ds));
  $('#slots').innerHTML = '<span class="muted" style="font-size:.8rem">Cargando horas…</span>';
  const res = await fetch('/api/slots?date=' + encodeURIComponent(ds));
  const data = await res.json();
  renderSlots(data.slots || []);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderSlots(slots) {
  const box = $('#slots');
  box.innerHTML = '';
  $('#slotsCount').textContent = slots.length ? `${slots.length} hueco${slots.length === 1 ? '' : 's'} libre${slots.length === 1 ? '' : 's'}` : '';
  if (!slots.length) {
    box.innerHTML = '<div class="empty-note">Ese día ya está completo. Prueba con otro día marcado en rosa ✦</div>';
    updateSteps();
    return;
  }
  slots.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot' + (state.time === t ? ' sel' : '');
    b.textContent = t;
    b.addEventListener('click', () => pickTime(t));
    box.appendChild(b);
  });
}

function pickTime(t) {
  if (!state.selected) {
    // auto-scroll to service selection
    $('#efectos').scrollIntoView({ behavior: 'smooth' });
    flashPickedHint();
    return;
  }
  state.time = t;
  $$('.slot').forEach((b) => b.classList.toggle('sel', b.textContent === t));
  $('#pickedWhen').hidden = false;
  $('#pickedDate').textContent = capitalize(fmtDate(state.date));
  $('#pickedTime').textContent = `${t} h`;
  $('#pickedDur2').textContent = state.selected.dur || '';
  updateSteps();
  const form = $('#bookingForm');
  form.classList.add('on');
  setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
}

function flashPickedHint() {
  const card = $('.booking-aside .picked-card');
  card.style.transition = 'none';
  card.style.boxShadow = '0 0 0 3px rgba(255,233,238,.5)';
  setTimeout(() => { card.style.transition = 'box-shadow .6s'; card.style.boxShadow = 'none'; }, 60);
}

$('#prevMonth').addEventListener('click', () => {
  if (state.month <= curMonth()) return;
  const [y, m] = state.month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  loadMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
});
$('#nextMonth').addEventListener('click', () => {
  const [y, m] = state.month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  loadMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
});

/* ---------- booking submit ---------- */
$('#bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#formError');
  err.classList.remove('on');
  if (!state.selected) { showErr('Elige primero un efecto.'); return; }
  if (!state.date || !state.time) { showErr('Elige día y hora.'); return; }
  const body = {
    serviceId: state.selected.id,
    date: state.date,
    time: state.time,
    name: $('#fName').value.trim(),
    phone: $('#fPhone').value.trim(),
    email: $('#fEmail').value.trim(),
    notes: $('#fNotes').value.trim(),
  };
  if (body.name.length < 2) { showErr('Escribe tu nombre completo.'); return; }
  if (body.phone.replace(/[^\d]/g, '').length < 9) { showErr('Revisa el teléfono: necesito al menos 9 dígitos.'); return; }

  const btn = $('#submitBtn');
  btn.disabled = true; btn.textContent = 'Reservando…';
  try {
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) { await loadMonth(state.month); await pickDate(state.date); }
      throw new Error(data.error || 'No se pudo reservar');
    }
    showConfirm(data.booking, data.whatsapp);
  } catch (ex) {
    showErr(ex.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar mi cita ✦';
  }

  function showErr(msg) { err.textContent = msg; err.classList.add('on'); }
});

function showConfirm(b, whatsapp) {
  $('#calendarZone').hidden = true;
  $('#bookingForm').hidden = true;
  const zone = $('#confirmZone');
  zone.classList.add('on');
  const msg =
    `Hola Gera ✦ Acabo de reservar online:%0A%0A` +
    `• Efecto: ${encodeURIComponent(b.serviceName)}%0A` +
    `• Fecha: ${encodeURIComponent(capitalize(fmtDate(b.date)))}%0A` +
    `• Hora: ${encodeURIComponent(b.time)} h%0A` +
    `• Precio: ${encodeURIComponent(money(b.price))}%0A` +
    `• Nombre: ${encodeURIComponent(b.name)}%0A` +
    `• Teléfono: ${encodeURIComponent(b.phone)}`;
  $('#ticket').innerHTML = `
    <div><dt>Efecto</dt><dd>${esc(b.serviceName)}</dd></div>
    <div><dt>Fecha</dt><dd>${esc(capitalize(fmtDate(b.date)))}</dd></div>
    <div><dt>Hora</dt><dd>${esc(b.time)} h</dd></div>
    <div><dt>Duración</dt><dd>${esc(state.selected?.dur || '—')}</dd></div>
    <div><dt>A nombre de</dt><dd>${esc(b.name)}</dd></div>
    <div class="total"><dt style="font-family:var(--sans);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">Total</dt><dd>${money(b.price)}</dd></div>`;
  const digits = String(whatsapp || '').replace(/[^\d]/g, '');
  const wa = $('#waLink');
  if (digits) { wa.href = `https://wa.me/${digits}?text=${msg}`; wa.hidden = false; }
  else wa.hidden = true;
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // refresh month so the booked slot disappears
  loadMonth(state.month);
  updateSteps();
  $$('.step').forEach((el) => el.classList.add('done'));
}

$('#newBooking').addEventListener('click', () => {
  state.selected = null; state.date = null; state.time = null;
  $('#pickedName').textContent = 'Aún sin elegir';
  $('#pickedDur').textContent = '—'; $('#pickedPrice').textContent = '—';
  $('#pickedWhen').hidden = true;
  $('#confirmZone').classList.remove('on');
  $('#calendarZone').hidden = false;
  $('#bookingForm').hidden = false;
  $('#bookingForm').classList.remove('on');
  $('#bookingForm').reset();
  $$('.svc').forEach((el) => el.classList.remove('is-selected'));
  $('#slotsZone').hidden = true;
  updateSteps();
  loadMonth(state.month).then(() => $('#efectos').scrollIntoView({ behavior: 'smooth' }));
});

/* ---------- reviews ---------- */
function starRow(rating) {
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? '' : 'off'}">★</span>`;
  return out;
}

function renderReviews(reviews, stats) {
  const section = $('#resenas');
  const navLink = document.querySelector('.nav a[href="#resenas"]');
  if (!state.site?.settings?.reviewsEnabled) { section.hidden = true; if (navLink) navLink.hidden = true; return; }
  section.hidden = false;
  if (navLink) navLink.hidden = false;

  $('#reviewAvg').textContent = stats.count ? String(stats.avg).replace('.', ',') : '—';
  $('#reviewStars').innerHTML = starRow(Math.round(stats.avg || 0));
  $('#reviewCount').textContent = stats.count
    ? `${stats.count} reseña${stats.count === 1 ? '' : 's'} de clientas`
    : 'Todavía sin reseñas';

  const google = String(state.site.settings.googleReviewUrl || '').trim();
  const gBtn = $('#googleReviewsBtn');
  if (google) { gBtn.href = google; gBtn.hidden = false; } else gBtn.hidden = true;

  const box = $('#reviewsList');
  if (!reviews.length) {
    box.innerHTML = '<div class="reviews-empty">Aún no hay reseñas publicadas. Si ya has venido al estudio, tu opinión será la primera ✦</div>';
    return;
  }
  box.innerHTML = reviews.map((r) => {
    const svc = state.services.find((s) => s.id === r.serviceId);
    const initial = esc(String(r.name || '?').trim().charAt(0).toUpperCase());
    let date = '';
    try { date = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(r.createdAt)); } catch {}
    return `<article class="review-card">
      <div class="top">
        <span class="review-avatar">${initial}</span>
        <span><b>${esc(r.name)}</b><span class="svc">${svc ? esc(svc.name) : 'Beauty By Gera'}</span></span>
      </div>
      <div class="review-stars">${starRow(Number(r.rating) || 0)}</div>
      <p>“${esc(r.text)}”</p>
      ${r.reply ? `<div class="reply"><b>Gera:</b> ${esc(r.reply)}</div>` : ''}
      <div class="date">${esc(date)}</div>
    </article>`;
  }).join('');
}

let reviewRating = 0;
$$('#starPicker button').forEach((b) => {
  b.addEventListener('click', () => {
    reviewRating = Number(b.dataset.star);
    $$('#starPicker button').forEach((x) => x.classList.toggle('on', Number(x.dataset.star) <= reviewRating));
  });
});

$('#openReviewForm').addEventListener('click', () => {
  $('#reviewForm').hidden = false;
  $('#reviewThanks').hidden = true;
  $('#reviewForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#cancelReview').addEventListener('click', () => { $('#reviewForm').hidden = true; $('#reviewError').classList.remove('on'); });

$('#reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#reviewError');
  err.classList.remove('on');
  const body = {
    name: $('#rName').value.trim(),
    rating: reviewRating,
    text: $('#rText').value.trim(),
    serviceId: $('#rService').value,
  };
  if (!body.rating) { err.textContent = 'Elige de 1 a 5 estrellas.'; err.classList.add('on'); return; }
  if (body.name.length < 2) { err.textContent = 'Escribe tu nombre.'; err.classList.add('on'); return; }
  if (body.text.length < 4) { err.textContent = 'Cuéntanos un poco más.'; err.classList.add('on'); return; }
  const btn = $('#submitReview');
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar');
    $('#reviewForm').hidden = true;
    $('#reviewThanksText').textContent = data.message;
    $('#reviewThanks').hidden = false;
    $('#reviewForm').reset();
    reviewRating = 0;
    $$('#starPicker button').forEach((x) => x.classList.remove('on'));
    const fresh = await (await fetch('/api/site')).json();
    state.site = fresh;
    renderReviews(fresh.reviews || [], fresh.reviewStats || { count: 0, avg: 0 });
    $('#reviewThanks').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (ex) {
    err.textContent = ex.message; err.classList.add('on');
  } finally {
    btn.disabled = false; btn.textContent = 'Publicar reseña ✦';
  }
});

function renderMap(s) {
  const frame = $('#mapFrame');
  const directions = $('#mapDirections');
  const lat = Number(s.mapLat);
  const lng = Number(s.mapLng);
  const addr = String(s.address || '').trim();
  $('#mapAddress').textContent = addr || 'Estudio privado · Cita previa';

  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
    const z = Number(s.mapZoom) || 16;
    const delta = z >= 17 ? 0.004 : z >= 15 ? 0.008 : 0.02;
    const bbox = [lng - delta, lat - delta * 0.72, lng + delta, lat + delta * 0.72].join(',');
    frame.innerHTML = `<iframe title="Mapa de Beauty By Gera" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}"></iframe>`;
    directions.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    directions.hidden = false;
  } else {
    frame.innerHTML = '<div class="map-empty">Aquí aparecerá el mapa con la ubicación exacta del estudio.</div>';
    directions.hidden = true;
  }
}

/* ---------- gallery ---------- */
const FALLBACK = [
  { label: 'Volumen Ruso', g: 'linear-gradient(150deg,#f6cfd9,#e3a4b5)' },
  { label: 'Ojo de Gato', g: 'linear-gradient(150deg,#f3dcc8,#d9b08c)' },
  { label: 'Efecto Muñeca', g: 'linear-gradient(150deg,#f9dbe4,#eeb6c6)' },
  { label: 'Clásico', g: 'linear-gradient(150deg,#f2e2d2,#dcbfa4)' },
  { label: 'Efecto Húmedo', g: 'linear-gradient(150deg,#f7d5dd,#d99fb1)' },
  { label: '3D', g: 'linear-gradient(150deg,#efd9e6,#cfa6c2)' },
];

function renderGallery(items) {
  const grid = $('#galleryGrid');
  grid.innerHTML = '';
  if (!items || !items.length) {
    FALLBACK.forEach((f) => {
      const d = document.createElement('div');
      d.className = 'gal';
      d.innerHTML = `<div class="ph" style="background:${f.g}">${esc(f.label)}<br><span style="font-family:var(--sans);font-style:normal;font-size:.55rem;letter-spacing:.24em;text-transform:uppercase;opacity:.7">foto próximamente</span></div>`;
      grid.appendChild(d);
    });
    return;
  }
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'gal';
    d.innerHTML = `<img src="${esc(it.file)}" alt="${esc(it.caption || 'Trabajo de Beauty By Gera')}" loading="lazy"><span class="cap">${esc(it.caption || '')}</span>`;
    d.addEventListener('click', () => openLightbox(it.file));
    if (i === 0) d.style.gridColumn = 'span 2', d.style.gridRow = 'span 2';
    grid.appendChild(d);
  });
}

const lb = $('#lightbox');
function openLightbox(src) { $('#lightboxImg').src = src; lb.classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeLightbox() { lb.classList.remove('on'); document.body.style.overflow = ''; }
$('#lightboxClose').addEventListener('click', closeLightbox);
lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

/* ---------- reveal ---------- */
function revealOnScroll() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => io.observe(el));
}

boot().catch((e) => console.error(e));
updateSteps();
