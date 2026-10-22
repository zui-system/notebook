// Penyimpanan di akun (Firestore + Storage).
// Firestore memakai cache offline: tulisan langsung tampil, disimpan di perangkat,
// lalu dikirim ke server otomatis saat internet tersedia.
import { loadStorage } from '../firebase.js';

const PROFILE_KEYS = ['displayName', 'email', 'plan', 'settings', 'flags', 'usage', 'createdAt', 'updatedAt'];
// Field yang menentukan sebuah jadwal pengingat. "at" sengaja tidak termasuk: setelah dibuat,
// server yang memajukan "at" untuk jadwal berulang.
const REMINDER_KEYS = ['noteId', 'itemId', 'title', 'text', 'base', 'repeat', 'tz'];

export class CloudStore {
  constructor(fb, user) {
    this.kind = 'cloud';
    this.canAttach = true;
    this.fb = fb;
    this.user = user;
    this.uid = user.uid;
    this.notes = new Map();
    this.notebooks = new Map();
    this.reminders = new Map();
    this.remindersReady = false;
    this.pendingReminders = null;
    this.listeners = new Set();
    this.unsubs = [];
    this.profile = { plan: 'free', flags: {} };
    this.onError = () => {};
  }

  col(name) { return this.fb.F.collection(this.fb.db, 'users', this.uid, name); }
  ref(name, id) { return this.fb.F.doc(this.fb.db, 'users', this.uid, name, id); }

  async init() {
    const F = this.fb.F;
    await this.ensureProfile();
    this.unsubs.push(F.onSnapshot(F.doc(this.fb.db, 'users', this.uid), snap => {
      if (snap.exists()) { this.profile = snap.data(); this.emit('profile'); }
    }, err => this.onError(err)));

    const first = (name, map) => new Promise(resolve => {
      let done = false;
      this.unsubs.push(F.onSnapshot(this.col(name), snap => {
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') map.delete(ch.doc.id);
          else map.set(ch.doc.id, { ...ch.doc.data({ serverTimestamps: 'estimate' }), id: ch.doc.id });
        }
        if (!done) { done = true; resolve(); }
        this.emit();
      }, err => { this.onError(err); if (!done) { done = true; resolve(); } }));
    });
    await Promise.all([first('notes', this.notes), first('notebooks', this.notebooks)]);

