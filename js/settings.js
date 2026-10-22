// Pengaturan tampilan. Disimpan di perangkat (langsung berlaku, juga saat offline)
// dan ikut disinkronkan ke profil akun bila pengguna masuk.

const KEY = 'zn-settings';

export const FONT_SIZES = [
  { id: 'kecil', label: 'Kecil', px: 15 },
  { id: 'sedang', label: 'Sedang', px: 17 },
  { id: 'besar', label: 'Besar', px: 20 },
  { id: 'sangat-besar', label: 'Sangat besar', px: 24 }
];

export const THEMES = [
  { id: 'terang', label: 'Terang Tenang', colors: ['#F7F5F0', '#2F5D50', '#1D1B17'], meta: '#F7F5F0' },
  { id: 'gelap', label: 'Gelap Tenang', colors: ['#1E1D1A', '#8FC1A9', '#EDEAE3'], meta: '#1E1D1A' },
  { id: 'ceria', label: 'Ceria Lembut', colors: ['#FBF1E6', '#B8430F', '#E7D8F5'], meta: '#FBF1E6' }
];

export const DEFAULTS = { fontSize: 'sedang', theme: 'terang', highContrast: false, labels: false, reminders: true };

const listeners = new Set();

function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return { ...DEFAULTS }; }
}

export function sanitize(s) {
  const o = { ...DEFAULTS };
  if (s && FONT_SIZES.some(f => f.id === s.fontSize)) o.fontSize = s.fontSize;
  if (s && THEMES.some(t => t.id === s.theme)) o.theme = s.theme;
  if (s && typeof s.highContrast === 'boolean') o.highContrast = s.highContrast;
  if (s && typeof s.labels === 'boolean') o.labels = s.labels;
  if (s && typeof s.reminders === 'boolean') o.reminders = s.reminders;
  return o;
}

export let settings = load();

export function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  r.dataset.fs = settings.fontSize;
  r.dataset.contrast = settings.highContrast ? 'tinggi' : 'normal';
  r.dataset.labels = settings.labels ? 'on' : 'off';
  const meta = document.querySelector('meta[name="theme-color"]');
  const t = THEMES.find(x => x.id === settings.theme);
  if (meta && t) meta.setAttribute('content', settings.highContrast && t.id === 'gelap' ? '#000000' : (settings.highContrast ? '#FFFFFF' : t.meta));
}

// fromRemote = true saat nilai datang dari akun (tidak dikirim balik).
export function updateSettings(patch, { fromRemote = false } = {}) {
  const next = sanitize({ ...settings, ...patch });
  // Ukuran "sangat besar" otomatis menampilkan label tombol (masih bisa dimatikan).
  if (!fromRemote && patch.fontSize === 'sangat-besar' && settings.fontSize !== 'sangat-besar' && !('labels' in patch)) {
    next.labels = true;
  }
  settings = next;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  applySettings();
  listeners.forEach(fn => fn(settings, fromRemote));
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
