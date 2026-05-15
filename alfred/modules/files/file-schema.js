// File schema for store `files`. Phase 6.

export const FILE_SCHEMA_VERSION = 1;

export const ALLOWED_MIME = Object.freeze({
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
});

export const ALLOWED_EXT = ['txt', 'md', 'csv', 'json', 'pdf', 'docx'];

export function defaultFile(overrides = {}) {
  const now = Date.now();
  return {
    id: 'f_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    schemaVersion: FILE_SCHEMA_VERSION,
    name: 'untitled',
    mimeType: 'text/plain',
    ext: 'txt',
    size: 0,
    text: '',           // extracted plain text (may be truncated for huge files)
    chunks: [],         // [{i, text, tokens}]
    summary: '',        // aggregated summary (filled by summarizer)
    memoryIds: [],      // memory ids derived from this file
    status: 'uploaded', // uploaded | parsed | summarized | error
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function inferExt(name, mime) {
  const lower = (name || '').toLowerCase();
  for (const ext of ALLOWED_EXT) if (lower.endsWith('.' + ext)) return ext;
  return ALLOWED_MIME[mime] || null;
}
