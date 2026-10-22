"""Uji fitur akun Tahap 2 (foto + kuota, foto saat offline, jadwal pengingat) memakai Firebase Emulator.

Jalankan dari folder proyek (perlu Java 11+ dan `npm install` di tests/rules):
    python3 -m http.server 5173 &
    tests/rules/node_modules/.bin/firebase emulators:exec --only auth,firestore,storage \\
        --project notebook-zui "python3 tests/e2e_cloud.py"

Firebase JS SDK diambil dari tests/rules/node_modules/firebase (versi sama dengan CDN),
karena lingkungan uji tidak selalu bisa menjangkau www.gstatic.com.
"""
import json
import os
import sys
import time
import urllib.request

# Permintaan dari service worker juga harus lewat route di bawah (SDK Firebase dimuat lewat SW).
os.environ["PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS"] = "1"
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = "http://localhost:5173/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SDK = os.path.join(ROOT, "tests/rules/node_modules/firebase")
PROJECT = "notebook-zui"
FS = f"http://127.0.0.1:8080/v1/projects/{PROJECT}/databases/(default)/documents"
results = []
errors = []
warns = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("LULUS " if cond else "GAGAL ") + name + (f" — {detail}" if detail else ""))


def admin(method, path, body=None):
    """Akses Firestore Emulator sebagai admin (melewati rules), seperti server."""
    req = urllib.request.Request(FS + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer owner", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def val(v):
    return int(v["integerValue"]) if "integerValue" in v else v.get("stringValue", v.get("doubleValue"))


def serve_sdk(route):
    name = route.request.url.rsplit("/", 1)[-1]
    path = os.path.join(SDK, name)
    if os.path.exists(path):
        route.fulfill(path=path, content_type="text/javascript")
    else:
        route.abort()


def wait(page, js, timeout=15000):
    try:
        page.wait_for_function(js, timeout=timeout)
    except Exception:
        print("Error/peringatan di halaman:", (errors + warns)[-5:])
        raise


MAKE_PHOTO = """async ([w, h]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 37 % 360},70%,${30 + i % 50}%)`; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 200, 40 + Math.random() * 200); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return new File([blob], 'foto.png', { type: 'image/png' });
}"""


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chromium")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    ctx.route("https://www.gstatic.com/firebasejs/**", serve_sdk)
    ctx.add_init_script("localStorage.setItem('zn-emulator', '1'); localStorage.setItem('zn-onboarded', '1');")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("console", lambda m: warns.append(m.text) if m.type == "warning" else None)

    # ---------- Masuk (akun email di Auth Emulator) ----------
    page.goto(BASE)
    page.get_by_role("heading", name="Masuk ke Zui Notebook").wait_for()
    page.evaluate("""async () => { const m = await import('./js/firebase.js'); const fb = await m.loadFirebase();
      await fb.A.createUserWithEmailAndPassword(fb.auth, 'ani@contoh.id', 'rahasia123'); }""")
    page.locator(".home h1").wait_for(timeout=20000)
    uid = page.evaluate("window.__zn.data.getStore().uid")
    check("Masuk dengan akun (emulator) dan beranda tampil", page.evaluate("window.__zn.data.getStore().kind") == "cloud")
    wait(page, f"window.__zn.data.getStore().profile && window.__zn.data.getStore().profile.createdAt")
    prof = admin("GET", f"/users/{uid}")
    check("Profil baru dibuat dengan paket free", prof and val(prof["fields"]["plan"]) == "free")

    # ---------- Jadwal pengingat tersimpan di akun ----------
    page.evaluate("""() => { const d = window.__zn.data;
      window.__noteR = d.createNote(d.blankNote({ title: 'Obat ibu', type: 'checklist', items: [
        { id: 'i1', text: 'Vitamin', done: false, due: Date.now() + 3600000, hasTime: true, repeat: 'harian', remind: true },
        { id: 'i2', text: 'Tanpa pengingat', done: false, due: Date.now() + 3600000, hasTime: true, repeat: null, remind: false } ] })); }""")
    time.sleep(2.5)
    rems = (admin("GET", f"/users/{uid}/reminders") or {}).get("documents", [])
    check("Jadwal pengingat tertulis ke koleksi reminders (hanya item yang diingatkan)", len(rems) == 1 and val(rems[0]["fields"]["text"]) == "Vitamin", f"{len(rems)} jadwal")
    page.evaluate("window.__zn.data.setItemDone(window.__noteR, 'i1', true)")
    time.sleep(2)
    rems2 = (admin("GET", f"/users/{uid}/reminders") or {}).get("documents", [])
    moved = rems2 and val(rems2[0]["fields"]["base"]) - val(rems[0]["fields"]["base"]) == 86400000
    check("Item berulang dicentang: jadwal di akun ikut maju 1 hari", moved)
    page.evaluate("window.__zn.data.setItemRemind(window.__noteR, 'i1', false)")
    time.sleep(2)
    check("Pengingat dimatikan: jadwal di akun dihapus", not (admin("GET", f"/users/{uid}/reminders") or {}).get("documents"))

    # ---------- Foto: kompres, catat kuota, unggah ----------
    note_id = page.evaluate("window.__zn.data.createNote(window.__zn.data.blankNote({ title: 'Renovasi dapur' }))")
    page.goto(BASE + f"#/catatan/{note_id}")
    page.get_by_label("Judul catatan").wait_for()
    orig = page.evaluate(f"async () => {{ const f = await ({MAKE_PHOTO})([3000, 2200]); window.__f = f; return f.size; }}")
    t = time.time()
    page.evaluate(f"window.__zn.data.addImage('{note_id}', window.__f)")
    wait(page, f"(window.__zn.data.getNote('{note_id}').attachments[0] || {{}}).url", 20000)
    up_ms = (time.time() - t) * 1000
    a = page.evaluate(f"window.__zn.data.getNote('{note_id}').attachments[0]")
    check("Foto dikompres sebelum diunggah", a["size"] < orig and a["size"] <= 5 * 1024 * 1024, f"{orig // 1024} KB → {a['size'] // 1024} KB, {up_ms:.0f} ms")
    dims = page.evaluate(f"""() => new Promise(r => {{ const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = window.__zn.data.getNote('{note_id}').attachments[0].url; }})""")
    check("Sisi terpanjang foto paket Gratis = 1600 px", max(dims) == 1600, str(dims))
    att_doc = admin("GET", f"/users/{uid}/attachments/{a['id']}")
    prof = admin("GET", f"/users/{uid}")
    usage = prof["fields"]["usage"]["mapValue"]["fields"]
    check("Lampiran tercatat dan kuota naik sebesar ukuran foto", att_doc and val(att_doc["fields"]["size"]) == a["size"] and val(usage["bytes"]) == a["size"] and val(usage["files"]) == 1)
    page.locator(".attachments img").first.wait_for()
    page.screenshot(path="tests/shots/c-01-photo.png")

    # Sisa kuota di Pengaturan
    page.goto(BASE + "#/pengaturan")
    page.get_by_role("heading", name="Penyimpanan foto").wait_for()
    page.wait_for_timeout(500)
    qtext = page.locator("section[aria-labelledby=set-photo]").inner_text()
    check("Pengaturan menampilkan sisa kuota foto", "tersisa" in qtext and "dari 100 MB terpakai" in qtext and "1 foto" in qtext, qtext.replace("\n", " | "))
    page.locator("section[aria-labelledby=set-photo]").screenshot(path="tests/shots/c-02-quota.png")

    # ---------- Foto saat offline ----------
    page.goto(BASE + f"#/catatan/{note_id}")
    page.get_by_label("Judul catatan").wait_for()
    ctx.set_offline(True)
    page.wait_for_timeout(300)
    page.evaluate(f"async () => {{ window.__f2 = await ({MAKE_PHOTO})([1200, 900]); await window.__zn.data.addImage('{note_id}', window.__f2); }}")
    page.wait_for_timeout(500)
    pend = page.evaluate(f"window.__zn.data.getNote('{note_id}').attachments[1]")
    shown = page.locator(".attachments figure.pending img").first.get_attribute("src") or ""
    check("Foto saat offline langsung tampil dari perangkat dengan tanda menunggu", pend.get("pending") and shown.startswith("blob:") and page.get_by_text("Menunggu internet").count() == 1)
    page.screenshot(path="tests/shots/c-03-photo-offline.png")
    page.reload()
    page.get_by_label("Judul catatan").wait_for(timeout=15000)
    page.wait_for_timeout(800)
    kept = page.evaluate("async () => (await import('./js/store/outbox.js')).listUploads(window.__zn.data.getStore().uid).then(l => l.length)")
    check("Foto offline tetap aman setelah aplikasi dibuka ulang tanpa internet", kept == 1 and page.locator(".attachments figure.pending img[src^='blob:']").count() == 1)
    ctx.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    wait(page, f"(window.__zn.data.getNote('{note_id}').attachments[1] || {{}}).url", 30000)
    prof = admin("GET", f"/users/{uid}")
    usage = prof["fields"]["usage"]["mapValue"]["fields"]
    check("Saat online lagi, foto terunggah otomatis dan tercatat di kuota", val(usage["files"]) == 2 and page.locator(".attachments figure.pending").count() == 0)

    # ---------- Kuota penuh ----------
    admin("PATCH", f"/users/{uid}?updateMask.fieldPaths=usage", {"fields": {"usage": {"mapValue": {"fields": {
        "bytes": {"integerValue": str(100 * 1024 * 1024 - 1000)}, "files": {"integerValue": "2"}}}}}})
    page.wait_for_timeout(800)
    page.evaluate(f"async () => {{ window.__f = await ({MAKE_PHOTO})([3000, 2200]); window.__f2 = await ({MAKE_PHOTO})([1200, 900]); }}")
    msg = page.evaluate(f"async () => {{ try {{ await window.__zn.data.addImage('{note_id}', window.__f2); return 'tidak ditolak'; }} catch (e) {{ return e.message; }} }}")
    check("Kuota penuh: foto ditolak dengan pesan yang jelas", "Kuota foto paket Gratis sudah penuh" in msg, msg)

    # Paket Plus (diubah server): kuota lebih besar, foto lebih tajam
    admin("PATCH", f"/users/{uid}?updateMask.fieldPaths=plan", {"fields": {"plan": {"stringValue": "plus"}}})
    wait(page, "window.__zn.data.plan().id === 'plus'")
    page.evaluate(f"window.__zn.data.addImage('{note_id}', window.__f)")
    wait(page, f"(window.__zn.data.getNote('{note_id}').attachments[2] || {{}}).url", 20000)
    dims = page.evaluate(f"""() => new Promise(r => {{ const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = window.__zn.data.getNote('{note_id}').attachments[2].url; }})""")
    check("Paket Plus (dibaca dari field plan): kuota lebih besar, foto 2560 px", max(dims) == 2560, str(dims))

    # ---------- Menghapus foto mengembalikan kuota ----------
    before = val(admin("GET", f"/users/{uid}")["fields"]["usage"]["mapValue"]["fields"]["bytes"])
    a0 = page.evaluate(f"window.__zn.data.getNote('{note_id}').attachments[0]")
    page.evaluate(f"window.__zn.data.removeImage('{note_id}', '{a0['path']}')")
    time.sleep(2)
    after = val(admin("GET", f"/users/{uid}")["fields"]["usage"]["mapValue"]["fields"]["bytes"])
    check("Menghapus foto mengembalikan kuota dan menghapus datanya", before - after == a0["size"] and admin("GET", f"/users/{uid}/attachments/{a0['id']}") is None)
    page.evaluate(f"async () => {{ await window.__zn.data.deleteForever('{note_id}'); }}")
    time.sleep(2)
    u = admin("GET", f"/users/{uid}")["fields"]["usage"]["mapValue"]["fields"]
    check("Menghapus catatan selamanya ikut menghapus foto-fotonya dari kuota", val(u["files"]) == 0, f"files={val(u['files'])}")

    noise = [e for e in errors if "net::ERR_INTERNET_DISCONNECTED" not in e and "Could not reach Cloud Firestore backend" not in e]
    check("Tidak ada error JavaScript", not noise, "; ".join(noise[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} pemeriksaan lulus")
sys.exit(1 if failed else 0)
