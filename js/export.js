// Ekspor catatan ke teks, Markdown, PDF, Word (.docx), dan .zip.
// Semua dibuat di perangkat (juga offline), tanpa pustaka tambahan.
// Modul ini baru dimuat saat pengguna mengekspor, agar aplikasi tetap cepat dibuka.
import { noteTitle, getNotebook } from './data.js';
import { fmtDateTime, fmtDue } from './dom.js';
import { REPEAT_LABEL } from './recur.js';

// ---------- Isi catatan dalam bentuk netral ----------
// Blok: { kind: 'title'|'h1'|'h2'|'meta'|'p'|'item'|'photo', text, done }
function noteBlocks(n, head = 'h1') {
  const out = [{ kind: head, text: noteTitle(n) }];
  const meta = [];
  const nb = n.notebookId && getNotebook(n.notebookId);
  if (nb) meta.push('Notebook: ' + nb.name);
  if ((n.tags || []).length) meta.push('Tag: ' + n.tags.map(t => '#' + t).join(' '));
  meta.push('Diubah ' + fmtDateTime(n.editedAt));
  out.push({ kind: 'meta', text: meta.join(' · ') });
  if (n.type === 'checklist') {
    for (const it of n.items || []) {
      if (!it.text.trim()) continue;
      let text = it.text.trim();
      if (typeof it.due === 'number') text += ` (tenggat: ${fmtDue(it.due, it.hasTime)}${it.repeat ? ', ' + REPEAT_LABEL[it.repeat] : ''})`;
      out.push({ kind: 'item', text, done: it.done });
    }
  } else {
    for (const line of String(n.body || '').split('\n')) out.push({ kind: 'p', text: line });
  }
  (n.attachments || []).forEach((a, i) => { if (a.url) out.push({ kind: 'photo', text: `Foto ${i + 1}`, url: a.url }); });
  return out;
}

function docBlocks(notes, title) {
  if (notes.length === 1) return noteBlocks(notes[0], 'title');
  const out = [{ kind: 'title', text: title }, { kind: 'meta', text: `${notes.length} catatan · diekspor ${fmtDateTime(Date.now())}` }];
  for (const n of notes) out.push(...noteBlocks(n, 'h1'));
  return out;
}

