// Pilihan ekspor untuk satu catatan atau satu notebook, dan ekspor semua catatan.
import { h, icon, toast } from '../dom.js';
import { menuSheet, openDialog } from './dialogs.js';
import * as data from '../data.js';

const loadExport = () => import('../export.js');

export function exportSheet(notes, title) {
  const rich = data.plan().exportRich;
  const run = async fmt => {
    const ex = await loadExport();
    const f = ex.FORMATS[fmt];
    if (f.plus && !rich) { plusDialog(f.label, () => run('md')); return; }
    try {
      const name = `${ex.safeName(title)}.${f.ext}`;
      ex.download(f.make(notes, title), name);
      toast(`Disimpan: ${name}`);
    } catch (e) {
      console.error(e);
      toast('Ekspor gagal. Coba lagi.');
    }
  };
  menuSheet({
    title: notes.length === 1 ? 'Ekspor catatan' : `Ekspor ${notes.length} catatan`,
    items: [
      { label: 'Teks (.txt)', icon: icon('text'), run: () => run('txt') },
      { label: 'Markdown (.md)', icon: icon('notes'), run: () => run('md') },
      { label: 'PDF', icon: icon('download'), hint: rich ? null : 'Plus', run: () => run('pdf') },
      { label: 'Word (.docx)', icon: icon('download'), hint: rich ? null : 'Plus', run: () => run('docx') }
    ]
  });
}

function plusDialog(what, alt) {
  openDialog(({ close, titleId }) => h('div', { class: 'dlg' },
    h('h2', { id: titleId }, `${what} tersedia di paket Plus`),
    h('p', null, 'Ekspor ke PDF dan Word termasuk paket Plus. Ekspor ke teks dan Markdown tetap gratis, begitu juga ekspor semua catatanmu (lewat Pengaturan).'),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'btn', autofocus: true, onClick: () => close() }, 'Tutup'),
      h('button', { type: 'button', class: 'btn primary', onClick: () => { close(); alt(); } }, 'Ekspor Markdown'))
  ));
}

// Semua catatan milik sendiri (kecuali tempat sampah). Selalu gratis.
export async function exportAll() {
  const notes = data.allNotes().filter(n => !n.deletedAt);
  if (!notes.length) { toast('Belum ada catatan untuk diekspor.'); return; }
  const ex = await loadExport();
  const d = new Date();
  const name = `zui-notebook-semua-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.zip`;
  ex.download(ex.allNotesZip(notes, data.snapshot()), name);
  toast(`${notes.length} catatan disimpan: ${name}`);
}
