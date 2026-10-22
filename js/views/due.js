// Dialog "Tanggal & pengingat" untuk satu item checklist, plus teks ringkas tanggalnya.
import { h, icon, toast, fmtDue } from '../dom.js';
import { openDialog } from './dialogs.js';
import { REPEATS, REPEAT_LABEL, nextOccurrence } from '../recur.js';
import { settings } from '../settings.js';
import * as data from '../data.js';
import { askPermission, enablePush, permission, isIOS, isStandalone } from '../reminders.js';

const pad = n => String(n).padStart(2, '0');
const dateValue = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeValue = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cap = s => s[0].toUpperCase() + s.slice(1);

// Hasil: { due, hasTime, repeat, remind } | { clear: true } | null (batal)
export function dueDialog(item) {
  return new Promise(resolve => {
    let answer = null;
    openDialog(({ close, titleId }) => {
      const has = typeof item.due === 'number';
      const date = h('input', { type: 'date', class: 'input', id: 'due-date', value: dateValue(has ? item.due : Date.now()), required: true, autofocus: true });
      const time = h('input', { type: 'time', class: 'input', id: 'due-time', value: has && item.hasTime ? timeValue(item.due) : '', 'aria-describedby': 'due-time-hint' });
      const err = h('p', { class: 'err', role: 'alert' });
      const quick = [['Hari ini', 0], ['Besok', 1], ['Minggu depan', 7]].map(([label, n]) =>
        h('button', { type: 'button', class: 'btn small ghost', onClick: () => { date.value = dateValue(data.addDays(data.startOfDay(), n)); date.focus(); } }, label));
      const cur = has ? (item.repeat || '') : '';
      const remind = h('input', { type: 'checkbox', role: 'switch', id: 'due-remind', checked: has ? !!item.remind : true });
      return h('form', { class: 'dlg', onSubmit: e => {
        e.preventDefault();
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.value);
        if (!m) { err.textContent = 'Pilih tanggal dulu.'; date.focus(); return; }
        const t = /^(\d{2}):(\d{2})$/.exec(time.value);
        let due = new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0).getTime();
        const rep = form().querySelector('input[name="due-rep"]:checked');
        const repeat = rep && rep.value ? rep.value : null;
        // Jadwal berulang yang dimulai di waktu yang sudah lewat (mis. "tiap hari 07.00" dibuat sore hari)
        // langsung mulai dari kejadian berikutnya, bukan dianggap terlambat.
        const from = t ? Date.now() : data.startOfDay() - 1;
        if (repeat && due <= from) due = nextOccurrence(due, repeat, new Date(due).getTimezoneOffset(), from);
        answer = { due, hasTime: !!t, repeat, remind: remind.checked };
        close();
      } },
        h('h2', { id: titleId }, 'Tanggal & pengingat'),
        item.text.trim() ? h('p', null, item.text.trim()) : null,
        h('div', { class: 'field' }, h('label', { for: 'due-date' }, 'Tanggal'), date, h('div', { class: 'quick' }, quick)),
        h('div', { class: 'field' }, h('label', { for: 'due-time' }, 'Jam (boleh kosong)'), time,
          h('span', { class: 'hint', id: 'due-time-hint' }, 'Tanpa jam, pengingat muncul pukul 08.00.')),
        h('fieldset', { class: 'seg four' }, h('legend', null, 'Ulangi'),
          [['', 'Tidak'], ...REPEATS.map(r => [r, cap(REPEAT_LABEL[r])])].map(([v, l]) => h('label', { class: 'opt' },
            h('input', { type: 'radio', name: 'due-rep', value: v, checked: v === cur }), h('span', null, l)))),
        h('label', { class: 'switch', for: 'due-remind' },
          h('span', { class: 'txt' }, h('span', null, 'Ingatkan saya'), h('small', null, 'Kirim notifikasi saat waktunya tiba.')),
          remind),
        err,
        h('div', { class: 'buttons' },
          has ? h('button', { type: 'button', class: 'btn ghost', onClick: () => { answer = { clear: true }; close(); } }, 'Hapus tanggal') : null,
          h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Batal'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Simpan'))
      );
      function form() { return date.form; }
    }, { onClose: () => resolve(answer) });
  });
}

// Menerapkan hasil dialog ke item (objek item diubah langsung).
export function applyDue(item, res) {
  if (res.clear) { delete item.due; delete item.hasTime; delete item.repeat; delete item.remind; return; }
  Object.assign(item, res);
}

// Setelah pengingat dipasang: minta izin notifikasi bila belum, lalu daftarkan perangkat.
export async function prepareNotifications() {
  if (!settings.reminders) { toast('Pengingat sedang dimatikan di Pengaturan. Tanggal tetap tersimpan.'); return; }
  const before = permission();
  const p = await askPermission();
  if (p === 'granted') { enablePush(data.getStore()); if (before !== 'granted') toast('Notifikasi diizinkan. Pengingat akan muncul tepat waktu.'); return; }
  if (p === 'denied') toast('Notifikasi diblokir di perangkat ini. Pengingat tetap terlihat di "Hari ini".');
  else if (p === 'unsupported') toast(isIOS() && !isStandalone()
    ? 'Di iPhone, pasang Zui Notebook ke Layar Utama dulu agar notifikasi bisa muncul.'
    : 'Perangkat ini belum mendukung notifikasi. Pengingat tetap terlihat di "Hari ini".');
}

// Baris kecil di bawah item: "Besok, 08.00 · tiap hari · 🔔"
export function dueLine(item, id) {
  if (typeof item.due !== 'number') return null;
  const late = !item.done && item.due < (item.hasTime ? Date.now() : data.startOfDay());
  const parts = [h('span', null, icon('calendar'), fmtDue(item.due, item.hasTime))];
  if (item.repeat) parts.push(h('span', null, icon('repeat'), REPEAT_LABEL[item.repeat]));
  if (item.remind && settings.reminders) parts.push(h('span', null, icon('bell'), 'diingatkan'));
  return h('span', { class: 'due' + (late ? ' late' : ''), id }, late ? h('span', null, 'Terlambat') : null, parts);
}
