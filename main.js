// Titik awal aplikasi: pengenalan, masuk, kerangka layar, dan navigasi.
import { h, iconButton, clear, toast } from './dom.js';
import { applySettings, updateSettings, settings } from './settings.js';
import * as data from './data.js';
import { parseRoute, go } from './nav.js';
import { hasFirebase, loadFirebase } from './firebase.js';
import { homeView, listView, searchView } from './views/lists.js';
import { editorView } from './views/editor.js';
import { settingsView } from './views/settings.js';
import { onboardingView, loginView, profileDialog, avatar } from './views/auth.js';
import { openDrawer, closeDrawer } from './views/drawer.js';
import { confirmDialog, promptDialog } from './views/dialogs.js';

const app = document.getElementById('app');
let fb = null;
let shell = null;
let view = null;
let viewKey = '';

applySettings();
registerServiceWorker();
watchConnection();
boot().catch(err => { console.error(err); fatal('Aplikasi gagal dimuat.', err); });

function mount(el) { clear(app).appendChild(el); }

function fatal(message, err) {
  mount(h('main', { class: 'auth', id: 'main' },
    h('div', { class: 'top' },
      h('h1', null, 'Ada kendala'),
      h('p', null, message),
      err ? h('p', { class: 'note-small' }, String(err.message || err)) : null),
    h('button', { type: 'button', class: 'btn primary block', onClick: () => location.reload() }, 'Coba lagi')));
}

async function boot() {
  if (!localStorage.getItem('zn-onboarded')) {
    mount(onboardingView({ onDone: () => { localStorage.setItem('zn-onboarded', '1'); boot(); } }));
    app.querySelector('h1')?.focus?.();
    return;
  }
  const mode = localStorage.getItem('zn-mode');
  if (mode === 'local') return startLocal();
  if (!hasFirebase()) return showLogin();

  try {
    fb = await loadFirebase();
  } catch (e) {
    console.error(e);
    if (mode === 'cloud') return fatal('Zui Notebook belum bisa dibuka. Periksa koneksi internet, lalu coba lagi.', e);
    return showLogin();
  }
  await completeEmailLink();
  fb.A.getRedirectResult(fb.auth).catch(e => toast(authMessage(e)));
  let first = true;
  fb.A.onAuthStateChanged(fb.auth, async user => {
    if (user) {
      const cur = data.getStore();
      if (!cur || cur.uid !== user.uid) await startCloud(user);
    } else if (first) {
      showLogin();
    }
    first = false;
  });
}

// ---------- Masuk ----------
function showLogin() {
  shell = null;
  mount(loginView({
    firebaseReady: !!fb,
    emailSentTo: sessionStorage.getItem('zn-email-sent') || '',
    onGoogle: signInGoogle,
    onEmail: sendEmailLink,
    onGuest: () => { localStorage.setItem('zn-mode', 'local'); startLocal(); }
  }));
}

function authMessage(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/popup-closed-by-user': 'Jendela masuk ditutup sebelum selesai.',
    'auth/cancelled-popup-request': 'Proses masuk dibatalkan.',
    'auth/network-request-failed': 'Tidak ada koneksi internet. Coba lagi saat online.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
    'auth/invalid-email': 'Alamat email belum benar.',
    'auth/invalid-action-code': 'Tautan masuk sudah dipakai atau kedaluwarsa. Minta tautan baru.',
    'auth/expired-action-code': 'Tautan masuk sudah kedaluwarsa. Minta tautan baru.',
    'auth/account-exists-with-different-credential': 'Email ini sudah terdaftar dengan cara masuk lain. Coba "Masuk lewat email".',
    'auth/unauthorized-domain': 'Alamat situs ini belum diizinkan di Firebase (Authorized domains).',
    'auth/operation-not-allowed': 'Cara masuk ini belum diaktifkan di Firebase.'
  };
  return map[code] || 'Gagal masuk. Coba lagi.';
}

async function signInGoogle() {
  const provider = new fb.A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  try {
    if (standalone) await fb.A.signInWithRedirect(fb.auth, provider);
    else await fb.A.signInWithPopup(fb.auth, provider);
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await fb.A.signInWithRedirect(fb.auth, provider);
      return;
    }
    throw new Error(authMessage(e));
  }
}

