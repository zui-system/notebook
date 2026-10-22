"""Uji ujung-ke-ujung fitur Tahap 2 (mode tanpa akun) dengan Playwright.

Jalankan dari folder proyek:
    python3 -m http.server 5173 &
    python3 tests/e2e_tahap2.py

Fitur akun (foto, kuota, jadwal pengingat di server) diuji di tests/e2e_cloud.py.
"""
import io
import json
import sys
import time
import zipfile

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
results = []
errors = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("LULUS " if cond else "GAGAL ") + name + (f" — {detail}" if detail else ""))


def expected_noise(text):
    # Lingkungan uji tidak bisa menjangkau Google Fonts dan CDN Firebase (mode tanpa akun tidak memakainya).
    return "Failed to load resource" in text or "www.gstatic.com/firebasejs" in text


with sync_playwright() as p:
    # Chromium penuh (bukan headless shell): hanya versi ini yang mendukung izin notifikasi.
    browser = p.chromium.launch(channel="chromium")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, accept_downloads=True)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    ctx.route("https://www.gstatic.com/**", lambda r: r.abort())
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and not expected_noise(m.text) else None)

    page.goto(BASE)
    page.get_by_role("button", name="Lewati").click()
    page.get_by_role("button", name="Coba tanpa akun").click()
    page.locator(".home h1").wait_for()
    page.evaluate("navigator.serviceWorker.ready")
    check("Beranda tetap tenang tanpa tugas (tidak ada tautan tugas)", page.locator("#home-today").count() == 0)
    page.locator("#btn-menu").click()
    check("Menu belum menampilkan Hari ini sebelum ada tanggal", page.locator("dialog.drawer").get_by_text("Hari ini").count() == 0)
    page.keyboard.press("Escape")

    # ================= 1. Tanggal dan pengingat =================
    page.locator("#btn-new").click()
    page.get_by_label("Judul catatan").fill("Obat ibu")
    page.get_by_role("button", name="Jadikan checklist").click()
    page.get_by_label("Item 1", exact=True).fill("Vitamin pagi")
    page.keyboard.press("Enter")
    page.get_by_label("Item 2", exact=True).fill("Bayar listrik")
    page.get_by_role("button", name="Atur tanggal item 1").click()
    dlg = page.locator("dialog[open]")
    check("Dialog tanggal terbuka dengan fokus di kolom tanggal", page.evaluate("document.activeElement.id") == "due-date")
    page.screenshot(path="tests/shots/t2-01-due-dialog.png")
    dlg.get_by_label("Jam (boleh kosong)").fill("07:00")
    dlg.get_by_role("radio", name="Tiap hari").check()
    # Izin notifikasi diberikan saat dialog disimpan (bukan saat aplikasi dibuka).
    ctx.grant_permissions(["notifications"])
    dlg.get_by_role("button", name="Simpan").click()
    page.wait_for_timeout(700)
    due1 = page.locator(".checkrow").nth(0).locator(".due").inner_text()
    check("Item berulang menampilkan jam, ulangan, dan pengingat", "07.00" in due1 and "tiap hari" in due1 and "diingatkan" in due1, due1.replace("\n", " | "))
    check("Jadwal harian yang jamnya sudah lewat tidak dianggap terlambat", "Terlambat" not in due1)

    # Item 2: besok tanpa jam, tanpa pengingat
    page.get_by_role("button", name="Atur tanggal item 2").click()
    dlg.get_by_role("button", name="Besok").click()
    dlg.get_by_role("switch", name="Ingatkan saya").uncheck()
    dlg.get_by_role("button", name="Simpan").click()
    page.wait_for_timeout(600)
    due2 = page.locator(".checkrow").nth(1).locator(".due").inner_text()
    check("Item tanpa jam tampil sebagai 'Besok' tanpa pengingat", due2.startswith("Besok") and "diingatkan" not in due2, due2.replace("\n", " | "))
    page.screenshot(path="tests/shots/t2-02-checklist-due.png")

    # Mencentang item berulang memajukan tanggal, tidak dicoret
    before = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Obat ibu').items[0].due")
    page.get_by_role("checkbox", name="Selesai: item 1").click()
    page.wait_for_timeout(700)
    after = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Obat ibu').items[0]")
    check("Item berulang dicentang: maju 1 hari, tetap belum selesai", after["due"] - before == 86400000 and not after["done"], page.locator("#toast").inner_text())
    page.get_by_role("button", name="Kembali").click()

    # Item terlambat (kemarin) dan hari ini lewat data, lalu tampilan Hari ini
    page.evaluate("""() => { const d = window.__zn.data; const t = d.startOfDay();
      d.createNote(d.blankNote({ title: 'Rumah', type: 'checklist', items: [
        { id: 'a1', text: 'Siram tanaman', done: false, due: d.addDays(t, -1), hasTime: false, repeat: null, remind: false },
        { id: 'a2', text: 'Telepon dokter', done: false, due: t + 23 * 3600000 + 59 * 60000, hasTime: true, repeat: null, remind: true },
        { id: 'a3', text: 'Tanpa tanggal', done: false } ] })); }""")
    page.wait_for_timeout(300)
    page.goto(BASE + "#/")
    page.locator(".home h1").wait_for()
    link = page.locator("#home-today")
    check("Beranda menampilkan satu tautan kecil ke tugas hari ini", link.count() == 1 and "2 tugas" in link.inner_text(), link.inner_text() if link.count() else "")
    page.screenshot(path="tests/shots/t2-03-home-today.png")
    link.click()
    page.get_by_role("heading", name="Hari ini", exact=True).wait_for()
    labels = page.locator(".section-label").all_inner_texts()
    check("Hari ini: bagian Terlambat dan Untuk hari ini", labels == ["Terlambat", "Untuk hari ini"], str(labels))
    page.screenshot(path="tests/shots/t2-04-today.png")
    page.get_by_role("checkbox", name="Selesai: Siram tanaman").click()
    page.wait_for_timeout(300)
    done = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Rumah').items[0].done")
    check("Mencentang dari Hari ini menandai item selesai di catatannya", done and page.locator(".agrow").count() == 1)
    page.locator("#toast").get_by_role("button", name="Batalkan").click()
    page.wait_for_timeout(200)
    check("Centang bisa dibatalkan", page.locator(".agrow").count() == 2)
    page.goto(BASE + "#/akan-datang")
    page.get_by_role("heading", name="Akan datang").wait_for()
    check("Akan datang dikelompokkan per hari", page.locator(".section-label").count() >= 1 and page.locator(".agrow").count() == 2)
    page.screenshot(path="tests/shots/t2-05-upcoming.png")
    page.locator("#btn-menu").click()
    drawer = page.locator("dialog.drawer")
    check("Menu menampilkan Hari ini dan Akan datang setelah ada tanggal", drawer.get_by_role("link", name="Hari ini").count() == 1 and drawer.get_by_role("link", name="Akan datang").count() == 1)
    page.keyboard.press("Escape")

    # Notifikasi dari perangkat muncul tepat waktu
    page.evaluate("""() => { const d = window.__zn.data;
      d.createNote(d.blankNote({ title: 'Uji', type: 'checklist', items: [
        { id: 'n1', text: 'Minum air', done: false, due: Date.now() + 2500, hasTime: true, repeat: null, remind: true } ] }));
      d.syncReminders(); }""")
    page.wait_for_timeout(4500)
    shown = page.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(l => l.map(n => ({title: n.title, body: n.body, tag: n.tag, actions: n.actions.map(a => a.title)})))")
    hit = [n for n in shown if n["title"] == "Minum air"]
    check("Notifikasi pengingat muncul saat waktunya tiba", len(hit) == 1, json.dumps(hit, ensure_ascii=False))
    check("Notifikasi punya tombol 'Matikan pengingat'", hit and hit[0]["actions"] == ["Matikan pengingat"])
    page.goto(BASE + "#/")
    page.reload()
    page.locator(".home h1").wait_for()
    page.wait_for_timeout(1500)
    again = page.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(l => l.filter(n => n.title === 'Minum air').length)")
    check("Pengingat yang sama tidak muncul dua kali setelah dibuka ulang", again <= 1)

    # Mematikan pengingat: dari notifikasi (rute) dan sakelar utama
    note_id = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Obat ibu').id")
    item_id = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Obat ibu').items[0].id")
    page.goto(BASE + f"#/matikan-pengingat/{note_id}/{item_id}")
    page.wait_for_function(f"location.hash === '#/catatan/{note_id}'")
    off = page.evaluate(f"window.__zn.data.getNote('{note_id}').items[0].remind")
    check("Tombol 'Matikan pengingat' pada notifikasi mematikan pengingat item itu", off is False, page.locator("#toast").inner_text())
    page.goto(BASE + "#/pengaturan")
    page.get_by_role("heading", name="Pengaturan").wait_for()
    check("Pengaturan menunjukkan izin notifikasi", page.get_by_text("Notifikasi diizinkan").count() == 1)
    page.screenshot(path="tests/shots/t2-06-settings-reminders.png", full_page=True)
    planned = page.evaluate("window.__zn.data.desiredReminders().size")
    page.get_by_role("switch", name="Pengingat aktif").uncheck()
    page.wait_for_timeout(800)
    now_planned = page.evaluate("window.__zn.data.desiredReminders().size")
    nxt = page.evaluate("window.__zn.reminders.nextLocal()")
    check("Sakelar utama mematikan semua pengingat", planned >= 1 and now_planned == 0 and nxt == float("inf"), f"{planned} → {now_planned}")
    page.get_by_role("switch", name="Pengingat aktif").check()

    # ================= 3. Template =================
    page.goto(BASE + "#/")
    page.locator(".home h1").wait_for()
    page.locator("#btn-new").click()
    tpl = page.locator(".templates .tpl")
    tpl.first.wait_for()
    page.wait_for_timeout(100)
    names = tpl.all_inner_texts()
    check("Layar Catatan baru menampilkan 6 template", names == ["Catatan rapat", "Jurnal harian", "Rencana proyek", "Daftar belanja", "Catatan keuangan", "Catatan belajar"], str(names))
    check("Fokus tetap di judul (bisa langsung mengetik)", page.evaluate("document.activeElement.getAttribute('aria-label')") == "Judul catatan")
    page.screenshot(path="tests/shots/t2-07-templates.png")
    page.get_by_label("Judul catatan").fill("Ide liburan")
    check("Pilihan template hilang begitu mulai menulis", page.locator(".templates").count() == 0)
    page.get_by_role("button", name="Kembali").click()
    n_before = page.evaluate("window.__zn.data.listNotes('semua').length")

    page.locator("#btn-new").click()
    page.get_by_role("button", name="Daftar belanja").click()
    page.wait_for_timeout(300)
    note = page.evaluate("(() => { const d = window.__zn.data; const n = d.listNotes('semua').find(n => n.title === 'Belanja'); return n && { type: n.type, items: n.items.map(i => i.text) }; })()")
    check("Template Daftar belanja: checklist berisi contoh, langsung tersimpan", note and note["type"] == "checklist" and len(note["items"]) == 6 and "#/catatan/" in page.url, str(note))
    page.screenshot(path="tests/shots/t2-08-template-belanja.png")
    page.locator("#toast").get_by_role("button", name="Batalkan").click()
    page.wait_for_timeout(300)
    gone = page.evaluate("!window.__zn.data.listNotes('semua').some(n => n.title === 'Belanja') && !window.__zn.data.listNotes('sampah').some(n => n.title === 'Belanja')")
    check("Template bisa dibatalkan (catatan kosong lagi)", gone and page.locator(".templates").count() == 1)

    page.get_by_role("button", name="Catatan rapat").click()
    page.wait_for_timeout(300)
    body = page.get_by_label("Isi catatan").input_value()
    check("Template Catatan rapat: teks contoh, kursor di isi", "Keputusan:" in body and page.evaluate("document.activeElement.getAttribute('aria-label')") == "Isi catatan")
    page.get_by_role("button", name="Kembali").click()
    page.locator("#btn-new").click()
    page.get_by_role("button", name="Rencana proyek").click()
    page.wait_for_timeout(300)
    dated = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title.startsWith('Rencana proyek')).items.filter(i => i.due && !i.remind).length")
    check("Template Rencana proyek berisi tenggat (tanpa pengingat)", dated == 5)
    page.get_by_role("button", name="Kembali").click()
    for name in ["Jurnal harian", "Catatan keuangan", "Catatan belajar"]:
        page.locator("#btn-new").click()
        page.get_by_role("button", name=name).click()
        page.wait_for_timeout(250)
        page.get_by_role("button", name="Kembali").click()
    n_after = page.evaluate("window.__zn.data.listNotes('semua').length")
    check("Semua template membuat catatan baru", n_after - n_before == 5, f"{n_before} → {n_after}")

    # ================= 4. Ekspor =================
    def grab(trigger):
        with page.expect_download() as d:
            trigger()
        dl = d.value
        return dl.suggested_filename, open(dl.path(), "rb").read()

    obat = page.evaluate("window.__zn.data.listNotes('semua').find(n => n.title === 'Obat ibu').id")
    page.goto(BASE + f"#/catatan/{obat}")
    page.get_by_label("Judul catatan").wait_for()

    def export_note(fmt):
        page.get_by_role("button", name="Pilihan lain").click()
        page.get_by_role("button", name="Ekspor catatan").click()
        return grab(lambda: page.locator("dialog[open]").get_by_role("button", name=fmt).click())

    name, raw = export_note("Markdown (.md)")
    md = raw.decode("utf-8")
    check("Gratis: ekspor satu catatan ke Markdown", name == "Obat ibu.md" and md.startswith("# Obat ibu") and "- [ ] Vitamin pagi (tenggat:" in md and "tiap hari" in md, md.splitlines()[0] if md else "")
    name, raw = export_note("Teks (.txt)")
    txt = raw.decode("utf-8")
    check("Gratis: ekspor satu catatan ke teks", name == "Obat ibu.txt" and "[ ] Bayar listrik" in txt)

    page.get_by_role("button", name="Pilihan lain").click()
    page.get_by_role("button", name="Ekspor catatan").click()
    sheet = page.locator("dialog[open]")
    check("PDF dan Word diberi label Plus untuk paket Gratis", sheet.get_by_role("button", name="PDF").inner_text().endswith("Plus") and sheet.get_by_role("button", name="Word (.docx)").inner_text().endswith("Plus"))
    page.screenshot(path="tests/shots/t2-09-export-sheet.png")
    sheet.get_by_role("button", name="PDF").click()
    page.get_by_role("heading", name="PDF tersedia di paket Plus").wait_for()
    plus = page.locator("dialog[open]")
    check("Gratis: PDF menampilkan penjelasan paket Plus (tidak mengunduh)", plus.get_by_text("PDF tersedia di paket Plus").count() == 1)
    page.screenshot(path="tests/shots/t2-10-plus.png")
    name, raw = grab(lambda: plus.get_by_role("button", name="Ekspor Markdown").click())
    check("Dari penjelasan Plus bisa langsung ekspor Markdown", name.endswith(".md"))

    # Paket Plus (dibaca dari field plan profil)
    page.evaluate("window.__zn.data.getStore().profile.plan = 'plus'")
    name, raw = export_note("PDF")
    import pypdf
    pdf = pypdf.PdfReader(io.BytesIO(raw))
    ptxt = pdf.pages[0].extract_text()
    check("Plus: ekspor PDF yang valid dan terbaca", name == "Obat ibu.pdf" and raw.startswith(b"%PDF-1.4") and "Obat ibu" in ptxt and "Vitamin pagi" in ptxt, f"{len(pdf.pages)} halaman, {len(raw)} byte")
    name, raw = export_note("Word (.docx)")
    import docx
    d = docx.Document(io.BytesIO(raw))
    paras = [p_.text for p_ in d.paragraphs]
    check("Plus: ekspor Word (.docx) yang valid dan terbaca", name == "Obat ibu.docx" and paras[0] == "Obat ibu" and any("Vitamin pagi" in t for t in paras), str(paras[:3]))

    # Notebook berisi banyak catatan, termasuk teks panjang: PDF berhalaman banyak
    page.evaluate("""() => { const d = window.__zn.data; const nb = d.createNotebook('Kantor');
      const long = Array.from({length: 120}, (_, i) => 'Baris ' + (i + 1) + ': rapat koordinasi — jadwal “minggu depan” é ü ñ ' + 'kata '.repeat(i % 12)).join('\\n');
      d.createNote(d.blankNote({ title: 'Notulen panjang (a/b) [uji]', body: long, notebookId: nb }));
      d.createNote(d.blankNote({ title: 'Ide', body: 'Satu baris saja', notebookId: nb }));
      window.__nb = nb; }""")
    nb = page.evaluate("window.__nb")
    page.goto(BASE + f"#/notebook/{nb}")
    page.get_by_role("heading", name="Kantor").wait_for()
    page.get_by_role("button", name="Atur").click()
    page.get_by_role("button", name="Ekspor notebook").click()
    name, raw = grab(lambda: page.locator("dialog[open]").get_by_role("button", name="PDF").click())
    pdf = pypdf.PdfReader(io.BytesIO(raw))
    alltxt = "\n".join(pg.extract_text() for pg in pdf.pages)
    check("Ekspor satu notebook ke PDF (berhalaman, huruf khusus aman)", name == "Kantor.pdf" and len(pdf.pages) >= 3 and "Baris 120" in alltxt and "Satu baris saja" in alltxt and "“minggu depan”" in alltxt, f"{len(pdf.pages)} halaman")
    page.get_by_role("button", name="Atur").click()
    page.get_by_role("button", name="Ekspor notebook").click()
    name, raw = grab(lambda: page.locator("dialog[open]").get_by_role("button", name="Markdown (.md)").click())
    md = raw.decode("utf-8")
    check("Ekspor satu notebook ke Markdown", name == "Kantor.md" and md.startswith("# Kantor") and "## Ide" in md)

    # Semua catatan: selalu gratis
    page.evaluate("window.__zn.data.getStore().profile.plan = 'free'")
    page.goto(BASE + "#/pengaturan")
    page.get_by_role("heading", name="Ekspor", exact=True).wait_for()
    name, raw = grab(lambda: page.get_by_role("button", name="Ekspor semua catatan").click())
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = z.namelist()
    total = page.evaluate("window.__zn.data.allNotes().filter(n => !n.deletedAt).length")
    mds = [n for n in names if n.endswith(".md")]
    snap = json.loads(z.read("data-lengkap.json"))
    check("Gratis: ekspor SEMUA catatan (.zip Markdown + data lengkap)", z.testzip() is None and len(mds) == total and "Kantor/Ide.md" in names and len(snap["notes"]) >= total, f"{len(mds)} file .md")

    page.screenshot(path="tests/shots/t2-99-end.png")
    check("Tidak ada error JavaScript", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} pemeriksaan lulus")
sys.exit(1 if failed else 0)
