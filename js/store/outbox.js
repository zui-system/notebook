// Antrean foto yang belum terunggah (mis. diambil saat offline), disimpan di perangkat.
// Foto tetap aman di sini sampai benar-benar tersimpan di akun.

const DB_NAME = 'zui-outbox';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('uploads', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('uploads', mode);
    const r = fn(t.objectStore('uploads'));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// entry: { id, uid, noteId, path, size, blob, createdAt, committed }
export const putUpload = entry => tx('readwrite', s => s.put(entry));
export const getUpload = id => tx('readonly', s => s.get(id));
export const deleteUpload = id => tx('readwrite', s => s.delete(id));
export async function listUploads(uid) {
  const all = await tx('readonly', s => s.getAll());
  return (all || []).filter(e => e.uid === uid).sort((a, b) => a.createdAt - b.createdAt);
}
