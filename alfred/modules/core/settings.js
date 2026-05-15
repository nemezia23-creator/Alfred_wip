// Settings manager. Persisted in IndexedDB `settings` store.
// Emits SETTINGS_CHANGED on every set().

import { get, put, getAll } from './db.js';
import { bus, EVT } from './event-bus.js';
import { createLogger } from './logger.js';

const log = createLogger('settings');

export const DEFAULTS = Object.freeze({
  theme: 'cyber',
  density: 'normal',
  api_provider: 'mistral',
  api_model: 'mistral-large-latest',
  max_tabs: 20,
  message_max_width: 82,
  log_level: 'info',
  // Phase 5/6/7
  'memory.inject': true,
  'memory.tools': true,
  'agents.tools': true,
  'files.attachToChat': true,
  'files.autoSummarize': true,
  'files.perChunkMemory': false,
  'files.maxSizeMB': 20,
  'files.chunkTokens': 2000,
  'files.overlapTokens': 80,
  'chat.model': 'mistral-large-latest',
  'chat.temperature': 0.7,
  'chat.system_prompt': '',
});

const cache = new Map();
let loaded = false;

export async function loadSettings() {
  const rows = await getAll('settings');
  for (const row of rows) cache.set(row.key, row.value);
  // Apply defaults for any missing key (in-memory only — written on first set)
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!cache.has(k)) cache.set(k, v);
  }
  loaded = true;
  log.debug('loaded', Object.fromEntries(cache));
  return Object.fromEntries(cache);
}

export function getSetting(key) {
  if (!loaded) log.warn(`getSetting("${key}") before loadSettings()`);
  return cache.has(key) ? cache.get(key) : DEFAULTS[key];
}

export async function setSetting(key, value) {
  cache.set(key, value);
  await put('settings', { key, value, ts: Date.now() });
  bus.emit(EVT.SETTINGS_CHANGED, { key, value });
}

export function allSettings() {
  return Object.fromEntries(cache);
}
