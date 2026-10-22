// Laci menu (dibuka dari ikon menu di kiri atas). Pengaturan ada di bagian bawah laci.
import { h, icon, iconButton, clear } from '../dom.js';
import * as data from '../data.js';
import { go, parseRoute } from '../nav.js';
import { openDialog, promptDialog } from './dialogs.js';

let current = null;

export function openDrawer() {
  if (current) return;
  let body;
  const off = data.onData(() => { if (body) fill(body); });
  current = openDialog(({ close }) => {
    const nav = (name, arg) => { close(); go(name, arg); };
    body = h('div', { class: 'dscroll' });
    const wrap = h('nav', { 'aria-label': 'Menu utama', style: 'display:contents' },
      h('div', { class: 'dhead' },
        h('span', { class: 'brand', id: 'drawer-title' }, 'Zui Notebook'),
        iconButton({ icon: 'close', label: 'Tutup menu', onClick: () => close() })
      ),
      body,
      h('div', { class: 'dfoot' },
        item({ icon: 'gear', label: 'Pengaturan', route: ['pengaturan'] }, nav)
      )
    );
    body._nav = nav;
    fill(body);
    return wrap;
  }, { cls: 'drawer', labelledBy: 'drawer-title', onClose: () => { off(); current = null; } });
  // Fokus ke kotak cari agar pengguna keyboard langsung bisa bergerak.
  const first = current.dlg.querySelector('.dsearch');
  if (first) first.focus();
}

export function closeDrawer() { if (current) current.close(); }

function isCurrent(name, arg) {
  const r = parseRoute();
  return r.name === name && (arg === undefined || r.arg === arg);
}

function item({ icon: ic, label, route, n, dot, unit = 'catatan' }, nav) {
  const [name, arg] = route;
  return h('a', {
    href: '#/' + [name, arg].filter(Boolean).map(encodeURIComponent).join('/'),
    class: 'menu-item',
    'aria-current': isCurrent(name, arg === undefined ? undefined : arg) ? 'page' : null,
    onClick: e => { e.preventDefault(); nav(name, arg); }
  }, dot ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : icon(ic), h('span', { class: 'grow' }, label), n !== undefined ? h('span', { class: 'n', 'aria-label': `${n} ${unit}` }, String(n)) : null);
}

function fill(body) {
  const nav = body._nav;
  const scrollTop = body.scrollTop;
  clear(body);
  body.appendChild(h('button', { type: 'button', class: 'dsearch', onClick: () => nav('cari') }, icon('search'), 'Cari catatan'));
  body.appendChild(h('div', { class: 'menu-list' },
    item({ icon: 'notes', label: 'Semua catatan', route: ['semua'], n: data.countIn('semua') }, nav),
    item({ icon: 'pin', label: 'Disematkan', route: ['disematkan'], n: data.countIn('disematkan') }, nav),
    // Baru muncul setelah ada item checklist bertanggal, agar menu tetap ringkas.
    data.hasDatedItems() ? item({ icon: 'sun', label: 'Hari ini', route: ['hari-ini'], n: data.countToday(), unit: 'tugas' }, nav) : null,
    data.hasDatedItems() ? item({ icon: 'calendar', label: 'Akan datang', route: ['akan-datang'], n: data.agenda().upcoming.length, unit: 'tugas' }, nav) : null
  ));

  body.appendChild(h('div', { class: 'group' },
    h('span', { id: 'grp-nb' }, 'Notebook'),
    iconButton({ icon: 'plus', label: 'Notebook baru', onClick: async () => {
      const name = await promptDialog({ title: 'Notebook baru', label: 'Nama notebook', ok: 'Buat', hint: 'Contoh: Rumah, Kerja, Resep' });
      if (name) { const id = data.createNotebook(name); nav('notebook', id); }
    } })
  ));
  const nbs = data.allNotebooks();
  body.appendChild(nbs.length
    ? h('div', { class: 'menu-list', role: 'group', 'aria-labelledby': 'grp-nb' }, nbs.map(nb => item({ dot: true, label: nb.name, route: ['notebook', nb.id], n: data.countIn('notebook', nb.id) }, nav)))
    : h('p', { class: 'note-small', style: 'margin:0 12px 4px' }, 'Belum ada notebook.'));

  const tags = data.allTags();
  if (tags.length) {
    body.appendChild(h('div', { class: 'group' }, h('span', { id: 'grp-tag' }, 'Tag')));
    body.appendChild(h('div', { class: 'menu-list', role: 'group', 'aria-labelledby': 'grp-tag' },
      tags.map(([t, c]) => item({ icon: 'tag', label: '#' + t, route: ['tag', t], n: c }, nav))));
  }

  body.appendChild(h('div', { class: 'group' }, h('span', null, 'Lainnya')));
  body.appendChild(h('div', { class: 'menu-list' },
    item({ icon: 'archive', label: 'Arsip', route: ['arsip'], n: data.countIn('arsip') }, nav),
    item({ icon: 'trash', label: 'Tempat sampah', route: ['sampah'], n: data.countIn('sampah') }, nav)
  ));

  const recent = data.recentNotes(6);
  if (recent.length) {
    body.appendChild(h('div', { class: 'group' }, h('span', { id: 'grp-recent' }, 'Terbaru')));
    body.appendChild(h('div', { class: 'menu-list', role: 'group', 'aria-labelledby': 'grp-recent' },
      recent.map(n => h('a', {
        href: '#/catatan/' + n.id,
        class: 'menu-item',
        onClick: e => { e.preventDefault(); nav('catatan', n.id); }
      }, h('span', { class: 'grow' }, data.noteTitle(n))))));
  }
  body.scrollTop = scrollTop;
}
