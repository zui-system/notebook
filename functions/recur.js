// Perhitungan jadwal pengingat (tanpa DOM, tanpa Firebase).
// Dipakai di aplikasi DAN di server: functions/recur.js adalah salinan persis file ini
// (diperiksa oleh tests/unit.test.mjs). Ubah keduanya bersamaan.

export const REPEATS = ['harian', 'mingguan', 'bulanan'];
export const REPEAT_LABEL = { harian: 'tiap hari', mingguan: 'tiap minggu', bulanan: 'tiap bulan' };
// Item bertanggal tanpa jam diingatkan pukul 08.00 pagi.
export const ALLDAY_REMIND_HOUR = 8;
const DAY = 86400000;

// Waktu pengingat pertama sebuah item (ms).
export function reminderBase(item) {
  if (!item || typeof item.due !== 'number') return null;
  return item.hasTime ? item.due : item.due + ALLDAY_REMIND_HOUR * 3600000;
}

// Kejadian ke-k dari jadwal berulang. tz = selisih menit seperti Date#getTimezoneOffset(),
// supaya server (UTC) menghitung "tanggal yang sama bulan depan" menurut jam pengguna.
export function occurrence(base, repeat, tz, k) {
  if (!k) return base;
  if (repeat === 'harian') return base + k * DAY;
  if (repeat === 'mingguan') return base + k * 7 * DAY;
  if (repeat === 'bulanan') {
    const local = new Date(base - tz * 60000);
    const day = local.getUTCDate();
    const y = local.getUTCFullYear(), m = local.getUTCMonth() + k;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = Date.UTC(y, m, Math.min(day, last), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds());
    return d + tz * 60000;
  }
  return null;
}

// Kejadian pertama yang lebih besar dari `after`. Tanpa ulangan: base itu sendiri (atau null bila lewat).
export function nextOccurrence(base, repeat, tz, after) {
  if (typeof base !== 'number') return null;
  if (base > after) return base;
  if (!REPEATS.includes(repeat)) return null;
  let k;
  if (repeat === 'bulanan') {
    const a = new Date(after - tz * 60000), b = new Date(base - tz * 60000);
    k = Math.max(1, (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + a.getUTCMonth() - b.getUTCMonth());
  } else {
    const p = repeat === 'harian' ? DAY : 7 * DAY;
    k = Math.max(1, Math.floor((after - base) / p));
  }
  let t = occurrence(base, repeat, tz, k);
  while (t <= after) t = occurrence(base, repeat, tz, ++k);
  while (k > 1 && occurrence(base, repeat, tz, k - 1) > after) t = occurrence(base, repeat, tz, --k);
  return t;
}

// Tanggal item berulang setelah dicentang: maju ke jadwal sesudah tanggal itu dan sesudah sekarang.
export function advanceDue(item, now, tz) {
  return nextOccurrence(item.due, item.repeat, tz, Math.max(item.due, now));
}

// Nama jadwal unik per item (dipakai sebagai id dokumen dan tag notifikasi).
export function reminderId(noteId, itemId) {
  const s = noteId + '/' + itemId;
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return 'r' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function hhmm(ms, tz) {
  const d = new Date(ms - tz * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + '.' + String(d.getUTCMinutes()).padStart(2, '0');
}

// Isi notifikasi. Sama untuk notifikasi dari perangkat dan dari server, agar tag-nya cocok
// dan notifikasi yang sama tidak muncul dua kali.
export function notificationFor(r, at) {
  const parts = [];
  if (r.title) parts.push(r.title);
  parts.push(hhmm(at, r.tz || 0) + (r.repeat ? ' · ' + REPEAT_LABEL[r.repeat] : ''));
  return {
    title: r.text || 'Pengingat',
    body: parts.join(' · '),
    tag: 'zn-' + reminderId(r.noteId, r.itemId) + '-' + at,
    noteId: r.noteId,
    itemId: r.itemId
  };
}
