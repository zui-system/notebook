# Zui Notebook — Tahap 2

Aplikasi catatan sederhana untuk semua usia. Bisa dipasang di HP (PWA), dipakai tanpa internet, dan tersinkron antar perangkat lewat Firebase.

## Isi folder

| File / folder | Fungsi |
|---|---|
| `index.html`, `css/`, `js/` | Aplikasi (JavaScript murni, tanpa langkah build) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: bisa dipasang dan dibuka offline |
| `firestore.rules`, `storage.rules` | Aturan keamanan: data hanya bisa dibaca/ditulis pemiliknya; kuota foto ditegakkan di sini |
| `functions/` | Cloud Functions: kirim notifikasi pengingat, bersihkan file foto yang dihapus |
| `docs/tahap2-rencana.md` | Rencana struktur data dan rules Tahap 2 |
| `firebase.json` | Pengaturan deploy Hosting, Firestore, Storage |
| `cors.json` | Izin unduh file cadangan dari Storage |
| `tests/e2e.py` | Uji fitur Tahap 1, kecepatan, offline (mode tanpa akun) |
| `tests/e2e_tahap2.py` | Uji pengingat, template, ekspor, aksesibilitas, kecepatan, offline (mode tanpa akun) |
| `tests/e2e_cloud.py` | Uji akun dengan Firebase Emulator: foto, kuota, foto offline, jadwal pengingat |
| `tests/unit.test.mjs` | Uji perhitungan jadwal dan pengirim pengingat di server |
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

### Tambahan untuk Tahap 2

1. **Notifikasi pengingat saat aplikasi tertutup.** Buka Firebase Console → Project settings →
   Cloud Messaging → Web Push certificates, lalu buat *key pair*. Salin kuncinya ke `FCM_VAPID_KEY`
   di `js/config.js`. Selama masih kosong, pengingat hanya muncul ketika aplikasi sedang terbuka.
2. **Cloud Functions** (paket Blaze). Samakan `REGION` di `functions/index.js` dengan lokasi
   database Firestore, lalu jalankan:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:indexes
   ```
3. **Aturan lintas layanan.** `storage.rules` membaca Firestore untuk memeriksa kuota foto. Saat
   pertama kali `firebase deploy --only storage`, setujui permintaan izin untuk Storage membaca
   Firestore.
4. **Paket Plus.** Ubah `users/{uid}.plan` menjadi `"plus"` dari server (Console atau Admin SDK).
   Pengguna tidak bisa mengubahnya sendiri.
5. Di iPhone/iPad, notifikasi hanya muncul bila Zui Notebook dipasang ke Layar Utama (iOS 16.4+).

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

## Fitur Tahap 2

- **Tanggal & pengingat pada item checklist:**
  - Bisa diisi tanggal, jam (boleh kosong, lalu pengingat muncul pukul 08.00), dan ulangan
    harian/mingguan/bulanan. Item berulang yang dicentang maju ke jadwal berikutnya.
  - Notifikasi datang dari perangkat (juga saat offline dan tanpa akun) dan dari server lewat
    web push (akun). Tag yang sama mencegah notifikasi muncul dua kali.
  - Pengingat bisa dimatikan per item, lewat tombol "Matikan pengingat" di notifikasi, atau
    semuanya lewat Pengaturan → Pengingat aktif.
  - Tampilan **Hari ini** (dengan bagian Terlambat) dan **Akan datang**. Keduanya baru muncul di
    menu setelah ada item bertanggal. Beranda hanya menampilkan satu tautan kecil bila ada tugas hari ini.
- **Foto lampiran (akun):**
  - Ambil dengan kamera atau pilih dari galeri, lalu dikompres otomatis.
  - Paket Gratis: maks 5 MB per foto, 1600 px, kuota 100 MB. Paket Plus: 20 MB, 2560 px, 5 GB.
    Batas dibaca dari field `plan` dan ditegakkan di rules. Sisa kuota tampil di Pengaturan.
  - Foto yang diambil saat offline disimpan di perangkat lalu diunggah otomatis saat online.
- **Template** di layar Catatan baru: catatan rapat, jurnal harian, rencana proyek, daftar belanja,
  catatan keuangan, catatan belajar.
- **Ekspor:**
  - Teks/Markdown untuk satu catatan atau notebook (gratis).
  - PDF dan Word (Plus).
  - Semua catatan sebagai .zip Markdown + JSON (selalu gratis).

## Uji

```bash
python3 -m http.server 5173 &
python3 tests/e2e.py            # perlu: pip install playwright && playwright install chromium

python3 tests/e2e_tahap2.py     # juga: pip install pypdf python-docx
node --test tests/unit.test.mjs

cd tests/rules && npm install && npm test   # perlu Java 11+ untuk emulator
cd ../.. && tests/rules/node_modules/.bin/firebase emulators:exec --only auth,firestore,storage \
    --project notebook-zui "python3 tests/e2e_cloud.py"
```

## Merilis versi baru

Naikkan `VERSION` di `sw.js` (dan `APP_VERSION` di `js/config.js`), lalu `firebase deploy --only hosting`.
Pengguna akan melihat pesan "Versi baru tersedia".
