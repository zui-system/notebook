// Pengingat di perangkat: memunculkan notifikasi saat waktunya tiba (selama aplikasi terbuka,
// juga saat offline dan tanpa akun), meminta izin notifikasi, dan mendaftarkan perangkat
// untuk notifikasi dari server (web push) agar pengingat tetap datang saat aplikasi tertutup.
import { notificationFor, nextOccurrence } from './recur.js';
import { FCM_VAPID_KEY } from './config.js';
import { loadMessaging } from './firebase.js';

const FIRED_KEY = 'zn-fired';
const DEVICE_KEY = 'zn-device';
const TOKEN_KEY = 'zn-push-token';
// Pengingat yang terlewat lebih lama dari ini (mis. komputer tidur) tidak dibunyikan lagi;
// item tetap terlihat di "Hari ini".
const LATE_MAX = 10 * 60000;

let plan = [];
let timer = null;

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const permission = () => (notifySupported() ? Notification.permission : 'unsupported');
export const pushConfigured = () => !!FCM_VAPID_KEY;
export const pushSupported = () => notifySupported() && 'serviceWorker' in navigator && 'PushManager' in window && pushConfigured();

export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
export function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

export async function askPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

function firedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); } catch { return new Set(); }
}
function markFired(tag) {
  const list = [...firedSet(), tag].slice(-200);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(list)); } catch {}
}

// Menampilkan satu notifikasi pengingat. Tag sama dengan notifikasi dari server,
// jadi bila keduanya datang, yang kedua hanya menggantikan yang pertama.
export async function showReminder(r, at, { test = false } = {}) {
  const n = notificationFor(r, at);
  if (!test) {
    if (firedSet().has(n.tag)) return false;
    markFired(n.tag);
  }
  if (permission() !== 'granted') return false;
  const opts = {
    body: n.body, tag: n.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: { noteId: n.noteId, itemId: n.itemId },
    actions: test ? [] : [{ action: 'matikan', title: 'Matikan pengingat' }]
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(n.title, opts);
    else { delete opts.actions; new Notification(n.title, opts); }
    return true;
  } catch (e) {
    console.warn('Notifikasi gagal ditampilkan', e);
    return false;
  }
}

// list: jadwal dari data.desiredReminders(). Dipanggil ulang setiap catatan berubah.
export function scheduleLocal(list) {
  plan = list.map(r => ({ ...r }));
  arm();
}

function arm() {
  clearTimeout(timer);
  let next = Infinity;
  for (const r of plan) if (r.at < next) next = r.at;
  if (next === Infinity) return;
  // Periksa ulang paling lambat tiap jam: timer bisa tertunda saat HP tidur.
  timer = setTimeout(tick, Math.min(Math.max(0, next - Date.now()), 3600000));
}

function tick() {
  const now = Date.now();
  for (const r of plan) {
    if (r.at > now) continue;
    if (now - r.at < LATE_MAX) showReminder(r, r.at);
    r.at = r.repeat ? nextOccurrence(r.base, r.repeat, r.tz, now) : null;
  }
  plan = plan.filter(r => typeof r.at === 'number');
  arm();
}

export function nextLocal() { return plan.reduce((m, r) => Math.min(m, r.at), Infinity); }

// ---------- Notifikasi dari server (web push lewat Firebase Cloud Messaging) ----------
export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : isIOS() ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Perangkat';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
}

export async function enablePush(store) {
  if (!store || store.kind !== 'cloud' || !pushSupported() || permission() !== 'granted') return false;
  try {
    const fb = await loadMessaging();
    if (!fb) return false;
    const reg = await navigator.serviceWorker.ready;
    const token = await fb.M.getToken(fb.messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return false;
    const key = store.uid + ':' + token;
    if (localStorage.getItem(TOKEN_KEY) !== key) {
      await store.saveDevice(deviceId(), token, deviceLabel());
      localStorage.setItem(TOKEN_KEY, key);
    }
    return true;
  } catch (e) {
    console.warn('Notifikasi dari server belum bisa diaktifkan', e);
    return false;
  }
}

export const pushEnabledHere = () => !!localStorage.getItem(TOKEN_KEY);

// Dipanggil saat keluar akun: perangkat ini tidak lagi menerima pengingat akun itu.
export async function disablePush(store) {
  localStorage.removeItem(TOKEN_KEY);
  if (store && store.removeDevice) await store.removeDevice(deviceId()).catch(() => {});
  try {
    if (pushSupported()) { const fb = await loadMessaging(); if (fb) await fb.M.deleteToken(fb.messaging); }
  } catch {}
}
