// Agent self-management tools — directives an agent can emit in its response
// to create / update / archive / delete agents. Phase 7.
//
// Tags supported (XML-ish, parsed regex):
//   <agent:create name="..." role="..." tags="t1,t2" temperature="0.7" style="concis">
//     instructions multilignes ici
//   </agent:create>
//   <agent:update id="ag_xxx" name="..." role="..." temperature="...">nouvelles instructions</agent:update>
//   <agent:archive id="ag_xxx"/>
//   <agent:delete id="ag_xxx"/>

import {
  createAgent, updateAgent, archiveAgent, deleteAgent, listAgents, getAgent,
} from './agent-manager.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('agent-tools');

export const AGENT_TOOLS_INSTRUCTIONS =
  `### OUTILS AGENTS (création / édition)\n` +
  `Tu peux créer, modifier, archiver ou supprimer des agents en émettant ces balises.\n` +
  `Elles sont retirées avant affichage et remplacées par un court accusé de réception.\n` +
  `\n` +
  `- Créer : <agent:create name="NomUnique" role="rôle court" tags="tag1,tag2" temperature="0.5" style="concis|detaille|formel|creatif|pedagogique" avatar="◈" color="#00e5ff">instructions complètes (multilignes autorisées)</agent:create>\n` +
  `- Modifier : <agent:update id="ag_xxx" name="..." role="..." temperature="...">nouvelles instructions</agent:update>\n` +
  `- Archiver : <agent:archive id="ag_xxx"/>\n` +
  `- Supprimer : <agent:delete id="ag_xxx"/>\n` +
  `\n` +
  `Règles : (1) ne crée un agent QUE si l'utilisateur le demande explicitement ; ` +
  `(2) le \`name\` doit être unique (ajoute un suffixe numérique si besoin) ; ` +
  `(3) pour update/archive/delete, l'id doit provenir de la liste « AGENTS DISPONIBLES » ci-dessous ; ` +
  `(4) une seule opération par balise.`;

export function buildAgentDirectory() {
  const all = listAgents({ includeArchived: false });
  if (!all.length) return '';
  const lines = all.map((a) => `- [id:${a.id}] ${a.name} — ${a.role || '(sans rôle)'}`);
  return `### AGENTS DISPONIBLES (${all.length})\n${lines.join('\n')}`;
}

function parseAttrs(s) {
  const out = {};
  // Accept double + single quotes
  const re = /([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2] != null ? m[2] : m[3];
  return out;
}

const TAG_RE = /<agent:(create|update|archive|delete)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/agent:\1>)/g;

function patchFromAttrs(attrs, body) {
  const patch = {};
  if (attrs.name) patch.name = attrs.name;
  if (attrs.role) patch.role = attrs.role;
  if (attrs.desc) patch.desc = attrs.desc;
  if (attrs.style) patch.style = attrs.style;
  if (attrs.avatar) patch.avatar = attrs.avatar;
  if (attrs.color) patch.color = attrs.color;
  if (attrs.tags) patch.tags = attrs.tags.split(',').map((s) => s.trim()).filter(Boolean);
  if (attrs.temperature != null && attrs.temperature !== '') patch.temperature = Number(attrs.temperature);
  if (attrs.maxTokens != null && attrs.maxTokens !== '') patch.maxTokens = Number(attrs.maxTokens);
  if (attrs.modelPref) patch.modelPref = attrs.modelPref;
  if (body && body.trim()) patch.instructions = body.trim();
  return patch;
}

/**
 * Parse + execute agent directives in an assistant message.
 * Returns { cleanedContent, results: [{ op, ok, message, id? }] }.
 */
export async function applyAgentDirectives(rawContent) {
  const results = [];
  if (!rawContent || rawContent.indexOf('<agent:') === -1) {
    return { cleanedContent: rawContent, results };
  }
  const ops = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(rawContent))) {
    ops.push({ raw: m[0], op: m[1], attrs: parseAttrs(m[2] || ''), body: (m[3] || '').trim() });
  }

  const replacements = [];
  for (const o of ops) {
    try {
      if (o.op === 'create') {
        if (!o.attrs.name) throw new Error('attribut "name" requis');
        const created = await createAgent({
          ...patchFromAttrs(o.attrs, o.body),
          lifecycle: 'active',
        }, { autoSuffix: true });
        replacements.push({ raw: o.raw, replacement: `_[agent créé · ${created.name} · ${created.id}]_` });
        results.push({ op: 'create', ok: true, id: created.id, message: 'créé' });
      } else if (o.op === 'update') {
        if (!o.attrs.id) throw new Error('id manquant');
        const updated = await updateAgent(o.attrs.id, patchFromAttrs(o.attrs, o.body));
        replacements.push({ raw: o.raw, replacement: `_[agent mis à jour · ${updated.name}]_` });
        results.push({ op: 'update', ok: true, id: updated.id, message: 'mis à jour' });
      } else if (o.op === 'archive') {
        if (!o.attrs.id) throw new Error('id manquant');
        await archiveAgent(o.attrs.id);
        replacements.push({ raw: o.raw, replacement: `_[agent archivé · ${o.attrs.id}]_` });
        results.push({ op: 'archive', ok: true, id: o.attrs.id, message: 'archivé' });
      } else if (o.op === 'delete') {
        if (!o.attrs.id) throw new Error('id manquant');
        const a = getAgent(o.attrs.id);
        const name = a?.name || o.attrs.id;
        await deleteAgent(o.attrs.id);
        replacements.push({ raw: o.raw, replacement: `_[agent supprimé · ${name}]_` });
        results.push({ op: 'delete', ok: true, id: o.attrs.id, message: 'supprimé' });
      }
    } catch (err) {
      replacements.push({ raw: o.raw, replacement: `_[échec agent ${o.op} : ${err.message}]_` });
      results.push({ op: o.op, ok: false, message: err.message });
      log.warn(`agent ${o.op} failed`, err.message);
    }
  }

  let cleaned = rawContent;
  for (const r of replacements) cleaned = cleaned.split(r.raw).join(r.replacement);
  return { cleanedContent: cleaned, results };
}
