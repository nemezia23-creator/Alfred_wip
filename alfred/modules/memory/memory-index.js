// MemoryIndex — index inversé fait-maison + TF léger.
// Tokenize FR avec strip d'accents et stop-words communs.

const STOP_WORDS = new Set([
  'le','la','les','un','une','des','de','du','et','ou','que','qui','quoi',
  'est','sont','être','avoir','dans','pour','par','sur','avec','sans',
  'mais','donc','car','ne','pas','plus','moins','aux','au','ce','cet',
  'cette','ces','mon','ma','mes','ton','ta','tes','son','sa','ses','nous',
  'vous','ils','elles','je','tu','il','elle','on','se','si','en','y',
  'the','and','or','of','to','a','an','is','are','was','were','in','on',
  'for','with','by','it','this','that','as','at','be','from',
]);

export function tokenize(text) {
  if (!text) return [];
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[\s,;.!?():"'`«»\[\]{}\-/\\]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

export class MemoryIndex {
  constructor() { this.index = new Map(); /* token -> Set<id> */ }

  clear() { this.index.clear(); }

  indexEntry(entry) {
    const tokens = tokenize(`${entry.content} ${(entry.tags || []).join(' ')}`);
    for (const t of new Set(tokens)) {
      if (!this.index.has(t)) this.index.set(t, new Set());
      this.index.get(t).add(entry.id);
    }
  }

  removeEntry(entry) {
    const tokens = tokenize(`${entry.content} ${(entry.tags || []).join(' ')}`);
    for (const t of new Set(tokens)) {
      const set = this.index.get(t);
      if (set) {
        set.delete(entry.id);
        if (set.size === 0) this.index.delete(t);
      }
    }
  }

  rebuild(entries) {
    this.clear();
    for (const e of entries) this.indexEntry(e);
  }

  // Returns array of {id, score} sorted desc.
  search(query) {
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];
    const scores = new Map();
    for (const t of qTokens) {
      const ids = this.index.get(t);
      if (!ids) continue;
      const idf = Math.log(1 + 1 / ids.size); // rarer => higher weight
      for (const id of ids) scores.set(id, (scores.get(id) || 0) + 1 + idf);
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);
  }
}
