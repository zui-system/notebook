// Pengaturan: tampilan (ukuran huruf, tema, kontras, label), cadangan, akun.
import { h, icon, clear, toast, fmtDateTime, fmtSize } from '../dom.js';
import { settings, updateSettings, FONT_SIZES, THEMES } from '../settings.js';
import * as data from '../data.js';
import { confirmDialog } from './dialogs.js';
import { APP_VERSION } from '../config.js';
import { accountHelp } from './auth.js';
import * as reminders from '../reminders.js';

export function settingsView({ onSignOut, onSignIn }) {
  const el = h('section', { class: 'settings', 'aria-labelledby': 'set-title' });
  const backupList = h('div');

  function radioGroup({ name, legend, options, value, onPick, four }) {
    return h('fieldset', { class: 'seg' + (four ? ' four' : '') },
      h('legend', null, legend),
      options.map(o => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: o.id, checked: o.id === value, onChange: () => onPick(o.id) }),
        h('span', null, ...o.content)
      ))
    );
  }

  function toggle({ id, label, help, checked, onChange }) {
    return h('label', { class: 'switch', for: id },
      h('span', { class: 'txt' }, h('span', null, label), help ? h('small', null, help) : null),
      h('input', { type: 'checkbox', role: 'switch', id, checked, onChange: e => onChange(e.target.checked) })
    );
  }

  function render() {
    clear(el);
    const s = settings;
    const store = data.getStore();
    el.appendChild(h('div', { class: 'viewhead' }, h('h1', { id: 'set-title' }, 'Pengaturan')));

    // --- Tampilan ---
    el.appendChild(h('section', { 'aria-labelledby': 'set-look' },
      h('h2', { id: 'set-look' }, 'Tampilan'),
      radioGroup({
        name: 'fs', legend: 'Ukuran huruf', value: s.fontSize, four: true,
        options: FONT_SIZES.map(f => ({ id: f.id, content: [h('span', { class: 'aa', style: `font-size:${f.px + 4}px`, 'aria-hidden': 'true' }, 'Aa'), f.label] })),
        onPick: v => { updateSettings({ fontSize: v }); render(); focusOn(`input[name="fs"][value="${v}"]`); }
      }),
      h('div', { class: 'preview', 'aria-label': 'Pratinjau ukuran huruf' },
        h('strong', null, 'Pratinjau'),
        'Belanja besok pagi: beras, telur, dan sayur bayam. Jangan lupa bayar listrik.'),
      radioGroup({
        name: 'theme', legend: 'Tema', value: s.theme,
        options: THEMES.map(t => ({ id: t.id, content: [h('span', { class: 'swatch', 'aria-hidden': 'true' }, t.colors.map(c => h('i', { style: `background:${c}` }))), t.label] })),
        onPick: v => { updateSettings({ theme: v }); render(); focusOn(`input[name="theme"][value="${v}"]`); }
      }),
      toggle({ id: 'hc', label: 'Kontras tinggi', help: 'Teks dan garis lebih tegas, lebih mudah dibaca.', checked: s.highContrast, onChange: v => { updateSettings({ highContrast: v }); } }),
      toggle({ id: 'lbl', label: 'Tampilkan label tombol', help: 'Menampilkan tulisan di bawah setiap ikon.', checked: s.labels, onChange: v => { updateSettings({ labels: v }); } })
    ));

    // --- Pengingat ---
    el.appendChild(h('section', { 'aria-labelledby': 'set-rem' },
      h('h2', { id: 'set-rem' }, 'Pengingat'),
      toggle({ id: 'rem', label: 'Pengingat aktif', help: 'Matikan untuk menghentikan semua notifikasi pengingat. Tanggal pada item tetap tersimpan.', checked: s.reminders,
        onChange: v => { updateSettings({ reminders: v }); toast(v ? 'Pengingat dinyalakan.' : 'Semua pengingat dimatikan.'); render(); focusOn('#rem'); } }),
      s.reminders ? notifyStatus(store) : null
    ));

    // --- Cadangan ---
    const cloud = store.kind === 'cloud';
    el.appendChild(h('section', { 'aria-labelledby': 'set-backup' },
      h('h2', { id: 'set-backup' }, 'Cadangan'),
      h('p', { class: 'desc' }, cloud
        ? 'Catatan dicadangkan otomatis ke akunmu setiap minggu. 5 cadangan terbaru disimpan.'
        : 'Catatan dicadangkan otomatis di perangkat ini setiap minggu. Simpan juga ke file agar aman bila HP hilang atau rusak.'),
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'btn primary', onClick: async e => {
          const b = e.currentTarget; b.disabled = true;
          try { await data.backupNow(false); toast('Cadangan berhasil dibuat.'); loadBackups(); }
          catch (err) { toast(err.message || 'Cadangan gagal dibuat.'); }
          finally { b.disabled = false; }
        } }, icon('shield'), 'Cadangkan sekarang')
      ),
      backupList,
      h('div', { class: 'btnrow' },
        h('button', { type: 'button', class: 'btn', onClick: exportFile }, icon('download'), 'Simpan ke file'),
        h('button', { type: 'button', class: 'btn', onClick: importFile }, icon('upload'), 'Pulihkan dari file')
      )
    ));
    loadBackups();

    // --- Akun ---
    const user = store.user;
    const plan = (store.profile && store.profile.plan) === 'plus' ? 'Plus' : 'Gratis';
    el.appendChild(h('section', { 'aria-labelledby': 'set-acc' },
      h('h2', { id: 'set-acc' }, 'Akun'),
      cloud
        ? h('dl', { class: 'kv' },
            h('dt', null, 'Nama'), h('dd', null, user.displayName || '—'),
            h('dt', null, 'Email'), h('dd', null, user.email || '—'),
            h('dt', null, 'Paket'), h('dd', null, h('span', { class: 'badge' }, plan)))
        : h('p', { class: 'desc' }, 'Kamu memakai Zui Notebook tanpa akun. Catatan hanya tersimpan di perangkat ini. Masuk agar catatan aman dan tersinkron di semua perangkat.'),
      h('div', { class: 'btnrow' },
        cloud
          ? h('button', { type: 'button', class: 'btn', onClick: onSignOut }, icon('logout'), 'Keluar')
          : h('button', { type: 'button', class: 'btn primary', onClick: onSignIn }, icon('cloud'), 'Masuk atau daftar'),
        h('button', { type: 'button', class: 'btn ghost', onClick: accountHelp }, icon('help'), 'Bantuan akun')
      )
    ));

    el.appendChild(h('p', { class: 'note-small', style: 'text-align:center' }, `Zui Notebook versi ${APP_VERSION}`));
  }

  // Keadaan izin notifikasi di perangkat ini, dengan langkah yang jelas bila belum bisa.
  function notifyStatus(store) {
    const p = reminders.permission();
    const box = h('div', { class: 'stack-sm' });
    const cloudPush = store.kind === 'cloud' && reminders.pushConfigured();
    if (p === 'unsupported') {
      box.appendChild(h('p', { class: 'desc' }, reminders.isIOS() && !reminders.isStandalone()
        ? 'Di iPhone dan iPad, notifikasi hanya bisa muncul bila Zui Notebook dipasang di Layar Utama: ketuk tombol Bagikan di Safari, pilih "Tambah ke Layar Utama", lalu buka Zui Notebook dari ikon itu.'
        : 'Perangkat atau browser ini belum bisa menampilkan notifikasi. Tugas bertanggal tetap terlihat di "Hari ini".'));
    } else if (p === 'denied') {
      box.appendChild(h('p', { class: 'desc' }, 'Notifikasi diblokir untuk Zui Notebook di perangkat ini. Buka pengaturan browser atau HP, cari Zui Notebook, lalu izinkan notifikasi.'));
    } else if (p === 'default') {
      box.appendChild(h('p', { class: 'desc' }, 'Izinkan notifikasi agar pengingat bisa muncul di perangkat ini.'));
      box.appendChild(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onClick: async () => {
        const r = await reminders.askPermission();
        if (r === 'granted') { await reminders.enablePush(store); toast('Notifikasi diizinkan.'); }
        render(); focusOn('#rem');
      } }, icon('bell'), 'Izinkan notifikasi')));
    } else {
      box.appendChild(h('p', { class: 'desc' }, cloudPush
        ? 'Notifikasi diizinkan. Pengingat tetap datang walau Zui Notebook sedang ditutup.'
        : store.kind === 'cloud'
          ? 'Notifikasi diizinkan. Pengingat muncul selama Zui Notebook terbuka (juga di latar belakang).'
          : 'Notifikasi diizinkan. Tanpa akun, pengingat hanya muncul selama Zui Notebook terbuka. Masuk dengan akun agar pengingat tetap datang saat aplikasi ditutup.'));
      box.appendChild(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn', onClick: async () => {
        const ok = await reminders.showReminder({ noteId: '', itemId: 'uji', title: 'Zui Notebook', text: 'Contoh pengingat', tz: new Date().getTimezoneOffset() }, Date.now(), { test: true });
        toast(ok ? 'Notifikasi contoh dikirim.' : 'Notifikasi contoh gagal ditampilkan.');
      } }, icon('bell'), 'Coba notifikasi')));
    }
    return box;
  }

  function focusOn(sel) { const n = el.querySelector(sel); if (n) n.focus(); }

  let loadSeq = 0;
  async function loadBackups() {
    const mine = ++loadSeq;
    let list = [];
    try { list = await data.listBackups(); }
    catch {
      if (mine !== loadSeq) return;
      clear(backupList).appendChild(h('p', { class: 'note-small' }, 'Daftar cadangan belum bisa dimuat (perlu internet).'));
      return;
    }
    // Abaikan hasil lama bila sudah ada permintaan yang lebih baru.
    if (mine !== loadSeq) return;
    clear(backupList);
    if (!list.length) { backupList.appendChild(h('p', { class: 'note-small' }, 'Belum ada cadangan.')); return; }
    backupList.appendChild(h('p', { class: 'note-small', style: 'margin:0' }, `Terakhir dicadangkan: ${fmtDateTime(list[0].createdAt)}`));
    backupList.appendChild(h('ul', { class: 'backups', 'aria-label': 'Daftar cadangan' }, list.map(b => h('li', null,
      h('span', null, fmtDateTime(b.createdAt), h('small', null, `${b.count} catatan · ${fmtSize(b.size)}${b.auto ? ' · otomatis' : ''}`)),
      h('button', { type: 'button', class: 'btn small', onClick: async () => {
        const ok = await confirmDialog({ title: 'Pulihkan cadangan ini?', message: `Catatan dari ${fmtDateTime(b.createdAt)} akan dikembalikan. Catatan yang sama akan ditimpa versi cadangan; catatan lain tetap aman.`, ok: 'Pulihkan' });
        if (!ok) return;
        try { const n = await data.restoreBackup(b.id); toast(`${n} catatan dipulihkan.`); }
        catch (e) { toast(e.message || 'Cadangan gagal dipulihkan.'); }
      } }, icon('restore'), 'Pulihkan')
    ))));
  }

  function exportFile() {
    const snap = data.snapshot();
    const blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' });
    const d = new Date();
    const name = `zui-notebook-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`File cadangan disimpan: ${name}`);
  }

  function importFile() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('File terlalu besar.');
        const snap = data.validateSnapshot(JSON.parse(await f.text()));
        const ok = await confirmDialog({ title: 'Pulihkan dari file?', message: `File berisi ${snap.notes.length} catatan. Catatan yang sama akan ditimpa versi di file; catatan lain tetap aman.`, ok: 'Pulihkan' });
        if (!ok) return;
        const n = await data.restoreSnapshot(snap);
        toast(`${n} catatan dipulihkan.`);
      } catch (e) {
        toast(e instanceof SyntaxError ? 'File ini bukan cadangan Zui Notebook.' : (e.message || 'File gagal dibaca.'));
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  render();
  return { el, update: () => {} };
}
