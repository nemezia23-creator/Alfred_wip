// Markdown-lite renderer with strict sanitization.
// Supports: headings (#..######), bold (**), italic (*), inline code (`),
// fenced code blocks (```lang), unordered/ordered lists, blockquotes, links [t](url), hr (---).

import { escapeHtml, safeUrl } from '../ui/sanitize.js';

function renderInline(text) {
  // text is already HTML-escaped at this point.
  // inline code first to protect its content
  let out = text.replace(/`([^`\n]+)`/g, (_, c) => `<code class="md-code">${c}</code>`);
  // bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // italic (avoid matching inside **)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // links
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return out;
}

export function renderMarkdown(src) {
  const lines = String(src ?? '').split('\n');
  const out = [];
  let i = 0;
  let inList = null; // 'ul' | 'ol' | null

  const closeList = () => {
    if (inList) { out.push(`</${inList}>`); inList = null; }
  };

  while (i < lines.length) {
    const raw = lines[i];

    // fenced code block
    const fence = raw.match(/^```(\w+)?\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      const code = escapeHtml(buf.join('\n'));
      out.push(
        `<pre class="md-pre" data-lang="${escapeHtml(lang)}"><button class="md-copy" type="button" aria-label="Copier le code">copy</button><code>${code}</code></pre>`
      );
      continue;
    }

    // hr
    if (/^\s*---+\s*$/.test(raw)) { closeList(); out.push('<hr class="md-hr">'); i++; continue; }

    // heading
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl} class="md-h md-h${lvl}">${renderInline(escapeHtml(h[2]))}</h${lvl}>`);
      i++; continue;
    }

    // blockquote
    if (/^>\s?/.test(raw)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote class="md-quote">${renderInline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(raw)) {
      if (inList !== 'ul') { closeList(); out.push('<ul class="md-list">'); inList = 'ul'; }
      const item = raw.replace(/^\s*[-*]\s+/, '');
      out.push(`<li>${renderInline(escapeHtml(item))}</li>`);
      i++; continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(raw)) {
      if (inList !== 'ol') { closeList(); out.push('<ol class="md-list">'); inList = 'ol'; }
      const item = raw.replace(/^\s*\d+\.\s+/, '');
      out.push(`<li>${renderInline(escapeHtml(item))}</li>`);
      i++; continue;
    }

    // blank line
    if (/^\s*$/.test(raw)) { closeList(); i++; continue; }

    // paragraph (collect consecutive non-special lines)
    closeList();
    const buf = [raw];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    out.push(`<p class="md-p">${renderInline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br>')}</p>`);
  }

  closeList();
  return out.join('\n');
}

// Wire copy buttons inside a rendered container.
export function bindCodeCopy(rootEl) {
  rootEl.querySelectorAll('pre.md-pre > button.md-copy').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const code = btn.parentElement.querySelector('code');
      try {
        await navigator.clipboard.writeText(code.innerText);
        const old = btn.textContent;
        btn.textContent = 'ok';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch { /* ignore */ }
    });
  });
}
