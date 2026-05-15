// One-shot migration from VOANH_AI_DB v3 → AlfredDB v4.
// - Reads all stores from the legacy DB if present.
// - Maps records into the new schema.
// - Does NOT delete the legacy DB (safety).
// - Sets settings.migrated_v2 = true once done.

import { createLogger } from './logger.js';
import { put, get } from './db.js';

const log = createLogger('migrate');
const LEGACY_DB = 'VOANH_AI_DB';
const FLAG_KEY = 'migrated_v2';

function openLegacy() {
  return new Promise((resolve, reject) => {
    // Open without specifying version → use existing version, no upgrade.
    const req = indexedDB.open(LEGACY_DB);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      // If the DB does not exist, abort the upgrade by aborting the txn.
      req.transaction.abort();
    };
  });
}

function readAll(db, store) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(store)) return resolve([]);
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function runMigrationIfNeeded() {
  const flag = await get('settings', FLAG_KEY);
  if (flag && flag.value === true) {
    log.debug('already migrated, skipping');
    return { skipped: true };
  }

  let legacy;
  try {
    legacy = await openLegacy();
  } catch (err) {
    log.info('no legacy VOANH_AI_DB found, fresh install');
    await put('settings', { key: FLAG_KEY, value: true, ts: Date.now() });
    return { skipped: true, reason: 'no-legacy' };
  }

  try {
    const result = { chats: 0, agents: 0, settings: 0, memories: 0 };

    // chats
    const chats = await readAll(legacy, 'chats');
    for (const c of chats) {
      await put('chats', { ...c, version: c.version || 1 });
      result.chats++;
    }

    // agents (add `version` field for forward-compat)
    const agents = await readAll(legacy, 'agents');
    for (const a of agents) {
      await put('agents', { ...a, version: a.version || 1 });
      result.agents++;
    }

    // settings
    const settings = await readAll(legacy, 'settings');
    for (const s of settings) {
      // legacy may use {key, value} already, keep as-is
      await put('settings', s);
      result.settings++;
    }

    // global_memory → memories
    const mem = await readAll(legacy, 'global_memory');
    for (const m of mem) {
      await put('memories', { ...m, type: m.type || 'global' });
      result.memories++;
    }

    await put('settings', { key: FLAG_KEY, value: true, ts: Date.now() });
    log.info('migration complete', result);
    return { migrated: true, ...result };
  } finally {
    legacy.close();
  }
}
