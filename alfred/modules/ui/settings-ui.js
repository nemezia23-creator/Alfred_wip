// Settings UI — modal exposing every user-toggleable setting.
// Phase 7. Replaces the old "prompt() pour la clé API" flow.

import { allSettings, getSetting, setSetting, DEFAULTS } from '../core/settings.js';
import { hasApiKey, setApiKey, clearApiKey } from '../core/api-bridge.js';
import { applyTheme, applyDensity } from './theme-engine.js';
import { toast } from './toast.js';
import { escapeHtml } from './sanitize.js';

let modalEl = null;

const SECTIONS = [
  {
    id: 'general',
    label: 'Général',
    fields: [
      { key: 'theme', label: 'Thème', type: 'select', options: ['cyber', 'midnight', 'light'], onChange: (v) => applyTheme(v) },
      { key: 'density', label: 'Densité', type: 'select', options: ['compact', 'normal', 'spacious'], onChange: (v) => applyDensity(v) },
      { key: 'log_level', label: 'Niveau de logs', type: 'select', options: ['debug', 'info', 'warn', 'error', 'silent'] },
    ],
  },
  {
    id: 'api',
    label: 'API',
    custom: 'renderApi',
  },
  {
    id: 'chat',
    label: 'Chat',
    fields: [
      { key: 'chat.model', label: 'Modèle Mistral par défaut', type: 'select',
        options: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'] },
      { key: 'chat.temperature', label: 'Température (0–1.5)', type: 'number', min: 0, max: 1.5, step: 0.05, def: 0.7 },
      { key: 'chat.system_prompt', label: 'System prompt par défaut (sans agent)', type: 'textarea' },
    ],
  },
  {
    id: 'memory',
    label: 'Mémoire',
    fields: [
      { key: 'memory.inject', label: 'Injecter les mémoires pertinentes dans le system prompt', type: 'bool', def: true },
      { key: 'memory.tools', label: 'Autoriser les agents à créer / modifier / supprimer des mémoires', type: 'bool', def: true },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    fields: [
      { key: 'agents.tools', label: 'Autoriser les agents à créer / modifier / archiver d’autres agents', type: 'bool', def: true },
    ],
  },
  {
    id: 'files',
    label: 'Fichiers',
    fields: [
      { key: 'files.attachToChat', label: 'Joindre le fichier au chat (mémorisation manuelle)', type: 'bool', def: true,
        help: 'Si actif, un fichier glissé apparaît comme pièce jointe dans le message en cours, avec un bouton « Mémoriser ». Sinon, ingestion immédiate.' },
      { key: 'files.autoSummarize', label: 'Résumer automatiquement à l’ingestion (appelle l’API)', type: 'bool', def: true },
      { key: 'files.perChunkMemory', label: 'Créer une mémoire par extrait (sinon une seule mémoire globale)', type: 'bool', def: false,
        help: 'Désactivé par défaut depuis la v8 : un PDF de 2 pages crée 1 mémoire au lieu de 9.' },
      { key: 'files.maxSizeMB', label: 'Taille maximale (Mo)', type: 'number', min: 1, max: 200, step: 1, def: 20 },
      { key: 'files.chunkTokens', label: 'Tokens par extrait (chunk)', type: 'number', min: 200, max: 8000, step: 50, def: 2000 },
      { key: 'files.overlapTokens', label: 'Recouvrement entre extraits (tokens)', type: 'number', min: 0, max: 500, step: 10, def: 80 },
    ],
  },
];

export function openSettings() {
  closeSettings();
  modalEl = document.createElement('div');
  modalEl.className = 'set-modal-overlay';
  modalEl.innerHTML = `
    <div class="set-modal" role="dialog" aria-label="Réglages">
      <header class="set-modal-head">
        <h2>⚙ Réglages</h2>
        <button class="set-btn set-btn--ghost" data-act="close">✕</button>
      </header>
      <div class="set-modal-body">
        <nav class="set-nav">
          ${SECTIONS.map((s, i) => `<button class="set-nav-btn${i === 0 ? ' on' : ''}" data-section="${s.id}">${s.label}</button>`).join('')}
        </nav>
        <div class="set-pane" id="set-pane"></div>
      </div>
      <footer class="set-modal-foot">
        <span class="set-hint">Les modifications sont enregistrées immédiatement.</span>
      </footer>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeSettings(); });
  modalEl.querySelector('[data-act="close"]').addEventListener('click', closeSettings);
  modalEl.querySelectorAll('.set-nav-btn').forEach((b) => b.addEventListener('click', () => {
    modalEl.querySelectorAll('.set-nav-btn').forEach((x) => x.classList.toggle('on', x === b));
    renderPane(b.dataset.section);
  }));
  document.addEventListener('keydown', escClose, { capture: true });
  renderPane(SECTIONS[0].id);
}

export function closeSettings() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.removeEventListener('keydown', escClose, { capture: true });
}

function escClose(e) { if (e.key === 'Escape') closeSettings(); }

function val(key, def) {
  const v = getSetting(key);
  return v === undefined ? (def ?? DEFAULTS[key]) : v;
}

function renderPane(sectionId) {
  const pane = modalEl.querySelector('#set-pane');
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return;
  if (section.custom === 'renderApi') return renderApi(pane);
  pane.innerHTML = `<form class="set-form" autocomplete="off">${section.fields.map(renderField).join('')}</form>`;
  pane.querySelectorAll('[data-key]').forEach((input) => {
    input.addEventListener('change', () => commitField(input, section));
  });
}

function renderField(f) {
  const cur = val(f.key, f.def);
  if (f.type === 'bool') {
    return `
      <label class="set-row set-row--inline">
        <input type="checkbox" data-key="${escapeHtml(f.key)}" data-type="bool" ${cur === true ? 'checked' : ''}>
        <span class="set-label">${escapeHtml(f.label)}</span>
        ${f.help ? `<span class="set-help">${escapeHtml(f.help)}</span>` : ''}
      </label>
    `;
  }
  if (f.type === 'select') {
    return `
      <label class="set-row">
        <span class="set-label">${escapeHtml(f.label)}</span>
        <select data-key="${escapeHtml(f.key)}" data-type="select">
          ${f.options.map((o) => `<option value="${escapeHtml(o)}" ${String(cur) === String(o) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>
      </label>
    `;
  }
  if (f.type === 'number') {
    return `
      <label class="set-row">
        <span class="set-label">${escapeHtml(f.label)}</span>
        <input type="number" data-key="${escapeHtml(f.key)}" data-type="number"
          min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}" value="${cur ?? ''}">
      </label>
    `;
  }
  if (f.type === 'textarea') {
    return `
      <label class="set-row">
        <span class="set-label">${escapeHtml(f.label)}</span>
        <textarea data-key="${escapeHtml(f.key)}" data-type="text" rows="4">${escapeHtml(cur || '')}</textarea>
      </label>
    `;
  }
  return '';
}

async function commitField(input, section) {
  const key = input.dataset.key;
  const type = input.dataset.type;
  let value;
  if (type === 'bool') value = input.checked;
  else if (type === 'number') value = Number(input.value);
  else value = input.value;
  await setSetting(key, value);
  const f = section.fields.find((x) => x.key === key);
  if (f?.onChange) try { f.onChange(value); } catch {}
  toast(`✓ ${key} mis à jour.`, { type: 'success', duration: 1200 });
}

function renderApi(pane) {
  const has = hasApiKey('mistral');
  pane.innerHTML = `
    <div class="set-form">
      <div class="set-row">
        <span class="set-label">Clé API Mistral</span>
        <span class="set-pill ${has ? 'ok' : 'ko'}">${has ? '✓ enregistrée' : '✗ aucune'}</span>
      </div>
      <div class="set-row set-row--actions">
        <input type="password" id="api-key-input" placeholder="${has ? '••• (laisser vide pour conserver)' : 'sk-…'}" autocomplete="off">
        <button class="set-btn set-btn--primary" data-act="save-api">Enregistrer</button>
        <button class="set-btn set-btn--danger" data-act="clear-api" ${has ? '' : 'disabled'}>Effacer</button>
      </div>
      <p class="set-help">La clé est stockée localement (cookie + localStorage). Elle ne quitte jamais votre navigateur sauf vers l’API Mistral.</p>
    </div>
  `;
  pane.querySelector('[data-act="save-api"]').addEventListener('click', () => {
    const v = pane.querySelector('#api-key-input').value.trim();
    if (!v) { toast('Saisissez une clé.', { type: 'info' }); return; }
    setApiKey('mistral', v);
    toast('Clé enregistrée.', { type: 'success' });
    renderApi(pane);
    document.getElementById('footer-api') && (document.getElementById('footer-api').textContent = 'API · Mistral ✓');
  });
  pane.querySelector('[data-act="clear-api"]').addEventListener('click', () => {
    if (!confirm('Effacer la clé API ?')) return;
    clearApiKey('mistral');
    toast('Clé effacée.', { type: 'info' });
    renderApi(pane);
    document.getElementById('footer-api') && (document.getElementById('footer-api').textContent = 'API · Mistral ✗');
  });
}
