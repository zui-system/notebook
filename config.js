// ============================================================
//  KONFIGURASI FIREBASE
//  Isi dengan konfigurasi dari Firebase Console:
//  Project settings > General > Your apps > Web app > SDK setup (Config)
//
//  Selama nilainya null, aplikasi berjalan dalam "mode tanpa akun":
//  catatan hanya tersimpan di perangkat ini (berguna untuk uji coba).
// ============================================================

export const firebaseConfig = null;

/* Contoh:
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "zui-notebook.firebaseapp.com",
  projectId: "zui-notebook",
  storageBucket: "zui-notebook.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/

// Alamat email bantuan yang ditampilkan di halaman "Tidak bisa masuk?"
// Kosongkan ('') bila belum ada; barisnya tidak akan ditampilkan.
export const SUPPORT_EMAIL = '';

// Versi Firebase JS SDK yang dimuat dari CDN resmi (gstatic.com).
export const FIREBASE_VERSION = '12.19.0';

// Batas ukuran file
export const LIMITS = {
  imageInputMax: 15 * 1024 * 1024, // file asli yang boleh dipilih
  imageUploadMax: 5 * 1024 * 1024, // setelah diperkecil, harus sama dengan storage.rules
  imageMaxSide: 1600,
  attachmentsPerNote: 10,
  backupMax: 20 * 1024 * 1024,     // harus sama dengan storage.rules
  backupsKept: 5,
  autoBackupEveryDays: 7,
  trashDays: 30
};

export const APP_VERSION = '1.0.0';
