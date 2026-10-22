// Uji unit tanpa browser dan tanpa Firebase:
//   node --test tests/unit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { occurrence, nextOccurrence, advanceDue, reminderBase, reminderId, notificationFor } from '../js/recur.js';
import { sendDueReminders, LATE_MAX } from '../functions/send.js';

const WIB = -420; // getTimezoneOffset() untuk Jakarta (UTC+7)
// Waktu lokal Jakarta -> ms
const jkt = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm) + WIB * 60000;

test('salinan recur.js di functions sama persis', () => {
  assert.equal(readFileSync(new URL('../functions/recur.js', import.meta.url), 'utf8'), readFileSync(new URL('../js/recur.js', import.meta.url), 'utf8'));
});

test('item tanpa jam diingatkan pukul 08.00', () => {
  assert.equal(reminderBase({ due: jkt(2026, 10, 22), hasTime: false }), jkt(2026, 10, 22, 8));
  assert.equal(reminderBase({ due: jkt(2026, 10, 22, 19, 30), hasTime: true }), jkt(2026, 10, 22, 19, 30));
  assert.equal(reminderBase({ text: 'x' }), null);
});

test('harian dan mingguan', () => {
  const base = jkt(2026, 10, 22, 7);
  assert.equal(nextOccurrence(base, 'harian', WIB, jkt(2026, 10, 25, 6)), jkt(2026, 10, 25, 7));
  assert.equal(nextOccurrence(base, 'harian', WIB, jkt(2026, 10, 25, 7)), jkt(2026, 10, 26, 7));
  assert.equal(nextOccurrence(base, 'mingguan', WIB, jkt(2026, 10, 23)), jkt(2026, 10, 29, 7));
  assert.equal(nextOccurrence(base, null, WIB, jkt(2026, 10, 23)), null, 'sekali jalan yang sudah lewat');
  assert.equal(nextOccurrence(base, null, WIB, jkt(2026, 10, 21)), base);
});

test('bulanan memakai tanggal yang sama, akhir bulan disesuaikan', () => {
  const base = jkt(2026, 1, 31, 9);
  assert.equal(occurrence(base, 'bulanan', WIB, 1), jkt(2026, 2, 28, 9));
  assert.equal(occurrence(base, 'bulanan', WIB, 2), jkt(2026, 3, 31, 9), 'tidak bergeser ke tanggal 28');
  assert.equal(nextOccurrence(base, 'bulanan', WIB, jkt(2026, 4, 15)), jkt(2026, 4, 30, 9));
  assert.equal(nextOccurrence(base, 'bulanan', WIB, jkt(2026, 12, 31, 9)), jkt(2027, 1, 31, 9));
  // Tanggal 1 pukul 00.30 WIB = hari sebelumnya di UTC: tetap tanggal 1 waktu lokal.
  assert.equal(occurrence(jkt(2026, 3, 1, 0, 30), 'bulanan', WIB, 1), jkt(2026, 4, 1, 0, 30));
});

test('mencentang item berulang memajukan tanggal', () => {
  const now = jkt(2026, 10, 22, 10);
  assert.equal(advanceDue({ due: jkt(2026, 10, 22, 7), repeat: 'harian' }, now, WIB), jkt(2026, 10, 23, 7));
  assert.equal(advanceDue({ due: jkt(2026, 10, 18, 7), repeat: 'harian' }, now, WIB), jkt(2026, 10, 23, 7), 'terlambat beberapa hari');
  assert.equal(advanceDue({ due: jkt(2026, 10, 25, 7), repeat: 'mingguan' }, now, WIB), jkt(2026, 11, 1, 7), 'dicentang lebih awal');
});

test('id dan tag pengingat stabil', () => {
  assert.equal(reminderId('n1', 'i1'), reminderId('n1', 'i1'));
  assert.notEqual(reminderId('n1', 'i1'), reminderId('n1', 'i2'));
  assert.match(reminderId('a'.repeat(40), 'b'.repeat(40)), /^r[0-9a-f]{16}$/);
  const n = notificationFor({ noteId: 'n1', itemId: 'i1', title: 'Obat ibu', text: 'Vitamin', repeat: 'harian', tz: WIB }, jkt(2026, 10, 22, 7, 5));
  assert.equal(n.title, 'Vitamin');
  assert.equal(n.body, 'Obat ibu · 07.05 · tiap hari');
});

