// Text segmenter — token-aware chunking with overlap. Phase 6.
// Approximates 1 token ≈ 4 chars (cheap, dependency-free).

const CHARS_PER_TOKEN = 4;

export function approxTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks roughly capped at `chunkTokens` tokens with
 * `overlapTokens` tokens of overlap between consecutive chunks.
 * Splits on paragraph boundaries first, then sentences, then hard cut.
 */
export function segmentText(text, { chunkTokens = 500, overlapTokens = 80 } = {}) {
  const src = String(text || '').trim();
  if (!src) return [];
  const maxChars = chunkTokens * CHARS_PER_TOKEN;
  const overlapChars = Math.max(0, overlapTokens * CHARS_PER_TOKEN);

  // Pre-split on blank lines (paragraphs) for nicer boundaries.
  const paragraphs = src.split(/\n{2,}/);
  const chunks = [];
  let buf = '';

  function flush() {
    const t = buf.trim();
    if (!t) return;
    chunks.push({ i: chunks.length, text: t, tokens: approxTokens(t) });
    buf = overlapChars && t.length > overlapChars ? t.slice(-overlapChars) + '\n\n' : '';
  }

  for (let p of paragraphs) {
    p = p.trim();
    if (!p) continue;
    if (p.length > maxChars) {
      // Sentence-level split for huge paragraphs.
      const sentences = p.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý"'(\[])/);
      for (const s of sentences) {
        if (buf.length + s.length + 1 > maxChars) flush();
        if (s.length > maxChars) {
          // Hard cut.
          for (let off = 0; off < s.length; off += maxChars) {
            buf += s.slice(off, off + maxChars);
            if (buf.length >= maxChars) flush();
          }
        } else {
          buf += (buf ? ' ' : '') + s;
        }
      }
      flush();
    } else {
      if (buf.length + p.length + 2 > maxChars) flush();
      buf += (buf ? '\n\n' : '') + p;
    }
  }
  flush();
  return chunks;
}
