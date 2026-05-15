// EventBus — typed pub/sub intra-fenêtre
// Aucun globals. Aucune dépendance.

export const EVT = Object.freeze({
  // Tabs
  TAB_CREATED: 'tab:created',
  TAB_CLOSED: 'tab:closed',
  TAB_SWITCHED: 'tab:switched',
  TAB_UPDATED: 'tab:updated',
  // Agents
  AGENT_CREATED: 'agent:created',
  AGENT_DELETED: 'agent:deleted',
  AGENT_UPDATED: 'agent:updated',
  AGENT_INVOKED: 'agent:invoked',
  // Chat
  CHAT_MESSAGE: 'chat:message',
  CHAT_STREAMING: 'chat:streaming',
  CHAT_ERROR: 'chat:error',
  // Memory
  MEMORY_ADDED: 'memory:added',
  MEMORY_DELETED: 'memory:deleted',
  // Tasks
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_COMPLETED: 'task:completed',
  // Files
  FILE_UPLOADED: 'file:uploaded',
  FILE_PARSED: 'file:parsed',
  // Misc
  SETTINGS_CHANGED: 'settings:changed',
  ORCHESTRATOR_ACTION: 'orchestrator:action',
  COMMAND_EXECUTED: 'command:executed',
  // Boot
  BOOT_STEP: 'boot:step',
  BOOT_READY: 'boot:ready',
  BOOT_ERROR: 'boot:error',
});

class EventBus {
  constructor() {
    this._listeners = new Map(); // type -> Set<fn>
    this._wildcards = new Set(); // fn(type, payload)
  }

  on(type, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (type === '*') {
      this._wildcards.add(handler);
      return () => this._wildcards.delete(handler);
    }
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    if (type === '*') { this._wildcards.delete(handler); return; }
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit(type, payload) {
    for (const fn of [...this._wildcards]) {
      try { fn(type, payload); } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] wildcard handler error for "${type}"`, err);
      }
    }
    const set = this._listeners.get(type);
    if (!set) return;
    // Copy to allow off() during dispatch
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        // Avoid breaking the bus on a faulty handler
        // eslint-disable-next-line no-console
        console.error(`[EventBus] handler error for "${type}"`, err);
      }
    }
  }

  clear(type) {
    if (type === '*') { this._wildcards.clear(); return; }
    if (type) this._listeners.delete(type);
    else { this._listeners.clear(); this._wildcards.clear(); }
  }
}

export const bus = new EventBus();
