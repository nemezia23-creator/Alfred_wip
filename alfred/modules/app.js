// Alfred Agent OS — bootstrap
// Phase 1 : core init, migration, theme, status.

import { bus, EVT } from './core/event-bus.js';
import { createLogger, setLogLevel } from './core/logger.js';
import { openDB, dbStats } from './core/db.js';
import { runMigrationIfNeeded } from './core/db-migrate.js';
import { loadSettings, getSetting } from './core/settings.js';
import { hasApiKey, setApiKey, clearApiKey } from './core/api-bridge.js';
import { bootTheme, applyTheme, applyDensity } from './ui/theme-engine.js';
import { mountChat } from './chat/chat-ui.js';
import { installDevTools, open as openDevTools, primeBusCapture } from './ui/devtools.js';
import { loadTabs, installWindowOpenGuard } from './tabs/tab-engine.js';
import { mountTabBar } from './tabs/tab-renderer.js';
import { installTabKeybindings } from './tabs/tab-keybindings.js';
import { bootAgents } from './agents/agent-ui.js';
import { openAgentManager } from './agents/agent-ui.js';
import { bootMemory, openMemoryManager } from './memory/memory-ui.js';
import { openSettings } from './ui/settings-ui.js';
import { toast } from './ui/toast.js';

const log = createLogger('app');

const $ = (sel) => document.querySelector(sel);

function logBoot(msg, status = 'ok') {
  const ul = $('#boot-log');
  if (!ul) return;
  const li = document.createElement('li');
  li.dataset.status = status;
  li.textContent = msg;
  ul.appendChild(li);
  bus.emit(EVT.BOOT_STEP, { msg, status });
}

async function boot() {
  try {
    // Phase 8.1 — démarrer la capture EventBus AVANT toute émission de
    // boot:step, sinon le panneau DevTools paraît vide tant qu'aucune
    // action n'a été déclenchée après l'ouverture des outils.
    primeBusCapture();
    logBoot('▸ chargement settings…');
    await openDB();
    await loadSettings();
    setLogLevel(getSetting('log_level') || 'info');
    logBoot('✓ DB ouverte (AlfredDB v4)');

    logBoot('▸ migration V1 → V2…');
    const migration = await runMigrationIfNeeded();
    logBoot(
      migration.migrated
        ? `✓ migration OK (chats:${migration.chats}, agents:${migration.agents}, settings:${migration.settings}, memories:${migration.memories})`
        : '✓ pas de données V1 à migrer'
    );

    logBoot('▸ application du thème…');
    await bootTheme();
    logBoot(`✓ thème ${getSetting('theme')} · densité ${getSetting('density')}`);

    // Wire UI controls
    const themeSel = $('#theme-select');
    const densitySel = $('#density-select');
    if (themeSel) {
      themeSel.value = getSetting('theme') || 'cyber';
      themeSel.addEventListener('change', (e) => applyTheme(e.target.value));
    }
    if (densitySel) {
      densitySel.value = getSetting('density') || 'normal';
      densitySel.addEventListener('change', (e) => applyDensity(e.target.value));
    }

    $('#open-settings')?.addEventListener('click', () => openSettings());
    installDevTools();
    $('#open-devtools')?.addEventListener('click', () => openDevTools());
    $('#open-agents')?.addEventListener('click', () => openAgentManager());
    $('#open-memory')?.addEventListener('click', () => openMemoryManager());

    // Footer status
    const stats = await dbStats();
    $('#footer-db').textContent =
      `DB · ${Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(' · ')}`;
    $('#footer-api').textContent = hasApiKey('mistral') ? 'API · Mistral ✓' : 'API · Mistral ✗ (cliquer Réglages)';

    $('#boot-status').textContent = 'Système prêt — v9 (phase 8 · scroll + stream cross-tab + fixes).';
    $('#boot-status').dataset.ready = 'true';
    bus.emit(EVT.BOOT_READY);
    log.info('boot complete');

    // Phase 3 — load tabs + install guards
    await loadTabs();
    // Phase 4 — agents (load + seed defaults)
    await bootAgents();
    // Phase 5 — memory (load + index rebuild)
    await bootMemory();
    installWindowOpenGuard();
    installTabKeybindings();
    bus.on('toast', (p) => toast(p?.msg || '', { type: p?.type || 'info' }));

    // Mount tab bar + chat UI (replaces boot panel)
    const main = $('#alfred-main');
    main.innerHTML = `
      <nav id="alfred-tabs" aria-label="Onglets de conversation"></nav>
      <section class="chat-shell" id="alfred-chat" aria-label="Chat"></section>
    `;
    main.style.padding = 'var(--space-3)';
    main.style.alignItems = 'stretch';
    mountTabBar($('#alfred-tabs'));
    await mountChat($('#alfred-chat'));
  } catch (err) {
    log.error('boot failed', err);
    logBoot(`✗ erreur: ${err.message}`, 'error');
    $('#boot-status').textContent = 'Échec du démarrage — voir console.';
    $('#boot-status').dataset.ready = 'false';
    bus.emit(EVT.BOOT_ERROR, err);
  }
}

function openApiKeyPrompt() {
  const current = hasApiKey('mistral') ? '(clé déjà enregistrée)' : '(aucune clé)';
  const next = prompt(`Clé API Mistral ${current}\n\nLaisser vide pour effacer.`, '');
  if (next === null) return;
  if (next.trim() === '') {
    clearApiKey('mistral');
    $('#footer-api').textContent = 'API · Mistral ✗';
  } else {
    setApiKey('mistral', next.trim());
    $('#footer-api').textContent = 'API · Mistral ✓';
  }
}

// Expose for debugging only
window.Alfred = { bus, EVT };

boot();
