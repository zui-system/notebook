# Zui Notebook — Rencana Tahap 2

Rencana ini dibuat setelah membaca kode Tahap 1. Prinsipnya: **menambah, bukan menulis ulang**.
Data lama tetap sah tanpa migrasi, semua field baru bersifat opsional.

## 1. Perubahan struktur data

### 1a. Item checklist (tetap di dalam dokumen catatan)

```
items: [{ id, text, done,            // Tahap 1, tidak berubah
          due?:     number | null,   // waktu tenggat (ms, waktu lokal). Tanpa jam = pukul 00.00 hari itu
          hasTime?: boolean,         // true bila jam diisi
          repeat?:  null | 'harian' | 'mingguan' | 'bulanan',
          remind?:  boolean }]       // true = kirim pengingat
```

- Item tanpa tanggal ditulis persis seperti Tahap 1 (field baru tidak ditulis).
- Tanpa jam, pengingat muncul pukul **08.00** di hari itu.
- Item berulang yang dicentang **tidak** menjadi selesai. Tanggalnya maju ke jadwal berikutnya
  (contoh: "Minum obat" tiap hari 07.00, dicentang, lalu muncul lagi besok 07.00).

### 1b. `users/{uid}/reminders/{rid}` — koleksi baru: jadwal pengingat

Dibuat otomatis oleh aplikasi dari item yang punya tanggal, `remind = true`, dan belum selesai.
Dibaca oleh server (Cloud Function) setiap menit untuk mengirim notifikasi ke HP.

```
{ noteId, itemId, title (≤120), text (≤200), at: number (ms), repeat, tz: int (menit), updatedAt }
```

- `rid` = hash pendek dari `noteId/itemId`, jadi satu item punya tepat satu jadwal.
- Ada tiga keadaan yang membuat aplikasi menghapus jadwalnya: item selesai, item dihapus, atau
  pengingat dimatikan. Pengingat dimatikan bisa per item, atau semua lewat sakelar di Pengaturan.
- Server mengirim notifikasi, lalu menghapus jadwal sekali jalan. Untuk jadwal berulang, server
  memajukan `at` ke jadwal berikutnya.

### 1c. `users/{uid}/devices/{deviceId}` — koleksi baru: alamat notifikasi per perangkat

```
{ token (FCM, ≤4096), label (≤80, mis. "Android · Chrome"), createdAt, updatedAt }
```

Dihapus saat keluar akun. Server juga menghapus token yang sudah tidak berlaku.

### 1d. `users/{uid}/attachments/{attId}` — koleksi baru: catatan lampiran foto

```
{ noteId, path: 'users/{uid}/attachments/{noteId}/{attId}.jpg', size: int, contentType: 'image/jpeg', createdAt }
```

### 1e. Profil `users/{uid}`

- `usage: { bytes, files, lastAttId }`: pemakaian kuota foto. Tidak bisa diubah sembarangan, lihat rules.
- `settings.reminders: boolean`: sakelar utama pengingat. Bawaan: aktif.
- `plan` tetap dikunci (`free`/`plus`) dan hanya bisa diubah server.

### 1f. Lampiran di dalam catatan

```
attachments: [{ id?, path, url, size, pending? }]
```

- `id` merujuk ke `attachments/{attId}`. Gambar Tahap 1 tidak punya `id` dan tetap tampil.
- `pending: true` artinya foto sudah diambil tetapi belum terunggah (sedang offline).

### 1g. Batas paket (`js/config.js` → `PLANS`, disalin sama persis ke rules)

| | Gratis | Plus |
|---|---|---|
| Ukuran per foto (setelah dikompres) | 5 MB | 20 MB |
| Sisi terpanjang foto | 1600 px | 2560 px |
| Kuota total foto | 100 MB | 5 GB |
| Foto per catatan | 10 | 10 |
| Ekspor TXT / Markdown (1 catatan, 1 notebook) | ✓ | ✓ |
| Ekspor PDF / Word | – | ✓ |
| Ekspor **semua** catatan (Markdown .zip + JSON) | ✓ | ✓ |

## 2. Perubahan rules

