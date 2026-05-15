// MemoryManager — CRUD + search + filtres + injection contexte chat.

import { getAll, put, del } from '../core/db.js';
import { bus, EVT } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { defaultMemory, validateMemory } from './memory-schema.js';
import { MemoryIndex } from './memory-index.js';

const log = createLogger('memory-mgr');

let memories = [];
const idx = new MemoryIndex();

export async function loadMemories() {
  memories = await getAll('memories');
  // Migrate legacy entries
  for (const m of memories) {
    if (!m.schemaVersion) {
      Object.assign(m, defaultMemory(m));
      await put('memories', m);
    }
  }
  idx.rebuild(memories.filter((m) => m.status === 'active'));
  log.info(`loaded ${memories.length} memories (${idx.index.size} index tokens)`);
  return memories.slice();
}

export function listMemories(filters = {}) {
  let out = memories.slice();
  if (filters.status) {
    const set = new Set([].concat(filters.status));
    out = out.filter((m) => set.has(m.status));
  } else {
    out = out.filter((m) => m.status !== 'archived');
  }
  if (filters.type) {
    const set = new Set([].concat(filters.type));
    out = out.filter((m) => set.has(m.type));
  }
  if (filters.source) {
    const set = new Set([].concat(filters.source));
    out = out.filter((m) => set.has(m.source));
  }
  if (filters.owner) out = out.filter((m) => m.owner === filters.owner);
  if (filters.tags && filters.tags.length) {
    const want = new Set(filters.tags.map((t) => t.toLowerCase()));
    out = out.filter((m) => (m.tags || []).some((t) => want.has(String(t).toLowerCase())));
  }
  if (filters.minConfidence != null) out = out.filter((m) => (m.confidence ?? 0) >= filters.minConfidence);
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out;
}

export function getMemory(id) {
  return memories.find((m) => m.id === id) || null;
}

export async function addMemory(input) {
  const v = validateMemory(input);
  if (!v.ok) throw new Error(v.errors.join(' · '));
  const m = v.memory;
  memories.push(m);
  await put('memories', m);
  if (m.status === 'active') idx.indexEntry(m);
  bus.emit(EVT.MEMORY_ADDED, m);
  log.info(`memory added: ${m.type} (${m.id})`);
  return m;
}

export async function updateMemory(id, patch) {
  const cur = getMemory(id);
  if (!cur) throw new Error('Mémoire introuvable.');
  const merged = {
    ...cur,
    ...patch,
    version: (cur.version || 1) + 1,
    previousVersion: cur.id,
    updatedAt: Date.now(),
  };
  const v = validateMemory(merged);
  if (!v.ok) throw new Error(v.errors.join(' · '));
  // Keep same id
  v.memory.id = cur.id;
  idx.removeEntry(cur);
  Object.assign(cur, v.memory);
  await put('memories', cur);
  if (cur.status === 'active') idx.indexEntry(cur);
  bus.emit(EVT.MEMORY_ADDED, cur);
  return cur;
}

export async function deleteMemory(id) {
  const i = memories.findIndex((m) => m.id === id);
  if (i === -1) throw new Error(`Mémoire introuvable : ${id}`);
  const [removed] = memories.splice(i, 1);
  await del('memories', id);
  idx.removeEntry(removed);
  bus.emit(EVT.MEMORY_DELETED, { id });
  log.info(`memory deleted: ${id}`);
}

export async function archiveMemory(id) { return updateMemory(id, { status: 'archived' }); }
export async function activateMemory(id) { return updateMemory(id, { status: 'active' }); }

