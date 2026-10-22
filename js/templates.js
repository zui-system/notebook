// Template catatan: muncul di layar "Catatan baru" selama catatan masih kosong.
// Bahasa sederhana, contoh isi sudah terisi supaya mudah diubah.
import { newId, startOfDay, addDays } from './data.js';
import { fmtDayHeading } from './dom.js';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const items = list => list.map(t => (typeof t === 'string' ? { id: newId(), text: t, done: false } : { id: newId(), done: false, ...t }));

export const TEMPLATES = [
  {
    id: 'rapat', label: 'Catatan rapat', icon: 'people',
    build: () => ({
      type: 'text',
      title: 'Rapat ' + fmtDayHeading(Date.now()),
      body: [
        'Peserta: Budi, Sari, Ani',
        '',
        'Yang dibahas:',
        '- Jadwal acara bulan depan',
        '- Pembagian tugas',
        '',
        'Keputusan:',
        '- Acara diadakan hari Sabtu pagi',
        '',
        'Tugas selanjutnya:',
        '- Budi: pesan tempat',
        '- Sari: kirim undangan',
        '',
        'Rapat berikutnya: Senin depan'
      ].join('\n')
    })
  },
  {
    id: 'jurnal', label: 'Jurnal harian', icon: 'pen',
    build: () => ({
      type: 'text',
      title: 'Jurnal ' + fmtDayHeading(Date.now()),
      body: [
        'Perasaanku hari ini: tenang',
        '',
        'Yang terjadi hari ini:',
        'Pagi jalan santai di taman. Siang makan bersama keluarga.',
        '',
        'Yang aku syukuri:',
        '- Cuaca cerah',
        '- Mengobrol lama dengan teman',
        '',
        'Besok aku ingin:',
        '- Tidur lebih awal'
      ].join('\n')
    })
  },
  {
    id: 'proyek', label: 'Rencana proyek', icon: 'calendar',
    build: () => {
      const t = startOfDay();
      const due = n => ({ due: addDays(t, n), hasTime: false, repeat: null, remind: false });
      return {
        type: 'checklist',
        title: 'Rencana proyek: Renovasi dapur',
        items: items([
          { text: 'Tentukan tujuan dan anggaran', ...due(2) },
          { text: 'Cari tukang dan minta penawaran harga', ...due(7) },
          { text: 'Pilih bahan dan warna', ...due(14) },
          { text: 'Mulai pengerjaan', ...due(21) },
          { text: 'Periksa hasil akhir', ...due(30) }
        ])
      };
    }
  },
  {
    id: 'belanja', label: 'Daftar belanja', icon: 'check',
    build: () => ({
      type: 'checklist',
      title: 'Belanja',
      items: items(['Beras 5 kg', 'Telur 1 kg', 'Minyak goreng', 'Sayur bayam', 'Bawang merah', 'Sabun cuci piring'])
    })
  },
  {
    id: 'keuangan', label: 'Catatan keuangan', icon: 'wallet',
    build: () => {
      const d = new Date();
      return {
        type: 'text',
        title: `Keuangan ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        body: [
          'Pemasukan:',
          '- Gaji: Rp 5.000.000',
          '',
          'Pengeluaran:',
          '- Belanja dapur: Rp 1.200.000',
          '- Listrik dan air: Rp 400.000',
          '- Transportasi: Rp 300.000',
          '- Tabungan: Rp 1.000.000',
          '',
          'Sisa: Rp 2.100.000',
          '',
          'Catatan:',
          'Bulan depan kurangi jajan di luar.'
        ].join('\n')
      };
    }
  },
  {
    id: 'belajar', label: 'Catatan belajar', icon: 'book',
    build: () => ({
      type: 'text',
      title: 'Belajar: Fotosintesis',
      body: [
        'Hal penting:',
        '- Tumbuhan membuat makanannya sendiri dengan bantuan sinar matahari',
        '- Yang dibutuhkan: air, udara (karbon dioksida), dan cahaya',
        '',
        'Kata baru:',
        '- Klorofil: zat hijau pada daun',
        '',
        'Yang belum aku pahami:',
        '- Kenapa daun bisa menguning?',
        '',
        'Ringkasan dengan kata-kataku sendiri:',
        'Daun itu seperti dapur kecil yang memasak makanan untuk tumbuhan.'
      ].join('\n')
    })
  }
];