// ---------- Server: mengirim pengingat (db dan messaging tiruan) ----------
function fakeDb(reminders, { devices = {}, profiles = {} } = {}) {
  const docs = new Map(Object.entries(reminders).map(([path, data]) => [path, { ...data }]));
  const deleted = [], updated = [], deadDeleted = [];
  const ref = path => ({
    path,
    parent: { parent: { id: path.split('/')[1] } },
    update: async patch => { updated.push([path, patch]); Object.assign(docs.get(path), patch); },
    delete: async () => { deleted.push(path); docs.delete(path); }
  });
  return {
    deleted, updated, deadDeleted,
    collectionGroup: () => ({
      where: (f, op, v) => ({ orderBy: () => ({ limit: () => ({ get: async () => {
        const list = [...docs.entries()].filter(([, d]) => d.at <= v).sort((a, b) => a[1].at - b[1].at);
        return { size: list.length, docs: list.map(([p, d]) => ({ ref: ref(p), data: () => ({ ...d }) })) };
      } }) }) })
    }),
    doc: path => ({ get: async () => {
      const p = profiles[path.split('/')[1]];
      return { exists: !!p, get: k => p && p[k] };
    } }),
    collection: path => ({ get: async () => ({
      docs: (devices[path.split('/')[1]] || []).map((token, i) => ({
        ref: { delete: async () => deadDeleted.push(token) }, get: () => token
      }))
    }) })
  };
}

function fakeMessaging(bad = []) {
  const calls = [];
  return {
    calls,
    sendEachForMulticast: async msg => {
      calls.push(msg);
      const responses = msg.tokens.map(t => bad.includes(t)
        ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        : { success: true });
      return { successCount: responses.filter(r => r.success).length, responses };
    }
  };
}

test('server: kirim yang sudah waktunya, majukan yang berulang, hapus yang sekali', async () => {
  const now = jkt(2026, 10, 22, 7, 0);
  const db = fakeDb({
    'users/ani/reminders/a': { noteId: 'n', itemId: 'a', text: 'Obat', at: now - 20000, base: jkt(2026, 10, 1, 7), repeat: 'harian', tz: WIB },
    'users/ani/reminders/b': { noteId: 'n', itemId: 'b', text: 'Bayar listrik', at: now - 5000, base: now - 5000, repeat: null, tz: WIB },
    'users/ani/reminders/c': { noteId: 'n', itemId: 'c', text: 'Nanti', at: now + 3600000, base: now + 3600000, repeat: null, tz: WIB }
  }, { devices: { ani: ['tok-hp', 'tok-lama'] }, profiles: { ani: { settings: {} } } });
  const m = fakeMessaging(['tok-lama']);
  const res = await sendDueReminders({ db, messaging: m, now });
  assert.equal(res.checked, 2);
  assert.equal(m.calls.length, 2);
  assert.deepEqual(m.calls[0].tokens, ['tok-hp', 'tok-lama']);
  assert.deepEqual(m.calls[1].tokens, ['tok-hp'], 'token mati tidak dipakai lagi');
  assert.equal(m.calls[0].data.title, 'Obat');
  assert.match(m.calls[0].data.tag, /^zn-r[0-9a-f]{16}-\d+$/);
  assert.deepEqual(db.updated, [['users/ani/reminders/a', { at: jkt(2026, 10, 23, 7) }]]);
  assert.deepEqual(db.deleted, ['users/ani/reminders/b']);
  assert.deepEqual(db.deadDeleted, ['tok-lama']);
});

test('server: tidak mengirim bila pengingat dimatikan atau terlambat jauh', async () => {
  const now = jkt(2026, 10, 22, 7);
  const db = fakeDb({
    'users/budi/reminders/a': { noteId: 'n', itemId: 'a', text: 'A', at: now, base: now, repeat: null, tz: WIB },
    'users/ani/reminders/b': { noteId: 'n', itemId: 'b', text: 'B', at: now - LATE_MAX - 1, base: now - LATE_MAX - 1, repeat: 'harian', tz: WIB }
  }, { devices: { budi: ['t1'], ani: ['t2'] }, profiles: { budi: { settings: { reminders: false } }, ani: {} } });
  const m = fakeMessaging();
  await sendDueReminders({ db, messaging: m, now });
  assert.equal(m.calls.length, 0);
  assert.deepEqual(db.deleted, ['users/budi/reminders/a']);
  assert.equal(db.updated.length, 1, 'yang berulang tetap dimajukan');
});
