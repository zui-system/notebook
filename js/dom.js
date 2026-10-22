// Pembantu kecil untuk membuat elemen DOM tanpa framework.

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'indeterminate', 'selected']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'ref') v(el);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROP_KEYS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Ikon garis sederhana (dibuat sendiri, ukuran 24x24).
const P = {
  menu: '<path d="M4 7h16M4 12h10M4 17h16"/>',
  pen: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  notes: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17.2v.3"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z" fill="#4285F4" stroke="none"/><path d="M12 21a8.9 8.9 0 0 0 6.1-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.7v2.4A9 9 0 0 0 12 21z" fill="#34A853" stroke="none"/><path d="M6.8 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.7a9 9 0 0 0 0 8.2z" fill="#FBBC05" stroke="none"/><path d="M12 6.6a4.9 4.9 0 0 1 3.4 1.3L18 5.3A8.7 8.7 0 0 0 12 3a9 9 0 0 0-8.3 4.8l3.1 2.4A5.4 5.4 0 0 1 12 6.6z" fill="#EA4335" stroke="none"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  shield: '<path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  textsize: '<path d="M4 18L9 6l5 12M5.8 14h6.4M15 18l3-7 3 7M15.8 16h4.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  belloff: '<path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8"/><path d="M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
  template: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M9 8v13"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.4.2 4 1.8 4.5 4.5"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><circle cx="16" cy="14.5" r="1.2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'
};

export function icon(name, cls) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${cls ? ` class="${cls}"` : ''}>${P[name] || ''}</svg>`;
  return t.content.firstChild;
}

// Tombol ikon dengan nama yang selalu terbaca pembaca layar;
// label terlihat bila pengaturan "Tampilkan label tombol" aktif.
export function iconButton({ icon: name, label, onClick, pressed, cls, extra, id }) {
  return h('button', {
    type: 'button',
    class: 'iconbtn' + (cls ? ' ' + cls : ''),
    onClick,
    id,
    'aria-pressed': pressed === undefined ? null : String(!!pressed)
  }, extra || icon(name), h('span', { class: 'lbl' }, label));
}

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById('toast');
  clear(el);
  el.appendChild(h('span', null, message));
  if (action) {
    el.appendChild(h('button', { type: 'button', onClick: () => { hide(); action.run(); } }, action.label));
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 7000 : 4000);
  function hide() { el.classList.remove('show'); }
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const time = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= startToday) return `Hari ini, ${time}`;
  if (ms >= startToday - 86400000) return `Kemarin, ${time}`;
  if (ms >= startToday - 6 * 86400000) return DAYS[d.getDay()];
  const y = d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

// Tanggal tenggat, mis. "Hari ini, 08.00", "Besok", "Kamis, 24 Okt", "3 Jan 2027".
export function fmtDue(ms, hasTime) {
  const d = new Date(ms);
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day - today) / 86400000);
  let label;
  if (diff === 0) label = 'Hari ini';
  else if (diff === 1) label = 'Besok';
  else if (diff === -1) label = 'Kemarin';
  else if (diff > 1 && diff < 7) label = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  else label = `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear()}`;
  return hasTime ? `${label}, ${fmtTime(ms)}` : label;
}

export function fmtDayHeading(ms) {
  const d = new Date(ms);
  const FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${FULL[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  const n = x => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024 * 1024) return n(bytes / 1024 / 1024) + ' MB';
  return n(bytes / 1024 / 1024 / 1024) + ' GB';
}
