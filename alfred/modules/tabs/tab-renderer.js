// Tab bar renderer — Phase 3

import {
  listTabs, getActiveId, createTab, closeTab, switchTab,
  renameTab, togglePin, reorderTabs,
} from './tab-engine.js';
import { bus, EVT } from '../core/event-bus.js';
import { escapeHtml } from '../ui/sanitize.js';

let root;
let dragId = null;

export function mountTabBar(container) {
  root = container;
  root.classList.add('tab-bar');
  root.setAttribute('role', 'tablist');
  root.innerHTML = '';
  render();

  root.addEventListener('click', onClick);
  root.addEventListener('auxclick', onAuxClick);
  root.addEventListener('dblclick', onDblClick);
  root.addEventListener('contextmenu', onContext);

  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  root.addEventListener('dragend', onDragEnd);

  // Re-render on tab events
  bus.on(EVT.TAB_CREATED, render);
  bus.on(EVT.TAB_CLOSED, render);
  bus.on(EVT.TAB_SWITCHED, render);
  bus.on(EVT.TAB_UPDATED, render);
}

function render() {
  if (!root) return;
  const active = getActiveId();
  const tabs = listTabs();
  const items = tabs.map((t) => `
    <div class="tab-item ${t.id === active ? 'is-active' : ''} ${t.pinned ? 'is-pinned' : ''}"
         role="tab" aria-selected="${t.id === active}"
         data-id="${t.id}" draggable="true" title="${escapeHtml(t.title)}">
      ${t.pinned ? '<span class="tab-pin" aria-hidden="true">📌</span>' : ''}
      <span class="tab-title">${escapeHtml(t.title)}</span>
      ${t.pinned ? '' : `<button class="tab-close" data-action="close" aria-label="Fermer">×</button>`}
    </div>
  `).join('');
  root.innerHTML = `
    <div class="tab-bar-inner">${items}</div>
    <button class="tab-new" data-action="new" type="button" title="Nouvelle conversation (Ctrl+N)">+</button>
  `;
}

function onClick(e) {
  const newBtn = e.target.closest('[data-action="new"]');
  if (newBtn) { createTab(); return; }
  const close = e.target.closest('[data-action="close"]');
  if (close) {
    const id = close.closest('.tab-item').dataset.id;
    if (confirm('Fermer cet onglet (la conversation sera supprimée) ?')) closeTab(id);
    return;
  }
  const item = e.target.closest('.tab-item');
  if (item) switchTab(item.dataset.id);
}

function onAuxClick(e) {
  if (e.button !== 1) return;
  const item = e.target.closest('.tab-item');
  if (!item) return;
  e.preventDefault();
  if (confirm('Fermer cet onglet ?')) closeTab(item.dataset.id);
}

function onDblClick(e) {
  const item = e.target.closest('.tab-item');
  if (!item) return;
  if (e.target.closest('.tab-close')) return;
  const id = item.dataset.id;
  const titleEl = item.querySelector('.tab-title');
  const current = titleEl.textContent;
  const next = prompt('Renommer l\'onglet :', current);
  if (next !== null && next.trim() !== '') renameTab(id, next.trim());
}

function onContext(e) {
  const item = e.target.closest('.tab-item');
  if (!item) return;
  e.preventDefault();
  const id = item.dataset.id;
  const pinned = item.classList.contains('is-pinned');
  // simple context: use confirm/prompt cascade — pragmatic, no extra UI
  const choice = prompt(
    `Action sur "${item.querySelector('.tab-title').textContent}" :\n` +
    `  1 = ${pinned ? 'Désépingler' : 'Épingler'}\n` +
    `  2 = Renommer\n` +
    `  3 = Fermer\n\nNuméro :`,
    '1'
  );
  if (choice === '1') togglePin(id);
  else if (choice === '2') {
    const next = prompt('Nouveau titre :', item.querySelector('.tab-title').textContent);
    if (next) renameTab(id, next.trim());
  } else if (choice === '3') {
    if (!pinned && confirm('Fermer ?')) closeTab(id);
  }
}

function onDragStart(e) {
  const item = e.target.closest('.tab-item');
  if (!item) return;
  dragId = item.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  item.classList.add('is-dragging');
}
function onDragOver(e) {
  if (!dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function onDrop(e) {
  if (!dragId) return;
  e.preventDefault();
  const target = e.target.closest('.tab-item');
  const ids = listTabs().map((t) => t.id);
  const from = ids.indexOf(dragId);
  ids.splice(from, 1);
  let to = ids.length;
  if (target && target.dataset.id !== dragId) to = ids.indexOf(target.dataset.id);
  ids.splice(to, 0, dragId);
  reorderTabs(ids);
}
function onDragEnd() {
  dragId = null;
  root.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
}