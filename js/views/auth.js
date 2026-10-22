// Layar pengenalan (3 langkah), masuk, bantuan akun, dan profil.
import { h, icon, clear, toast } from '../dom.js';
import { settings, updateSettings, FONT_SIZES } from '../settings.js';
import { openDialog } from './dialogs.js';
import { SUPPORT_EMAIL } from '../config.js';

// ---------- Pengenalan ----------
export function onboardingView({ onDone }) {
  let step = 0;
  const el = h('main', { class: 'onb', id: 'main', tabindex: '-1' });
  const steps = [
    () => [
      h('div', { class: 'art', 'aria-hidden': 'true' }, icon('notes')),
      h('h1', { id: 'onb-t' }, 'Selamat datang di Zui Notebook'),
      h('p', null, 'Tempat sederhana untuk mencatat apa saja: belanjaan, ide, pekerjaan, atau resep.'),
      h('p', null, 'Ketuk ikon pena untuk menulis. Semua tersimpan otomatis.')
    ],
    () => [
      h('div', { class: 'art', 'aria-hidden': 'true' }, icon('cloud')),
      h('h1', { id: 'onb-t' }, 'Aman dan selalu ada'),
      h('p', null, 'Catatan tetap bisa dibuka tanpa internet, lalu tersinkron sendiri ke semua perangkatmu.'),
      h('p', null, 'Catatan yang dihapus masih bisa dipulihkan selama 30 hari.')
    ],
    () => [
      h('div', { class: 'art', 'aria-hidden': 'true' }, icon('textsize')),
      h('h1', { id: 'onb-t' }, 'Pilih ukuran huruf'),
      h('p', null, 'Pilih yang paling nyaman dibaca. Bisa diubah kapan saja di Pengaturan.'),
      h('fieldset', { class: 'seg' },
        h('legend', { class: 'sr-only' }, 'Ukuran huruf'),
        FONT_SIZES.map(f => h('label', { class: 'opt' },
          h('input', { type: 'radio', name: 'onb-fs', value: f.id, checked: settings.fontSize === f.id, onChange: () => { updateSettings({ fontSize: f.id }); render(); el.querySelector(`input[value="${f.id}"]`).focus(); } }),
          h('span', null, h('span', { class: 'aa', style: `font-size:${f.px + 4}px`, 'aria-hidden': 'true' }, 'Aa'), f.label)
        ))
      )
    ]
  ];

  function render() {
    clear(el);
    el.setAttribute('aria-labelledby', 'onb-t');
    el.appendChild(h('div', { class: 'top' }, ...steps[step]()));
    el.appendChild(h('div', { class: 'steps', role: 'img', 'aria-label': `Langkah ${step + 1} dari 3` }, [0, 1, 2].map(i => h('i', { class: i === step ? 'on' : '' }))));
    el.appendChild(h('div', { class: 'nav' },
      step > 0
        ? h('button', { type: 'button', class: 'btn', onClick: () => { step--; render(); focusTitle(); } }, 'Kembali')
        : h('button', { type: 'button', class: 'btn ghost', onClick: onDone }, 'Lewati'),
      h('button', { type: 'button', class: 'btn primary', onClick: () => { if (step < 2) { step++; render(); focusTitle(); } else onDone(); } }, step < 2 ? 'Lanjut' : 'Mulai')
    ));
  }
  function focusTitle() { const t = el.querySelector('h1'); if (t) { t.tabIndex = -1; t.focus(); } }
  render();
  return el;
}

