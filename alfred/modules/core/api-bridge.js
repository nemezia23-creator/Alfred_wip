// APIBridge — multi-provider abstraction.
// Phase 1: Mistral provider only. Streaming SSE wired in Phase 2 (chat-stream.js).
//
// Key storage strategy (V1 compat):
//   1. Cookie `mistral_api_key` (legacy)
//   2. localStorage `mistral_api_key` (fallback)
//
// Key is NEVER logged. NEVER persisted in IndexedDB.

import { createLogger } from './logger.js';

const log = createLogger('api');

const PROVIDERS = {
  mistral: {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    chatPath: '/chat/completions',
    keyCookie: 'mistral_api_key',
    keyStorage: 'mistral_api_key',
    defaultModel: 'mistral-large-latest',
  },
};

function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name, value, days = 365) {
  const exp = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

export function getApiKey(providerId = 'mistral') {
  const p = PROVIDERS[providerId];
  if (!p) return null;
  const fromCookie = readCookie(p.keyCookie);
  if (fromCookie) return fromCookie;
  try {
    const fromLs = localStorage.getItem(p.keyStorage);
    if (fromLs) return fromLs;
  } catch {
    /* localStorage may be blocked in strict file:// */
  }
  return null;
}

export function setApiKey(providerId, key) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`unknown provider: ${providerId}`);
  writeCookie(p.keyCookie, key);
  try {
    localStorage.setItem(p.keyStorage, key);
  } catch {
    /* ignore */
  }
  log.info(`API key set for ${providerId} (length=${key?.length ?? 0})`);
}

export function clearApiKey(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) return;
  writeCookie(p.keyCookie, '', -1);
  try {
    localStorage.removeItem(p.keyStorage);
  } catch {
    /* ignore */
  }
}

export function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    defaultModel: p.defaultModel,
  }));
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

// Health check — does NOT validate the key, only that one exists.
export function hasApiKey(providerId = 'mistral') {
  return Boolean(getApiKey(providerId));
}
