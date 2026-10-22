// ============================================================
//  KONFIGURASI FIREBASE
//  Isi dengan konfigurasi dari Firebase Console:
//  Project settings > General > Your apps > Web app > SDK setup (Config)
//
//  Selama nilainya null, aplikasi berjalan dalam "mode tanpa akun":
//  catatan hanya tersimpan di perangkat ini (berguna untuk uji coba).
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCcsoG7EuloDwgvDAt_-Nfpx3jZk2dnDwA",
  authDomain: "notebook-zui.firebaseapp.com",
  projectId: "notebook-zui",
  storageBucket: "notebook-zui.firebasestorage.app",
  messagingSenderId: "461738650541",
  appId: "1:461738650541:web:6f987c8582c779ef0b4f24"
};

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