export function searchMemories(query, { limit = 10, ...filters } = {}) {
  const q = String(query || '').trim();
  const allowedList = listMemories({ status: 'active', ...filters });
  const allowed = new Set(allowedList.map((m) => m.id));
  const ranked = idx.search(q);
  const seen = new Set();
  const out = [];

  for (const r of ranked) {
    if (!allowed.has(r.id) || seen.has(r.id)) continue;
    const m = getMemory(r.id);
    if (m) { out.push({ ...m, _score: r.score }); seen.add(r.id); }
    if (out.length >= limit) break;
  }

  // Substring fallback (handles short queries / accents / partial words).
  if (out.length < limit && q.length >= 1) {
    const needle = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const subs = [];
    for (const m of allowedList) {
      if (seen.has(m.id)) continue;
      const hay = ((m.content || '') + ' ' + (m.tags || []).join(' '))
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (hay.includes(needle)) subs.push({ ...m, _score: 0.1 });
    }
    subs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const m of subs) {
      out.push(m); seen.add(m.id);
      if (out.length >= limit) break;
    }
  }

  // Stable secondary sort: score desc, then updatedAt desc.
  out.sort((a, b) => (b._score - a._score) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
  return out;
}

export async function noteMemoryAccess(id) {
  const m = getMemory(id);
  if (!m) return;
  m.accessCount = (m.accessCount || 0) + 1;
  m.lastAccessed = Date.now();
  await put('memories', m);
}

// Build a system-prompt extra block from memories matching agent + query.
// Strategy: take agent.tags as filter, then top-K by query relevance.
export function buildMemoryContext({ agent = null, query = '', maxItems = null, minConfidence = 0 } = {}) {
  const memPrio = agent?.memPrio ?? 3;
  const k = maxItems ?? Math.max(0, Math.min(8, memPrio * 2));
  if (k === 0) return { items: [], block: '' };
  const filters = {
    minConfidence,
    tags: agent?.tags && agent.tags.length ? agent.tags : undefined,
  };
  let items = query ? searchMemories(query, { ...filters, limit: k }) : listMemories({ status: 'active', ...filters }).slice(0, k);
  if (!items.length && agent?.tags?.length) {
    // Fallback : ignore tags filter
    items = query ? searchMemories(query, { limit: k }) : listMemories({ status: 'active' }).slice(0, k);
  }
  if (!items.length) return { items: [], block: '' };
  for (const m of items) noteMemoryAccess(m.id);
  const lines = items.map((m, i) => `(${i + 1}) [id:${m.id}] [${m.type}] ${m.content}`);
  // Phase 8 — bloc complémentaire listant les 30 mémoires les plus récentes
  // (id + extrait court) pour que l'agent puisse cibler une mémoire ancienne
  // à modifier/supprimer même si elle n'est pas dans le top-K pertinent.
  const recent = listMemories({ status: 'active' }).slice(0, 30)
    .filter((m) => !items.find((x) => x.id === m.id));
  const recentBlock = recent.length
    ? `\n\n### MÉMOIRES RÉCENTES (${recent.length}) — utiliser ces id pour update/delete\n` +
      recent.map((m) => `- [id:${m.id}] [${m.type}] ${(m.content || '').slice(0, 120).replace(/\n/g, ' ')}`).join('\n')
    : '';
  const block =
    `### MÉMOIRE PERTINENTE (${items.length})\n` +
    `Utilise les éléments suivants comme contexte factuel quand pertinent. Ne les cite pas explicitement sauf demande.\n` +
    `Chaque entrée commence par son [id:m_xxx] que tu peux réutiliser pour la modifier ou supprimer (voir « OUTILS MÉMOIRE »).\n\n` +
    lines.join('\n') + recentBlock;
  return { items, block };
}

/**
 * Instructions pour les outils d'écriture mémoire (créer / modifier / supprimer).
 * Concaténé au system prompt quand l'injection mémoire est active.
 */
