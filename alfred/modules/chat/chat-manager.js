// Chat state manager — single chat 'default' for Phase 2.
// Persists messages in IndexedDB store `chats` (one row per message, prefixed by chatId).

import { getAll, get as dbGet, put, del, clear } from '../core/db.js';
import { bus, EVT } from '../core/event-bus.js';
import { getSetting } from '../core/settings.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('chat-mgr');

export const DEFAULT_CHAT_ID = 'default';

let messages = []; // in-memory cache, sorted by ts asc
let currentChatId = DEFAULT_CHAT_ID;

export function getCurrentChatId() { return currentChatId; }
export function setCurrentChatId(id) { currentChatId = id || DEFAULT_CHAT_ID; }

function uid() {
  return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export async function loadChat(chatId = currentChatId) {
  currentChatId = chatId;
  const all = await getAll('chats');
  messages = all
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => a.ts - b.ts);
  log.debug(`loaded ${messages.length} messages for ${chatId}`);
  return messages.slice();
}

export function listMessages() { return messages.slice(); }

export async function addMessage(msg) {
  const full = {
    id: msg.id || uid(),
    chatId: msg.chatId || currentChatId,
    role: msg.role,
    content: msg.content ?? '',
    ts: msg.ts || Date.now(),
    model: msg.model,
    tokens: msg.tokens,
    rating: msg.rating ?? 0,
    agentId: msg.agentId ?? null,
  };
  messages.push(full);
  await put('chats', full);
  bus.emit(EVT.CHAT_MESSAGE, full);
  return full;
}

export async function updateMessage(id, patch) {
  let m = messages.find((x) => x.id === id);
  if (m) {
    Object.assign(m, patch);
    await put('chats', m);
    bus.emit(EVT.CHAT_MESSAGE, m);
    return m;
  }
  // Phase 8 fix : message hors cache (réponse en cours dans un autre onglet
  // après un switch). On lit/écrit directement la BDD pour ne rien perdre.
  const stored = await dbGet('chats', id);
  if (!stored) return null;
  Object.assign(stored, patch);
  await put('chats', stored);
  bus.emit(EVT.CHAT_MESSAGE, stored);
  return stored;
}

export async function deleteMessage(id) {
  const idx = messages.findIndex((x) => x.id === id);
  if (idx === -1) return;
  messages.splice(idx, 1);
  await del('chats', id);
  bus.emit(EVT.CHAT_MESSAGE, { deleted: id });
}

// Truncate after a given message id (keeps the message itself).
export async function truncateAfter(id) {
  const idx = messages.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const removed = messages.splice(idx + 1);
  for (const m of removed) await del('chats', m.id);
  bus.emit(EVT.CHAT_MESSAGE, { truncated: id });
}

export async function resetChat() {
  // delete only messages of default chat
  for (const m of messages) await del('chats', m.id);
  messages = [];
  bus.emit(EVT.CHAT_MESSAGE, { reset: true });
}

// Build the array sent to the API: trim to context window, prepend system prompt if any.
export function buildContext() {
  const win = Number(getSetting('chat.context_window')) || 20;
  const sys = (getSetting('chat.system_prompt') || '').trim();
  const tail = messages.slice(-win).map((m) => ({ role: m.role, content: m.content }));
  return sys ? [{ role: 'system', content: sys }, ...tail] : tail;
}

export function approxTokens(str) {
  return Math.ceil((str || '').length / 4);
}

// Export current chat as markdown.
export function exportMarkdown() {
  const lines = ['# Conversation Alfred', ''];
  for (const m of messages) {
    const who = m.role === 'user' ? '**Vous**' : m.role === 'assistant' ? '**Alfred**' : `**${m.role}**`;
    lines.push(`${who} _(${new Date(m.ts).toLocaleString()})_`);
    lines.push('');
    lines.push(m.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

export function exportText() {
  return messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n');
}
