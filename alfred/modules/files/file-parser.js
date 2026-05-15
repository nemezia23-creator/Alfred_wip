// File parsing — text extraction. Phase 6.
// Supported: txt, md, csv, json (native), pdf (PDF.js via CDN ESM),
// docx (mammoth via CDN ESM).

import { bus, EVT } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { inferExt } from './file-schema.js';

const log = createLogger('file-parser');

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';
const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

let _pdfjs;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
  if (_pdfjs.GlobalWorkerOptions) _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return _pdfjs;
}

let _mammothPromise;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (_mammothPromise) return _mammothPromise;
  _mammothPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MAMMOTH_URL; s.async = true;
    s.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error('mammoth introuvable après chargement'));
    s.onerror = () => reject(new Error('Échec du chargement de mammoth depuis le CDN'));
    document.head.appendChild(s);
  });
  return _mammothPromise;
}

async function readText(file) { return await file.text(); }

async function parsePdf(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const txt = content.items.map((it) => it.str).join(' ');
    pages.push(`--- page ${i} ---\n${txt}`);
  }
  return pages.join('\n\n');
}

async function parseDocx(file) {
  const mammoth = await loadMammoth();
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value || '';
}

function prettyJson(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

/**
 * Parse a File → { text, ext, meta }.
 * Throws on unsupported type or parse failure.
 */
export async function parseFile(file) {
  const ext = inferExt(file.name, file.type);
  if (!ext) throw new Error(`Type non supporté: ${file.name}`);
  let text = '';
  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
      text = await readText(file);
      break;
    case 'json':
      text = prettyJson(await readText(file));
      break;
    case 'pdf':
      text = await parsePdf(file);
      break;
    case 'docx':
      text = await parseDocx(file);
      break;
    default: throw new Error(`Extension non gérée: ${ext}`);
  }
  text = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  const meta = { name: file.name, mime: file.type, size: file.size, ext, length: text.length };
  bus.emit(EVT.FILE_PARSED, meta);
  log.info(`parsed ${file.name} (${ext}, ${text.length} chars)`);
  return { text, ext, meta };
}
