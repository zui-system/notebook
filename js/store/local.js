// Penyimpanan di perangkat (IndexedDB) untuk mode tanpa akun.
// Antarmukanya sama dengan CloudStore agar sisa aplikasi tidak perlu tahu bedanya.

const DB_NAME = 'zui-notebook';
const DB_VERSION = 1;
const STORES = ['notes', 'notebooks', 'meta', 'backups'];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function readAll(db, store) {
  return new Promise((resolve, reject) => {
    const out = new Map();
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.set(c.key, c.value); c.continue(); }
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

export class LocalStore {
  constructor() {
    this.kind = 'local';
    this.canAttach = false;
    this.notes = new Map();
    this.notebooks = new Map();
    this.listeners = new Set();
    this.user = null;
    this.profile = { plan: 'free' };
  }

  async init() {
    this.db = await openDB();
    this.notes = await readAll(this.db, 'notes');
    this.notebooks = await readAll(this.db, 'notebooks');
    for (const [id, n] of this.notes) n.id = id;
    for (const [id, n] of this.notebooks) n.id = id;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(fn => fn()); }

  putNote(id, data) {
    this.notes.set(id, { ...data, id });
    this.emit();
    return run(this.db, 'notes', 'readwrite', s => s.put(data, id));
  }
  removeNote(id) {
    this.notes.delete(id);
    this.emit();
    return run(this.db, 'notes', 'readwrite', s => s.delete(id));
  }
  putNotebook(id, data) {
    this.notebooks.set(id, { ...data, id });
    this.emit();
    return run(this.db, 'notebooks', 'readwrite', s => s.put(data, id));
  }
  removeNotebook(id) {
    this.notebooks.delete(id);
    this.emit();
    return run(this.db, 'notebooks', 'readwrite', s => s.delete(id));
  }

  getFlag(key) { return run(this.db, 'meta', 'readonly', s => s.get(key)); }
  setFlag(key, value) { return run(this.db, 'meta', 'readwrite', s => s.put(value, key)); }

  // Pengaturan disimpan di localStorage oleh settings.js; tidak perlu disalin.
  saveSettings() {}

  // ---- Cadangan (disimpan di IndexedDB perangkat) ----
  async createBackup(snapshot, auto) {
    const json = JSON.stringify(snapshot);
    const id = String(snapshot.createdAt);
    await run(this.db, 'backups', 'readwrite', s => s.put({ createdAt: snapshot.createdAt, count: snapshot.notes.length, size: json.length, auto: !!auto, json }, id));
    return id;
  }
  async listBackups() {
    const all = await readAll(this.db, 'backups');
    return [...all.entries()].map(([id, b]) => ({ id, createdAt: b.createdAt, count: b.count, size: b.size, auto: b.auto }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async readBackup(id) {
    const b = await run(this.db, 'backups', 'readonly', s => s.get(id));
    return b ? JSON.parse(b.json) : null;
  }
  deleteBackup(id) { return run(this.db, 'backups', 'readwrite', s => s.delete(id)); }

  // Menghapus semua catatan di perangkat (dipakai setelah dipindah ke akun).
  async wipe() {
    for (const s of STORES) await run(this.db, s, 'readwrite', st => st.clear());
    this.notes.clear(); this.notebooks.clear();
    this.emit();
  }

  close() { try { this.db.close(); } catch {} }
}
