// Uji aturan keamanan Firestore & Storage dengan Firebase Emulator.
// Jalankan dari folder tests/rules:
//   npm install
//   npx firebase emulators:exec --only firestore,storage --project demo-zui "node --test rules.test.mjs"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';
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
test('storage: hanya pemilik, batas 5 MB, hanya gambar', async () => {
  const st = asAni().storage();
  const small = new Uint8Array(1000);
  await assertSucceeds(uploadBytes(ref(st, 'users/ani/attachments/n1/a.jpg'), small, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/b.jpg'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'users/ani/attachments/n1/c.exe'), small, { contentType: 'application/octet-stream' }));
  await assertFails(uploadBytes(ref(asBudi().storage(), 'users/ani/attachments/n1/d.jpg'), small, { contentType: 'image/jpeg' }));
  await assertFails(getBytes(ref(asBudi().storage(), 'users/ani/attachments/n1/a.jpg')));
});
