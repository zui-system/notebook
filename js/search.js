// Indeks pencarian lokal. Dibangun dan disimpan di memori perangkat dari data
// yang sudah ada di perangkat, jadi pencarian instan dan tetap jalan offline.
// Mendukung awalan kata ("bel" menemukan "belanja") dan mengabaikan aksen/huruf besar.

export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(s) {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
}

export class SearchIndex {
  constructor() { this.docs = new Map(); }

  // notes: Map id -> note, notebooks: Map id -> notebook
  sync(notes, notebooks) {
    for (const id of this.docs.keys()) if (!notes.has(id)) this.docs.delete(id);
    for (const [id, n] of notes) {
      const nbName = n.notebookId && notebooks.get(n.notebookId) ? notebooks.get(n.notebookId).name : '';
      const key = `${n.editedAt}|${n.deletedAt}|${n.archived}|${n.notebookId}|${nbName}|${(n.tags || []).join(',')}`;
      const cur = this.docs.get(id);
      if (cur && cur.key === key) continue;
      const titleTokens = new Set(tokenize(n.title));
      const all = new Set([
        ...titleTokens,
        ...tokenize(n.body),
        ...(n.items || []).flatMap(i => tokenize(i.text)),
        ...(n.tags || []).flatMap(t => tokenize(t)),
        ...tokenize(nbName)
      ]);
      this.docs.set(id, { key, title: titleTokens, all: [...all], editedAt: n.editedAt, deleted: !!n.deletedAt });
    }
  }

  search(query, { includeDeleted = false, limit = 200 } = {}) {
    const q = tokenize(query);
    if (!q.length) return [];
    const out = [];
    for (const [id, d] of this.docs) {
      if (d.deleted && !includeDeleted) continue;
      let score = 0;
      let ok = true;
      for (const t of q) {
        let hit = 0;
        for (const w of d.all) {
          if (w === t) { hit = Math.max(hit, 2); break; }
          if (w.startsWith(t)) hit = Math.max(hit, 1);
        }
        if (!hit) { ok = false; break; }
        score += hit;
        for (const w of d.title) { if (w.startsWith(t)) { score += 3; break; } }
      }
      if (ok) out.push({ id, score, editedAt: d.editedAt });
    }
    out.sort((a, b) => b.score - a.score || b.editedAt - a.editedAt);
    return out.slice(0, limit).map(r => r.id);
  }
}