// ---------- Masuk ----------
export function loginView({ firebaseReady, onGoogle, onEmail, onGuest, emailSentTo }) {
  const el = h('main', { class: 'auth', id: 'main', 'aria-labelledby': 'auth-t' });
  let mode = emailSentTo ? 'sent' : 'choose';
  let sentTo = emailSentTo || '';
  let error = '';

  function render() {
    clear(el);
    const top = h('div', { class: 'top' },
      h('div', { style:'width:3.6rem;height:3.6rem;border-radius:1rem;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center', 'aria-hidden': 'true' }, icon('notes')),
      h('h1', { id: 'auth-t' }, mode === 'sent' ? 'Cek email kamu' : 'Masuk ke Zui Notebook'),
      h('p', null, mode === 'sent'
        ? `Kami mengirim tautan masuk ke ${sentTo}. Buka email itu di perangkat ini, lalu ketuk tautannya.`
        : 'Masuk supaya catatanmu aman dan tersinkron di HP, tablet, dan komputer.')
    );
    el.appendChild(top);
    if (error) el.appendChild(h('p', { class: 'err', role: 'alert' }, error));

    const stack = h('div', { class: 'stack' });
    if (mode === 'choose') {
      stack.appendChild(h('button', { type: 'button', class: 'btn block', disabled: !firebaseReady, onClick: async () => { error = ''; try { await onGoogle(); } catch (e) { error = e.message; render(); } } }, icon('google'), 'Masuk dengan Google'));
      stack.appendChild(h('button', { type: 'button', class: 'btn block', disabled: !firebaseReady, onClick: () => { mode = 'email'; error = ''; render(); el.querySelector('#email').focus(); } }, icon('mail'), 'Masuk lewat email'));
      if (!firebaseReady) stack.appendChild(h('p', { class: 'note-small' }, 'Masuk dengan akun belum diaktifkan di versi ini.'));
      stack.appendChild(h('div', { class: 'or' }, 'atau'));
      stack.appendChild(h('button', { type: 'button', class: 'btn ghost block', onClick: onGuest }, 'Coba tanpa akun'));
      stack.appendChild(h('p', { class: 'note-small', style: 'text-align:center' }, 'Tanpa akun, catatan hanya tersimpan di perangkat ini.'));
    } else if (mode === 'email') {
      const input = h('input', { class: 'input', type: 'email', id: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: localStorage.getItem('zn-email') || '' });
      stack.appendChild(h('form', { class: 'stack', onSubmit: async e => {
        e.preventDefault();
        const email = input.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { error = 'Alamat email belum benar. Contoh: nama@gmail.com'; render(); return; }
        const btn = e.submitter || el.querySelector('button[type=submit]');
        if (btn) btn.disabled = true;
        try { await onEmail(email); sentTo = email; mode = 'sent'; error = ''; }
        catch (err) { error = err.message; }
        render();
      } },
        h('div', { class: 'field' }, h('label', { for: 'email' }, 'Alamat email'), input, h('span', { class: 'hint' }, 'Kami kirim tautan untuk masuk. Tidak perlu kata sandi.')),
        h('button', { type: 'submit', class: 'btn primary block' }, 'Kirim tautan masuk'),
        h('button', { type: 'button', class: 'btn ghost block', onClick: () => { mode = 'choose'; error = ''; render(); } }, 'Kembali')
      ));
    } else {
      stack.appendChild(h('button', { type: 'button', class: 'btn block', onClick: async () => { try { await onEmail(sentTo); toast('Tautan baru sudah dikirim.'); } catch (e) { error = e.message; render(); } } }, 'Kirim ulang tautan'));
      stack.appendChild(h('button', { type: 'button', class: 'btn ghost block', onClick: () => { mode = 'email'; render(); } }, 'Pakai email lain'));
      stack.appendChild(h('p', { class: 'note-small' }, 'Tidak ada di kotak masuk? Periksa folder Spam atau Promosi. Tautan hanya bisa dipakai satu kali.'));
    }
    el.appendChild(stack);
    el.appendChild(h('button', { type: 'button', class: 'linkbtn', style: 'align-self:center', onClick: accountHelp }, 'Tidak bisa masuk?'));
  }
  render();
  return el;
}

