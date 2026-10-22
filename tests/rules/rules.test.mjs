// Uji aturan keamanan Firestore & Storage dengan Firebase Emulator.
// Jalankan dari folder tests/rules:
//   npm install
//   npx firebase emulators:exec --only firestore,storage --project demo-zui "node --test rules.test.mjs"
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel, writeBatch, increment } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env;
const note = () => ({
  title: 'Belanja', body: 'beras', type: 'text', items: [], notebookId: null, tags: [],
  pinned: false, archived: false, deletedAt: null, createdAt: Date.now(), editedAt: Date.now(),
  attachments: [], updatedAt: serverTimestamp()
});
const profile = (plan = 'free') => ({ displayName: 'Ani', email: 'ani@contoh.id', plan, settings: {}, flags: {}, createdAt: Date.now(), updatedAt: serverTimestamp() });

before(async () => {
  setLogLevel('error');
  env = await initializeTestEnvironment({
    projectId: 'demo-zui',
    firestore: { rules: readFileSync('../../firestore.rules', 'utf8') },
    storage: { rules: readFileSync('../../storage.rules', 'utf8') }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const asAni = () => env.authenticatedContext('ani');
const asBudi = () => env.authenticatedContext('budi');

test('pemilik bisa membuat profil dengan plan free', async () => {
  await assertSucceeds(setDoc(doc(asAni().firestore(), 'users/ani'), profile()));
});
test('tidak bisa membuat profil langsung dengan plan plus', async () => {
  await assertFails(setDoc(doc(asAni().firestore(), 'users/ani'), profile('plus')));
});
test('pengguna tidak bisa menaikkan plan sendiri', async () => {
  const db = asAni().firestore();
  await setDoc(doc(db, 'users/ani'), profile());
  await assertFails(updateDoc(doc(db, 'users/ani'), { plan: 'plus', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'users/ani'), { settings: { theme: 'gelap' }, updatedAt: serverTimestamp() }));
});
test('orang lain tidak bisa membaca profil', async () => {
  await setDoc(doc(asAni().firestore(), 'users/ani'), profile());
  await assertFails(getDoc(doc(asBudi().firestore(), 'users/ani')));
});
test('tamu (belum masuk) tidak bisa apa-apa', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'users/ani/notes/n1')));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n1'), note()));
});
test('pemilik bisa menulis, membaca, menghapus catatan', async () => {
  const db = asAni().firestore();
  await assertSucceeds(setDoc(doc(db, 'users/ani/notes/n1'), note()));
  await assertSucceeds(getDoc(doc(db, 'users/ani/notes/n1')));
  await assertSucceeds(deleteDoc(doc(db, 'users/ani/notes/n1')));
});
test('orang lain tidak bisa membaca atau menulis catatan', async () => {
  await setDoc(doc(asAni().firestore(), 'users/ani/notes/n1'), note());
  const db = asBudi().firestore();
  await assertFails(getDoc(doc(db, 'users/ani/notes/n1')));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n2'), note()));
  await assertFails(deleteDoc(doc(db, 'users/ani/notes/n1')));
});
test('catatan dengan field asing atau terlalu besar ditolak', async () => {
  const db = asAni().firestore();
  await assertFails(setDoc(doc(db, 'users/ani/notes/n1'), { ...note(), admin: true }));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n1'), { ...note(), title: 'x'.repeat(301) }));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n1'), { ...note(), type: 'video' }));
});
test('jalur di luar users ditutup', async () => {
  await assertFails(setDoc(doc(asAni().firestore(), 'public/x'), { a: 1 }));
});
test('storage: foto tidak bisa diunggah tanpa tercatat di kuota', async () => {
  const st = asAni().storage();
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/attfoto0001.jpg'), new Uint8Array(1000), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/c.exe'), new Uint8Array(1000), { contentType: 'application/octet-stream' }));
});

// ---------- Tahap 2: tanggal & pengingat ----------
const reminder = () => ({ noteId: 'n1', itemId: 'i1', title: 'Obat ibu', text: 'Vitamin', at: Date.now() + 60000, base: Date.now() + 60000, repeat: 'harian', tz: -420, updatedAt: serverTimestamp() });