// ---------- Teks dan Markdown ----------
const mdEscape = s => s.replace(/^([#>*+-]|\d+\.)\s/, '\\$&');

export function toMarkdown(notes, title) {
  const lines = [];
  for (const b of docBlocks(notes, title)) {
    if (b.kind === 'title') lines.push('# ' + b.text, '');
    else if (b.kind === 'h1') lines.push('', (notes.length === 1 ? '# ' : '## ') + b.text, '');
    else if (b.kind === 'meta') lines.push('_' + b.text + '_', '');
    else if (b.kind === 'item') lines.push(`- [${b.done ? 'x' : ' '}] ${b.text}`);
    else if (b.kind === 'photo') lines.push('', `![${b.text}](${b.url})`);
    else lines.push(b.text);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toText(notes, title) {
  const lines = [];
  for (const b of docBlocks(notes, title)) {
    if (b.kind === 'title' || b.kind === 'h1') lines.push('', b.text, (b.kind === 'title' ? '=' : '-').repeat(Math.min(60, b.text.length)), '');
    else if (b.kind === 'meta') lines.push(b.text, '');
    else if (b.kind === 'item') lines.push(`[${b.done ? 'x' : ' '}] ${b.text}`);
    else if (b.kind === 'photo') lines.push(`${b.text}: ${b.url}`);
    else lines.push(b.text);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- ZIP (tanpa kompresi; isinya teks kecil) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(cen.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// ---------- Word (.docx) ----------
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function toDocx(notes, title) {
  const para = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
  const body = docBlocks(notes, title).map(b => {
    if (b.kind === 'title') return para(b.text, 'Title');
    if (b.kind === 'h1') return para(b.text, 'Heading1');
    if (b.kind === 'meta') return para(b.text, 'Meta');
    if (b.kind === 'item') return para((b.done ? '☑ ' : '☐ ') + b.text, 'Item');
    if (b.kind === 'photo') return para(`${b.text}: ${b.url}`, 'Meta');
    return para(b.text);
  }).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const style = (id, name, { size, bold, color, before = 0, after = 120, based = 'Normal' }) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/><w:pPr><w:spacing w:before="${before}" w:after="${after}"/></w:pPr><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('Title', 'Title', { size: 44, bold: true, after: 120 })}
${style('Heading1', 'heading 1', { size: 32, bold: true, before: 360, after: 80 })}
${style('Meta', 'Keterangan', { size: 20, color: '5E5A52', after: 160 })}
${style('Item', 'Item checklist', { size: 24, after: 60 })}
</w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>Zui Notebook</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles }
  ];
  const blob = zip(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- PDF (huruf Helvetica bawaan PDF, A4) ----------
// Lebar huruf Helvetica (per 1000) untuk karakter 32–126; huruf lain dianggap 556.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
// Karakter Unicode yang punya tempat di WinAnsiEncoding (selain Latin-1).
const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function winAnsi(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out += ch;
    else if (WINANSI[ch]) out += String.fromCharCode(WINANSI[ch]);
    else if (c >= 160 && c <= 255) out += ch;
    else if (c === 9) out += '    ';
    else if (c === 0x2610) out += '[ ]';
    else if (c === 0x2611) out += '[x]';
    else out += '?';
  }
  return out;
}
const width = (s, size, bold) => [...s].reduce((w, ch) => { const c = ch.charCodeAt(0); return w + (c >= 32 && c <= 126 ? HELV[c - 32] : 556); }, 0) * size / 1000 * (bold ? 1.06 : 1);

function wrapLine(text, size, bold, max) {
  const words = text.split(/( +)/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (width(cur + w, size, bold) <= max) { cur += w; continue; }
    if (cur.trim()) lines.push(cur.trimEnd());
    cur = w.trimStart();
    while (width(cur, size, bold) > max) { // kata yang sangat panjang (mis. alamat web)
      let i = cur.length;
      while (i > 1 && width(cur.slice(0, i), size, bold) > max) i--;
      lines.push(cur.slice(0, i));
      cur = cur.slice(i);
    }
  }
  lines.push(cur.trimEnd());
  return lines;
}

const pdfStr = s => '(' + [...s].map(ch => {
  const c = ch.charCodeAt(0);
  if (ch === '\\' || ch === '(' || ch === ')') return '\\' + ch;
  if (c > 126 || c < 32) return '\\' + c.toString(8).padStart(3, '0');
  return ch;
}).join('') + ')';

export function toPdf(notes, title) {
  const PW = 595.28, PH = 841.89, M = 56, MAXW = PW - 2 * M;
  const STYLE = {
    title: { size: 22, bold: true, before: 0, after: 8, lead: 1.25 },
    h1: { size: 16, bold: true, before: 18, after: 4, lead: 1.25 },
    meta: { size: 9.5, bold: false, before: 0, after: 10, lead: 1.4, gray: true },
    p: { size: 11.5, bold: false, before: 0, after: 2, lead: 1.45 },
    item: { size: 11.5, bold: false, before: 0, after: 3, lead: 1.45, indent: 20 },
    photo: { size: 9.5, bold: false, before: 4, after: 2, lead: 1.4, gray: true }
  };
  const pages = [[]];
  let y = PH - M;
  const newPage = () => { pages.push([]); y = PH - M; };
  for (const b of docBlocks(notes, title)) {
    const st = STYLE[b.kind];
    const raw = winAnsi(b.kind === 'photo' ? `${b.text}: ${b.url}` : b.text);
    const indent = st.indent || 0;
    const lines = raw === '' ? [''] : wrapLine(raw, st.size, st.bold, MAXW - indent);
    const lh = st.size * st.lead;
    if (b.kind === 'h1' && y - st.before - lh * 3 < M) newPage(); // judul tidak sendirian di bawah halaman
    else y -= st.before;
    lines.forEach((ln, i) => {
      if (y - lh < M) newPage();
      y -= lh;
      const ops = [];
      if (b.kind === 'item' && i === 0) {
        // Kotak centang digambar, bukan karakter
        const s = st.size * 0.8, bx = M + 2, by = y + st.size * 0.02;
        ops.push(`0.4 G 0.8 w ${bx} ${by} ${s} ${s} re S`);
        if (b.done) ops.push(`0.2 G 1.2 w ${bx + s * 0.2} ${by + s * 0.5} m ${bx + s * 0.42} ${by + s * 0.22} l ${bx + s * 0.85} ${by + s * 0.82} l S`);
      }
      ops.push(`BT /${st.bold ? 'F2' : 'F1'} ${st.size} Tf ${st.gray ? '0.37 0.35 0.32 rg' : '0.11 0.1 0.09 rg'} ${M + indent} ${y.toFixed(2)} Td ${pdfStr(ln)} Tj ET`);
      pages[pages.length - 1].push(...ops);
    });
    y -= st.after;
  }
  // Nomor halaman
  pages.forEach((ops, i) => {
    const t = `Halaman ${i + 1} dari ${pages.length}`;
    ops.push(`BT /F1 9 Tf 0.37 0.35 0.32 rg ${(PW - M - width(t, 9)).toFixed(2)} ${(M / 2).toFixed(2)} Td ${pdfStr(t)} Tj ET`);
  });

  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const ops of pages) {
    const stream = ops.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfStr(winAnsi(title))} /Producer (Zui Notebook) >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Semua karakter < 256, jadi satu karakter = satu byte.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---------- Nama file dan unduhan ----------
export function safeName(s, fallback = 'catatan') {
  const n = String(s || '').replace(/[\\/:*?"<>|#%{}^~[\]`\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return n || fallback;
}

export const FORMATS = {
  txt: { label: 'Teks (.txt)', ext: 'txt', make: (notes, title) => new Blob([toText(notes, title)], { type: 'text/plain;charset=utf-8' }) },
  md: { label: 'Markdown (.md)', ext: 'md', make: (notes, title) => new Blob([toMarkdown(notes, title)], { type: 'text/markdown;charset=utf-8' }) },
  pdf: { label: 'PDF', ext: 'pdf', plus: true, make: toPdf },
  docx: { label: 'Word (.docx)', ext: 'docx', plus: true, make: toDocx }
};

// Semua catatan milik sendiri dalam satu .zip: satu file Markdown per catatan,
// dikelompokkan per notebook, ditambah data lengkap (JSON) untuk dipulihkan.
export function allNotesZip(notes, snapshot) {
  const used = new Set();
  const files = [];
  for (const n of notes) {
    const nb = n.notebookId && getNotebook(n.notebookId);
    const folder = n.archived ? 'Arsip' : nb ? safeName(nb.name, 'Notebook') : 'Tanpa notebook';
    const base = safeName(noteTitle(n));
    let name = `${folder}/${base}.md`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${folder}/${base} (${i}).md`;
    used.add(name.toLowerCase());
    files.push({ name, data: toMarkdown([n], noteTitle(n)) });
  }
  files.push({ name: 'data-lengkap.json', data: JSON.stringify(snapshot, null, 1) });
  files.push({ name: 'BACA SAYA.txt', data: `Ekspor Zui Notebook, ${fmtDateTime(Date.now())}\n\nSetiap catatan ada di file .md (Markdown) yang bisa dibuka di aplikasi teks apa pun.\nFile data-lengkap.json bisa dipulihkan lewat Pengaturan > Cadangan > Pulihkan dari file.\n` });
  return zip(files);
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
