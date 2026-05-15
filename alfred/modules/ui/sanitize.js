// Sanitization helpers — no innerHTML on raw user/AI content without escaping first.

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function escapeAttr(str) {
  return escapeHtml(str);
}

// Allow only http(s) and mailto schemes.
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (/^(https?:|mailto:)/i.test(s)) return s;
  return '#';
}
