// Service worker: aplikasi tetap terbuka tanpa internet.
// Ganti VERSION setiap kali merilis versi baru agar file lama diperbarui.
const VERSION = 'zn-v2.0.0';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/dom.js',
  'js/nav.js',
  'js/settings.js',
  'js/config.js',
  'js/data.js',
  'js/search.js',
  'js/recur.js',
  'js/reminders.js',
  'js/templates.js',
  'js/firebase.js',
  'js/store/local.js',
  'js/store/cloud.js',
  'js/store/outbox.js',
  'js/views/auth.js',
  'js/views/dialogs.js',
  'js/views/drawer.js',
  'js/views/editor.js',
  'js/views/lists.js',
  'js/views/settings.js',
  'js/views/due.js',
  'js/views/agenda.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];
const RUNTIME = 'zn-runtime-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // File aplikasi sendiri: ambil dari cache dulu (cepat), lalu perbarui di belakang.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(staleWhileRevalidate(new Request('index.html'), VERSION, req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req, VERSION));
    return;
  }

  // Firebase SDK (alamat berversi, tidak pernah berubah) dan huruf: simpan permanen.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }
  // Gambar lampiran dari Firebase Storage.
  if (url.hostname === 'firebasestorage.googleapis.com' && req.destination === 'image') {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Selain itu (Firestore, login) langsung ke jaringan; Firestore punya cache offline sendiri.
});

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName, fetchReq) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(fetchReq || req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { network.catch(() => {}); return hit; }
  const res = await network;
  return res || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// ---------- Notifikasi pengingat ----------
// Pesan dari server (Firebase Cloud Messaging, data saja): kita tampilkan sendiri,
// dengan tag yang sama seperti notifikasi dari aplikasi agar tidak muncul dua kali.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const d = payload.data || payload.notification || payload;
  event.waitUntil(self.registration.showNotification(d.title || 'Pengingat', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { noteId: d.noteId || '', itemId: d.itemId || '' },
    actions: d.noteId ? [{ action: 'matikan', title: 'Matikan pengingat' }] : []
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { noteId, itemId } = event.notification.data || {};
  const hash = event.action === 'matikan' && noteId
    ? '#/matikan-pengingat/' + encodeURIComponent(noteId) + '/' + encodeURIComponent(itemId)
    : noteId ? '#/catatan/' + encodeURIComponent(noteId) : '#/hari-ini';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (win) {
      win.postMessage({ type: 'open', hash });
      return win.focus();
    }
    return self.clients.openWindow(new URL('./' + hash, self.registration.scope).href);
  })());
});
