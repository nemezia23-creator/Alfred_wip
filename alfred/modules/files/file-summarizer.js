// File summarizer — per-chunk via API, aggregated, then injected as memories.
// Phase 6. Uses streamMistral. Falls back to "no summary" if no API key.

import { streamMistral } from '../chat/chat-stream.js';
import { hasApiKey } from '../core/api-bridge.js';
import { addMemory } from '../memory/memory-manager.js';
import { put } from '../core/db.js';
import { createLogger } from '../core/logger.js';
import { getSetting } from '../core/settings.js';

const log = createLogger('file-sum');

const SUM_SYSTEM = `Tu es un résumeur. Pour chaque extrait, produis un résumé factuel concis (3-6 phrases), en français, sans préambule. Garde noms propres, chiffres et dates.`;
const AGG_SYSTEM = `Tu agrèges plusieurs résumés partiels d'un même document en un résumé global cohérent (10-20 phrases), en français, structuré par paragraphes.`;

async function summarizeChunk(text, { model, signal } = {}) {
  const res = await streamMistral({
    model: model || getSetting('chat.model') || 'mistral-small-latest',
    temperature: 0.3,
    messages: [
      { role: 'system', content: SUM_SYSTEM },
      { role: 'user', content: `EXTRAIT:\n\n${text}\n\nRésume.` },
    ],
    signal,
  });
  return (res.content || '').trim();
}

async function aggregateSummaries(parts, { model, signal } = {}) {
  if (parts.length <= 1) return parts[0] || '';
  const joined = parts.map((p, i) => `(${i + 1}) ${p}`).join('\n\n');
  const res = await streamMistral({
    model: model || getSetting('chat.model') || 'mistral-small-latest',
    temperature: 0.3,
    messages: [
      { role: 'system', content: AGG_SYSTEM },
      { role: 'user', content: `RÉSUMÉS PARTIELS :\n\n${joined}\n\nProduis le résumé global.` },
    ],
    signal,
  });
  return (res.content || '').trim();
}

/**
 * Summarize a stored file (must already have chunks set).
 * Mutates `fileRecord` and persists it. Creates memory entries
 * (one per chunk + one global) linked to the file via `meta.fileId`.
 *
 * @param {object} fileRecord — record from `files` store
 * @param {object} opts
 * @param {(p:{step:string,i?:number,total?:number})=>void} [opts.onProgress]
 * @returns {Promise<object>} updated fileRecord
 */
export async function summarizeFile(fileRecord, opts = {}) {
  if (!hasApiKey('mistral')) {
    fileRecord.status = 'parsed';
    fileRecord.summary = '';
    await put('files', fileRecord);
    return fileRecord;
  }
  const chunks = fileRecord.chunks || [];
  const partials = [];
  const memIds = [];
  const tags = ['file', fileRecord.ext || 'doc'];
  const perChunkMem = getSetting('files.perChunkMemory') === true;

  for (let i = 0; i < chunks.length; i++) {
    opts.onProgress?.({ step: 'chunk', i: i + 1, total: chunks.length });
    let summary = '';
    try { summary = await summarizeChunk(chunks[i].text, { signal: opts.signal }); }
    catch (e) { log.warn(`chunk ${i} summary failed: ${e.message}`); continue; }
    partials.push(summary);
    if (!perChunkMem) continue;
    try {
      const mem = await addMemory({
        content: `[${fileRecord.name} · extrait ${i + 1}/${chunks.length}]\n${summary}`,
        type: 'document',
        source: 'file',
        owner: 'global',
        confidence: 0.7,
        tags,
      });
      mem.fileId = fileRecord.id;
      mem.chunkIndex = i;
      await put('memories', mem);
      memIds.push(mem.id);
    } catch (e) { log.warn(`memory insert failed: ${e.message}`); }
  }

  opts.onProgress?.({ step: 'aggregate' });
  let global = '';
  try { global = await aggregateSummaries(partials, { signal: opts.signal }); }
  catch (e) { log.warn(`aggregate failed: ${e.message}`); }

  if (global) {
    try {
      const mem = await addMemory({
        content: `[${fileRecord.name}]\n${global}`,
        type: 'summary',
        source: 'file',
        owner: 'global',
        confidence: 0.8,
        tags,
      });
      mem.fileId = fileRecord.id;
      await put('memories', mem);
      memIds.push(mem.id);
    } catch (e) { log.warn(`global memory insert failed: ${e.message}`); }
  }

  fileRecord.summary = global;
  fileRecord.memoryIds = memIds;
  fileRecord.status = 'summarized';
  fileRecord.updatedAt = Date.now();
  await put('files', fileRecord);
  return fileRecord;
}
