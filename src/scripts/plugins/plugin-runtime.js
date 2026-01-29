import { logger } from '../utils/logger.js';

const INIT_TIMEOUT_MS = 10000;
const EVENT_TIMEOUT_MS = 4000;

const buildWorkerScript = () => `
const listeners = new Map();
const pendingRpcs = new Map();
let rpcSeq = 1;
let pluginMeta = {};

const makeError = (err) => ({
  message: err && err.message ? String(err.message) : String(err || 'unknown error'),
  stack: err && err.stack ? String(err.stack) : '',
});

const send = (msg) => {
  postMessage(msg);
};

const callRpc = (method, params) => new Promise((resolve, reject) => {
  const id = rpcSeq++;
  pendingRpcs.set(id, { resolve, reject });
  send({ type: 'rpc', id, method, params });
});

const api = {
  plugin: {},
  storage: {
    get: (key) => callRpc('storage.get', { key }),
    set: (key, value) => callRpc('storage.set', { key, value }),
    remove: (key) => callRpc('storage.remove', { key }),
    keys: () => callRpc('storage.keys', {}),
  },
  logger: {
    log: (...args) => send({ type: 'log', level: 'log', args }),
    info: (...args) => send({ type: 'log', level: 'info', args }),
    warn: (...args) => send({ type: 'log', level: 'warn', args }),
    error: (...args) => send({ type: 'log', level: 'error', args }),
    debug: (...args) => send({ type: 'log', level: 'debug', args }),
  },
  events: {
    on: (event, callback) => {
      const name = String(event || '').trim();
      if (!name || typeof callback !== 'function') return;
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      send({ type: 'event_subscribe', event: name });
    },
    off: (event, callback) => {
      const name = String(event || '').trim();
      if (!name || !listeners.has(name)) return;
      if (callback) listeners.get(name).delete(callback);
      if (!callback || listeners.get(name).size === 0) listeners.delete(name);
    },
    once: (event, callback) => {
      if (typeof callback !== 'function') return;
      const wrapped = async (data) => {
        api.events.off(event, wrapped);
        return callback(data);
      };
      api.events.on(event, wrapped);
    },
  },
};

const dispatchEvent = async (name, payload) => {
  const list = listeners.get(name);
  if (!list || list.size === 0) return payload;
  let data = payload;
  for (const cb of Array.from(list)) {
    try {
      const res = await cb(data);
      if (res && typeof res === 'object') data = res;
    } catch (err) {
      send({ type: 'event_error', event: name, error: makeError(err) });
    }
  }
  return data;
};

const initPlugin = async (meta, code) => {
  pluginMeta = meta || {};
  api.plugin = {
    id: pluginMeta.id || '',
    name: pluginMeta.name || '',
    version: pluginMeta.version || '',
    mode: pluginMeta.mode || 'safe',
  };
  const module = { exports: {} };
  const exports = module.exports;
  let entry = null;
  try {
    const fn = new Function('module', 'exports', String(code || ''));
    fn(module, exports);
    entry = module.exports;
    if (entry && typeof entry === 'object' && typeof entry.default === 'function') {
      entry = entry.default;
    }
  } catch (err) {
    throw err;
  }
  if (typeof entry !== 'function') {
    throw new Error('Plugin entry must export a function');
  }
  await entry(api);
};

self.addEventListener('message', async (e) => {
  const msg = e.data || {};
  if (msg.type === 'rpc_result' || msg.type === 'rpc_error') {
    const pending = pendingRpcs.get(msg.id);
    if (pending) {
      pendingRpcs.delete(msg.id);
      if (msg.type === 'rpc_error') {
        pending.reject(msg.error || new Error('rpc error'));
      } else {
        pending.resolve(msg.result);
      }
    }
    return;
  }

  if (msg.type === 'init') {
    try {
      await initPlugin(msg.plugin || {}, msg.code || '');
      send({ type: 'init_result', id: msg.id, ok: true });
    } catch (err) {
      send({ type: 'init_result', id: msg.id, ok: false, error: makeError(err) });
    }
    return;
  }

  if (msg.type === 'event') {
    try {
      const data = await dispatchEvent(String(msg.name || ''), msg.data || {});
      send({ type: 'event_result', id: msg.id, data });
    } catch (err) {
      send({ type: 'event_result', id: msg.id, data: msg.data, error: makeError(err) });
    }
  }
});
`;

const callWithTimeout = (promise, timeoutMs, onTimeout) => new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    if (typeof onTimeout === 'function') onTimeout();
    reject(new Error('timeout'));
  }, timeoutMs);
  promise
    .then((res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    })
    .catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
});

class PluginInstance {
  constructor(record, store) {
    this.record = record;
    this.store = store;
    this.worker = null;
    this.pending = new Map();
    this.seq = 1;
    this.status = 'stopped';
    this.lastError = null;
    this.subscriptions = new Set();
  }

