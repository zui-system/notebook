// Memuat Firebase dari CDN resmi hanya saat dibutuhkan (mode akun).
// Service worker menyimpan file ini, sehingga tetap bisa dibuka offline.
import { firebaseConfig, FIREBASE_VERSION } from './config.js';

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
let cache = null;

export const hasFirebase = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export async function loadFirebase() {
  if (cache) return cache;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js')
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  auth.languageCode = 'id';
  let db;
  try {
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
    });
  } catch (e) {
    console.warn('Cache offline Firestore tidak tersedia, memakai mode memori.', e);
    db = fsMod.getFirestore(app);
  }
  cache = { app, auth, db, A: authMod, F: fsMod, storage: null, S: null };
  return cache;
}

// Storage dimuat terpisah karena hanya perlu untuk gambar dan cadangan.
export async function loadStorage() {
  const fb = await loadFirebase();
  if (!fb.S) {
    fb.S = await import(BASE + 'firebase-storage.js');
    fb.storage = fb.S.getStorage(fb.app);
  }
  return fb;
}