// ---------- Bantuan pemulihan akun ----------
export function accountHelp() {
  openDialog(({ close, titleId }) => h('div', { class: 'dlg' },
    h('h2', { id: titleId }, 'Tidak bisa masuk?'),
    h('ol', { style: 'margin:0;padding-left:1.3em;display:flex;flex-direction:column;gap:10px' },
      h('li', null, h('strong', null, 'Pakai cara masuk yang sama. '), 'Catatan tersimpan di akun, bukan di HP. Masuk dengan akun Google atau email yang sama seperti sebelumnya.'),
      h('li', null, h('strong', null, 'Lupa akun mana? '), 'Coba "Masuk lewat email" dengan alamat Gmail kamu. Akun Google dan email yang sama akan terhubung ke catatan yang sama.'),
      h('li', null, h('strong', null, 'Tautan email tidak berfungsi? '), 'Tautan hanya berlaku satu kali dan sebentar. Minta tautan baru, lalu buka di perangkat yang sama.'),
      h('li', null, h('strong', null, 'Ganti HP atau HP hilang? '), 'Cukup pasang Zui Notebook di perangkat baru lalu masuk lagi. Semua catatan akan muncul kembali.'),
      h('li', null, h('strong', null, 'Lupa sandi Google? '), h('a', { href: 'https://accounts.google.com/signin/recovery', target: '_blank', rel: 'noopener' }, 'Pulihkan akun Google'), ' lewat halaman resmi Google.'),
      SUPPORT_EMAIL ? h('li', null, h('strong', null, 'Masih belum bisa? '), 'Hubungi kami di ', h('a', { href: 'mailto:' + SUPPORT_EMAIL }, SUPPORT_EMAIL), '.') : null
    ),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn primary', autofocus: true, onClick: () => close() }, 'Mengerti'))
  ));
}

// ---------- Profil ----------
export function profileDialog({ store, onSettings, onSignOut, onSignIn }) {
  const user = store.user;
  const cloud = store.kind === 'cloud';
  const plan = (store.profile && store.profile.plan) === 'plus' ? 'Plus' : 'Gratis';
  openDialog(({ close, titleId }) => h('div', { class: 'dlg' },
    h('div', { style: 'display:flex;gap:14px;align-items:center' },
      avatar(user, 'width:3rem;height:3rem;font-size:1.2rem'),
      h('div', null,
        h('h2', { id: titleId }, cloud ? (user.displayName || user.email || 'Akun saya') : 'Tanpa akun'),
        cloud ? h('p', { class: 'note-small' }, user.email || '') : h('p', { class: 'note-small' }, 'Catatan hanya di perangkat ini')
      )
    ),
    cloud ? h('p', null, 'Paket: ', h('span', { class: 'badge' }, plan)) : null,
    h('ul', { class: 'menu-list' },
      h('li', null, h('button', { type: 'button', class: 'menu-item', onClick: () => { close(); onSettings(); } }, icon('gear'), h('span', { class: 'grow' }, 'Pengaturan'))),
      h('li', null, h('button', { type: 'button', class: 'menu-item', onClick: () => { close(); accountHelp(); } }, icon('help'), h('span', { class: 'grow' }, 'Bantuan akun'))),
      cloud
        ? h('li', null, h('button', { type: 'button', class: 'menu-item', onClick: () => { close(); onSignOut(); } }, icon('logout'), h('span', { class: 'grow' }, 'Keluar')))
        : h('li', null, h('button', { type: 'button', class: 'menu-item', onClick: () => { close(); onSignIn(); } }, icon('cloud'), h('span', { class: 'grow' }, 'Masuk atau daftar')))
    ),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn block', onClick: () => close() }, 'Tutup'))
  ));
}

export function avatar(user, style) {
  const name = (user && (user.displayName || user.email)) || '';
  const letter = name ? name.trim()[0].toUpperCase() : '';
  const el = h('span', { class: 'avatar', style, 'aria-hidden': 'true' });
  if (user && user.photoURL) {
    const img = h('img', { src: user.photoURL, alt: '', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); el.textContent = letter; });
    el.appendChild(img);
  } else if (letter) el.textContent = letter;
  else el.appendChild(icon('user'));
  return el;
}
