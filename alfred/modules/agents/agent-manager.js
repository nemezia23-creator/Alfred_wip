// AgentManager — CRUD agents persistés dans le store `agents`.
// Émet AGENT_CREATED / AGENT_UPDATED / AGENT_DELETED.

import { getAll, get as dbGet, put, del } from '../core/db.js';
import { bus, EVT } from '../core/event-bus.js';
import { getSetting, setSetting } from '../core/settings.js';
import { createLogger } from '../core/logger.js';
import { defaultAgent, validateAgent, AGENT_SCHEMA_VERSION } from './agent-schema.js';

const log = createLogger('agent-mgr');

let agents = [];

export async function loadAgents() {
  agents = await getAll('agents');
  // Migrate old V1 agents missing version
  for (const a of agents) {
    if (!a.version) {
      Object.assign(a, defaultAgent(a));
      a.version = AGENT_SCHEMA_VERSION;
      await put('agents', a);
    }
  }
  agents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  log.info(`loaded ${agents.length} agents`);
  await seedDefaultsIfNeeded();
  return agents.slice();
}

export function listAgents({ includeArchived = false } = {}) {
  return agents
    .filter((a) => includeArchived || a.lifecycle !== 'archived')
    .slice();
}

export function getAgent(id) {
  if (!id) return null;
  return agents.find((a) => a.id === id) || null;
}

function existingNames() {
  return agents.map((a) => ({ id: a.id, name: a.name }));
}

// Returns a unique variant of `name`. If taken, appends " (2)", " (3)"…
// excludeId lets a rename re-use its own current name.
function uniquifyName(name, { excludeId = null } = {}) {
  const base = String(name || '').trim();
  if (!base) return base;
  const taken = new Set(
    agents.filter((a) => a.id !== excludeId).map((a) => a.name.toLowerCase())
  );
  if (!taken.has(base.toLowerCase())) return base;
  // Strip an existing "(N)" suffix to rebuild cleanly
  const m = base.match(/^(.*?)\s*\((\d+)\)\s*$/);
  const root = m ? m[1].trim() : base;
  let n = m ? Number(m[2]) + 1 : 2;
  while (taken.has(`${root} (${n})`.toLowerCase())) n++;
  return `${root} (${n})`;
}

export async function createAgent(input, { autoSuffix = false } = {}) {
  let candidate = { ...input };
  if (autoSuffix) candidate.name = uniquifyName(candidate.name);
  const v = validateAgent(candidate, { existingNames: existingNames() });
  if (!v.ok) throw new Error(v.errors.join(' · '));
  const a = v.agent;
  agents.push(a);
  agents.sort((x, y) => (x.name || '').localeCompare(y.name || ''));
  await put('agents', a);
  bus.emit(EVT.AGENT_CREATED, a);
  log.info(`agent created: "${a.name}" (${a.id})`);
  return a;
}

export async function updateAgent(id, patch) {
  const cur = getAgent(id);
  if (!cur) throw new Error('Agent introuvable');
  const merged = { ...cur, ...patch, updatedAt: Date.now() };
  const v = validateAgent(merged, { existingNames: existingNames(), excludeId: id });
  if (!v.ok) throw new Error(v.errors.join(' · '));
  Object.assign(cur, v.agent);
  agents.sort((x, y) => (x.name || '').localeCompare(y.name || ''));
  await put('agents', cur);
  bus.emit(EVT.AGENT_UPDATED, cur);
  log.info(`agent updated: "${cur.name}" (${cur.id})`);
  return cur;
}

export async function deleteAgent(id) {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const [removed] = agents.splice(idx, 1);
  await del('agents', id);
  bus.emit(EVT.AGENT_DELETED, { id, agent: removed });
  log.info(`agent deleted: "${removed.name}" (${id})`);
}

export async function archiveAgent(id) {
  return updateAgent(id, { lifecycle: 'archived' });
}
export async function activateAgent(id) {
  return updateAgent(id, { lifecycle: 'active' });
}

export async function duplicateAgent(id) {
  const a = getAgent(id);
  if (!a) throw new Error('Agent introuvable');
  const copy = { ...a, name: `${a.name} (copie)`, lifecycle: 'draft' };
  delete copy.id; delete copy.createdAt; delete copy.updatedAt;
  return createAgent(copy, { autoSuffix: true });
}

export function exportAgent(id) {
  const a = getAgent(id);
  if (!a) return null;
  return JSON.stringify(a, null, 2);
}

export async function importAgent(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  delete obj.id; // assign new
  return createAgent(obj, { autoSuffix: true });
}

export async function noteAgentUsed(id, rating = null) {
  const a = getAgent(id);
  if (!a) return;
  a.usageCount = (a.usageCount || 0) + 1;
  if (a.lifecycle === 'draft') a.lifecycle = 'active';
  if (rating != null && rating > 0) {
    const n = a._ratedCount || 0;
    a.avgRating = ((a.avgRating || 0) * n + rating) / (n + 1);
    a._ratedCount = n + 1;
  }
  a.updatedAt = Date.now();
  await put('agents', a);
  bus.emit(EVT.AGENT_UPDATED, a);
}

// ----- Default seed -----

const DEFAULT_AGENTS = [
  {
    name: 'Généraliste',
    role: 'Assistant polyvalent capable de répondre à toutes questions courantes.',
    desc: 'Agent par défaut, équilibré.',
    instructions: "Réponds clairement, structuré, en français. Si tu ne sais pas, dis-le.",
    style: 'detaille', temperature: 0.7, avatar: '◈', color: '#00e5ff',
    tags: ['general'], lifecycle: 'active',
  },
  {
    name: 'CodeForge',
    role: 'Ingénieur logiciel senior, expert multi-langages.',
    desc: 'Code review, debug, architecture.',
    instructions: "Donne du code commenté, signale les pièges, propose des alternatives. Utilise des blocs ``` avec le langage.",
    style: 'concis', temperature: 0.3, avatar: '⌬', color: '#00ff9d',
    tags: ['code', 'dev', 'debug'], lifecycle: 'active',
  },
  {
    name: 'WriterPro',
    role: 'Rédacteur professionnel, soin du style et de la cohérence.',
    desc: 'Rédaction longue, reformulation, ton.',
    instructions: "Soigne le rythme, varie les structures de phrases, évite les répétitions.",
    style: 'creatif', temperature: 0.85, avatar: '✎', color: '#ff6b35',
    tags: ['writing', 'redaction'], lifecycle: 'active',
  },
  {
    name: 'ResearchBot',
    role: 'Chercheur méthodique, raisonne pas à pas et cite ses hypothèses.',
    desc: 'Recherche, synthèse, comparaison.',
    instructions: "Structure : Hypothèses → Analyse → Synthèse → Limites. Identifie ce qui reste incertain.",
    style: 'pedagogique', temperature: 0.5, avatar: '🔬', color: '#7c3aed',
    tags: ['research', 'analysis'], lifecycle: 'active',
  },
];

async function seedDefaultsIfNeeded() {
  if (getSetting('agents_seeded') === true) return;
  const haveAny = agents.length > 0;
  if (!haveAny) {
    for (const tpl of DEFAULT_AGENTS) {
      try {
        await createAgent(tpl);
      } catch (e) {
        log.warn(`seed "${tpl.name}" failed: ${e.message}`);
      }
    }
    log.info(`seeded ${DEFAULT_AGENTS.length} default agents`);
  }
  await setSetting('agents_seeded', true);
}
