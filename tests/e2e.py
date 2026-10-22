"""Uji ujung-ke-ujung Zui Notebook (mode tanpa akun) dengan Playwright.

Jalankan dari folder proyek:
    python3 -m http.server 5173 &
    python3 tests/e2e.py
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
results = []
errors = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("LULUS " if cond else "GAGAL ") + name + (f" — {detail}" if detail else ""))


def lum(hex_):
    hex_ = hex_.strip().lstrip("#")
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    # Huruf Google tidak bisa dijangkau dari lingkungan uji; blokir agar tidak memperlambat.
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    # Kegagalan muat file selain huruf Google (yang sengaja diblokir) dicatat sebagai error.
    page.on("response", lambda r: errors.append(f"{r.status} {r.url}") if r.status >= 400 and "fonts.g" not in r.url else None)

    # ---------- Muat pertama ----------
    t0 = time.time()
    page.goto(BASE)
    page.get_by_role("heading", name="Selamat datang di Zui Notebook").wait_for()
    first_load = (time.time() - t0) * 1000
    check("Pengenalan tampil saat pertama dibuka", True, f"{first_load:.0f} ms")
    page.screenshot(path="tests/shots/01-onboarding.png")

    page.get_by_role("button", name="Lanjut").click()
    page.get_by_role("heading", name="Aman dan selalu ada").wait_for()
    page.get_by_role("button", name="Lanjut").click()
    page.get_by_role("radio", name="Besar", exact=True).check()
    check("Ukuran huruf langsung berubah di pengenalan", page.evaluate("document.documentElement.dataset.fs") == "besar")
    page.screenshot(path="tests/shots/02-onboarding-font.png")
    page.get_by_role("button", name="Mulai").click()

    # ---------- Masuk tanpa akun ----------
    page.get_by_role("heading", name="Masuk ke Zui Notebook").wait_for()
    page.screenshot(path="tests/shots/03-login.png")
    page.get_by_role("button", name="Coba tanpa akun").click()
    page.locator(".home h1").wait_for()
    check("Beranda kosong dengan sapaan", page.locator(".home h1").inner_text().startswith("Selamat"))
    page.screenshot(path="tests/shots/04-home.png")

    # ---------- Catatan contoh ----------
    page.locator("#btn-menu").click()
    page.locator("dialog.drawer").wait_for()
    page.screenshot(path="tests/shots/05-drawer.png")
    check("Pengaturan ada di bagian bawah menu", page.locator("dialog.drawer .dfoot").get_by_text("Pengaturan").count() == 1)
    page.locator("dialog.drawer").get_by_role("link", name="Semua catatan").click()
    page.get_by_role("heading", name="Semua catatan").wait_for()
    check("Ada 1 catatan contoh", page.locator(".notes > li").count() == 1)

    # ---------- Catatan baru (1 ketukan lalu mengetik) ----------
    page.locator("#btn-new").click()
    page.get_by_label("Judul catatan").fill("Belanja besok")
    page.get_by_label("Isi catatan").fill("beras 5 kg\ntelur\nsayur bayam")
    page.wait_for_timeout(600)
    check("URL berganti ke catatan setelah mulai mengetik", "#/catatan/" in page.url)
    page.screenshot(path="tests/shots/06-editor.png")
    page.get_by_role("button", name="Kembali").click()
    page.go_back() if "#/catatan" in page.url else None

    # ---------- Checklist ----------
    page.locator("#btn-new").click()
    page.get_by_label("Judul catatan").fill("Obat ibu")
    page.get_by_role("button", name="Jadikan checklist").click()
    page.get_by_label("Item 1", exact=True).fill("Vitamin pagi")
    page.keyboard.press("Enter")
    page.get_by_label("Item 2", exact=True).fill("Obat sore")
    page.get_by_role("checkbox", name="Selesai: item 1").check()
    page.wait_for_timeout(600)
    page.screenshot(path="tests/shots/07-checklist.png")
    check("Checklist: 2 item, 1 dicentang", page.locator(".checkrow").count() == 2 and page.locator(".checkrow.done").count() == 1)

    # Sematkan
    page.get_by_role("button", name="Sematkan").click()
    check("Tombol sematkan berstatus aktif", page.get_by_role("button", name="Lepas sematan").get_attribute("aria-pressed") == "true")
    page.get_by_role("button", name="Kembali").click()

    # ---------- Notebook lewat menu ----------
    page.locator("#btn-menu").click()
    page.get_by_role("button", name="Notebook baru").click()
    page.get_by_label("Nama notebook").fill("Rumah")
    page.get_by_role("button", name="Buat").click()
    page.get_by_role("heading", name="Rumah").wait_for()
    page.get_by_role("button", name="Tulis di sini").click()
    page.get_by_label("Judul catatan").fill("Tagihan listrik")
    page.wait_for_timeout(600)
    check("Catatan baru masuk ke notebook Rumah", page.locator(".chips").inner_text().find("Rumah") >= 0)
    # Tag
    page.get_by_role("button", name="+ Tag").click()
    page.get_by_label("Tag catatan").fill("penting, bulanan")
    page.get_by_role("button", name="Simpan").click()
    page.locator(".chips").get_by_text("#penting").wait_for(timeout=3000)
    check("Tag tersimpan", page.locator(".chips").inner_text().find("#penting") >= 0)
    page.get_by_role("button", name="Kembali").click()

    # ---------- Pencarian lokal ----------
    page.locator("#btn-menu").click()
    page.locator("dialog.drawer .dsearch").click()
    t = time.time()
    page.get_by_role("searchbox").fill("bay")
    page.get_by_text("1 catatan ditemukan").wait_for()
    search_ms = (time.time() - t) * 1000
    check("Pencarian awalan kata 'bay' menemukan 'bayam'", page.locator(".notes .card h2").first.inner_text() == "Belanja besok", f"{search_ms:.0f} ms")
    page.get_by_role("searchbox").fill("penting")
    page.get_by_text("1 catatan ditemukan").wait_for()
    check("Pencarian menemukan berdasarkan tag", page.locator(".notes .card h2").first.inner_text() == "Tagihan listrik")
    page.screenshot(path="tests/shots/08-search.png")

    # ---------- Hapus dengan konfirmasi, lalu pulihkan ----------
    page.locator(".notes .card").first.click()
    page.get_by_role("button", name="Pilihan lain").click()
    page.get_by_role("button", name="Hapus catatan").click()
    dlg = page.locator("dialog[open]")
    check("Konfirmasi muncul sebelum menghapus", dlg.get_by_text("Pindahkan ke tempat sampah?").count() == 1)
    check("Fokus awal di tombol Batal (aman)", page.evaluate("document.activeElement.textContent") == "Batal")
    page.screenshot(path="tests/shots/09-confirm.png")
    dlg.get_by_role("button", name="Ya, hapus").click()
    page.wait_for_url("**#/cari")
    page.goto(BASE + "#/sampah")
    page.get_by_role("heading", name="Tempat sampah").wait_for()
    check("Catatan ada di tempat sampah dengan sisa 30 hari", page.get_by_text("Terhapus otomatis dalam 30 hari").count() == 1)
    page.screenshot(path="tests/shots/10-trash.png")
    page.get_by_role("button", name="Pulihkan").click()
    page.wait_for_timeout(200)
    check("Catatan dipulihkan dari tempat sampah", page.get_by_text("Tempat sampah kosong.").count() == 1)

    # Penghapusan otomatis setelah 30 hari
    page.evaluate("""async () => {
      const d = window.__zn.data; const id = d.createNote(d.blankNote({title:'Lama sekali'}));
      d.updateNote(id, {deletedAt: Date.now() - 31*86400000}, {touch:false});
      await d.purgeTrash(); window.__oldGone = !d.getNote(id);
    }""")
    check("Catatan >30 hari di sampah terhapus otomatis", page.evaluate("window.__oldGone"))

    # ---------- Pengaturan ----------
    page.goto(BASE + "#/pengaturan")
    page.get_by_role("heading", name="Pengaturan").wait_for()
    page.get_by_role("radio", name="Sangat besar").check()
    check("Ukuran 'sangat besar' langsung berlaku", page.evaluate("getComputedStyle(document.documentElement).fontSize") == "24px")
    check("Label tombol otomatis muncul di 'sangat besar'", page.evaluate("document.documentElement.dataset.labels") == "on")
    page.screenshot(path="tests/shots/11-settings-xl.png", full_page=True)
    page.get_by_role("radio", name="Sedang").check()
    page.get_by_role("radio", name="Gelap Tenang").check()
    check("Tema gelap aktif", page.evaluate("document.documentElement.dataset.theme") == "gelap")
    page.screenshot(path="tests/shots/12-settings-dark.png", full_page=True)
    page.get_by_role("switch", name="Kontras tinggi").check()
    check("Kontras tinggi aktif", page.evaluate("document.documentElement.dataset.contrast") == "tinggi")
    page.get_by_role("switch", name="Kontras tinggi").uncheck()
    page.get_by_role("radio", name="Ceria Lembut").check()
    page.goto(BASE + "#/")
    page.locator(".home h1").wait_for()
    page.screenshot(path="tests/shots/13-home-ceria.png")
    page.goto(BASE + "#/pengaturan")
    page.get_by_role("radio", name="Terang Tenang").check()

    # Cadangan
    page.get_by_role("button", name="Cadangkan sekarang").click()
    page.locator(".backups li").first.wait_for()
    check("Cadangan dibuat dan tampil di daftar", page.locator(".backups li").count() >= 1)

    # Pulihkan dari cadangan setelah catatan dihapus permanen
    restored = page.evaluate("""async () => {
      const d = window.__zn.data; const n = d.listNotes('semua').find(x => x.title === 'Belanja besok');
      await d.deleteForever(n.id); const gone = !d.getNote(n.id);
      const list = await d.listBackups(); await d.restoreBackup(list[0].id);
      return gone && !!d.getNote(n.id);
    }""")
    check("Catatan yang terhapus kembali setelah cadangan dipulihkan", restored)

    # ---------- Keyboard ----------
    page.goto(BASE + "#/")
    page.locator(".home h1").wait_for()
    page.keyboard.press("Tab")  # tautan lompat
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement.id")
    page.keyboard.press("Enter")
    opened = page.locator("dialog.drawer[open]").count() == 1
    page.keyboard.press("Escape")
    closed = page.locator("dialog.drawer[open]").count() == 0
    check("Menu bisa dibuka dan ditutup dengan keyboard", focused == "btn-menu" and opened and closed, f"fokus={focused}")

    # Semua tombol punya nama yang bisa dibaca pembaca layar dan cukup besar
    page.locator("#btn-menu").click()
    info = page.evaluate("""() => [...document.querySelectorAll('button, a.menu-item, [role=switch]')].filter(b => b.offsetParent || b.closest('dialog[open]')).map(b => {
      const r = b.getBoundingClientRect(); return {name: (b.innerText || b.getAttribute('aria-label') || '').trim(), w: r.width, h: r.height};
    })""")
    unnamed = [i for i in info if not i["name"]]
    small = [i for i in info if i["h"] and i["h"] < 44]
    check("Semua tombol punya nama untuk pembaca layar", not unnamed, f"{len(info)} tombol diperiksa")
    check("Semua tombol setinggi minimal 44 px", not small, json.dumps(small[:3]))
    page.keyboard.press("Escape")

    # ---------- Kontras WCAG AA ----------
    pairs = {}
    for theme in ["terang", "gelap", "ceria"]:
        for hc in [False, True]:
            vals = page.evaluate(f"""() => {{ const r = document.documentElement; r.dataset.theme='{theme}'; r.dataset.contrast='{'tinggi' if hc else 'normal'}';
              const s = getComputedStyle(r); const g = n => s.getPropertyValue(n).trim();
              return {{bg:g('--bg'), surface:g('--surface'), ink:g('--ink'), muted:g('--muted'), accent:g('--accent'), accentInk:g('--accent-ink'), danger:g('--danger'), dangerInk:g('--danger-ink')}}; }}""")
            checks = {
                "teks": ratio(vals["ink"], vals["bg"]),
                "teks redup": min(ratio(vals["muted"], vals["bg"]), ratio(vals["muted"], vals["surface"])),
                "tombol utama": ratio(vals["accentInk"], vals["accent"]),
                "tombol hapus": ratio(vals["dangerInk"], vals["danger"]),
            }
            pairs[f"{theme}{' +kontras' if hc else ''}"] = {k: round(v, 1) for k, v in checks.items()}
    page.evaluate("() => { const r=document.documentElement; r.dataset.theme='terang'; r.dataset.contrast='normal'; }")
    worst = min(v for d in pairs.values() for v in d.values())
    check("Kontras WCAG AA (≥ 4.5:1) di semua tema", worst >= 4.5, f"terendah {worst:.1f}:1")

    # ---------- Data tetap ada setelah dimuat ulang ----------
    page.reload()
    page.locator(".home h1").wait_for()
    count = page.evaluate("window.__zn.data.listNotes('semua').length")
    check("Catatan tetap ada setelah aplikasi dibuka ulang", count == 4, f"{count} catatan")

    # ---------- Kecepatan (muat ulang dengan cache) ----------
    page.evaluate("navigator.serviceWorker.ready")
    times = []
    for _ in range(3):
        t = time.time()
        page.reload()
        page.locator(".home h1").wait_for()
        times.append((time.time() - t) * 1000)
    nav = page.evaluate("JSON.stringify(performance.getEntriesByType('navigation')[0].toJSON())")
    nav = json.loads(nav)
    js_bytes = page.evaluate("performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js') || r.name.endsWith('.css')).reduce((a, r) => a + (r.decodedBodySize || 0), 0)")
    check("Beranda siap < 1 detik (muat ulang)", max(times) < 1000, f"{min(times):.0f}–{max(times):.0f} ms; DOMContentLoaded {nav['domContentLoadedEventEnd']:.0f} ms; JS+CSS {js_bytes/1024:.0f} KB tanpa kompresi")

    # 500 catatan: kecepatan pencarian
    ms = page.evaluate("""() => { const d = window.__zn.data;
      for (let i = 0; i < 500; i++) d.createNote(d.blankNote({title: 'Catatan nomor ' + i, body: 'isi tentang proyek renovasi rumah dan bahan bangunan ' + i}));
      const t = performance.now(); for (let i = 0; i < 20; i++) d.search.search('renov bangun'); return (performance.now() - t) / 20; }""")
    page.wait_for_timeout(1500)  # beri waktu penyimpanan ke IndexedDB selesai
    before_off = page.evaluate("window.__zn.data.listNotes('semua').length")
    check("Pencarian di 500+ catatan tetap cepat", ms < 30, f"{ms:.1f} ms per pencarian")

    # ---------- Offline ----------
    controlled = page.evaluate("!!navigator.serviceWorker.controller")
    ctx.set_offline(True)
    t = time.time()
    page.reload()
    page.locator(".home h1").wait_for(timeout=8000)
    off_ms = (time.time() - t) * 1000
    off_count = page.evaluate("window.__zn.data.listNotes('semua').length")
    check("Aplikasi terbuka tanpa internet", controlled and off_count == before_off, f"{off_ms:.0f} ms, {off_count} catatan")
    page.locator("#btn-new").click()
    page.get_by_label("Judul catatan").fill("Ditulis saat offline")
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Kembali").click()
    page.reload()
    page.locator(".home h1").wait_for()
    ok = page.evaluate("window.__zn.data.listNotes('semua').some(n => n.title === 'Ditulis saat offline')")
    check("Catatan yang ditulis offline tersimpan", ok)
    page.screenshot(path="tests/shots/14-offline-home.png")
    ctx.set_offline(False)

    check("Tidak ada error JavaScript", not errors, "; ".join(errors[:3]))
    print("\nKontras per tema:", json.dumps(pairs, ensure_ascii=False))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} pemeriksaan lulus")
sys.exit(1 if failed else 0)
