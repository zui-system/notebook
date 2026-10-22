// Logika catatan: membuat, mengubah, sampah, notebook, tag, cadangan.
// Bekerja di atas LocalStore (perangkat) atau CloudStore (akun).
import { LocalStore } from './store/local.js';
import { SearchIndex, normalize } from './search.js';
import { LIMITS } from './config.js';
import { settings, onSettings } from './settings.js';

export const search = new SearchIndex();
let store = null;
const listeners = new Set();

export const getStore = () => store;
export const onData = fn => { listeners.add(fn); return () => listeners.delete(fn); };

function emit(what) {
  if (!store) return;
  search.sync(store.notes, store.notebooks);
  listeners.forEach(fn => fn(what));
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 20);

const NOTE_FIELDS = ['title', 'body', 'type', 'items', 'notebookId', 'tags', 'pinned', 'archived', 'deletedAt', 'createdAt', 'editedAt', 'attachments'];

export function blankNote(p = {}) {
  const now = Date.now();
  return { title: '', body: '', type: 'text', items: [], notebookId: null, tags: [], pinned: false, archived: false, deletedAt: null, createdAt: now, editedAt: now, attachments: [], ...p };
}

export function normTag(t) {
  return String(t || '').replace(/^#+/, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 30);
}

// Menyamakan bentuk data catatan dengan aturan keamanan Firestore.
export function cleanNote(n) {
  const o = {};
  for (const k of NOTE_FIELDS) o[k] = n[k];
  o.title = String(o.title || '').slice(0, 300);
  o.body = String(o.body || '').slice(0, 50000);
  o.type = o.type === 'checklist' ? 'checklist' : 'text';
  o.items = (Array.isArray(o.items) ? o.items : []).slice(0, 300).map(i => ({ id: String(i.id || newId()).slice(0, 40), text: String(i.text || '').slice(0, 1000), done: !!i.done }));
  o.notebookId = typeof o.notebookId === 'string' && o.notebookId ? o.notebookId.slice(0, 40) : null;
  o.tags = [...new Set((Array.isArray(o.tags) ? o.tags : []).map(normTag).filter(Boolean))].slice(0, 20);
  o.pinned = !!o.pinned;
  o.archived = !!o.archived;
  o.deletedAt = typeof o.deletedAt === 'number' ? o.deletedAt : null;
  o.createdAt = typeof o.createdAt === 'number' ? o.createdAt : Date.now();
  o.editedAt = typeof o.editedAt === 'number' ? o.editedAt : Date.now();
  o.attachments = (Array.isArray(o.attachments) ? o.attachments : []).slice(0, LIMITS.attachmentsPerNote)
    .map(a => ({ path: String(a.path), url: String(a.url), size: Number(a.size) || 0 }));
  return o;
}

export function isEmptyNote(n) {
  return !String(n.title || '').trim() && !String(n.body || '').trim() &&
    !(n.items || []).some(i => String(i.text || '').trim()) && !(n.attachments || []).length;
}

export function noteTitle(n) {
  if (n.title && n.title.trim()) return n.title.trim();
  const first = n.type === 'checklist' ? (n.items || []).find(i => i.text.trim())?.text : String(n.body || '').split('\n').find(l => l.trim());
  return first ? first.trim().slice(0, 80) : 'Tanpa judul';
}

export function noteSnippet(n) {
  if (n.type === 'checklist') {
    const items = (n.items || []).filter(i => i.text.trim());
    if (!items.length) return '';
    const done = items.filter(i => i.done).length;
    return `${done} dari ${items.length} selesai`;
  }
  const lines = String(n.body || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!n.title.trim()) lines.shift();
  return lines.join(' · ').slice(0, 200);
}

// ---- Memulai penyimpanan ----
let unsubSettings = null;

async function attach(s) {
  if (store) store.close();
  store = s;
  store.onChange(what => emit(what));
  if (unsubSettings) unsubSettings();
  unsubSettings = onSettings((st, fromRemote) => { if (!fromRemote && store) store.saveSettings(st); });
  if (!(await store.getFlag('sample'))) {
    await createSample();
    await store.setFlag('sample', true);
  }
  emit();
  purgeTrash();
}

export async function useLocal() {
  const s = new LocalStore();
  await s.init();
  await attach(s);
}

export async function useCloud(fb, user, onError) {
  const { CloudStore } = await import('./store/cloud.js');
  const s = new CloudStore(fb, user);
  s.onError = onError;
  await s.init();
  // Profil lama yang belum punya bendera contoh dianggap sudah punya catatan contoh,
  // kecuali profilnya baru dibuat sekarang.
  if (!s.isNewProfile && s.profile && !s.profile.flags) s.profile.flags = { sample: true };
  await attach(s);
}

async function createSample() {
  const id = newId();
  await store.putNote(id, cleanNote(blankNote({
    title: 'Selamat datang di Zui Notebook',
    type: 'checklist',
    pinned: true,
    items: [
      { id: newId(), text: 'Ketuk ikon pena di kanan atas untuk menulis catatan baru', done: false },
      { id: newId(), text: 'Buka menu di kiri atas untuk melihat semua catatan', done: false },
      { id: newId(), text: 'Atur ukuran huruf dan tema di Pengaturan (bagian bawah menu)', done: false },
      { id: newId(), text: 'Centang kotak ini kalau sudah dicoba', done: false }
    ]
  })));
}

// ---- Daftar ----
export function allNotes() { return store ? [...store.notes.values()] : []; }
export function getNote(id) { return store ? store.notes.get(id) : null; }
export function allNotebooks() {
  return store ? [...store.notebooks.values()].sort((a, b) => a.name.localeCompare(b.name, 'id')) : [];
}
export function getNotebook(id) { return store ? store.notebooks.get(id) : null; }

const byRecent = (a, b) => (b.pinned - a.pinned) || (b.editedAt - a.editedAt);

export function listNotes(kind, arg) {
  let list = allNotes();
  if (kind === 'sampah') return list.filter(n => n.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  list = list.filter(n => !n.deletedAt);
  if (kind === 'arsip') return list.filter(n => n.archived).sort((a, b) => b.editedAt - a.editedAt);
  list = list.filter(n => !n.archived);
  if (kind === 'disematkan') list = list.filter(n => n.pinned);
  if (kind === 'notebook') list = list.filter(n => n.notebookId === arg);
  if (kind === 'tag') list = list.filter(n => (n.tags || []).includes(arg));
  return list.sort(byRecent);
}

export function recentNotes(n = 6) {
  return allNotes().filter(x => !x.deletedAt && !x.archived).sort((a, b) => b.editedAt - a.editedAt).slice(0, n);
}

export function allTags() {
  const counts = new Map();
  for (const n of allNotes()) {
    if (n.deletedAt) continue;
    for (const t of n.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
}

export function countIn(kind, arg) { return listNotes(kind, arg).length; }

// ---- Mengubah catatan ----
export function createNote(draft) {
  const id = newId();
  store.putNote(id, cleanNote({ ...draft, createdAt: Date.now(), editedAt: Date.now() }));
  return id;
}

export function saveNote(id, draft) {
  store.putNote(id, cleanNote(draft));
}

export function updateNote(id, patch, { touch = true } = {}) {
  const cur = store.notes.get(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  if (touch) next.editedAt = Date.now();
  store.putNote(id, cleanNote(next));
}

export const togglePin = id => { const n = getNote(id); if (n) updateNote(id, { pinned: !n.pinned }, { touch: false }); };
export const setArchived = (id, archived) => updateNote(id, { archived, pinned: archived ? false : getNote(id).pinned }, { touch: false });
export const trashNote = id => updateNote(id, { deletedAt: Date.now(), pinned: false }, { touch: false });
export const restoreNote = id => updateNote(id, { deletedAt: null }, { touch: false });

export async function deleteForever(id) {
  const n = getNote(id);
  if (!n) return;
  for (const a of n.attachments || []) if (store.deleteFile) store.deleteFile(a.path);
  await store.removeNote(id);
}

export async function emptyTrash() {
  for (const n of listNotes('sampah')) await deleteForever(n.id);
}

export async function purgeTrash() {
  const cutoff = Date.now() - LIMITS.trashDays * 86400000;
  for (const n of allNotes()) if (n.deletedAt && n.deletedAt < cutoff) await deleteForever(n.id);
}

export function daysLeftInTrash(n) {
  return Math.max(0, Math.ceil((n.deletedAt + LIMITS.trashDays * 86400000 - Date.now()) / 86400000));
}

// ---- Notebook ----
export function createNotebook(name) {
  const id = newId();
  store.putNotebook(id, { name: String(name).trim().slice(0, 60) || 'Notebook', createdAt: Date.now() });
  return id;
}
export function renameNotebook(id, name) {
  const nb = getNotebook(id);
  if (!nb) return;
  store.putNotebook(id, { name: String(name).trim().slice(0, 60) || nb.name, createdAt: nb.createdAt || Date.now() });
}
export async function deleteNotebook(id) {
  for (const n of allNotes()) if (n.notebookId === id) updateNote(n.id, { notebookId: null }, { touch: false });
  await store.removeNotebook(id);
}

// ---- Gambar ----
export async function resizeImage(file) {
  if (file.size > LIMITS.imageInputMax) throw new Error('Gambar terlalu besar. Maksimal 15 MB.');
  if (!/^image\//.test(file.type)) throw new Error('File ini bukan gambar.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Gambar tidak bisa dibuka.'); });
  const scale = Math.min(1, LIMITS.imageMaxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(bmp, 0, 0, w, hgt);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob || blob.size > LIMITS.imageUploadMax) throw new Error('Gambar masih terlalu besar setelah diperkecil (maks 5 MB).');
  return blob;
}

export async function addImage(noteId, file) {
  const n = getNote(noteId);
  if (!n) throw new Error('Catatan tidak ditemukan.');
  if ((n.attachments || []).length >= LIMITS.attachmentsPerNote) throw new Error(`Maksimal ${LIMITS.attachmentsPerNote} gambar per catatan.`);
  if (!navigator.onLine) throw new Error('Menambah gambar butuh internet. Coba lagi saat online.');
  const blob = await resizeImage(file);
  const att = await store.uploadImage(noteId, blob);
  const cur = getNote(noteId);
  updateNote(noteId, { attachments: [...(cur.attachments || []), att] });
}

export async function removeImage(noteId, path) {
  const n = getNote(noteId);
  if (!n) return;
  updateNote(noteId, { attachments: (n.attachments || []).filter(a => a.path !== path) });
  if (store.deleteFile) store.deleteFile(path);
}

// ---- Cadangan ----
export function snapshot() {
  return {
    app: 'zui-notebook',
    version: 1,
    createdAt: Date.now(),
    notes: allNotes().map(n => ({ id: n.id, ...cleanNote(n) })),
    notebooks: [...store.notebooks.values()].map(nb => ({ id: nb.id, name: nb.name, createdAt: nb.createdAt || Date.now() })),
    settings: { ...settings }
  };
}

export async function backupNow(auto = false) {
  if (store.kind === 'cloud' && !navigator.onLine) throw new Error('Cadangan ke akun butuh internet.');
  const snap = snapshot();
  const size = JSON.stringify(snap).length;
  if (size > LIMITS.backupMax) throw new Error('Data terlalu besar untuk satu cadangan.');
  await store.createBackup(snap, auto);
  // Simpan hanya beberapa cadangan terbaru.
  const list = await store.listBackups();
  for (const b of list.slice(LIMITS.backupsKept)) await store.deleteBackup(b.id).catch(() => {});
  return snap.createdAt;
}

export async function autoBackup() {
  try {
    if (!store) return;
    if (store.kind === 'cloud' && !navigator.onLine) return;
    const list = await store.listBackups();
    const last = list[0] ? list[0].createdAt : 0;
    if (Date.now() - last > LIMITS.autoBackupEveryDays * 86400000 && allNotes().length) await backupNow(true);
  } catch (e) {
    console.warn('Cadangan otomatis gagal', e);
  }
}

export const listBackups = () => store.listBackups();

export function validateSnapshot(snap) {
  if (!snap || snap.app !== 'zui-notebook' || !Array.isArray(snap.notes)) throw new Error('File ini bukan cadangan Zui Notebook.');
  return snap;
}

// Memulihkan: catatan di cadangan menimpa versi yang sama; catatan lain tetap ada.
export async function restoreSnapshot(snap) {
  validateSnapshot(snap);
  let count = 0;
  for (const nb of snap.notebooks || []) {
    if (!nb || !nb.id) continue;
    await store.putNotebook(String(nb.id).slice(0, 40), { name: String(nb.name || 'Notebook').slice(0, 60), createdAt: Number(nb.createdAt) || Date.now() });
  }
  for (const n of snap.notes) {
    if (!n || !n.id) continue;
    await store.putNote(String(n.id).slice(0, 40), cleanNote(n));
    count++;
  }
  return count;
}

export async function restoreBackup(id) {
  const snap = await store.readBackup(id);
  return restoreSnapshot(snap);
}

// ---- Pindah dari perangkat ke akun ----
export async function localNotesForMigration() {
  const s = new LocalStore();
  await s.init();
  const notes = [...s.notes.values()].filter(n => !isSampleUntouched(n));
  return { local: s, notes, notebooks: [...s.notebooks.values()] };
}

function isSampleUntouched(n) {
  return n.title === 'Selamat datang di Zui Notebook' && n.type === 'checklist' && !(n.items || []).some(i => i.done);
}

export async function migrateFromLocal(m) {
  for (const nb of m.notebooks) await store.putNotebook(nb.id, { name: nb.name, createdAt: nb.createdAt || Date.now() });
  for (const n of m.notes) await store.putNote(n.id, cleanNote(n));
  await m.local.wipe();
  m.local.close();
}

export function normalizedIncludes(hay, needle) { return normalize(hay).includes(normalize(needle)); }
