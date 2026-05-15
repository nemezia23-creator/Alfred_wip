// AlfredDB — IndexedDB abstraction layer
// Stores: tabs, chats, agents, memories, tasks, files, settings, command_history
// All operations promise-based, all writes wrapped in try/catch upstream.

import { createLogger } from './logger.js';

const log = createLogger('db');

export const DB_NAME = 'AlfredDB';
export const DB_VERSION = 4;

export const STORES = Object.freeze({
  tabs: { keyPath: 'id', indexes: [['order', 'order'], ['updatedAt', 'updatedAt']] },
  chats: { keyPath: 'id', indexes: [['tabId', 'tabId'], ['createdAt', 'createdAt']] },
  agents: { keyPath: 'id', indexes: [['name', 'name', { unique: false }], ['tag', 'tag']] },
  memories: { keyPath: 'id', indexes: [['type', 'type'], ['createdAt', 'createdAt']] },
  tasks: { keyPath: 'id', indexes: [['status', 'status'], ['agentId', 'agentId']] },
  files: { keyPath: 'id', indexes: [['createdAt', 'createdAt']] },
  settings: { keyPath: 'key' },
  command_history: { keyPath: 'id', indexes: [['ts', 'ts']] },
});

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      log.info(`upgrading ${DB_NAME} from v${event.oldVersion} → v${DB_VERSION}`);
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const idx of def.indexes || []) {
            const [idxName, keyPath, opts] = idx;
            store.createIndex(idxName, keyPath, opts || {});
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => log.warn('open blocked by another connection');
  });
  return _dbPromise;
}

function tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const db = await openDB();
  return promisify(tx(db, store, 'readwrite').put(value));
}

export async function get(store, key) {
  const db = await openDB();
  return promisify(tx(db, store).get(key));
}

export async function del(store, key) {
  const db = await openDB();
  return promisify(tx(db, store, 'readwrite').delete(key));
}

export async function getAll(store) {
  const db = await openDB();
  return promisify(tx(db, store).getAll());
}

export async function clear(store) {
  const db = await openDB();
  return promisify(tx(db, store, 'readwrite').clear());
}

export async function count(store) {
  const db = await openDB();
  return promisify(tx(db, store).count());
}

export async function dbStats() {
  const stats = {};
  for (const name of Object.keys(STORES)) {
    try {
      stats[name] = await count(name);
    } catch {
      stats[name] = -1;
    }
  }
  return stats;
}
