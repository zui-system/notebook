# Zui Notebook — Tahap 1

Aplikasi catatan sederhana untuk semua usia. Bisa dipasang di HP (PWA), dipakai tanpa internet, dan tersinkron antar perangkat lewat Firebase.

## Isi folder

| File / folder | Fungsi |
|---|---|
| `index.html`, `css/`, `js/` | Aplikasi (JavaScript murni, tanpa langkah build) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: bisa dipasang dan dibuka offline |
| `firestore.rules`, `storage.rules` | Aturan keamanan: data hanya bisa dibaca/ditulis pemiliknya |
| `firebase.json` | Pengaturan deploy Hosting, Firestore, Storage |
| `cors.json` | Izin unduh file cadangan dari Storage |
| `tests/e2e.py` | Uji fitur, kecepatan, offline (mode tanpa akun) |
| `tests/rules/` | Uji aturan keamanan dengan Firebase Emulator |

## Menyalakan Firebase (sekali saja)

1. Buat proyek di [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: aktifkan **Google** dan **Email/Password → Email link (passwordless sign-in)**.
3. **Firestore Database**: buat database (mode production).
4. **Storage**: aktifkan (paket Blaze diperlukan untuk Storage pada proyek baru).
5. **Project settings → Your apps → Web app**: salin konfigurasi ke `js/config.js` (`firebaseConfig`).
6. Pasang Firebase CLI lalu deploy:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add            # pilih proyekmu
   firebase deploy               # hosting + firestore.rules + storage.rules
   ```
7. Izinkan unduhan cadangan dari browser: ganti `NAMA-PROYEK` di `cors.json`, lalu
   ```bash
   gsutil cors set cors.json gs://NAMA-BUCKET
   ```
8. **Authentication → Settings → Authorized domains**: pastikan domain situsmu tercantum.

Selama `firebaseConfig` masih `null`, aplikasi tetap berjalan dalam **mode tanpa akun** (data hanya di perangkat).

## Fitur Tahap 1

- Masuk dengan Google atau tautan email, plus halaman "Tidak bisa masuk?" untuk pemulihan akun.
- Mode tanpa akun; saat nanti masuk, catatan di perangkat ditawarkan untuk dipindah ke akun.
- Catatan teks dan checklist, notebook, tag, sematkan, arsip.
- Pencarian instan dengan indeks lokal di perangkat (awalan kata, tanpa internet).
- Offline penuh dan sinkron otomatis (cache offline Firestore).
- Tempat sampah 30 hari + konfirmasi sebelum menghapus, bisa dibatalkan.
- Cadangan otomatis tiap minggu (5 terbaru), cadangkan manual, simpan ke file, pulihkan.
- Pengaturan: ukuran huruf (kecil/sedang/besar/sangat besar) dengan pratinjau langsung, 3 tema (Terang Tenang, Gelap Tenang, Ceria Lembut), kontras tinggi, tampilkan label tombol.
- Onboarding 3 layar dan 1 catatan contoh.
- Gambar lampiran (akun saja): diperkecil otomatis, maks 5 MB, maks 10 per catatan.
- Profil punya field `plan` (`free`/`plus`); pengguna tidak bisa mengubahnya sendiri.

## Uji

```bash
python3 -m http.server 5173 &
python3 tests/e2e.py            # perlu: pip install playwright && playwright install chromium

cd tests/rules && npm install && npm test   # perlu Java 11+ untuk emulator
```

## Merilis versi baru

Naikkan `VERSION` di `sw.js` (dan `APP_VERSION` di `js/config.js`), lalu `firebase deploy --only hosting`.
Pengguna akan melihat pesan "Versi baru tersedia".