test('item checklist boleh punya tanggal, ulangan, dan pengingat', async () => {
  const db = asAni().firestore();
  const items = [{ id: 'i1', text: 'Vitamin', done: false, due: Date.now(), hasTime: true, repeat: 'harian', remind: true }, { id: 'i2', text: 'Tanpa tanggal', done: false }];
  await assertSucceeds(setDoc(doc(db, 'users/ani/notes/n1'), { ...note(), type: 'checklist', items }));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n2'), { ...note(), type: 'checklist', items: [{ ...items[0], repeat: 'tiap jam' }] }));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n3'), { ...note(), type: 'checklist', items: [{ ...items[0], due: 'besok' }] }));
  await assertFails(setDoc(doc(db, 'users/ani/notes/n4'), { ...note(), type: 'checklist', items: [{ ...items[0], admin: true }] }));
});
test('pengaturan boleh menyimpan sakelar pengingat', async () => {
  const db = asAni().firestore();
  await setDoc(doc(db, 'users/ani'), profile());
  await assertSucceeds(updateDoc(doc(db, 'users/ani'), { settings: { reminders: false }, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/ani'), { settings: { reminders: 'tidak' }, updatedAt: serverTimestamp() }));
});
test('jadwal pengingat: hanya pemilik, bentuk dibatasi', async () => {
  const db = asAni().firestore();
  await assertSucceeds(setDoc(doc(db, 'users/ani/reminders/r1'), reminder()));
  await assertSucceeds(getDoc(doc(db, 'users/ani/reminders/r1')));
  await assertFails(setDoc(doc(db, 'users/ani/reminders/r2'), { ...reminder(), repeat: 'tiap jam' }));
  await assertFails(setDoc(doc(db, 'users/ani/reminders/r3'), { ...reminder(), tz: 5000 }));
  await assertFails(setDoc(doc(db, 'users/ani/reminders/r4'), { ...reminder(), text: 'x'.repeat(201) }));
  await assertFails(setDoc(doc(db, 'users/ani/reminders/r5'), { ...reminder(), kirimKe: 'semua' }));
  await assertFails(getDoc(doc(asBudi().firestore(), 'users/ani/reminders/r1')));
  await assertFails(setDoc(doc(asBudi().firestore(), 'users/ani/reminders/r6'), reminder()));
  await assertSucceeds(deleteDoc(doc(db, 'users/ani/reminders/r1')));
});
test('perangkat penerima notifikasi: hanya pemilik', async () => {
  const dev = { token: 'tok', label: 'Android · Chrome', createdAt: Date.now(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(asAni().firestore(), 'users/ani/devices/d1'), dev));
  await assertFails(setDoc(doc(asAni().firestore(), 'users/ani/devices/d2'), { ...dev, token: '' }));
  await assertFails(getDoc(doc(asBudi().firestore(), 'users/ani/devices/d1')));
  await assertFails(setDoc(doc(asBudi().firestore(), 'users/ani/devices/d3'), dev));
});

// ---------- Tahap 2: lampiran foto dan kuota ----------
const MB = 1024 * 1024;
const att = (id, size, noteId = 'n1') => ({ noteId, path: `users/ani/attachments/${noteId}/${id}.jpg`, size, contentType: 'image/jpeg', createdAt: Date.now() });

function addPhoto(db, id, size, { delta = size, files = 1, last = id, data } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `users/ani/attachments/${id}`), data || att(id, size));
  b.update(doc(db, 'users/ani'), { 'usage.bytes': increment(delta), 'usage.files': increment(files), 'usage.lastAttId': last, updatedAt: serverTimestamp() });
  return b.commit();
}
function removePhoto(db, id, size, { delta = -size } = {}) {
  const b = writeBatch(db);
  b.delete(doc(db, `users/ani/attachments/${id}`));
  b.update(doc(db, 'users/ani'), { 'usage.bytes': increment(delta), 'usage.files': increment(-1), 'usage.lastAttId': id, updatedAt: serverTimestamp() });
  return b.commit();
}
async function aniWithPlan(plan, usage) {
  // Paket diatur lewat Admin (server), seperti nanti saat pembayaran.
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/ani'), { ...profile(), plan, ...(usage ? { usage } : {}), updatedAt: Date.now() }));
}

test('foto tercatat bersama kenaikan kuota yang tepat', async () => {
  await aniWithPlan('free');
  const db = asAni().firestore();
  await assertSucceeds(addPhoto(db, 'attfoto0001', 300000));
  const u = (await getDoc(doc(db, 'users/ani'))).data().usage;
  assert.deepEqual(u, { bytes: 300000, files: 1, lastAttId: 'attfoto0001' });
  await assertFails(addPhoto(db, 'attfoto0002', 300000, { delta: 1 }), 'kenaikan tidak sama dengan ukuran');
  await assertFails(addPhoto(db, 'attfoto0003', 300000, { files: 0 }));
  await assertFails(addPhoto(db, 'attfoto0004', 300000, { last: 'attfoto0001' }));
  await assertFails(addPhoto(db, 'attfoto0005', 300000, { data: { ...att('attfoto0005', 300000), path: 'users/budi/attachments/n1/attfoto0005.jpg' } }));
});
test('kuota tidak bisa diubah tanpa lampiran, dan lampiran tidak bisa diubah', async () => {
  await aniWithPlan('free', { bytes: 0, files: 0 });
  const db = asAni().firestore();
  await assertFails(updateDoc(doc(db, 'users/ani'), { 'usage.bytes': 0, 'usage.files': 0, 'usage.lastAttId': 'palsu12345', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/ani'), { 'usage.bytes': increment(-1000), updatedAt: serverTimestamp() }));
  await addPhoto(db, 'attfoto0001', 1000);
  await assertFails(updateDoc(doc(db, 'users/ani/attachments/attfoto0001'), { size: 1 }));
  await assertFails(deleteDoc(doc(db, 'users/ani/attachments/attfoto0001')), 'hapus tanpa mengurangi kuota');
  await assertFails(removePhoto(db, 'attfoto0001', 1000, { delta: -999999 }));
  await assertSucceeds(removePhoto(db, 'attfoto0001', 1000));
  const u = (await getDoc(doc(db, 'users/ani'))).data().usage;
  assert.equal(u.bytes, 0);
  assert.equal(u.files, 0);
});
test('batas per foto dan kuota total mengikuti paket', async () => {
  await aniWithPlan('free', { bytes: 99 * MB, files: 50 });
  let db = asAni().firestore();
  await assertFails(addPhoto(db, 'attbesar001', 5 * MB + 1), 'gratis: > 5 MB per foto');
  await assertFails(addPhoto(db, 'attpenuh001', 2 * MB), 'gratis: kuota 100 MB terlampaui');
  await assertSucceeds(addPhoto(db, 'attmuat0001', 1 * MB));
  await env.clearFirestore();
  await aniWithPlan('plus', { bytes: 99 * MB, files: 50 });
  db = asAni().firestore();
  await assertSucceeds(addPhoto(db, 'attbesar001', 12 * MB), 'plus: foto lebih besar, kuota lebih besar');
  await assertFails(addPhoto(db, 'attbesar002', 21 * MB), 'plus: tetap ada batas per foto');
});
test('orang lain tidak bisa membaca atau mencatat lampiran', async () => {
  await aniWithPlan('free');
  await addPhoto(asAni().firestore(), 'attfoto0001', 1000);
  await assertFails(getDoc(doc(asBudi().firestore(), 'users/ani/attachments/attfoto0001')));
  const budi = asBudi().firestore();
  const b = writeBatch(budi);
  b.set(doc(budi, 'users/ani/attachments/attfoto0002'), att('attfoto0002', 1000));
  await assertFails(b.commit());
});
test('storage: unggah hanya untuk foto tercatat dengan ukuran sama persis', async () => {
  await aniWithPlan('free');
  await addPhoto(asAni().firestore(), 'attfoto0001', 1000);
  const st = asAni().storage();
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/attfoto0001.jpg'), new Uint8Array(2000), { contentType: 'image/jpeg' }), 'ukuran berbeda');
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n2/attfoto0001.jpg'), new Uint8Array(1000), { contentType: 'image/jpeg' }), 'catatan berbeda');
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/attfoto0001.jpg'), new Uint8Array(1000), { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(st, 'users/ani/attachments/n1/attfoto0001.jpg'), new Uint8Array(1000), { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(st, 'users/ani/attachments/n1/attfoto0001.jpg')));
  await assertFails(getBytes(ref(asBudi().storage(), 'users/ani/attachments/n1/attfoto0001.jpg')));
  await assertFails(uploadBytes(ref(asBudi().storage(), 'users/ani/attachments/n1/attfoto0001.jpg'), new Uint8Array(1000), { contentType: 'image/jpeg' }));
});
