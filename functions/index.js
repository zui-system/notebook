// Zui Notebook — Cloud Functions (perlu paket Blaze).
//   sendReminders      tiap menit: kirim notifikasi pengingat yang sudah waktunya
//   cleanupAttachment  saat data lampiran dihapus: hapus juga file fotonya di Storage
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { sendDueReminders } from './send.js';

initializeApp();

// Samakan dengan lokasi database Firestore proyekmu (mis. asia-southeast2 = Jakarta).
const REGION = 'asia-southeast2';

export const sendReminders = onSchedule({ schedule: 'every 1 minutes', region: REGION, timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const res = await sendDueReminders({ db: getFirestore(), messaging: getMessaging(), log: (...a) => logger.warn(...a) });
  if (res.checked) logger.info('Pengingat diproses', res);
});

export const cleanupAttachment = onDocumentDeleted({ document: 'users/{uid}/attachments/{attId}', region: REGION }, async event => {
  const path = event.data && event.data.get('path');
  // Hanya file milik pengguna yang sama, di folder lampiran.
  if (typeof path !== 'string' || !path.startsWith(`users/${event.params.uid}/attachments/`)) return;
  await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
});