  async start() {
    if (this.worker) return;
    if (typeof Worker === 'undefined') {
      throw new Error('Worker not supported');
    }
    const script = buildWorkerScript();
    const blob = new Blob([script], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.worker = worker;
    worker.onmessage = (e) => this.handleMessage(e.data || {});
    worker.onerror = (err) => {
      this.status = 'error';
      this.lastError = err?.message || 'worker error';
      logger.warn(`[plugin:${this.record.id}] worker error`, err);
    };
    await this.init();
  }

  async init() {
    this.status = 'starting';
    const payload = {
      type: 'init',
      plugin: {
        id: this.record.id,
        name: this.record.manifest?.name || this.record.id,
        version: this.record.manifest?.version || '',
        mode: this.record.manifest?.mode || 'safe',
        permissions: Array.isArray(this.record.manifest?.permissions) ? this.record.manifest.permissions : [],
      },
      code: this.record.code,
    };
    const result = await this.request(payload, INIT_TIMEOUT_MS);
    if (!result?.ok) {
      this.status = 'error';
      this.lastError = result?.error?.message || 'init failed';
      throw new Error(this.lastError);
    }
    this.status = 'running';
  }

  async stop() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
    this.status = 'stopped';
  }

  async emit(eventName, data) {
    if (!this.worker || this.status !== 'running') return data;
    const payload = {
      type: 'event',
      name: eventName,
      data,
    };
    try {
      const res = await this.request(payload, EVENT_TIMEOUT_MS);
      if (res?.error) {
        logger.warn(`[plugin:${this.record.id}] event error`, res.error);
      }
      return res?.data ?? data;
    } catch (err) {
      logger.warn(`[plugin:${this.record.id}] event timeout`, err);
      return data;
    }
  }

  request(payload, timeoutMs) {
    const id = this.seq++;
    payload.id = id;
    return callWithTimeout(
      new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker?.postMessage(payload);
      }),
      timeoutMs,
      () => {
        this.pending.delete(id);
      },
    );
  }

  async handleMessage(msg) {
    if (msg.type === 'init_result' || msg.type === 'event_result') {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        pending.resolve(msg);
      }
      return;
    }
    if (msg.type === 'rpc') {
      await this.handleRpc(msg);
      return;
    }
    if (msg.type === 'log') {
      this.handleLog(msg.level, msg.args);
      return;
    }
    if (msg.type === 'event_subscribe') {
      if (msg.event) this.subscriptions.add(String(msg.event));
      return;
    }
    if (msg.type === 'event_error') {
      logger.warn(`[plugin:${this.record.id}] event error`, msg.error);
    }
  }

  async handleRpc(msg) {
    const respond = (type, payload) => {
      if (!this.worker) return;
      this.worker.postMessage({ type, id: msg.id, ...payload });
    };
    const method = String(msg.method || '');
    const permissions = Array.isArray(this.record.manifest?.permissions) ? this.record.manifest.permissions : [];
    if (!permissions.includes('storage')) {
      respond('rpc_error', { error: { message: 'permission denied' } });
      return;
    }
    try {
      if (method === 'storage.get') {
        const result = await this.store.storageGet(this.record.id, msg.params?.key);
        respond('rpc_result', { result });
        return;
      }
      if (method === 'storage.set') {
        await this.store.storageSet(this.record.id, msg.params?.key, msg.params?.value);
        respond('rpc_result', { result: true });
        return;
      }
      if (method === 'storage.remove') {
        await this.store.storageRemove(this.record.id, msg.params?.key);
        respond('rpc_result', { result: true });
        return;
      }
      if (method === 'storage.keys') {
        const result = await this.store.storageKeys(this.record.id);
        respond('rpc_result', { result });
        return;
      }
      respond('rpc_error', { error: { message: 'unknown method' } });
    } catch (err) {
      respond('rpc_error', { error: { message: err?.message || String(err) } });
    }
  }

  handleLog(level, args) {
    const prefix = `[plugin:${this.record.id}]`;
    const payload = Array.isArray(args)
      ? args.map(a => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
      : [];
    const message = [prefix, ...payload].join(' ');
    switch (String(level || 'log')) {
      case 'debug':
        logger.debug(message);
        break;
      case 'info':
        logger.info(message);
        break;
      case 'warn':
        logger.warn(message);
        break;
      case 'error':
        logger.error(message);
        break;
      default:
        logger.info(message);
    }
  }
}

export class PluginRuntime {
  constructor(store) {
    this.store = store;
    this.instances = new Map();
    this.initialized = false;
  }

  async init() {
    await this.store.ready;
    await this.startEnabled();
    this.initialized = true;
  }

  isRunning(id) {
    const instance = this.instances.get(String(id || '').trim());
    return instance?.status === 'running';
  }

  getStatus(id) {
    const instance = this.instances.get(String(id || '').trim());
    if (!instance) return { status: 'stopped', error: null };
    return { status: instance.status, error: instance.lastError };
  }

  async startEnabled() {
    const list = this.store.list();
    for (const item of list) {
      if (item.enabled) {
        await this.enablePlugin(item.id);
      }
    }
  }

  async enablePlugin(id) {
    const key = String(id || '').trim();
    if (!key) return;
    if (this.instances.has(key)) return;
    const record = this.store.get(key);
    if (!record) return;
    const instance = new PluginInstance(record, this.store);
    this.instances.set(key, instance);
    try {
      await instance.start();
    } catch (err) {
      logger.warn(`[plugin:${key}] failed to start`, err);
      instance.status = 'error';
      instance.lastError = err?.message || 'start failed';
    }
  }

  async disablePlugin(id) {
    const key = String(id || '').trim();
    const instance = this.instances.get(key);
    if (instance) {
      await instance.stop();
    }
    this.instances.delete(key);
  }

  async dispatchEvent(name, data) {
    let payload = data;
    for (const [id, instance] of this.instances.entries()) {
      if (instance.status !== 'running') continue;
      payload = await instance.emit(name, payload);
    }
    return payload;
  }
}
