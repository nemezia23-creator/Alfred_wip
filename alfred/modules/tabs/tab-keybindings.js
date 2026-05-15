// Global keyboard shortcuts for tabs — Phase 3
// Note: Ctrl+W and Ctrl+Tab are often intercepted by the browser; we provide
// Alt-based alternatives that always work.

import { createTab, closeTab, cycleTab, getActiveId } from './tab-engine.js';

export function installTabKeybindings() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod && !e.altKey) return;

    // Ctrl/Cmd + N → new tab
    if (mod && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      createTab();
      return;
    }
    // Alt + N → new tab (browser-safe alternative)
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      createTab();
      return;
    }
    // Ctrl/Cmd + W → close active (browser may intercept)
    if (mod && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      const id = getActiveId();
      if (id) closeTab(id);
      return;
    }
    // Alt + W → close active (browser-safe)
    if (e.altKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      const id = getActiveId();
      if (id) closeTab(id);
      return;
    }
    // Ctrl + Tab / Ctrl+Shift+Tab → cycle (often intercepted)
    if (mod && e.key === 'Tab') {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + ArrowRight/ArrowLeft → cycle (always works)
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); cycleTab(1); return; }
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); cycleTab(-1); return; }
  });
}