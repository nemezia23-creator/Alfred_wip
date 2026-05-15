// Build the system prompt sent to the API for a given agent.
// Template Jinja-lite : {{name}}, {{role}}, {{primer}}, {{instructions}},
// {{forbidden}}, {{style}}, {{tags}}, {{date}}.

const STYLE_HINTS = {
  concis: 'Réponds de manière concise, sans préambule inutile.',
  detaille: 'Réponds en détail, avec exemples et nuances.',
  formel: 'Adopte un ton formel et professionnel.',
  creatif: 'Adopte un ton créatif, autorise métaphores et analogies.',
  pedagogique: 'Adopte un ton pédagogique : explique pas à pas.',
};

function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ''
  );
}

export function buildSystemPrompt(agent, { extraSystem = '' } = {}) {
  if (!agent) return extraSystem.trim() || '';

  const vars = {
    name: agent.name || 'Alfred',
    role: agent.role || '',
    primer: agent.primer || '',
    instructions: agent.instructions || '',
    forbidden: agent.forbidden || '',
    style: agent.style || '',
    tags: (agent.tags || []).join(', '),
    date: new Date().toISOString().slice(0, 10),
  };

  if (agent.systemPromptTemplate && agent.systemPromptTemplate.trim()) {
    return [fillTemplate(agent.systemPromptTemplate, vars), extraSystem].filter(Boolean).join('\n\n').trim();
  }

  const parts = [];
  parts.push(`Tu es ${vars.name}.`);
  if (vars.role) parts.push(`Rôle : ${vars.role}`);
  if (vars.primer) parts.push(vars.primer);
  if (vars.instructions) parts.push(`Instructions :\n${vars.instructions}`);
  if (agent.style && STYLE_HINTS[agent.style]) parts.push(STYLE_HINTS[agent.style]);
  if (vars.forbidden) parts.push(`À ne jamais faire :\n${vars.forbidden}`);
  if (vars.tags) parts.push(`Domaines / tags : ${vars.tags}.`);
  if (extraSystem.trim()) parts.push(extraSystem.trim());
  return parts.join('\n\n');
}

export { fillTemplate };