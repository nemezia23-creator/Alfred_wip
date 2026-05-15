// Agent schema (V2) — validation sans dépendance.
// Référence: docs/SPECIFICATION.md §4.3.

export const AGENT_SCHEMA_VERSION = 2;

export const STYLES = ['', 'concis', 'detaille', 'formel', 'creatif', 'pedagogique'];
export const LIFECYCLES = ['draft', 'active', 'archived'];

export const CONSTRAINTS = Object.freeze({
  name: { min: 2, max: 40, pattern: /^[a-zA-Z0-9À-ÿ\s\-_().]+$/ },
  role: { min: 0, max: 500 },
  desc: { max: 140 },
  instructions: { max: 5000 },
  primer: { max: 1000 },
  forbidden: { max: 1000 },
  temperature: { min: 0, max: 2 },
  maxTokens: { min: 256, max: 16000 },
  memPrio: { min: 1, max: 5 },
  tags: { max: 10, eachMax: 24 },
});

export function defaultAgent(overrides = {}) {
  const now = Date.now();
  return {
    id: 'a_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    version: AGENT_SCHEMA_VERSION,
    name: '',
    role: '',
    desc: '',
    instructions: '',
    primer: '',
    tags: [],
    style: '',
    temperature: 0.7,
    maxTokens: 2048,
    modelPref: '',
    forbidden: '',
    memPrio: 3,
    avatar: '◈',
    color: '#00e5ff',
    systemPromptTemplate: '',
    tools: [],
    isOrchestrator: false,
    parentAgentId: null,
    lifecycle: 'draft',
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    avgRating: 0,
    ...overrides,
  };
}

// Returns { ok: true, agent } or { ok: false, errors: [...] }
export function validateAgent(input, { existingNames = [], excludeId = null } = {}) {
  const errors = [];
  const a = { ...defaultAgent(), ...input };

  const name = String(a.name || '').trim();
  if (name.length < CONSTRAINTS.name.min) errors.push(`Nom trop court (min ${CONSTRAINTS.name.min}).`);
  if (name.length > CONSTRAINTS.name.max) errors.push(`Nom trop long (max ${CONSTRAINTS.name.max}).`);
  if (name && !CONSTRAINTS.name.pattern.test(name)) errors.push('Nom : caractères invalides.');
  const dup = existingNames.find((n) => n.id !== excludeId && n.name.toLowerCase() === name.toLowerCase());
  if (dup) errors.push(`Nom déjà utilisé par "${dup.name}".`);

  if ((a.role || '').length > CONSTRAINTS.role.max) errors.push(`Rôle trop long (max ${CONSTRAINTS.role.max}).`);
  if ((a.desc || '').length > CONSTRAINTS.desc.max) errors.push(`Description trop longue (max ${CONSTRAINTS.desc.max}).`);
  if ((a.instructions || '').length > CONSTRAINTS.instructions.max)
    errors.push(`Instructions trop longues (max ${CONSTRAINTS.instructions.max}).`);
  if ((a.primer || '').length > CONSTRAINTS.primer.max)
    errors.push(`Primer trop long (max ${CONSTRAINTS.primer.max}).`);
  if ((a.forbidden || '').length > CONSTRAINTS.forbidden.max)
    errors.push(`Interdits trop longs (max ${CONSTRAINTS.forbidden.max}).`);

  const temp = Number(a.temperature);
  if (Number.isNaN(temp) || temp < CONSTRAINTS.temperature.min || temp > CONSTRAINTS.temperature.max)
    errors.push(`Température hors [${CONSTRAINTS.temperature.min}, ${CONSTRAINTS.temperature.max}].`);
  const mt = Number(a.maxTokens);
  if (Number.isNaN(mt) || mt < CONSTRAINTS.maxTokens.min || mt > CONSTRAINTS.maxTokens.max)
    errors.push(`maxTokens hors [${CONSTRAINTS.maxTokens.min}, ${CONSTRAINTS.maxTokens.max}].`);
  const mp = Number(a.memPrio);
  if (Number.isNaN(mp) || mp < CONSTRAINTS.memPrio.min || mp > CONSTRAINTS.memPrio.max)
    errors.push(`memPrio hors [${CONSTRAINTS.memPrio.min}, ${CONSTRAINTS.memPrio.max}].`);

  if (!STYLES.includes(a.style || '')) errors.push(`Style invalide.`);
  if (!LIFECYCLES.includes(a.lifecycle)) errors.push(`Lifecycle invalide.`);

  if (!Array.isArray(a.tags)) errors.push('tags doit être un tableau.');
  else {
    if (a.tags.length > CONSTRAINTS.tags.max) errors.push(`Max ${CONSTRAINTS.tags.max} tags.`);
    for (const t of a.tags) {
      if (typeof t !== 'string' || t.length === 0) { errors.push('tag vide.'); break; }
      if (t.length > CONSTRAINTS.tags.eachMax) { errors.push(`tag "${t}" trop long.`); break; }
    }
  }

  if (errors.length) return { ok: false, errors };
  a.name = name;
  a.temperature = temp;
  a.maxTokens = Math.round(mt);
  a.memPrio = Math.round(mp);
  a.tags = a.tags.map((t) => String(t).trim()).filter(Boolean);
  return { ok: true, agent: a };
}
