// Tab engine — Phase 3
// Multi-onglets persistés dans `tabs` store. Chaque tab a son propre chatId == tab.id,
// donc les messages de chat-manager sont filtrés par chatId === tabId.

import { getAll, put, del, get as dbGet } from '../core/db.js';
import { bus, EVT } from '../core/event-bus.js';
import { getSetting, setSetting } from '../core/settings.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('tab-engine');

const HARD_CAP = 50;

let tabs = [];           // sorted by `order` asc
let activeId = null;

function uid() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function sortTabs() {
  tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function emit(type, payload) { bus.emit(type, payload); }

export async function loadTabs() {
  tabs = await getAll('tabs');
  sortTabs();
  if (tabs.length === 0) {
    const first = await _createInternal({ title: 'Conversation 1' });
    tabs = [first];
  }
  const saved = getSetting('tabs.activeId');
  activeId = (saved && tabs.find((t) => t.id === saved)?.id) || tabs[0].id;
  log.info(`loaded ${tabs.length} tabs, active=${activeId}`);
  return { tabs: tabs.slice(), activeId };
}

export function listTabs() { return tabs.slice(); }
export function getActiveId() { return activeId; }
export function getActive() { return tabs.find((t) => t.id === activeId) || null; }
export function getTab(id) { return tabs.find((t) => t.id === id) || null; }

async function _createInternal({ title, agentId = null, model = null } = {}) {
  const now = Date.now();
  const tab = {
    id: uid(),
    title: title || `Conversation ${tabs.length + 1}`,
    agentId,
    model: model || getSetting('chat.model') || 'mistral-large-latest',
    pinned: false,
    order: tabs.length ? Math.max(...tabs.map((t) => t.order ?? 0)) + 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  await put('tabs', tab);
  return tab;
}

export async function createTab(opts = {}) {
  if (tabs.length >= (Number(getSetting('max_tabs')) || 20)) {
    log.warn('max_tabs reached — archiving oldest non-pinned');
    const oldest = tabs.filter((t) => !t.pinned).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) await closeTab(oldest.id, { silent: true });
  }
  if (tabs.length >= HARD_CAP) throw new Error(`Hard cap ${HARD_CAP} tabs atteint.`);
  const tab = await _createInternal(opts);
  tabs.push(tab);
  emit(EVT.TAB_CREATED, tab);
  await switchTab(tab.id);
  return tab;
}

export async function closeTab(id, { silent = false } = {}) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  if (tab.pinned) {
    if (!silent) bus.emit('toast', { msg: 'Onglet épinglé — désépinglez avant fermeture.', type: 'info' });
    return;
  }
  // delete associated messages
  const allMsgs = await getAll('chats');
  for (const m of allMsgs) if (m.chatId === id) await del('chats', m.id);
  await del('tabs', id);
  tabs.splice(idx, 1);

  if (!silent) emit(EVT.TAB_CLOSED, { id });

  if (tabs.length === 0) {
    const t = await _createInternal({ title: 'Conversation 1' });
    tabs.push(t);
    emit(EVT.TAB_CREATED, t);
    await switchTab(t.id);
    return;
  }
  if (activeId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    await switchTab(next.id);
  }
}

export async function switchTab(id) {
  if (!tabs.find((t) => t.id === id)) return;
  if (activeId === id) {
    emit(EVT.TAB_SWITCHED, { id });
    return;
  }
  activeId = id;
  await setSetting('tabs.activeId', id);
  emit(EVT.TAB_SWITCHED, { id });
}

export async function renameTab(id, title) {
  const tab = getTab(id);
  if (!tab) return;
  tab.title = (title || '').slice(0, 60).trim() || tab.title;
  tab.updatedAt = Date.now();
  await put('tabs', tab);
  emit(EVT.TAB_UPDATED, tab);
}

export async function togglePin(id) {
  const tab = getTab(id);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  tab.updatedAt = Date.now();
  await put('tabs', tab);
  emit(EVT.TAB_UPDATED, tab);
}

export async function setTabAgent(id, agentId) {
  const tab = getTab(id);
  if (!tab) return;
  tab.agentId = agentId || null;
  tab.updatedAt = Date.now();
  await put('tabs', tab);
  emit(EVT.TAB_UPDATED, tab);
}

export async function reorderTabs(orderedIds) {
  const map = new Map(tabs.map((t) => [t.id, t]));
  let i = 0;
  for (const id of orderedIds) {
    const t = map.get(id);
    if (t) { t.order = i++; await put('tabs', t); }
  }
  sortTabs();
  emit(EVT.TAB_UPDATED, { reordered: true });
}

export async function cycleTab(dir = 1) {
  if (tabs.length < 2) return;
  const idx = tabs.findIndex((t) => t.id === activeId);
  const nextIdx = (idx + dir + tabs.length) % tabs.length;
  await switchTab(tabs[nextIdx].id);
}

// Auto-title from first user message
export async function maybeAutoTitle(tabId, content) {
  const tab = getTab(tabId);
  if (!tab) return;
  // Only retitle if title still default-looking
  if (!/^Conversation \d+$/.test(tab.title)) return;
  const title = (content || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (title) await renameTab(tabId, title);
}

export async function touchActive() {
  const tab = getActive();
  if (!tab) return;
  tab.updatedAt = Date.now();
  await put('tabs', tab);
}

// Anti-new-window: redirect user to Ctrl+N convention.
export function installWindowOpenGuard() {
  const original = window.open;
  window.open = function () {
    log.warn('window.open intercepté — Alfred fonctionne en onglets');
    bus.emit('toast', {
      msg: 'Alfred fonctionne en onglets. Ctrl+N (ou bouton +) pour une nouvelle conversation.',
      type: 'info',
    });
    return null;
  };
  window.open.__alfred_original = original;
}