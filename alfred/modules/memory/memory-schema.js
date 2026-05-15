// Memory schema (V2) — validation zero-dep.
// Référence: docs/SPECIFICATION.md §4.5.

export const MEMORY_SCHEMA_VERSION = 2;

export const SOURCES = ['manual', 'file', 'conversation', 'agent'];
export const TYPES = ['fact', 'preference', 'instruction', 'document', 'summary'];
export const STATUSES = ['active', 'archived', 'deprecated'];

export const CONSTRAINTS = Object.freeze({
  content: { min: 1, max: 10000 },
  tags: { max: 12, eachMax: 24 },
  confidence: { min: 0, max: 1 },
});

export function defaultMemory(overrides = {}) {
  const now = Date.now();
  return {
    id: 'm_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    version: 1,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    content: '',
    source: 'manual',
    type: 'fact',
    owner: 'global',
    confidence: 1,
    tags: [],
    status: 'active',
    previousVersion: null,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessed: 0,
    ...overrides,
  };
}

export function validateMemory(input) {
  const errors = [];
  const m = { ...defaultMemory(), ...input };

  const content = String(m.content || '').trim();
  if (content.length < CONSTRAINTS.content.min) errors.push('Contenu vide.');
  if (content.length > CONSTRAINTS.content.max) errors.push(`Contenu trop long (max ${CONSTRAINTS.content.max}).`);

  if (!SOURCES.includes(m.source)) errors.push('Source invalide.');
  if (!TYPES.includes(m.type)) errors.push('Type invalide.');
  if (!STATUSES.includes(m.status)) errors.push('Statut invalide.');

  const c = Number(m.confidence);
  if (Number.isNaN(c) || c < CONSTRAINTS.confidence.min || c > CONSTRAINTS.confidence.max)
    errors.push('Confiance hors [0,1].');

  if (!Array.isArray(m.tags)) errors.push('tags doit être un tableau.');
  else {
    if (m.tags.length > CONSTRAINTS.tags.max) errors.push(`Max ${CONSTRAINTS.tags.max} tags.`);
    for (const t of m.tags) {
      if (typeof t !== 'string' || !t) { errors.push('tag vide.'); break; }
      if (t.length > CONSTRAINTS.tags.eachMax) { errors.push(`tag "${t}" trop long.`); break; }
    }
  }

  if (errors.length) return { ok: false, errors };
  m.content = content;
  m.confidence = c;
  m.tags = m.tags.map((t) => String(t).trim()).filter(Boolean);
  return { ok: true, memory: m };
}