export const MEMORY_TOOLS_INSTRUCTIONS =
  `### OUTILS MÉMOIRE (écriture)\n` +
  `Tu peux créer, modifier ou supprimer des mémoires en émettant ces balises dans ta réponse.\n` +
  `Les balises sont retirées avant affichage à l'utilisateur et remplacées par un court accusé de réception.\n` +
  `\n` +
  `- Créer : <memory:create type="fact|preference|instruction|summary" tags="tag1,tag2" confidence="0.8">contenu durable</memory:create>\n` +
  `- Modifier : <memory:update id="m_xxx">nouveau contenu</memory:update>\n` +
  `- Supprimer : <memory:delete id="m_xxx"/>\n` +
  `\n` +
  `Règles : (1) n'écris une mémoire que si l'utilisateur le demande ou qu'une information durable mérite d'être enregistrée ; ` +
  `(2) ne mémorise jamais des secrets, mots de passe, ou propos sensibles ; ` +
  `(3) un seul fait par balise <memory:create> ; ` +
  `(4) pour modifier/supprimer, l'id doit provenir du bloc « MÉMOIRE PERTINENTE » ci-dessus.`;

function parseAttrs(s) {
  const out = {};
  // Accept double + single quotes, and bare values
  const re = /([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]);
  return out;
}

/**
 * Parse + execute memory write directives in an assistant message.
 * Returns { cleanedContent, results: [{ op, ok, message, id? }] }.
 */
export async function applyMemoryDirectives(rawContent) {
  const results = [];
  if (!rawContent || rawContent.indexOf('<memory:') === -1) {
    return { cleanedContent: rawContent, results };
  }
  // Extract all directives in order. Tolerates self-closing, empty body,
  // whitespace before /> and inside the closing tag.
  const ops = [];
  const re = /<memory:(create|update|delete)\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/memory:\1\s*>)/g;
  let m;
  while ((m = re.exec(rawContent))) {
    ops.push({ raw: m[0], op: m[1], attrs: parseAttrs(m[2] || ''), body: (m[3] || '').trim() });
  }

  const replacements = [];
  for (const o of ops) {
    try {
      if (o.op === 'create') {
        const created = await addMemory({
          content: o.body,
          source: 'agent',
          type: o.attrs.type || 'fact',
          tags: (o.attrs.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
          confidence: o.attrs.confidence != null ? Number(o.attrs.confidence) : 0.8,
          owner: o.attrs.owner || 'global',
        });
        replacements.push({ raw: o.raw, replacement: `_[mémoire créée · ${created.type} · ${created.id}]_` });
        results.push({ op: 'create', ok: true, id: created.id, message: 'créée' });
      } else if (o.op === 'update') {
        if (!o.attrs.id) throw new Error('id manquant');
        await updateMemory(o.attrs.id, { content: o.body });
        replacements.push({ raw: o.raw, replacement: `_[mémoire mise à jour · ${o.attrs.id}]_` });
        results.push({ op: 'update', ok: true, id: o.attrs.id, message: 'mise à jour' });
      } else if (o.op === 'delete') {
        if (!o.attrs.id) throw new Error('id manquant');
        await deleteMemory(o.attrs.id);
        replacements.push({ raw: o.raw, replacement: `_[mémoire supprimée · ${o.attrs.id}]_` });
        results.push({ op: 'delete', ok: true, id: o.attrs.id, message: 'supprimée' });
      }
    } catch (err) {
      replacements.push({ raw: o.raw, replacement: `_[échec mémoire ${o.op} : ${err.message}]_` });
      results.push({ op: o.op, ok: false, message: err.message });
    }
  }

  let cleaned = rawContent;
  for (const r of replacements) cleaned = cleaned.split(r.raw).join(r.replacement);
  return { cleanedContent: cleaned, results };
}

export function exportMemories() {
  return JSON.stringify({ schemaVersion: 2, memories }, null, 2);
}

export async function importMemories(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj.memories) ? obj.memories : [];
  let added = 0;
  for (const raw of arr) {
    const candidate = { ...raw };
    delete candidate.id;
    try { await addMemory(candidate); added++; } catch (e) { log.warn(`import skip: ${e.message}`); }
  }
  return added;
}
