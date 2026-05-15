// Structured console logger with levels and namespaces.
// Zero deps. Levels: debug < info < warn < error < silent.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
let GLOBAL_LEVEL = 'info';

const STYLE = {
  debug: 'color:#7c8aa0',
  info: 'color:#00e5ff',
  warn: 'color:#f59e0b',
  error: 'color:#ff3366;font-weight:bold',
};

// In-memory ring buffer + subscribers (for in-app DevTools panel).
const RING_MAX = 500;
const RING = [];
const SUBS = new Set();

export function getLogHistory() {
  return RING.slice();
}

export function onLog(handler) {
  SUBS.add(handler);
  return () => SUBS.delete(handler);
}

export function clearLogHistory() {
  RING.length = 0;
  for (const fn of SUBS) {
    try { fn({ type: 'clear' }); } catch { /* noop */ }
  }
}

function pushEntry(entry) {
  RING.push(entry);
  if (RING.length > RING_MAX) RING.shift();
  for (const fn of SUBS) {
    try { fn(entry); } catch { /* noop */ }
  }
}

export function setLogLevel(level) {
  if (LEVELS[level] !== undefined) GLOBAL_LEVEL = level;
}

export function getLogLevel() {
  return GLOBAL_LEVEL;
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[GLOBAL_LEVEL];
}

export function createLogger(namespace) {
  const tag = `[${namespace}]`;
  const make = (level) => (...args) => {
    pushEntry({ ts: Date.now(), level, ns: namespace, args });
    if (!shouldLog(level)) return;
    const fn = console[level] || console.log;
    fn(`%c${tag}`, STYLE[level], ...args);
  };
  return {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  };
}

export const log = createLogger('alfred');