async function sendEmailLink(email) {
  try {
    await fb.A.sendSignInLinkToEmail(fb.auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
    localStorage.setItem('zn-email', email);
    sessionStorage.setItem('zn-email-sent', email);
  } catch (e) {
    throw new Error(authMessage(e));
  }
}

async function completeEmailLink() {
  if (!fb.A.isSignInWithEmailLink(fb.auth, location.href)) return;
  let email = localStorage.getItem('zn-email');
  if (!email) {
    email = await promptDialog({ title: 'Konfirmasi email', label: 'Alamat email yang kamu pakai untuk masuk', ok: 'Masuk', maxLength: 200 });
  }
  if (email) {
    try {
      await fb.A.signInWithEmailLink(fb.auth, email, location.href);
      sessionStorage.removeItem('zn-email-sent');
    } catch (e) {
      toast(authMessage(e));
    }
  }
  history.replaceState(null, '', location.pathname + '#/');
}

// ---------- Mulai penyimpanan ----------
async function startLocal() {
  mount(h('div', { class: 'boot', role: 'status' }, 'Memuat catatan…'));
  await data.useLocal();
  enterApp();
}

async function startCloud(user) {
  localStorage.setItem('zn-mode', 'cloud');
  mount(h('div', { class: 'boot', role: 'status' }, 'Menyiapkan catatanmu…'));
  await data.useCloud(fb, user, onCloudError);
  const store = data.getStore();
  const remote = store.profile && store.profile.settings;
  if (remote && Object.keys(remote).length) updateSettings(remote, { fromRemote: true });
  else store.saveSettings(settings);
  await offerMigration();
  enterApp();
}

async function offerMigration() {
  try {
    const m = await data.localNotesForMigration();
    if (!m.notes.length) { m.local.close(); return; }
    const ok = await confirmDialog({
      title: 'Pindahkan catatan ke akun?',
      message: `Ada ${m.notes.length} catatan yang dibuat tanpa akun di perangkat ini. Pindahkan ke akunmu supaya aman dan tersinkron?`,
      ok: 'Pindahkan', cancel: 'Nanti saja'
    });
    if (ok) { await data.migrateFromLocal(m); toast(`${m.notes.length} catatan dipindahkan ke akunmu.`); }
    else m.local.close();
  } catch (e) { console.warn('Pemindahan catatan dilewati', e); }
}

let lastCloudError = 0;
function onCloudError(err) {
  console.error(err);
  if (Date.now() - lastCloudError < 5000) return;
  lastCloudError = Date.now();
  if (err && err.code === 'permission-denied') toast('Perubahan ditolak oleh server. Coba masuk ulang.');
  else if (err && err.code === 'resource-exhausted') toast('Batas penyimpanan tercapai.');
}

// ---------- Kerangka layar ----------
function enterApp() {
  const topSlot = h('header', { style: 'display:contents' });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  mount(h('div', { class: 'shell' }, topSlot, main));
  shell = { topSlot, main };
  data.onData(() => render());
  render(true);
  setTimeout(() => data.autoBackup(), 4000);
}

function defaultTopbar() {
  const store = data.getStore();
  return h('div', { class: 'topbar' },
    iconButton({ icon: 'menu', label: 'Menu', id: 'btn-menu', onClick: openDrawer }),
    h('div', { class: 'right' },
      iconButton({ icon: 'pen', label: 'Catatan baru', id: 'btn-new', onClick: () => go('baru') }),
      iconButton({ icon: 'user', label: 'Profil', id: 'btn-profile', extra: avatar(store.user), onClick: () => profileDialog({ store, onSettings: () => go('pengaturan'), onSignOut: signOut, onSignIn: signInFromLocal }) })
    ));
}

function makeView(r) {
  const store = data.getStore();
  switch (r.name) {
    case '': return { ...homeView({ name: store.user && store.user.displayName }), title: 'Zui Notebook' };
    case 'semua': case 'disematkan': case 'arsip': case 'sampah':
      return { ...listView(r.name), title: null };
    case 'notebook': return { ...listView('notebook', r.arg), title: null };
    case 'tag': return { ...listView('tag', r.arg), title: null };
    case 'cari': return { ...searchView(), title: 'Cari', selfFocus: true };
    case 'baru': { const v = editorView(null, { notebookId: r.arg }); return { ...v, title: 'Catatan baru', selfFocus: true, key: () => v.noteId && v.noteId() ? 'catatan/' + v.noteId() : 'baru/' + (r.arg || '') }; }
    case 'catatan': { const v = editorView(r.arg); return { ...v, title: 'Catatan', selfFocus: true }; }
    case 'pengaturan': return { ...settingsView({ onSignOut: signOut, onSignIn: signInFromLocal }), title: 'Pengaturan' };
    default: return { ...homeView({}), title: 'Zui Notebook' };
  }
}

function render(force = false) {
  if (!shell) return;
  const r = parseRoute();
  const key = r.name + '/' + (r.arg || '');
  if (!force && view && (key === viewKey || (view.key && view.key() === key))) {
    viewKey = key;
    if (view.update) view.update();
    return;
  }
  if (view && view.destroy) view.destroy();
  closeDrawer();
  viewKey = key;
  view = makeView(r);
  clear(shell.topSlot).appendChild(view.toolbar || defaultTopbar());
  clear(shell.main).appendChild(view.el);
  const h1 = shell.main.querySelector('h1');
  document.title = (view.title || (h1 && h1.textContent) || 'Zui Notebook') + (view.title === 'Zui Notebook' ? '' : ' · Zui Notebook');
  window.scrollTo(0, 0);
  // Pindahkan fokus ke judul layar agar pembaca layar tahu halaman berganti.
  if (!force && !view.selfFocus && h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', () => render());
// Simpan catatan yang sedang ditulis saat aplikasi ditutup atau dipindah.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && view && view.destroy) view.destroy(); });
window.addEventListener('pagehide', () => { if (view && view.destroy) view.destroy(); });

// ---------- Akun ----------
async function signOut() {
  const ok = await confirmDialog({
    title: 'Keluar dari akun?',
    message: 'Catatanmu tetap aman di akun. Di perangkat ini catatan akan disembunyikan sampai kamu masuk lagi.',
    ok: 'Keluar'
  });
  if (!ok) return;
  if (view && view.destroy) view.destroy();
  // Pastikan perubahan terakhir sudah terkirim sebelum cache perangkat dibersihkan.
  const sent = await Promise.race([
    fb.F.waitForPendingWrites(fb.db).then(() => true).catch(() => false),
    new Promise(r => setTimeout(() => r(false), 6000))
  ]);
  if (!sent) {
    const force = await confirmDialog({
      title: 'Ada perubahan yang belum terkirim',
      message: 'Sepertinya kamu sedang offline. Kalau keluar sekarang, perubahan terakhir yang belum terkirim akan hilang. Sambungkan internet dulu, atau tetap keluar?',
      ok: 'Tetap keluar', cancel: 'Tunggu dulu', danger: true
    });
    if (!force) return;
  }
  try { await fb.A.signOut(fb.auth); } catch {}
  try { await fb.F.terminate(fb.db); await fb.F.clearIndexedDbPersistence(fb.db); } catch (e) { console.warn(e); }
  localStorage.removeItem('zn-mode');
  location.replace(location.pathname);
}

function signInFromLocal() {
  if (!hasFirebase()) { toast('Masuk dengan akun belum diaktifkan di versi ini.'); return; }
  localStorage.removeItem('zn-mode');
  location.replace(location.pathname);
}

// ---------- Koneksi dan PWA ----------
function watchConnection() {
  window.addEventListener('offline', () => toast('Kamu sedang offline. Catatan tetap tersimpan dan akan tersinkron otomatis.'));
  window.addEventListener('online', () => { if (data.getStore() && data.getStore().kind === 'cloud') toast('Kembali online. Menyinkronkan catatan…'); });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Versi baru tersedia.', { label: 'Muat ulang', run: () => location.reload() });
          }
        });
      });
    }).catch(e => console.warn('Service worker gagal didaftarkan', e));
  });
}

// Untuk pengujian otomatis.
window.__zn = { data, go };
