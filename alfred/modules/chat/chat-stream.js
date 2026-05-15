// Mistral SSE streaming wrapper.

import { getApiKey, getProvider } from '../core/api-bridge.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('chat-stream');

export class ChatStreamError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * Stream a chat completion from Mistral.
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {string} opts.model
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @param {(chunk:string, full:string)=>void} [opts.onDelta]
 * @returns {Promise<{content:string, usage?:object}>}
 */
export async function streamMistral(opts) {
  const provider = getProvider('mistral');
  const key = getApiKey('mistral');
  if (!key) throw new ChatStreamError('Aucune clé API Mistral configurée.', 401);

  const body = {
    model: opts.model || provider.defaultModel,
    messages: opts.messages,
    stream: true,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  let res;
  try {
    res = await fetch(provider.baseUrl + provider.chatPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ChatStreamError(`Erreur réseau: ${err.message}`, 0);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let msg = `Erreur API ${res.status}`;
    if (res.status === 401) msg = 'Clé API invalide ou expirée (401). Reconfigurez-la dans Réglages.';
    else if (res.status === 429) msg = 'Limite de requêtes atteinte (429). Réessayez dans quelques secondes.';
    else if (text) msg += ` — ${text.slice(0, 200)}`;
    throw new ChatStreamError(msg, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let usage;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        const m = line.match(/^data:\s*(.*)$/);
        if (!m) continue;
        const data = m[1];
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; opts.onDelta?.(delta, full); }
          if (json.usage) usage = json.usage;
        } catch (err) {
          log.warn('SSE parse error', err.message);
        }
      }
    }
  }

  return { content: full, usage };
}
