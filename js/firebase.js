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
  cache = { app, auth, db, A: authMod, F: fsMod, storage: null, S: null, M: null, messaging: null };
  if (useEmulator()) {
    authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fsMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return cache;
}

// Hanya untuk pengujian di komputer sendiri (tests/e2e_cloud.py): memakai Firebase Emulator.
function useEmulator() {
  return ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('zn-emulator') === '1';
}

// Storage dimuat terpisah karena hanya perlu untuk gambar dan cadangan.
export async function loadStorage() {
  const fb = await loadFirebase();
  if (!fb.S) {
    fb.S = await import(BASE + 'firebase-storage.js');
    fb.storage = fb.S.getStorage(fb.app);
    if (useEmulator()) fb.S.connectStorageEmulator(fb.storage, '127.0.0.1', 9199);
  }
  return fb;
}

// Cloud Messaging dimuat hanya saat notifikasi pengingat diaktifkan.
export async function loadMessaging() {
  const fb = await loadFirebase();
  if (!fb.M) {
    const M = await import(BASE + 'firebase-messaging.js');
    if (!(await M.isSupported())) return null;
    fb.M = M;
    fb.messaging = M.getMessaging(fb.app);
  }
  return fb;
}
