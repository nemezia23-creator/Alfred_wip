// Alfred — In-app DevTools panel.
// Tabs: Logs, DB Browser, Settings, EventBus, API.
// Keyboard: Ctrl/Cmd+Shift+D toggles. Also responds to F12 if not captured by the browser.

import { bus } from '../core/event-bus.js';
import { getLogHistory, onLog, clearLogHistory, setLogLevel, getLogLevel } from '../core/logger.js';
import { STORES, getAll, count, del, clear as clearStore, dbStats } from '../core/db.js';
import { allSettings, setSetting } from '../core/settings.js';
import { hasApiKey, setApiKey, clearApiKey } from '../core/api-bridge.js';

const TABS = [
  { id: 'logs', label: 'Logs' },
  { id: 'db', label: 'Database' },
  { id: 'settings', label: 'Settings' },
  { id: 'bus', label: 'EventBus' },
  { id: 'api', label: 'API' },
];

const state = {
  open: false,
  tab: 'logs',
  logFilter: '',
  logLevel: 'debug',
  dbStore: 'settings',
  busEvents: [],
  unsubLog: null,
  unsubBus: null,
};

const BUS_MAX = 200;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'on') for (const [evt, h] of Object.entries(v)) node.addEventListener(evt, h);
    else if (k === 'html') node.innerHTML = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function safeStringify(v) {
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function ensureRoot() {
  let root = document.getElementById('alfred-devtools');
  if (root) return root;
  root = el('div', { id: 'alfred-devtools', class: 'devtools', 'aria-hidden': 'true', role: 'dialog', 'aria-label': 'DevTools Alfred' });
  root.appendChild(el('div', {
    class: 'devtools-backdrop',
    on: { click: close },
  }));
  const panel = el('div', { class: 'devtools-panel', role: 'document' });

  const header = el('div', { class: 'devtools-header' }, [
    el('div', { class: 'devtools-title' }, '🛠 DevTools Alfred'),
    el('div', { class: 'devtools-tabs' }, TABS.map(t => el('button', {
      type: 'button',
      class: 'devtools-tab',
      'data-tab': t.id,
      on: { click: () => switchTab(t.id) },
    }, t.label))),
    el('button', { type: 'button', class: 'devtools-close', 'aria-label': 'Fermer', on: { click: close } }, '✕'),
  ]);

  const body = el('div', { class: 'devtools-body', id: 'devtools-body' });

  panel.appendChild(header);
  panel.appendChild(body);
  root.appendChild(panel);
  document.body.appendChild(root);
  return root;
}

function switchTab(id) {
  state.tab = id;
  for (const btn of document.querySelectorAll('.devtools-tab')) {
    btn.classList.toggle('is-active', btn.dataset.tab === id);
  }
  render();
}

/* ---------- Tab: Logs ---------- */
function renderLogs(body) {
  body.innerHTML = '';
  const toolbar = el('div', { class: 'devtools-toolbar' }, [
    el('label', {}, ['Niveau ',
      el('select', {
        on: { change: (e) => { setLogLevel(e.target.value); state.logLevel = e.target.value; } },
      }, ['debug','info','warn','error','silent'].map(l => {
        const o = el('option', { value: l }, l);
        if (l === getLogLevel()) o.selected = true;
        return o;
      })),
    ]),
    el('input', {
      type: 'search',
      placeholder: 'filtrer…',
      value: state.logFilter,
      on: { input: (e) => { state.logFilter = e.target.value; renderLogList(list); } },
    }),
    el('button', { type: 'button', on: { click: () => { clearLogHistory(); renderLogList(list); } } }, 'Effacer'),
    el('button', { type: 'button', on: { click: () => {
      const blob = new Blob([getLogHistory().map(e =>
        `${fmtTime(e.ts)} [${e.level}] [${e.ns}] ${e.args.map(safeStringify).join(' ')}`).join('\n')],
        { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `alfred-logs-${Date.now()}.txt` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } } }, 'Export .txt'),
  ]);
  const list = el('ul', { class: 'devtools-list devtools-logs' });
  body.appendChild(toolbar);
  body.appendChild(list);
  renderLogList(list);

  if (state.unsubLog) state.unsubLog();
  state.unsubLog = onLog((entry) => {
    if (entry?.type === 'clear') { list.innerHTML = ''; return; }
    appendLogRow(list, entry);
    list.scrollTop = list.scrollHeight;
  });
}

function appendLogRow(list, entry) {
  if (state.logFilter) {
    const hay = (entry.ns + ' ' + entry.args.map(safeStringify).join(' ')).toLowerCase();
    if (!hay.includes(state.logFilter.toLowerCase())) return;
  }
  const fullMsg = entry.args.map(safeStringify).join(' ');
  const li = el('li', { class: `devtools-log lvl-${entry.level}` }, [
    el('details', {}, [
      el('summary', {}, [
        el('span', { class: 'devtools-log-ts' }, fmtTime(entry.ts)),
        el('span', { class: 'devtools-log-lvl' }, entry.level),
        el('span', { class: 'devtools-log-ns' }, `[${entry.ns}]`),
        el('span', { class: 'devtools-log-msg' }, fullMsg.length > 240 ? fullMsg.slice(0, 240) + '…' : fullMsg),
      ]),
      fullMsg.length > 240 ? el('pre', { class: 'devtools-db-json' }, fullMsg) : null,
    ]),
  ]);
  list.appendChild(li);
}

function renderLogList(list) {
  list.innerHTML = '';
  for (const e of getLogHistory()) appendLogRow(list, e);
  list.scrollTop = list.scrollHeight;
}

/* ---------- Tab: DB Browser ---------- */
async function renderDB(body) {
  body.innerHTML = '';
  const stats = await dbStats();
  const sidebar = el('div', { class: 'devtools-db-sidebar' });
  for (const name of Object.keys(STORES)) {
    const btn = el('button', {
      type: 'button',
      class: 'devtools-db-store' + (name === state.dbStore ? ' is-active' : ''),
      on: { click: () => { state.dbStore = name; renderDB(body); } },
    }, [
      el('span', { class: 'devtools-db-store-name' }, name),
      el('span', { class: 'devtools-db-store-count' }, String(stats[name] ?? '?')),
    ]);
    sidebar.appendChild(btn);
  }

  const main = el('div', { class: 'devtools-db-main' });
  const toolbar = el('div', { class: 'devtools-toolbar' }, [
    el('strong', {}, `Store : ${state.dbStore}`),
    el('button', { type: 'button', on: { click: async () => {
      if (!confirm(`Vider le store "${state.dbStore}" ? Cette action est irréversible.`)) return;
      await clearStore(state.dbStore); renderDB(body);
    } } }, 'Vider le store'),
    el('button', { type: 'button', on: { click: () => renderDB(body) } }, '↻ Refresh'),
  ]);
  const rows = await getAll(state.dbStore);
  const table = el('div', { class: 'devtools-db-rows' });
  if (!rows.length) {
    table.appendChild(el('div', { class: 'devtools-empty' }, '(store vide)'));
  } else {
    for (const row of rows) {
      const keyPath = STORES[state.dbStore].keyPath;
      const key = row?.[keyPath];
      const item = el('details', { class: 'devtools-db-row' });
      const summary = el('summary', {}, [
        el('code', { class: 'devtools-db-key' }, String(key)),
        el('span', { class: 'devtools-db-preview' }, summarize(row)),
        el('button', {
          type: 'button', class: 'devtools-db-del',
          on: { click: async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!confirm(`Supprimer "${key}" ?`)) return;
            await del(state.dbStore, key); renderDB(body);
          } },
        }, '🗑'),
      ]);
      const pre = el('pre', { class: 'devtools-db-json' }, safeStringify(row));
      item.appendChild(summary); item.appendChild(pre);
      table.appendChild(item);
    }
  }
  main.appendChild(toolbar);
  main.appendChild(table);

  const grid = el('div', { class: 'devtools-db' }, [sidebar, main]);
  body.appendChild(grid);
}

function summarize(row, max = 200) {
  const s = safeStringify(row).replace(/\s+/g, ' ');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Snapshot a payload safely so the devtools doesn't keep references
// to live, growing objects (root cause of bus overload on streaming).
function snapshotPayload(p, maxLen = 400) {
  if (p == null) return p;
  try {
    const json = JSON.stringify(p, (k, v) => {
      if (typeof v === 'string' && v.length > maxLen) return v.slice(0, maxLen) + `…(+${v.length - maxLen})`;
      return v;
    });
    return json && json.length > 2000 ? json.slice(0, 2000) + '…' : JSON.parse(json);
  } catch {
    return String(p);
  }
}

// Events too noisy for the bus panel (fire many times per second).
const NOISY_EVENTS = new Set(['chat:streaming']);


/* ---------- Tab: Settings ---------- */
async function renderSettings(body) {
  body.innerHTML = '';
  const all = allSettings();
  const toolbar = el('div', { class: 'devtools-toolbar' }, [
    el('strong', {}, 'Settings (live)'),
    el('button', { type: 'button', on: { click: () => renderSettings(body) } }, '↻ Refresh'),
    el('button', { type: 'button', on: { click: async () => {
      const k = prompt('Clé ?'); if (!k) return;
      const v = prompt('Valeur (JSON autorisé) ?', '""');
      if (v === null) return;
      let parsed = v; try { parsed = JSON.parse(v); } catch { /* keep string */ }
      await setSetting(k, parsed); renderSettings(body);
    } } }, '＋ Ajouter / éditer'),
  ]);
  const list = el('div', { class: 'devtools-kv' });
  const entries = Object.entries(all).sort(([a],[b]) => a.localeCompare(b));
  if (!entries.length) list.appendChild(el('div', { class: 'devtools-empty' }, '(aucun setting)'));
  for (const [k, v] of entries) {
    const masked = /api[_-]?key|secret|token/i.test(k);
    const display = masked ? '••• (masqué)' : safeStringify(v);
    list.appendChild(el('div', { class: 'devtools-kv-row' }, [
      el('code', { class: 'devtools-kv-k' }, k),
      el('pre', { class: 'devtools-kv-v' }, display),
      el('button', { type: 'button', on: { click: async () => {
        const nv = prompt(`Nouvelle valeur pour "${k}" (JSON autorisé) :`, masked ? '' : safeStringify(v));
        if (nv === null) return;
        let parsed = nv; try { parsed = JSON.parse(nv); } catch { /* string */ }
        await setSetting(k, parsed); renderSettings(body);
      } } }, 'Éditer'),
    ]));
  }
  body.appendChild(toolbar);
  body.appendChild(list);
}

/* ---------- Tab: EventBus ---------- */
function renderBus(body) {
  body.innerHTML = '';
  const counter = el('span', { class: 'devtools-muted' }, `${state.busEvents.length} événement(s)`);
  const list = el('ul', { class: 'devtools-list devtools-bus' });
  const toolbar = el('div', { class: 'devtools-toolbar' }, [
    el('strong', {}, 'Flux EventBus (live)'),
    el('button', { type: 'button', on: { click: () => { state.busEvents = []; list.innerHTML = ''; counter.textContent = '0 événement(s)'; } } }, 'Effacer'),
    el('label', {}, [
      ' ',
      (() => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = !!state.includeNoisy;
        cb.addEventListener('change', () => { state.includeNoisy = cb.checked; });
        return cb;
      })(),
      ' afficher chat:streaming',
    ]),
    counter,
  ]);
  // Render newest first (reverse order)
  for (const ev of state.busEvents.slice().reverse()) appendBusRow(list, ev);
  body.appendChild(toolbar);
  body.appendChild(list);
  if (!state.busEvents.length) {
    list.appendChild(el('li', { class: 'devtools-empty' }, '(aucun événement capturé pour l’instant — déclenchez une action dans l’app)'));
  }
}

function appendBusRow(list, ev) {
  const summary = summarize(ev.payload, 240);
  const row = el('li', {}, [
    el('details', {}, [
      el('summary', {}, [
        el('span', { class: 'devtools-log-ts' }, fmtTime(ev.ts)),
        el('span', { class: 'devtools-bus-type' }, ev.type),
        el('span', { class: 'devtools-bus-payload' }, summary),
      ]),
      el('pre', { class: 'devtools-db-json' }, safeStringify(ev.payload)),
    ]),
  ]);
  // Insert at top (newest first)
  list.insertBefore(row, list.firstChild);
  // Cap DOM rows to avoid bloat
  while (list.childElementCount > BUS_MAX) list.removeChild(list.lastChild);
}


/* ---------- Tab: API ---------- */
function renderAPI(body) {
  body.innerHTML = '';
  const has = hasApiKey('mistral');
  body.appendChild(el('div', { class: 'devtools-toolbar' }, [
    el('strong', {}, 'Mistral'),
    el('span', { class: has ? 'devtools-pill ok' : 'devtools-pill ko' }, has ? 'clé enregistrée' : 'pas de clé'),
  ]));
  body.appendChild(el('div', { class: 'devtools-actions' }, [
    el('button', { type: 'button', on: { click: () => {
      const k = prompt('Clé API Mistral :', ''); if (!k) return;
      setApiKey('mistral', k.trim()); renderAPI(body);
    } } }, has ? 'Remplacer la clé' : 'Saisir une clé'),
    el('button', { type: 'button', on: { click: () => {
      if (!confirm('Effacer la clé API ?')) return;
      clearApiKey('mistral'); renderAPI(body);
    } } }, 'Effacer la clé'),
  ]));
  body.appendChild(el('p', { class: 'devtools-muted' },
    'La clé est stockée en cookie + localStorage (compat V1). Elle n\'apparaît jamais dans les logs ni la BDD.'));
}

/* ---------- Render dispatch ---------- */
function render() {
  const body = document.getElementById('devtools-body');
  if (!body) return;
  if (state.tab === 'logs') renderLogs(body);
  else if (state.tab === 'db') renderDB(body);
  else if (state.tab === 'settings') renderSettings(body);
  else if (state.tab === 'bus') renderBus(body);
  else if (state.tab === 'api') renderAPI(body);
}

/* ---------- Public API ---------- */
export function open(tab) {
  ensureRoot();
  state.open = true;
  document.getElementById('alfred-devtools').setAttribute('aria-hidden', 'false');
  document.body.classList.add('devtools-open');
  if (tab) state.tab = tab;
  // Mark active tab
  for (const btn of document.querySelectorAll('.devtools-tab')) {
    btn.classList.toggle('is-active', btn.dataset.tab === state.tab);
  }
  if (!state.unsubBus) primeBusCapture();
  render();
}

// Phase 7 — start capturing bus events as soon as the app boots so that
// the EventBus tab shows history (not just events emitted after first open).
export function primeBusCapture() {
  if (state.unsubBus) return;
  state.unsubBus = bus.on('*', (type, payload) => {
    // Skip noisy events unless explicitly enabled
    if (NOISY_EVENTS.has(type) && !state.includeNoisy) return;
    // Snapshot to avoid retaining live, growing references (CHAT_STREAMING etc.)
    const snap = snapshotPayload(payload);
    const ev = { ts: Date.now(), type, payload: snap };
    state.busEvents.push(ev);
    if (state.busEvents.length > BUS_MAX) state.busEvents.shift();
    // Append-only DOM update (no full re-render) when bus tab visible
    if (state.open && state.tab === 'bus') {
      const list = document.querySelector('.devtools-bus');
      if (list) appendBusRow(list, ev);
    }
  });
}

export function close() {
  state.open = false;
  const root = document.getElementById('alfred-devtools');
  if (root) root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('devtools-open');
  if (state.unsubLog) { state.unsubLog(); state.unsubLog = null; }
}

export function toggle() { state.open ? close() : open(); }

export function installDevTools() {
  ensureRoot();
  // Keyboard shortcuts: Ctrl/Cmd+Shift+D (reliable) + try F12 (may be blocked by browser).
  window.addEventListener('keydown', (e) => {
    const isF12 = e.key === 'F12';
    const isCombo = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd');
    const isEsc = e.key === 'Escape' && state.open;
    if (isF12 || isCombo) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (isEsc) {
      e.preventDefault();
      close();
    }
  }, { capture: true });

  // Expose for console use.
  window.Alfred = window.Alfred || {};
  window.Alfred.devtools = { open, close, toggle };
}
