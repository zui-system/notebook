// Beranda (kosong dan tenang), daftar catatan, dan pencarian.
import { h, icon, clear, fmtDate, toast } from '../dom.js';
import * as data from '../data.js';
import { go } from '../nav.js';
import { confirmDialog, promptDialog, menuSheet } from './dialogs.js';

export function greeting(d = new Date()) {
  const hr = d.getHours();
  if (hr >= 4 && hr < 11) return 'Selamat pagi';
  if (hr >= 11 && hr < 15) return 'Selamat siang';
  if (hr >= 15 && hr < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function homeView({ name }) {
  const first = (name || '').trim().split(/\s+/)[0];
  const el = h('section', { class: 'home', 'aria-labelledby': 'home-title' },
    icon('notes', 'mark'),
    h('h1', { id: 'home-title' }, first ? `${greeting()}, ${first}` : greeting()),
    h('p', null, 'Apa yang ingin kamu catat?')
  );
  return { el };
}

function card(n) {
  const nb = n.notebookId ? data.getNotebook(n.notebookId) : null;
  const snippet = data.noteSnippet(n);
  const metaParts = [];
  if (n.pinned) metaParts.push(h('span', { class: 'pin' }, icon('pin'), 'Disematkan'));
  if (nb) metaParts.push(h('span', null, nb.name));
  metaParts.push(h('span', null, fmtDate(n.editedAt)));
  return h('button', { type: 'button', class: 'card', onClick: () => go('catatan', n.id) },
    h('span', { class: 'meta' }, metaParts.flatMap((m, i) => i ? [h('span', { 'aria-hidden': 'true' }, '·'), m] : [m])),
    h('h2', null, data.noteTitle(n)),
    snippet ? h('p', null, snippet) : null,
    (n.tags || []).length ? h('span', { class: 'meta' }, n.tags.map(t => h('span', { class: 'tagchip' }, '#' + t))) : null
  );
}

function trashCard(n) {
  const days = data.daysLeftInTrash(n);
  return h('div', { class: 'card' },
    h('span', { class: 'meta' }, `Terhapus otomatis dalam ${days} hari`),
    h('h2', null, data.noteTitle(n)),
    data.noteSnippet(n) ? h('p', null, data.noteSnippet(n)) : null,
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn small', onClick: () => { data.restoreNote(n.id); toast('Catatan dipulihkan.'); } }, icon('restore'), 'Pulihkan'),
      h('button', { type: 'button', class: 'btn small ghost', onClick: async () => {
        const ok = await confirmDialog({ title: 'Hapus selamanya?', message: `"${data.noteTitle(n)}" akan dihapus permanen dan tidak bisa dikembalikan.`, ok: 'Hapus selamanya', danger: true });
        if (ok) { await data.deleteForever(n.id); toast('Catatan dihapus permanen.'); }
      } }, 'Hapus selamanya')
    )
  );
}

const TITLES = { semua: 'Semua catatan', disematkan: 'Disematkan', arsip: 'Arsip', sampah: 'Tempat sampah' };

export function listView(kind, arg) {
  const el = h('section', { 'aria-labelledby': 'list-title' });
  const update = () => {
    clear(el);
    let title = TITLES[kind];
    if (kind === 'notebook') {
      const nb = data.getNotebook(arg);
      if (!nb) { el.appendChild(h('div', { class: 'empty' }, h('p', null, 'Notebook ini tidak ditemukan.'), h('button', { class: 'btn', onClick: () => go('semua') }, 'Lihat semua catatan'))); return; }
      title = nb.name;
    }
    if (kind === 'tag') title = '#' + arg;
    const notes = data.listNotes(kind, arg);
    const actions = [];
    if (kind === 'notebook') {
      actions.push(h('button', { type: 'button', class: 'btn small', onClick: () => go('baru', arg) }, icon('pen'), 'Tulis di sini'));
      actions.push(h('button', { type: 'button', class: 'btn small ghost', onClick: () => notebookMenu(arg) }, icon('more'), 'Atur'));
    }
    if (kind === 'sampah' && notes.length) {
      actions.push(h('button', { type: 'button', class: 'btn small', onClick: async () => {
        const ok = await confirmDialog({ title: 'Kosongkan tempat sampah?', message: `${notes.length} catatan akan dihapus permanen dan tidak bisa dikembalikan.`, ok: 'Kosongkan', danger: true });
        if (ok) { await data.emptyTrash(); toast('Tempat sampah dikosongkan.'); }
      } }, 'Kosongkan'));
    }
    el.appendChild(h('div', { class: 'viewhead' },
      h('div', null, h('h1', { id: 'list-title' }, title), h('div', { class: 'count' }, `${notes.length} catatan`)),
      actions.length ? h('div', { class: 'actions' }, actions) : null
    ));
    if (kind === 'sampah') el.appendChild(h('p', { class: 'note-small', style: 'margin:0 0 12px' }, 'Catatan di sini dihapus otomatis setelah 30 hari.'));
    if (!notes.length) {
      const msg = { sampah: 'Tempat sampah kosong.', arsip: 'Belum ada catatan yang diarsipkan.', disematkan: 'Belum ada catatan yang disematkan.' }[kind] || 'Belum ada catatan di sini.';
      el.appendChild(h('div', { class: 'empty' }, h('p', null, msg),
        kind === 'sampah' || kind === 'arsip' ? null : h('button', { type: 'button', class: 'btn primary', onClick: () => go('baru', kind === 'notebook' ? arg : null) }, icon('pen'), 'Tulis catatan')));
      return;
    }
    el.appendChild(h('ul', { class: 'notes' }, notes.map(n => h('li', null, kind === 'sampah' ? trashCard(n) : card(n)))));
  };
  update();
  return { el, update };
}

async function notebookMenu(id) {
  const nb = data.getNotebook(id);
  if (!nb) return;
  menuSheet({
    title: nb.name,
    items: [
      { label: 'Ganti nama', icon: icon('pen'), run: async () => {
        const name = await promptDialog({ title: 'Ganti nama notebook', label: 'Nama notebook', value: nb.name });
        if (name) data.renameNotebook(id, name);
      } },
      { label: 'Hapus notebook', icon: icon('trash'), danger: true, run: async () => {
        const n = data.countIn('notebook', id);
        const ok = await confirmDialog({ title: 'Hapus notebook?', message: n ? `Notebook "${nb.name}" dihapus. ${n} catatan di dalamnya tetap aman dan pindah ke "Semua catatan".` : `Notebook "${nb.name}" akan dihapus.`, ok: 'Hapus notebook', danger: true });
        if (ok) { await data.deleteNotebook(id); go('semua', null, { replace: true }); toast('Notebook dihapus.'); }
      } }
    ]
  });
}

export function searchView() {
  let q = sessionStorage.getItem('zn-q') || '';
  const results = h('div', { 'aria-live': 'polite' });
  const input = h('input', {
    type: 'search', id: 'q', value: q, placeholder: 'Ketik kata yang dicari…', autocomplete: 'off', enterkeyhint: 'search',
    'aria-describedby': 'q-help',
    onInput: e => { q = e.target.value; sessionStorage.setItem('zn-q', q); update(); }
  });
  const el = h('section', { 'aria-labelledby': 'search-title' },
    h('div', { class: 'viewhead' }, h('h1', { id: 'search-title' }, 'Cari')),
    h('label', { class: 'searchbox', for: 'q' }, icon('search'), h('span', { class: 'sr-only' }, 'Cari catatan'), input),
    h('p', { id: 'q-help', class: 'sr-only' }, 'Hasil muncul langsung saat mengetik.'),
    results
  );
  function update() {
    clear(results);
    if (!q.trim()) { results.appendChild(h('p', { class: 'note-small' }, 'Cari judul, isi, tag, atau nama notebook. Pencarian bekerja juga tanpa internet.')); return; }
    const ids = data.search.search(q);
    const notes = ids.map(id => data.getNote(id)).filter(Boolean);
    results.appendChild(h('div', { class: 'count', style: 'margin-bottom:10px' }, notes.length ? `${notes.length} catatan ditemukan` : 'Tidak ada catatan yang cocok.'));
    if (notes.length) results.appendChild(h('ul', { class: 'notes' }, notes.map(n => h('li', null, card(n)))));
  }
  update();
  setTimeout(() => input.focus(), 0);
  return { el, update };
}
