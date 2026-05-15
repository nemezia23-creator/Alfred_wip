// Chat actions: copy / export / regenerate / edit helpers.

import { exportMarkdown, exportText } from './chat-manager.js';

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
}

export function exportChat(format = 'md') {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (format === 'txt') {
    download(`alfred-chat-${ts}.txt`, exportText(), 'text/plain;charset=utf-8');
  } else {
    download(`alfred-chat-${ts}.md`, exportMarkdown(), 'text/markdown;charset=utf-8');
  }
}
