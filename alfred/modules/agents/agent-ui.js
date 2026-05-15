// Agent UI — modal CRUD, selector, @ mention dropdown.
// Pure DOM, theme tokens.

import {
  loadAgents, listAgents, getAgent, createAgent, updateAgent,
  deleteAgent, archiveAgent, activateAgent, duplicateAgent, exportAgent, importAgent,
} from './agent-manager.js';
import { defaultAgent, STYLES, LIFECYCLES } from './agent-schema.js';
import { bus, EVT } from '../core/event-bus.js';
import { toast } from '../ui/toast.js';
import { escapeHtml } from '../ui/sanitize.js';

let modalEl = null;

export async function bootAgents() {
  await loadAgents();
}

// ---------- Selector (used by chat toolbar) ----------

export function fillAgentSelect(selectEl, currentId) {
  selectEl.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '— sans agent —';
  selectEl.appendChild(blank);
  for (const a of listAgents()) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = `${a.avatar || '◈'} ${a.name}`;
    if (a.id === currentId) o.selected = true;
    selectEl.appendChild(o);
  }
}

// ---------- Modal CRUD ----------

export function openAgentManager(focusAgentId = null) {
  closeAgentManager();
  modalEl = document.createElement('div');
  modalEl.className = 'agent-modal-overlay';
  modalEl.innerHTML = `
    <div class="agent-modal" role="dialog" aria-label="Gestion des agents">
      <header class="agent-modal-head">
        <h2>◈ Agents</h2>
        <div class="agent-modal-actions">
          <button class="ag-btn" data-act="new">+ Nouveau</button>
          <button class="ag-btn" data-act="import">⇪ Import</button>
          <button class="ag-btn ag-btn--ghost" data-act="close">✕</button>
        </div>
      </header>
      <div class="agent-modal-body">
        <aside class="agent-list" aria-label="Liste agents"></aside>
        <section class="agent-edit" aria-label="Édition agent"></section>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeAgentManager();
  });
  modalEl.querySelector('[data-act="close"]').onclick = closeAgentManager;
  modalEl.querySelector('[data-act="new"]').onclick = () => editAgent(null);
  modalEl.querySelector('[data-act="import"]').onclick = importAgentDialog;
  document.addEventListener('keydown', escClose);

  refreshList(focusAgentId);
  if (focusAgentId) editAgent(focusAgentId);
  else editAgent(listAgents()[0]?.id || null);

  // Phase 8.1 — keep the modal list in sync when agents are created/updated/
  // deleted by another path (e.g. another agent emitting <agent:create…>).
  // Without this, the list appeared stale and the user thought the new
  // agent had not been created.
  const offChanged = bus.on('agents:changed', () => {
    if (!modalEl) return;
    const current = modalEl.querySelector('.ag-item.on')?.dataset.id || null;
    refreshList(current);
  });
  modalEl._offAgentsChanged = offChanged;
}

export function closeAgentManager() {
  if (!modalEl) return;
  if (typeof modalEl._offAgentsChanged === 'function') {
    try { modalEl._offAgentsChanged(); } catch {}
  }
  document.removeEventListener('keydown', escClose);
  modalEl.remove();
  modalEl = null;
}

function escClose(e) { if (e.key === 'Escape') closeAgentManager(); }

function refreshList(activeId = null) {
  if (!modalEl) return;
  const aside = modalEl.querySelector('.agent-list');
  const items = listAgents({ includeArchived: true });
  aside.innerHTML = items.length === 0
    ? `<p class="ag-empty">Aucun agent. Cliquez "+ Nouveau".</p>`
    : items.map((a) => `
        <button class="ag-item ${a.id === activeId ? 'on' : ''} ${a.lifecycle === 'archived' ? 'arch' : ''}"
                data-id="${a.id}" type="button" style="--ag-color:${escapeHtml(a.color || '#00e5ff')}">
          <span class="ag-avatar">${escapeHtml(a.avatar || '◈')}</span>
          <span class="ag-name">${escapeHtml(a.name)}</span>
          <span class="ag-meta">${escapeHtml(a.lifecycle)}</span>
        </button>`).join('');
  aside.querySelectorAll('.ag-item').forEach((el) => {
    el.onclick = () => editAgent(el.dataset.id);
  });
}

function editAgent(id) {
  if (!modalEl) return;
  const editEl = modalEl.querySelector('.agent-edit');
  const a = id ? getAgent(id) : defaultAgent({ name: '', lifecycle: 'draft' });
  if (!a) { editEl.innerHTML = `<p class="ag-empty">Sélectionnez un agent.</p>`; return; }
  const isNew = !id;
  editEl.innerHTML = `
    <form class="ag-form" autocomplete="off">
      <div class="ag-row ag-row--head">
        <label>Avatar<input name="avatar" value="${escapeHtml(a.avatar)}" maxlength="4"></label>
        <label>Couleur<input name="color" type="color" value="${escapeHtml(a.color || '#00e5ff')}"></label>
        <label class="ag-grow">Nom<input name="name" value="${escapeHtml(a.name)}" required></label>
      </div>
      <label>Description courte<input name="desc" value="${escapeHtml(a.desc)}" maxlength="140"></label>
      <label>Rôle<textarea name="role" rows="2" maxlength="500">${escapeHtml(a.role)}</textarea></label>
      <label>Primer (amorce)<textarea name="primer" rows="2" maxlength="1000">${escapeHtml(a.primer)}</textarea></label>
      <label>Instructions<textarea name="instructions" rows="6" maxlength="5000">${escapeHtml(a.instructions)}</textarea></label>
      <label>Interdits<textarea name="forbidden" rows="2" maxlength="1000">${escapeHtml(a.forbidden)}</textarea></label>
      <div class="ag-row">
        <label>Style
          <select name="style">
            ${STYLES.map((s) => `<option value="${s}" ${s === a.style ? 'selected' : ''}>${s || '— défaut —'}</option>`).join('')}
          </select>
        </label>
        <label>Température
          <input name="temperature" type="number" min="0" max="2" step="0.05" value="${a.temperature}">
        </label>
        <label>maxTokens
          <input name="maxTokens" type="number" min="256" max="16000" step="64" value="${a.maxTokens}">
        </label>
        <label>Mémoire prio
          <input name="memPrio" type="number" min="1" max="5" step="1" value="${a.memPrio}">
        </label>
      </div>
      <label>Modèle préféré (laisse vide pour utiliser celui du chat)
        <input name="modelPref" value="${escapeHtml(a.modelPref || '')}" placeholder="ex. mistral-large-latest">
      </label>
      <label>Tags (séparés par virgules)
        <input name="tags" value="${escapeHtml((a.tags || []).join(', '))}">
      </label>
      <label>Cycle de vie
        <select name="lifecycle">
          ${LIFECYCLES.map((l) => `<option value="${l}" ${l === a.lifecycle ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <label>System prompt template (avancé — vide = auto)
        <textarea name="systemPromptTemplate" rows="3" placeholder="{{name}} · {{role}} · {{instructions}}">${escapeHtml(a.systemPromptTemplate || '')}</textarea>
      </label>
      <footer class="ag-form-actions">
        <button class="ag-btn ag-btn--primary" type="submit">${isNew ? 'Créer' : 'Enregistrer'}</button>
        ${!isNew ? `<button class="ag-btn" type="button" data-act="dup">Dupliquer</button>` : ''}
        ${!isNew ? `<button class="ag-btn" type="button" data-act="export">Export JSON</button>` : ''}
        ${!isNew ? `<button class="ag-btn" type="button" data-act="${a.lifecycle === 'archived' ? 'unarchive' : 'archive'}">${a.lifecycle === 'archived' ? 'Désarchiver' : 'Archiver'}</button>` : ''}
        ${!isNew ? `<button class="ag-btn ag-btn--danger" type="button" data-act="del">Supprimer</button>` : ''}
      </footer>
    </form>
  `;

  const form = editEl.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const patch = {
      name: fd.get('name'),
      desc: fd.get('desc'),
      role: fd.get('role'),
      primer: fd.get('primer'),
      instructions: fd.get('instructions'),
      forbidden: fd.get('forbidden'),
      style: fd.get('style'),
      temperature: Number(fd.get('temperature')),
      maxTokens: Number(fd.get('maxTokens')),
      memPrio: Number(fd.get('memPrio')),
      modelPref: fd.get('modelPref'),
      tags: String(fd.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean),
      lifecycle: fd.get('lifecycle'),
      avatar: fd.get('avatar') || '◈',
      color: fd.get('color') || '#00e5ff',
      systemPromptTemplate: fd.get('systemPromptTemplate'),
    };
    try {
      const saved = isNew ? await createAgent(patch, { autoSuffix: true }) : await updateAgent(id, patch);
      toast(isNew ? 'Agent créé.' : 'Agent enregistré.', { type: 'success' });
      refreshList(saved.id);
      editAgent(saved.id);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  };

  editEl.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    if (!confirm(`Supprimer définitivement l'agent "${a.name}" ?`)) return;
    await deleteAgent(id);
    toast('Agent supprimé.', { type: 'info' });
    refreshList(); editAgent(listAgents()[0]?.id || null);
  });
  editEl.querySelector('[data-act="dup"]')?.addEventListener('click', async () => {
    const n = await duplicateAgent(id);
    refreshList(n.id); editAgent(n.id);
  });
  editEl.querySelector('[data-act="archive"]')?.addEventListener('click', async () => {
    await archiveAgent(id); refreshList(id); editAgent(id);
  });
  editEl.querySelector('[data-act="unarchive"]')?.addEventListener('click', async () => {
    await activateAgent(id); refreshList(id); editAgent(id);
  });
  editEl.querySelector('[data-act="export"]')?.addEventListener('click', () => {
    const json = exportAgent(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${a.name.replace(/\W+/g, '_')}.agent.json`;
    link.click(); URL.revokeObjectURL(url);
  });
}

function importAgentDialog() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0]; if (!f) return;
    try {
      const text = await f.text();
      const a = await importAgent(text);
      toast(`Agent "${a.name}" importé.`, { type: 'success' });
      refreshList(a.id); editAgent(a.id);
    } catch (err) {
      toast(`Import échoué : ${err.message}`, { type: 'error' });
    }
  };
  input.click();
}

// Re-render selectors when agents change
bus.on(EVT.AGENT_CREATED, () => bus.emit('agents:changed'));
bus.on(EVT.AGENT_UPDATED, () => bus.emit('agents:changed'));
bus.on(EVT.AGENT_DELETED, () => bus.emit('agents:changed'));

// ---------- @ mention dropdown ----------

export function attachMentionDropdown(textarea, onPick) {
  let dd = null;
  let active = -1;
  let matches = [];

  function close() {
    dd?.remove(); dd = null; matches = []; active = -1;
  }

  function open(query) {
    matches = listAgents().filter((a) => {
      const hay = `${a.name} ${(a.tags || []).join(' ')} ${a.desc || ''}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    }).slice(0, 8);
    if (!matches.length) { close(); return; }
    if (!dd) {
      dd = document.createElement('div');
      dd.className = 'agent-mention-dd';
      document.body.appendChild(dd);
    }
    const r = textarea.getBoundingClientRect();
    dd.style.left = r.left + 'px';
    dd.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    active = 0;
    render();
  }

  function render() {
    if (!dd) return;
    dd.innerHTML = matches.map((a, i) => `
      <button class="amd-item ${i === active ? 'on' : ''}" data-i="${i}" type="button"
              style="--ag-color:${escapeHtml(a.color || '#00e5ff')}">
        <span class="amd-av">${escapeHtml(a.avatar || '◈')}</span>
        <span class="amd-name">${escapeHtml(a.name)}</span>
        <span class="amd-tags">${escapeHtml((a.tags || []).slice(0, 3).join(' · '))}</span>
      </button>
    `).join('');
    dd.querySelectorAll('.amd-item').forEach((el) => {
      el.onmousedown = (e) => { e.preventDefault(); pick(Number(el.dataset.i)); };
    });
  }

  function pick(i) {
    const a = matches[i]; if (!a) return;
    const v = textarea.value;
    const caret = textarea.selectionStart;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) { close(); return; }
    const after = v.slice(caret);
    const insert = `@${a.name} `;
    textarea.value = v.slice(0, at) + insert + after;
    textarea.selectionStart = textarea.selectionEnd = at + insert.length;
    textarea.dispatchEvent(new Event('input'));
    onPick?.(a);
    close();
  }

  textarea.addEventListener('input', () => {
    const caret = textarea.selectionStart;
    const before = textarea.value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w\-]{0,30})$/);
    if (m) open(m[1]);
    else close();
  });

  textarea.addEventListener('keydown', (e) => {
    if (!dd) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); active = (active + 1) % matches.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); active = (active - 1 + matches.length) % matches.length; render(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, { capture: true });

  textarea.addEventListener('blur', () => setTimeout(close, 120));
}
