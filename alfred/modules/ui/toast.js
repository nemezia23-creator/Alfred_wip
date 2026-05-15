// Minimal toast notifications with ARIA live region.

import { escapeHtml } from './sanitize.js';

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'alfred-toasts';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.style.cssText =
    'position:fixed;bottom:60px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:9999;pointer-events:none;';
  document.body.appendChild(container);
  return container;
}

export function toast(message, opts = {}) {
  const { type = 'info', duration = 4000 } = opts;
  const el = document.createElement('div');
  el.className = `alfred-toast alfred-toast--${type}`;
  el.style.cssText =
    'pointer-events:auto;font-family:var(--font-mono);font-size:.85rem;padding:10px 14px;border-radius:var(--radius-md);background:var(--surface-2);border:var(--border-accent);color:var(--text-bright);box-shadow:var(--shadow-md);max-width:360px;';
  if (type === 'error') el.style.borderColor = 'var(--color-danger)';
  if (type === 'success') el.style.borderColor = 'var(--color-success)';
  el.innerHTML = escapeHtml(message);
  ensureContainer().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, duration);
}
