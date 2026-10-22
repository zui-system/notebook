// Penulis catatan: teks atau checklist. Tersimpan otomatis.
import { h, icon, iconButton, clear, toast, fmtDateTime, fmtDue } from '../dom.js';
import * as data from '../data.js';
import { go, back } from '../nav.js';
import { confirmDialog, promptDialog, menuSheet } from './dialogs.js';
import { dueDialog, applyDue, dueLine, prepareNotifications } from './due.js';

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export function editorView(id, { notebookId = null } = {}) {
  let noteId = id;
  const existing = id ? data.getNote(id) : null;
  if (id && !existing) {
    return { el: h('div', { class: 'empty' }, h('p', null, 'Catatan ini tidak ditemukan. Mungkin sudah dihapus.'), h('button', { type: 'button', class: 'btn', onClick: () => go('semua') }, 'Lihat semua catatan')), toolbar: null };
  }
  let draft = existing ? structuredClone(existing) : data.blankNote({ notebookId: notebookId && data.getNotebook(notebookId) ? notebookId : null });
  delete draft.id;
  let timer = null;
  let dirty = false;
  const inTrash = () => !!draft.deletedAt;

  function flush() {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    if (!noteId) {
      if (data.isEmptyNote(draft)) return;
      noteId = data.createNote(draft);
      history.replaceState(null, '', '#/catatan/' + noteId);
      renderToolbar();
    } else {
      data.saveNote(noteId, draft);
    }
  }
  function changed() {
    dirty = true;
    draft.editedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  function setMeta(patch) {
    Object.assign(draft, patch);
    if (noteId) data.updateNote(noteId, patch, { touch: false });
    else dirty = true;
    renderToolbar();
    renderChips();
  }

  // ---- Bilah atas editor ----
  const toolbar = h('div', { class: 'topbar' });
  function renderToolbar() {
    clear(toolbar);
    toolbar.appendChild(iconButton({ icon: 'back', label: 'Kembali', onClick: () => { flush(); back(''); } }));
    const right = h('div', { class: 'right' });
    if (!inTrash()) {
      right.appendChild(iconButton({ icon: 'pin', label: draft.pinned ? 'Lepas sematan' : 'Sematkan', pressed: draft.pinned, onClick: () => { setMeta({ pinned: !draft.pinned }); toast(draft.pinned ? 'Catatan disematkan.' : 'Sematan dilepas.'); } }));
      right.appendChild(iconButton({
        icon: draft.type === 'checklist' ? 'text' : 'check',
        label: draft.type === 'checklist' ? 'Jadikan teks' : 'Jadikan checklist',
        onClick: toggleType
      }));
      right.appendChild(iconButton({ icon: 'more', label: 'Pilihan lain', onClick: moreMenu }));
    }
    toolbar.appendChild(right);
  }

  // ---- Isi ----
  const title = h('textarea', {
    class: 'title', rows: 1, placeholder: 'Judul', 'aria-label': 'Judul catatan', maxlength: 300,
    onInput: e => { draft.title = e.target.value.replace(/\n/g, ' '); autoGrow(e.target); changed(); },
    onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); focusContent(); } }
  });
  title.value = draft.title;
  const chips = h('div', { class: 'chips' });
  const content = h('div');
  const attachments = h('div');
  const banner = h('div');
  const footer = h('p', { class: 'note-small', style: 'margin:18px 0 0' });

  const el = h('article', { class: 'editor', 'aria-label': 'Catatan' }, banner, title, chips, content, attachments, footer);

  function renderBanner() {
    clear(banner);
    if (inTrash()) {
      banner.appendChild(h('div', { class: 'banner' },
        h('p', null, `Catatan ini ada di tempat sampah dan akan terhapus dalam ${data.daysLeftInTrash(draft)} hari.`),
        h('button', { type: 'button', class: 'btn small primary', onClick: () => { data.restoreNote(noteId); draft.deletedAt = null; refreshAll(); toast('Catatan dipulihkan.'); } }, icon('restore'), 'Pulihkan')));
    } else if (draft.archived) {
      banner.appendChild(h('div', { class: 'banner' },
        h('p', null, 'Catatan ini diarsipkan.'),
        h('button', { type: 'button', class: 'btn small', onClick: () => { setMeta({ archived: false }); renderBanner(); toast('Dikeluarkan dari arsip.'); } }, 'Keluarkan dari arsip')));
    }
  }

  function renderChips() {
    clear(chips);
    const nb = draft.notebookId ? data.getNotebook(draft.notebookId) : null;
    const readOnly = inTrash();
    chips.appendChild(h(readOnly ? 'span' : 'button', { type: readOnly ? null : 'button', class: 'tagchip', onClick: readOnly ? null : chooseNotebook, 'aria-label': readOnly ? null : `Notebook: ${nb ? nb.name : 'tanpa notebook'}. Ketuk untuk mengganti.` },
      icon('book'), ' ', nb ? nb.name : 'Tanpa notebook'));
    for (const t of draft.tags || []) chips.appendChild(h('span', { class: 'tagchip' }, '#' + t));
    if (!readOnly) chips.appendChild(h('button', { type: 'button', class: 'tagchip', onClick: editTags }, (draft.tags || []).length ? 'Ubah tag' : '+ Tag'));
  }

  function renderContent(focusItemId) {
    clear(content);
    const ro = inTrash();
    title.readOnly = ro;
    if (draft.type === 'checklist') {
      const list = h('ul', { class: 'checklist', 'aria-label': 'Daftar periksa' });
      draft.items.forEach((it, idx) => {
        const cb = h('input', { type: 'checkbox', id: 'cb-' + it.id, checked: it.done, disabled: ro,
          onChange: e => {
            const next = data.applyDone(it, e.target.checked);
            changed();
            if (next) {
              // Item berulang: tidak dicoret, tanggalnya maju ke jadwal berikutnya.
              renderContent();
              const again = content.querySelector('#cb-' + CSS.escape(it.id));
              if (again) again.focus();
              toast(`Bagus! Berikutnya: ${fmtDue(next, it.hasTime)}.`);
              return;
            }
            row.classList.toggle('done', it.done);
          } });
        const txt = h('input', {
          type: 'text', value: it.text, 'aria-label': `Item ${idx + 1}`, readOnly: ro, maxlength: 1000, 'data-id': it.id,
          'aria-describedby': typeof it.due === 'number' ? 'due-' + it.id : null,
          onInput: e => { it.text = e.target.value; changed(); },
          onKeydown: e => {
            if (e.key === 'Enter') { e.preventDefault(); addItem(idx + 1); }
            else if (e.key === 'Backspace' && !e.target.value && draft.items.length > 1) {
              e.preventDefault();
              const prev = draft.items[idx - 1] || draft.items[idx + 1];
              draft.items.splice(idx, 1); changed(); renderContent(prev && prev.id);
            }
          }
        });
        if (ro) txt.readOnly = true;
        const row = h('li', { class: 'checkrow' + (it.done ? ' done' : '') },
          h('label', { class: 'box', for: 'cb-' + it.id }, cb, h('span', { class: 'sr-only' }, `Selesai: item ${idx + 1}`)),
          h('div', { class: 'itemmain' }, txt, dueLine(it, 'due-' + it.id)),
          ro ? null : iconButton({ icon: 'calendar', cls: 'duebtn' + (typeof it.due === 'number' ? ' set' : ''), label: `${typeof it.due === 'number' ? 'Ubah' : 'Atur'} tanggal item ${idx + 1}`, onClick: () => editDue(it) }),
          ro ? null : iconButton({ icon: 'close', label: `Hapus item ${idx + 1}`, onClick: () => { draft.items.splice(idx, 1); changed(); renderContent(); } })
        );
        list.appendChild(row);
      });
      content.appendChild(list);
      if (!ro) content.appendChild(h('button', { type: 'button', class: 'btn small ghost addrow', onClick: () => addItem(draft.items.length) }, icon('plus'), 'Tambah item'));
      if (focusItemId) {
        const target = content.querySelector(`input[data-id="${focusItemId}"]`);
        if (target) { target.focus(); target.setSelectionRange(target.value.length, target.value.length); }
      }
    } else {
      const body = h('textarea', {
        class: 'body', placeholder: 'Tulis catatanmu di sini…', 'aria-label': 'Isi catatan', readOnly: ro, maxlength: 50000,
        onInput: e => { draft.body = e.target.value; autoGrow(e.target); changed(); }
      });
      body.value = draft.body;
      content.appendChild(body);
      requestAnimationFrame(() => autoGrow(body));
    }
  }

  async function editDue(it) {
    const res = await dueDialog(it);
    if (!res) return;
    applyDue(it, res);
    changed();
    flush();
    renderContent();
    const btn = [...content.querySelectorAll('.duebtn')][draft.items.indexOf(it)];
    if (btn) btn.focus();
    if (res.clear) { toast('Tanggal dihapus.'); return; }
    toast(`${res.remind ? 'Pengingat dipasang' : 'Tanggal disimpan'}: ${fmtDue(it.due, it.hasTime)}.`);
    if (res.remind) await prepareNotifications();
  }

  function addItem(at) {
    const it = { id: data.newId(), text: '', done: false };
    draft.items.splice(at, 0, it);
    changed();
    renderContent(it.id);
  }

  function focusContent() {
    const t = content.querySelector('textarea, input[type="text"]');
    if (t) t.focus();
    else if (draft.type === 'checklist') addItem(0);
  }

  function renderAttachments() {
    clear(attachments);
    const list = draft.attachments || [];
    if (!list.length) return;
    attachments.appendChild(h('div', { class: 'attachments' }, list.map((a, i) => h('figure', null,
      h('img', { src: a.url, alt: `Gambar ${i + 1}`, loading: 'lazy' }),
      inTrash() ? null : h('figcaption', null, iconButton({ icon: 'trash', label: `Hapus gambar ${i + 1}`, onClick: async () => {
        const ok = await confirmDialog({ title: 'Hapus gambar?', message: 'Gambar ini akan dihapus dari catatan.', ok: 'Hapus gambar', danger: true });
        if (ok) { await data.removeImage(noteId, a.path); draft.attachments = data.getNote(noteId).attachments; renderAttachments(); }
      } }))
    ))));
  }

  function renderFooter() {
    footer.textContent = noteId ? `Diubah ${fmtDateTime(draft.editedAt)}` : '';
  }

  function refreshAll() {
    renderToolbar(); renderBanner(); renderChips(); renderContent(); renderAttachments(); renderFooter();
    requestAnimationFrame(() => autoGrow(title));
  }

  function toggleType() {
    if (draft.type === 'checklist') {
      draft.body = draft.items.map(i => i.text).filter(t => t.trim()).join('\n');
      draft.type = 'text';
    } else {
      const lines = draft.body.split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
      draft.items = (lines.length ? lines : ['']).map(t => ({ id: data.newId(), text: t, done: false }));
      draft.body = '';
      draft.type = 'checklist';
    }
    changed();
    renderToolbar();
    renderContent(draft.type === 'checklist' ? draft.items[draft.items.length - 1].id : null);
    if (draft.type === 'text') focusContent();
    toast(draft.type === 'checklist' ? 'Diubah menjadi checklist.' : 'Diubah menjadi teks.');
  }

  function chooseNotebook() {
    const nbs = data.allNotebooks();
    menuSheet({
      title: 'Pindah ke notebook',
      items: [
        { label: 'Tanpa notebook', checked: !draft.notebookId, run: () => setMeta({ notebookId: null }) },
        ...nbs.map(nb => ({ label: nb.name, checked: draft.notebookId === nb.id, run: () => setMeta({ notebookId: nb.id }) })),
        { label: 'Notebook baru…', icon: icon('plus'), run: async () => {
          const name = await promptDialog({ title: 'Notebook baru', label: 'Nama notebook', ok: 'Buat' });
          if (name) setMeta({ notebookId: data.createNotebook(name) });
        } }
      ]
    });
  }

  async function editTags() {
    const v = await promptDialog({ title: 'Tag', label: 'Tag catatan', value: (draft.tags || []).join(', '), hint: 'Pisahkan dengan koma. Contoh: belanja, penting', maxLength: 300 });
    if (v === null) return;
    const tags = [...new Set(v.split(',').map(data.normTag).filter(Boolean))].slice(0, 20);
    setMeta({ tags });
  }

  async function ensureSaved() {
    dirty = true;
    flush();
    if (!noteId) {
      // Catatan masih kosong: simpan dulu agar gambar bisa dilampirkan.
      noteId = data.createNote(draft);
      history.replaceState(null, '', '#/catatan/' + noteId);
      renderToolbar();
    }
    return noteId;
  }

  function pickImage() {
    const store = data.getStore();
    if (!store.canAttach) {
      toast('Masuk dengan akun untuk menambah gambar.');
      return;
    }
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      try {
        const id = await ensureSaved();
        toast('Mengunggah gambar…');
        await data.addImage(id, file);
        draft.attachments = data.getNote(id).attachments;
        renderAttachments();
        toast('Gambar ditambahkan.');
      } catch (e) {
        toast(e.message || 'Gambar gagal ditambahkan.');
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  function moreMenu() {
    menuSheet({
      title: 'Pilihan catatan',
      items: [
        { label: 'Pindah ke notebook', icon: icon('book'), run: chooseNotebook },
        { label: 'Atur tag', icon: icon('tag'), run: editTags },
        { label: 'Tambah gambar', icon: icon('image'), run: pickImage },
        { label: draft.archived ? 'Keluarkan dari arsip' : 'Arsipkan', icon: icon('archive'), run: async () => {
          await ensureSaved();
          const archived = !draft.archived;
          setMeta({ archived, pinned: archived ? false : draft.pinned });
          renderBanner();
          toast(archived ? 'Catatan diarsipkan.' : 'Dikeluarkan dari arsip.');
        } },
        { label: 'Hapus catatan', icon: icon('trash'), danger: true, run: async () => {
          const ok = await confirmDialog({ title: 'Pindahkan ke tempat sampah?', message: 'Catatan masih bisa dipulihkan dari Tempat sampah selama 30 hari.', ok: 'Ya, hapus', danger: true });
          if (!ok) return;
          clearTimeout(timer); dirty = false;
          if (noteId) {
            data.saveNote(noteId, draft);
            data.trashNote(noteId);
            const deletedId = noteId;
            toast('Catatan dipindah ke tempat sampah.', { label: 'Batalkan', run: () => data.restoreNote(deletedId) });
          }
          back('');
        } }
      ]
    });
  }

  refreshAll();
  if (!existing) setTimeout(() => title.focus(), 0);

  return {
    el,
    toolbar,
    noteId: () => noteId,
    // Dipanggil saat data berubah (mis. dari perangkat lain). Isi yang sedang
    // diketik tidak ditimpa; hanya diperbarui bila tidak ada perubahan lokal.
    update() {
      if (!noteId || dirty) return;
      const fresh = data.getNote(noteId);
      if (!fresh) return;
      if (fresh.editedAt > draft.editedAt || fresh.deletedAt !== draft.deletedAt || fresh.pinned !== draft.pinned || fresh.archived !== draft.archived || fresh.notebookId !== draft.notebookId) {
        const active = document.activeElement;
        const typing = active && el.contains(active) && (active.tagName === 'TEXTAREA' || active.type === 'text');
        draft = structuredClone(fresh); delete draft.id;
        if (typing) { renderToolbar(); renderChips(); renderBanner(); renderFooter(); }
        else { title.value = draft.title; refreshAll(); }
      } else {
        renderChips();
      }
    },
    destroy: flush
  };
}