    // Jadwal pengingat: hanya dibaca untuk membandingkan, tidak memicu tampilan ulang.
    this.unsubs.push(F.onSnapshot(this.col('reminders'), snap => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') this.reminders.delete(ch.doc.id);
        else this.reminders.set(ch.doc.id, ch.doc.data());
      }
      if (!this.remindersReady) {
        this.remindersReady = true;
        if (this.pendingReminders) { const want = this.pendingReminders; this.pendingReminders = null; this.syncReminders(want); }
      }
    }, err => this.onError(err)));
  }

  async ensureProfile() {
    const F = this.fb.F;
    const ref = F.doc(this.fb.db, 'users', this.uid);
    let snap = null;
    try { snap = await F.getDoc(ref); } catch { /* offline dan belum ada di cache */ }
    if (snap && snap.exists()) {
      this.profile = snap.data();
      this.isNewProfile = false;
      return;
    }
    if (!snap) { this.isNewProfile = false; return; }
    this.isNewProfile = true;
    this.profile = {
      displayName: (this.user.displayName || '').slice(0, 100),
      email: (this.user.email || '').slice(0, 200),
      plan: 'free',
      settings: {},
      flags: {},
      createdAt: Date.now(),
      updatedAt: F.serverTimestamp()
    };
    F.setDoc(ref, this.profile).catch(err => this.onError(err));
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { this.listeners.forEach(fn => fn(what)); }

  write(promise) { promise.catch(err => this.onError(err)); return Promise.resolve(); }

  putNote(id, data) {
    this.notes.set(id, { ...data, id });
    this.emit();
    return this.write(this.fb.F.setDoc(this.ref('notes', id), { ...data, updatedAt: this.fb.F.serverTimestamp() }));
  }
  removeNote(id) {
    this.notes.delete(id);
    this.emit();
    return this.write(this.fb.F.deleteDoc(this.ref('notes', id)));
  }
  putNotebook(id, data) {
    this.notebooks.set(id, { ...data, id });
    this.emit();
    return this.write(this.fb.F.setDoc(this.ref('notebooks', id), { ...data, updatedAt: this.fb.F.serverTimestamp() }));
  }
  removeNotebook(id) {
    this.notebooks.delete(id);
    this.emit();
    return this.write(this.fb.F.deleteDoc(this.ref('notebooks', id)));
  }

  profileRef() { return this.fb.F.doc(this.fb.db, 'users', this.uid); }

  // ---- Pengingat: samakan koleksi reminders dengan jadwal yang dihitung dari catatan ----
  syncReminders(want) {
    if (!this.remindersReady) { this.pendingReminders = want; return; }
    const F = this.fb.F;
    for (const [rid, r] of want) {
      const cur = this.reminders.get(rid);
      if (cur && REMINDER_KEYS.every(k => (cur[k] ?? null) === (r[k] ?? null))) continue;
      this.reminders.set(rid, r);
      this.write(F.setDoc(this.ref('reminders', rid), { ...r, updatedAt: F.serverTimestamp() }));
    }
    for (const rid of [...this.reminders.keys()]) {
      if (want.has(rid)) continue;
      this.reminders.delete(rid);
      this.write(F.deleteDoc(this.ref('reminders', rid)));
    }
  }

  saveDevice(id, token, label) {
    const F = this.fb.F;
    return this.write(F.setDoc(this.ref('devices', id), { token, label: String(label).slice(0, 80), createdAt: Date.now(), updatedAt: F.serverTimestamp() }));
  }
  removeDevice(id) {
    return this.fb.F.deleteDoc(this.ref('devices', id));
  }

  async getFlag(key) { return !!(this.profile.flags && this.profile.flags[key]); }
  setFlag(key, value) {
    this.profile.flags = { ...(this.profile.flags || {}), [key]: !!value };
    return this.write(this.fb.F.updateDoc(this.profileRef(), { flags: this.profile.flags, updatedAt: this.fb.F.serverTimestamp() }));
  }
  saveSettings(settings) {
    this.profile.settings = { ...settings };
    return this.write(this.fb.F.updateDoc(this.profileRef(), { settings: this.profile.settings, updatedAt: this.fb.F.serverTimestamp() }));
  }

  // ---- Gambar lampiran ----
  async uploadImage(noteId, blob) {
    const fb = await loadStorage();
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
    const path = `users/${this.uid}/attachments/${noteId}/${name}`;
    const r = fb.S.ref(fb.storage, path);
    await fb.S.uploadBytes(r, blob, { contentType: 'image/jpeg' });
    const url = await fb.S.getDownloadURL(r);
    return { path, url, size: blob.size };
  }
  async deleteFile(path) {
    try {
      const fb = await loadStorage();
      await fb.S.deleteObject(fb.S.ref(fb.storage, path));
    } catch (e) {
      if (e && e.code !== 'storage/object-not-found') console.warn('Gagal menghapus file', path, e);
    }
  }

  // ---- Cadangan: isi di Storage, daftar di Firestore ----
  async createBackup(snapshot, auto) {
    const fb = await loadStorage();
    const json = JSON.stringify(snapshot);
    const blob = new Blob([json], { type: 'application/json' });
    const id = String(snapshot.createdAt);
    const path = `users/${this.uid}/backups/${id}.json`;
    await fb.S.uploadBytes(fb.S.ref(fb.storage, path), blob, { contentType: 'application/json' });
    await fb.F.setDoc(this.ref('backups', id), {
      createdAt: snapshot.createdAt, path, count: snapshot.notes.length, size: blob.size, auto: !!auto
    });
    return id;
  }
  async listBackups() {
    const F = this.fb.F;
    const snap = await F.getDocs(F.query(this.col('backups'), F.orderBy('createdAt', 'desc'), F.limit(20)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async readBackup(id) {
    const fb = await loadStorage();
    const bytes = await fb.S.getBytes(fb.S.ref(fb.storage, `users/${this.uid}/backups/${id}.json`));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async deleteBackup(id) {
    await this.deleteFile(`users/${this.uid}/backups/${id}.json`);
    await this.fb.F.deleteDoc(this.ref('backups', id));
  }

  close() { this.unsubs.forEach(u => { try { u(); } catch {} }); this.unsubs = []; }
}

export { PROFILE_KEYS };
