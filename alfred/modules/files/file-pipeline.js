// Orchestrates upload → parse → segment → store → summarize. Phase 6.

import { put } from '../core/db.js';
import { toast } from '../ui/toast.js';
import { createLogger } from '../core/logger.js';
import { getSetting } from '../core/settings.js';
import { defaultFile } from './file-schema.js';
import { parseFile } from './file-parser.js';
import { segmentText } from './file-segmenter.js';
import { summarizeFile } from './file-summarizer.js';

const log = createLogger('file-pipeline');

/**
 * Run the full pipeline for a single uploaded File.
 * @param {File} file
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {(msg:string)=>void} [opts.onStatus]
 * @returns {Promise<object>} the persisted file record
 */
export async function ingestFile(file, opts = {}) {
  const status = opts.onStatus || (() => {});
  let record = defaultFile({
    name: file.name, mimeType: file.type, size: file.size,
  });
  try {
    status(`📥 ${file.name} : extraction…`);
    const { text, ext, meta } = await parseFile(file);
    record = defaultFile({
      ...record, ext, mimeType: meta.mime || record.mimeType,
      text: text.slice(0, 200000), // safety cap
      status: 'parsed',
    });
    status(`✂ ${file.name} : segmentation…`);
    const chunkTokens = Number(getSetting('files.chunkTokens') || 500);
    const overlapTokens = Number(getSetting('files.overlapTokens') || 80);
    record.chunks = segmentText(text, { chunkTokens, overlapTokens });
    await put('files', record);

    if (getSetting('files.autoSummarize') !== false) {
      status(`✨ ${file.name} : résumé (${record.chunks.length} extrait(s))…`);
      record = await summarizeFile(record, {
        signal: opts.signal,
        onProgress: ({ step, i, total }) => {
          if (step === 'chunk') status(`✨ ${file.name} : extrait ${i}/${total}…`);
          else if (step === 'aggregate') status(`✨ ${file.name} : agrégation…`);
        },
      });
      toast(`Fichier traité : ${file.name} → ${record.memoryIds.length} mémoire(s).`, { type: 'success', duration: 3500 });
    } else {
      toast(`Fichier importé : ${file.name} (${record.chunks.length} extrait(s)).`, { type: 'success' });
    }
    return record;
  } catch (err) {
    record.status = 'error';
    record.error = err.message;
    record.updatedAt = Date.now();
    try { await put('files', record); } catch {}
    log.error('ingest failed', err);
    toast(`Échec import ${file.name} : ${err.message}`, { type: 'error', duration: 5000 });
    throw err;
  }
}
