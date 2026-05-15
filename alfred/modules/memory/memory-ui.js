// Memory UI — modal CRUD + recherche + filtres + import/export.

import {
  loadMemories, listMemories, getMemory,
  addMemory, updateMemory, deleteMemory,
  archiveMemory, activateMemory, searchMemories,
  exportMemories, importMemories,
} from './memory-manager.js';
import { defaultMemory, SOURCES, TYPES, STATUSES } from './memory-schema.js';
import { listAgents } from '../agents/agent-manager.js';
import { bus, EVT } from '../core/event-bus.js';
import { toast } from '../ui/toast.js';
import { escapeHtml } from '../ui/sanitize.js';

let modalEl = null;
let state = { query: '', filterType: '', filterSource: '', filterStatus: 'active', filterTag: '', minConfidence: 0, selectedId: null };
const CONTENT_MAX = 10000;

export async function bootMemory() {
  await loadMemories();
}

export function openMemoryManager(focusId = null) {
  closeMemoryManager();
  if (focusId) state.selectedId = focusId;
  modalEl = document.createElement('div');
  modalEl.className = 'mem-modal-overlay';
  modalEl.innerHTML = `
    <div class="mem-modal" role="dialog" aria-label="Mémoire documentaire">
      <header class="mem-modal-head">
        <h2>⬡ Mémoire</h2>
        <div class="mem-modal-actions">
          <button class="mem-btn" data-act="new">+ Nouvelle</button>
          <button class="mem-btn" data-act="import">⇪ Import</button>
          <button class="mem-btn" data-act="export">⇩ Export</button>
          <button class="mem-btn mem-btn--ghost" data-act="close">✕</button>
        </div>
      </header>
      <div class="mem-toolbar">
        <input class="mem-search" type="search" placeholder="Rechercher dans la mémoire…" value="${escapeHtml(state.query)}">
        <select class="mem-f-type" aria-label="Type"><option value="">Type · tous</option>${TYPES.map((t) => `<option value="${t}" ${t===state.filterType?'selected':''}>${t}</option>`).join('')}</select>
        <select class="mem-f-source" aria-label="Source"><option value="">Source · toutes</option>${SOURCES.map((s) => `<option value="${s}" ${s===state.filterSource?'selected':''}>${s}</option>`).join('')}</select>
        <select class="mem-f-status" aria-label="Statut">${STATUSES.map((s) => `<option value="${s}" ${s===state.filterStatus?'selected':''}>${s}</option>`).join('')}</select>
        <input class="mem-f-tag" type="search" placeholder="Tag…" value="${escapeHtml(state.filterTag)}" aria-label="Filtre par tag" style="max-width:140px">
        <label class="mem-conf-wrap" title="Confiance minimale">
          <span>conf ≥ <strong class="mem-conf-val">${Math.round(state.minConfidence*100)}%</strong></span>
          <input class="mem-f-conf" type="range" min="0" max="1" step="0.05" value="${state.minConfidence}" aria-label="Confiance minimale">
        </label>
        <span class="mem-counter"></span>
      </div>
      <div class="mem-modal-body">
        <aside class="mem-list" aria-label="Liste mémoires"></aside>
        <section class="mem-edit" aria-label="Édition mémoire"></section>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeMemoryManager(); });
  modalEl.querySelector('[data-act="close"]').onclick = closeMemoryManager;
  modalEl.querySelector('[data-act="new"]').onclick = () => editMemory(null);
  modalEl.querySelector('[data-act="import"]').onclick = importDialog;
  modalEl.querySelector('[data-act="export"]').onclick = exportDialog;

  const onChange = () => { refreshList(); };
  modalEl.querySelector('.mem-search').addEventListener('input', (e) => { state.query = e.target.value; onChange(); });
  modalEl.querySelector('.mem-f-type').addEventListener('change', (e) => { state.filterType = e.target.value; onChange(); });
  modalEl.querySelector('.mem-f-source').addEventListener('change', (e) => { state.filterSource = e.target.value; onChange(); });
  modalEl.querySelector('.mem-f-status').addEventListener('change', (e) => { state.filterStatus = e.target.value; onChange(); });
  modalEl.querySelector('.mem-f-tag').addEventListener('input', (e) => { state.filterTag = e.target.value; onChange(); });
  modalEl.querySelector('.mem-f-conf').addEventListener('input', (e) => {
    state.minConfidence = Number(e.target.value);
    modalEl.querySelector('.mem-conf-val').textContent = `${Math.round(state.minConfidence*100)}%`;
    onChange();
  });

  document.addEventListener('keydown', escClose);

  refreshList();
  if (state.selectedId) editMemory(state.selectedId);
  else {
    const first = currentList()[0];
    editMemory(first?.id || null);
  }
}

export function closeMemoryManager() {
  if (!modalEl) return;
  document.removeEventListener('keydown', escClose);
  modalEl.remove(); modalEl = null;
}

function escClose(e) { if (e.key === 'Escape') closeMemoryManager(); }

function currentList() {
  const tags = state.filterTag.trim()
    ? state.filterTag.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined;
  const filters = {
    status: state.filterStatus,
    type: state.filterType || undefined,
    source: state.filterSource || undefined,
    tags,
    minConfidence: state.minConfidence > 0 ? state.minConfidence : undefined,
  };
  if (state.query.trim()) {
    return searchMemories(state.query, { ...filters, limit: 200 });
  }
  return listMemories(filters);
}

function refreshList() {
  if (!modalEl) return;
  const aside = modalEl.querySelector('.mem-list');
  const items = currentList();
  modalEl.querySelector('.mem-counter').textContent = `${items.length} entrée(s)`;
  if (!items.length) {
    aside.innerHTML = `<p class="mem-empty">Aucune mémoire. Cliquez "+ Nouvelle".</p>`;
    return;
  }
  aside.innerHTML = items.map((m) => {
    const preview = (m.content || '').replace(/\s+/g, ' ').slice(0, 80);
    return `
      <button class="mem-item ${m.id === state.selectedId ? 'on' : ''}" data-id="${m.id}" type="button">
        <span class="mem-item-type">${escapeHtml(m.type)}</span>
        <span class="mem-item-content">${escapeHtml(preview)}</span>
        <span class="mem-item-meta">
          ${escapeHtml(m.source)} · conf ${Math.round((m.confidence || 0) * 100)}%
          ${m.status !== 'active' ? ` · <em>${escapeHtml(m.status)}</em>` : ''}
        </span>
      </button>`;
  }).join('');
  aside.querySelectorAll('.mem-item').forEach((el) => {
    el.onclick = () => { state.selectedId = el.dataset.id; editMemory(el.dataset.id); refreshList(); };
  });
}

function editMemory(id) {
  if (!modalEl) return;
  const editEl = modalEl.querySelector('.mem-edit');
  const m = id ? getMemory(id) : defaultMemory();
  if (!m) { editEl.innerHTML = `<p class="mem-empty">Sélectionnez une mémoire.</p>`; return; }
  const isNew = !id;
  const agents = listAgents();
  editEl.innerHTML = `
    <form class="mem-form" autocomplete="off">
      <label>Contenu
        <textarea name="content" rows="8" maxlength="${CONTENT_MAX}" required placeholder="Fait, préférence, instruction…">${escapeHtml(m.content)}</textarea>
        <span class="mem-char-counter" aria-live="polite"><span class="mem-char-count">${(m.content || '').length}</span>/${CONTENT_MAX}</span>
      </label>
      <div class="mem-row">
        <label>Type
          <select name="type">
            ${TYPES.map((t) => `<option value="${t}" ${t === m.type ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label>Source
          <select name="source">
            ${SOURCES.map((s) => `<option value="${s}" ${s === m.source ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label>Statut
          <select name="status">
            ${STATUSES.map((s) => `<option value="${s}" ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label>Confiance (0–1)
          <input name="confidence" type="number" min="0" max="1" step="0.05" value="${m.confidence}">
        </label>
      </div>
      <div class="mem-row">
        <label>Propriétaire
          <select name="owner">
            <option value="global" ${m.owner === 'global' ? 'selected' : ''}>global</option>
            ${agents.map((a) => `<option value="${a.id}" ${a.id === m.owner ? 'selected' : ''}>${escapeHtml(a.avatar || '◈')} ${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </label>
        <label class="mem-grow">Tags (séparés par virgules)
          <input name="tags" value="${escapeHtml((m.tags || []).join(', '))}">
        </label>
      </div>
      <footer class="mem-form-actions">
        <button class="mem-btn mem-btn--primary" type="submit">${isNew ? 'Créer' : 'Enregistrer'}</button>
        ${!isNew ? `<button class="mem-btn" type="button" data-act="${m.status === 'archived' ? 'unarchive' : 'archive'}">${m.status === 'archived' ? 'Désarchiver' : 'Archiver'}</button>` : ''}
        ${!isNew ? `<button class="mem-btn mem-btn--danger" type="button" data-act="del">Supprimer</button>` : ''}
        <span class="mem-meta">${isNew ? '' : `v${m.version || 1} · ${new Date(m.updatedAt).toLocaleString('fr-FR')} · ${m.accessCount || 0} accès`}</span>
      </footer>
    </form>
  `;

  const form = editEl.querySelector('form');
  const ta = form.querySelector('textarea[name="content"]');
  const counter = form.querySelector('.mem-char-count');
  const counterWrap = form.querySelector('.mem-char-counter');
  const updateCounter = () => {
    const n = ta.value.length;
    counter.textContent = String(n);
    counterWrap.classList.toggle('is-warn', n >= CONTENT_MAX * 0.9);
    counterWrap.classList.toggle('is-max', n >= CONTENT_MAX);
  };
  ta.addEventListener('input', updateCounter);
  updateCounter();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const patch = {
      content: fd.get('content'),
      type: fd.get('type'),
      source: fd.get('source'),
      status: fd.get('status'),
      confidence: Number(fd.get('confidence')),
      owner: fd.get('owner') || 'global',
      tags: String(fd.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const saved = isNew ? await addMemory(patch) : await updateMemory(id, patch);
      toast(isNew ? 'Mémoire créée.' : 'Mémoire enregistrée.', { type: 'success' });
      state.selectedId = saved.id;
      refreshList();
      editMemory(saved.id);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  };
  editEl.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    if (!confirm('Supprimer définitivement cette mémoire ?')) return;
    await deleteMemory(id);
    toast('Mémoire supprimée.', { type: 'info' });
    state.selectedId = null;
    refreshList();
    editMemory(currentList()[0]?.id || null);
  });
  editEl.querySelector('[data-act="archive"]')?.addEventListener('click', async () => {
    await archiveMemory(id); refreshList(); editMemory(id);
  });
  editEl.querySelector('[data-act="unarchive"]')?.addEventListener('click', async () => {
    await activateMemory(id); refreshList(); editMemory(id);
  });
}

function importDialog() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0]; if (!f) return;
    try {
      const text = await f.text();
      const n = await importMemories(text);
      toast(`${n} mémoire(s) importée(s).`, { type: 'success' });
      refreshList();
    } catch (err) {
      toast(`Import échoué : ${err.message}`, { type: 'error' });
    }
  };
  input.click();
}

function exportDialog() {
  const json = exportMemories();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `alfred-memories-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}

bus.on(EVT.MEMORY_ADDED, () => { if (modalEl) refreshList(); });
bus.on(EVT.MEMORY_DELETED, () => { if (modalEl) refreshList(); });
