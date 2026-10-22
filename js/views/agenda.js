// "Hari ini" dan "Akan datang": item checklist bertanggal dari semua catatan.
import { h, icon, clear, toast, fmtDue, fmtTime, fmtDayHeading } from '../dom.js';
import * as data from '../data.js';
import { go } from '../nav.js';
import { REPEAT_LABEL } from '../recur.js';
import { settings } from '../settings.js';

function row({ note, item }, { showDate }) {
  const id = 'ag-' + note.id + '-' + item.id;
  const meta = [data.noteTitle(note)];
  meta.push(showDate ? fmtDue(item.due, item.hasTime) : item.hasTime ? fmtTime(item.due) : 'Sepanjang hari');
  if (item.repeat) meta.push(REPEAT_LABEL[item.repeat]);
  const late = item.due < (item.hasTime ? Date.now() : data.startOfDay());
  return h('li', { class: 'agrow' + (late ? ' late' : '') },
    h('label', { class: 'box', for: id },
      h('input', { type: 'checkbox', id, onChange: () => complete(note, item) }),
      h('span', { class: 'sr-only' }, `Selesai: ${item.text}`)),
    h('button', { type: 'button', class: 'agmain', onClick: () => go('catatan', note.id) },
      h('span', { class: 'txt' }, item.text),
      h('span', { class: 'meta' },
        meta.join(' · '),
        item.remind && settings.reminders ? h('span', { class: 'bell', 'aria-label': 'diingatkan' }, icon('bell')) : null))
  );
}

function complete(note, item) {
  const prevDue = item.due;
  const next = data.setItemDone(note.id, item.id, true);
  const undo = () => next
    ? data.updateItem(note.id, item.id, it => { it.due = prevDue; })
    : data.setItemDone(note.id, item.id, false);
  toast(next ? `Bagus! Berikutnya: ${fmtDue(next, item.hasTime)}.` : 'Ditandai selesai.', { label: 'Batalkan', run: undo });
}

export function agendaView(kind) {
  const today = kind === 'hari-ini';
  const el = h('section', { 'aria-labelledby': 'ag-title' });
  const update = () => {
    const focusedId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    clear(el);
    const a = data.agenda();
    const groups = [];
    if (today) {
      if (a.overdue.length) groups.push({ label: 'Terlambat', items: a.overdue, showDate: true });
      if (a.today.length) groups.push({ label: 'Untuk hari ini', items: a.today, showDate: false });
    } else {
      const byDay = new Map();
      for (const e of a.upcoming) {
        const d = data.startOfDay(e.item.due);
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d).push(e);
      }
      const tomorrow = data.addDays(data.startOfDay(), 1);
      for (const [d, items] of byDay) groups.push({ label: d === tomorrow ? 'Besok · ' + fmtDayHeading(d) : fmtDayHeading(d), items, showDate: false });
    }
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    el.appendChild(h('div', { class: 'viewhead' },
      h('div', null,
        h('h1', { id: 'ag-title' }, today ? 'Hari ini' : 'Akan datang'),
        h('div', { class: 'count' }, today ? `${fmtDayHeading(Date.now())} · ${total} tugas` : `${total} tugas`)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn small ghost', onClick: () => go(today ? 'akan-datang' : 'hari-ini') },
          icon(today ? 'calendar' : 'sun'), today ? 'Akan datang' : 'Hari ini'))
    ));
    if (!total) {
      el.appendChild(h('div', { class: 'empty' },
        h('p', null, today ? 'Tidak ada tugas untuk hari ini.' : 'Belum ada tugas yang akan datang.'),
        h('p', { class: 'note-small' }, 'Tambahkan tanggal pada item checklist lewat tombol kalender di samping item.')));
      return;
    }
    for (const g of groups) {
      el.appendChild(h('h2', { class: 'section-label' }, g.label));
      el.appendChild(h('ul', { class: 'agenda' }, g.items.map(e => row(e, g))));
    }
    // Item yang baru dicentang hilang dari daftar: fokus pindah ke item berikutnya.
    if (focusedId) { const f = el.querySelector('#' + CSS.escape(focusedId)) || el.querySelector('.agrow input'); if (f) f.focus(); }
  };
  update();
  return { el, update };
}