**Firestore**
- `validItem` menerima `due`, `hasTime`, `repeat`, `remind` (tipe diperiksa).
- `validSettings` menerima `reminders` (bool).
- `validProfile` menerima `usage`. Profil baru boleh tanpa `usage`, atau dengan `usage` bernilai 0.
- **Kuota foto ditegakkan server.** Mendaftarkan foto harus dilakukan dalam satu *batch*, yaitu
  membuat `attachments/{attId}` sekaligus menaikkan `usage.bytes` sebesar `size` persis dan
  mengisi `usage.lastAttId = attId`. Rules memeriksa tiga hal:
  - `size` ≤ batas per foto paketnya
  - `usage` sesudah = `usage` sebelum + `size`
  - `usage` sesudah ≤ kuota paketnya

  Menghapus foto juga satu *batch* dengan pengurangan yang sama persis. `usage` tidak bisa
  diubah tanpa lampiran yang benar-benar dibuat atau dihapus. Dokumen lampiran tidak bisa diubah
  setelah dibuat.
- `reminders/{rid}`: hanya pemilik. Field dan tipe dibatasi, `repeat` hanya 3 nilai, `tz` antara -840 dan 840.
- `devices/{deviceId}`: hanya pemilik. Field dibatasi.
- Semua jalur lain tetap tertutup.

**Storage**
- Unggah foto hanya boleh bila `attachments/{attId}` sudah ada di Firestore dengan ukuran yang
  **sama persis**, nama file `{attId}.jpg`, dan jenis `image/jpeg`. Ini memakai aturan lintas
  layanan `firestore.get()`, jadi foto yang tidak tercatat di kuota tidak bisa diunggah.
- Batas per foto mengikuti paket (`plan` dibaca dari profil).
- Gambar lama Tahap 1 tetap bisa dibaca dan dihapus.
- Cadangan: tidak berubah.

## 3. Server (Cloud Functions, folder baru `functions/`)

- `sendReminders`: berjalan tiap 1 menit. Mencari jadwal yang sudah waktunya
  (`collectionGroup('reminders').where('at','<=',sekarang)`), lalu mengirim notifikasi ke semua
  perangkat pemilik. Pengiriman dilewati bila `settings.reminders` bernilai `false`. Setelah itu
  jadwal dimajukan (bila berulang) atau dihapus.
- `cleanupAttachment`: saat `attachments/{attId}` dihapus, file fotonya ikut dihapus dari Storage.
  Dengan begitu kuota tidak bisa diakali dengan menghapus catatan sambil menyimpan filenya.
- Perlu: paket Blaze, kunci VAPID (Cloud Messaging → Web Push certificates) di `js/config.js`,
  dan indeks `reminders.at` (lingkup collection group) yang sudah disiapkan di `firestore.indexes.json`.

## 4. Offline

- **Pengingat:**
  - Jadwal dihitung di perangkat dan ditulis ke Firestore. Saat offline, tulisan ini antre dan
    terkirim begitu online lagi.
  - Selama aplikasi terbuka (termasuk offline dan mode tanpa akun), pengingat juga dimunculkan
    langsung dari perangkat.
  - Notifikasi dari server dan dari perangkat memakai `tag` yang sama, jadi tidak muncul dobel.
- **Foto:**
  - Saat offline, foto tetap dikompres lalu disimpan di antrean perangkat (IndexedDB).
  - Catatan langsung menampilkan foto itu dengan tanda "Menunggu internet".
  - Begitu online, foto didaftarkan ke kuota, diunggah, lalu tautannya disimpan ke catatan.
  - Kalau kuota ternyata penuh, foto dikeluarkan dari catatan dengan pesan yang jelas.
    Foto tidak pernah hilang diam-diam.

## 5. Antarmuka (tetap tenang, Mode Sederhana tetap bawaan)

- **Beranda** tetap kosong. Hanya bila ada tugas hari ini muncul satu tautan kecil,
  misalnya "2 tugas untuk hari ini".
- **Menu:** "Hari ini" dan "Akan datang" baru muncul setelah ada item bertanggal.
- **Checklist:** tiap item mendapat satu tombol kalender. Tanggal yang terpasang tampil sebagai
  teks kecil di bawah item.
- **Pengaturan** mendapat bagian baru:
  - Pengingat: sakelar utama dan izin notifikasi di perangkat ini.
  - Penyimpanan foto: sisa kuota.
  - Ekspor semua catatan.
- **Catatan baru:** pilihan template tampil di bawah judul selama catatan masih kosong, lalu
  hilang sendiri begitu mulai menulis.
- **Ekspor:** lewat menu ⋯ di catatan dan menu "Atur" di notebook. Pilihan PDF dan Word diberi
  label "Plus".

## 6. Tidak termasuk (Tahap 3)

AI, kolaborasi, kunci catatan, suara, dan scan.
