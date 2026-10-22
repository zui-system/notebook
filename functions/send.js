// Mengirim pengingat yang sudah waktunya. Dipisah dari index.js agar bisa diuji tanpa Firebase
// (tests/unit.test.mjs memberi db dan messaging tiruan).
import { nextOccurrence, notificationFor } from './recur.js';

// Terlambat lebih dari ini (mis. layanan sempat terganggu): tidak dikirim lagi, hanya dimajukan.
export const LATE_MAX = 60 * 60000;
const BATCH = 500;
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

async function loadUser(db, uid) {
  const [profile, devices] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.collection(`users/${uid}/devices`).get()
  ]);
  const settings = (profile.exists && profile.get('settings')) || {};
  return {
    enabled: settings.reminders !== false,
    devices: devices.docs.map(d => ({ ref: d.ref, token: d.get('token') })).filter(d => typeof d.token === 'string' && d.token)
  };
}

export async function sendDueReminders({ db, messaging, now = Date.now(), log = () => {} }) {
  const users = new Map();
  const seen = new Set();
  let checked = 0, sent = 0, removedTokens = 0;
  for (let round = 0; round < 10; round++) {
    const snap = await db.collectionGroup('reminders').where('at', '<=', now).orderBy('at').limit(BATCH).get();
    let fresh = 0;
    for (const doc of snap.docs) {
      // Jadwal yang gagal dimajukan bisa muncul lagi di putaran berikutnya: jangan kirim dua kali.
      if (seen.has(doc.ref.path)) continue;
      seen.add(doc.ref.path);
      fresh++;
      checked++;
      const r = doc.data();
      const uid = doc.ref.parent.parent.id;
      if (!users.has(uid)) users.set(uid, await loadUser(db, uid));
      const u = users.get(uid);
      if (u.enabled && u.devices.length && now - r.at <= LATE_MAX) {
        const n = notificationFor(r, r.at);
        const res = await messaging.sendEachForMulticast({
          tokens: u.devices.map(d => d.token),
          // Hanya data: service worker aplikasi yang menampilkan notifikasinya.
          data: { title: n.title, body: n.body, tag: n.tag, noteId: n.noteId, itemId: n.itemId },
          webpush: { headers: { Urgency: 'high', TTL: '3600' } }
        });
        sent += res.successCount;
        const dead = u.devices.filter((d, i) => !res.responses[i].success && DEAD_TOKEN.has(res.responses[i].error && res.responses[i].error.code));
        for (const d of dead) { await d.ref.delete().catch(() => {}); removedTokens++; }
        u.devices = u.devices.filter(d => !dead.includes(d));
      }
      // Majukan jadwal berulang, hapus yang sekali jalan. Bila aplikasi baru saja mengubah
      // jadwal ini, perubahan dari aplikasi yang dipakai (precondition gagal, diabaikan).
      const next = r.repeat ? nextOccurrence(typeof r.base === 'number' ? r.base : r.at, r.repeat, r.tz || 0, Math.max(now, r.at)) : null;
      const pre = doc.updateTime ? [{ lastUpdateTime: doc.updateTime }] : [];
      try {
        if (next) await doc.ref.update({ at: next }, ...pre);
        else await doc.ref.delete(...pre);
      } catch (e) {
        log('Jadwal berubah saat diproses, dilewati', doc.ref.path, e.message);
      }
    }
    if (snap.size < BATCH || !fresh) break;
  }
  return { checked, sent, removedTokens };
}
