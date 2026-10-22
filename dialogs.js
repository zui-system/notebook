// Dialog yang bisa dipakai dengan keyboard dan pembaca layar (elemen <dialog> bawaan browser).
import { h } from '../dom.js';

let seq = 0;

export function openDialog(build, { cls = '', onClose, labelledBy } = {}) {
  const id = 'dlg' + (++seq);
  const dlg = h('dialog', { class: cls, 'aria-labelledby': labelledBy || id + '-t' });
  const returnFocus = document.activeElement;
  const close = (value) => { if (dlg.open) dlg.close(value === undefined ? '' : String(value)); };
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose(dlg.returnValue);
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  });
  // Ketuk area gelap di luar dialog untuk menutup.
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.appendChild(build({ close, titleId: id + '-t' }));
  document.body.appendChild(dlg);
  dlg.showModal();
  const auto = dlg.querySelector('[autofocus]');
  if (auto) auto.focus();
  return { dlg, close };
}

export function confirmDialog({ title, message, ok = 'Ya', cancel = 'Batal', danger = false }) {
  return new Promise(resolve => {
    let answer = false;
    openDialog(({ close, titleId }) => h('div', { class: 'dlg' },
      h('h2', { id: titleId }, title),
      message ? h('p', null, message) : null,
      h('div', { class: 'buttons' },
        // Fokus awal di "Batal" agar tidak terhapus tanpa sengaja.
        h('button', { type: 'button', class: 'btn', autofocus: true, onClick: () => close() }, cancel),
        h('button', { type: 'button', class: 'btn ' + (danger ? 'danger' : 'primary'), onClick: () => { answer = true; close(); } }, ok)
      )
    ), { onClose: () => resolve(answer) });
  });
}

export function promptDialog({ title, label, value = '', ok = 'Simpan', hint, maxLength = 60 }) {
  return new Promise(resolve => {
    let answer = null;
    openDialog(({ close, titleId }) => {
      const input = h('input', { class: 'input', id: 'prompt-in', value, maxlength: maxLength, autofocus: true, autocomplete: 'off' });
      const form = h('form', { class: 'dlg', onSubmit: e => { e.preventDefault(); answer = input.value.trim(); close(); } },
        h('h2', { id: titleId }, title),
        h('div', { class: 'field' },
          h('label', { for: 'prompt-in' }, label),
          input,
          hint ? h('span', { class: 'hint' }, hint) : null
        ),
        h('div', { class: 'buttons' },
          h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Batal'),
          h('button', { type: 'submit', class: 'btn primary' }, ok)
        )
      );
      setTimeout(() => { input.select(); }, 0);
      return form;
    }, { onClose: () => resolve(answer) });
  });
}

// Lembar pilihan (menu) — daftar tombol besar.
export function menuSheet({ title, items }) {
  return openDialog(({ close, titleId }) => h('div', { class: 'dlg' },
    h('h2', { id: titleId }, title),
    h('ul', { class: 'menu-list' }, items.filter(Boolean).map((it, i) => h('li', null,
      h('button', {
        type: 'button',
        class: 'menu-item' + (it.danger ? ' danger' : ''),
        role: it.checked !== undefined ? 'menuitemradio' : null,
        'aria-checked': it.checked !== undefined ? String(!!it.checked) : null,
        autofocus: i === 0 ? true : null,
        onClick: () => { close(); it.run(); }
      }, it.icon || null, h('span', { class: 'grow' }, it.label), it.hint ? h('span', { class: 'n' }, it.hint) : null)
    ))),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn block', onClick: () => close() }, 'Tutup'))
  ), { cls: 'sheet' });
}
