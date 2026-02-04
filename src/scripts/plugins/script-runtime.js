import { appSettings } from '../storage/app-settings.js';
import { logger } from '../utils/logger.js';
import { emitDebugLog } from '../utils/debug-log.js';

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const SCRIPT_TOTAL_BYTES = 8 * 1024 * 1024;
const SCRIPT_PAYLOAD_LIMIT = 1200000;

const buildWorkerScript = () => `
const scripts = new Map();
let currentContext = { sessionId: '', personaId: '', presetId: '', worldId: '', worldIds: [] };
let currentSettings = { allowReadMessages: true, allowModifyVariables: true, allowNetwork: false };
const DISPATCH_RESULT_LIMIT = ${SCRIPT_PAYLOAD_LIMIT};
let seq = 0;
const pending = new Map();
const importCache = new Map();
const IMPORT_CACHE_LIMIT = 32;

const clone = (v) => {
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
};

const estimateSize = (value) => {
  try { return JSON.stringify(value).length; } catch { return DISPATCH_RESULT_LIMIT + 1; }
};

const callRpc = (method, params = {}) => {
  const id = \`\${Date.now()}-\${++seq}\`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, at: Date.now() });
    postMessage({ type: 'rpc', id, method, params });
  });
};

const buildModuleNamespace = (moduleExports, diff) => {
  const hasDiff = diff && Object.keys(diff).length > 0;
  let result = null;
  if (moduleExports !== undefined && moduleExports !== null) {
    if (typeof moduleExports === 'object' || typeof moduleExports === 'function') {
      result = moduleExports;
    } else {
      result = { default: moduleExports };
    }
  } else if (hasDiff) {
    result = diff;
  } else {
    result = {};
  }
  if (typeof result === 'function') {
    if (!('default' in result)) result.default = result;
    if (hasDiff) {
      Object.entries(diff).forEach(([key, value]) => {
        if (!(key in result)) result[key] = value;
      });
    }
    return result;
  }
  if (result && typeof result === 'object') {
    if (!('default' in result)) {
      result.default = (moduleExports !== undefined && moduleExports !== null) ? moduleExports : result;
    }
    if (hasDiff) {
      Object.entries(diff).forEach(([key, value]) => {
        if (!(key in result)) result[key] = value;
      });
    }
    return result;
  }
  return { default: result };
};

const getOrigin = () => {
  try {
    const origin = self.location && self.location.origin;
    if (!origin || origin === 'null') return '';
    return origin;
  } catch {
    return '';
  }
};

const resolveLibUrl = (path) => {
  if (!path) return '';
  const raw = String(path);
  if (/^[a-z]+:\\/\\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('tauri:') || raw.startsWith('app:')) {
    return raw;
  }
  const origin = getOrigin();
  if (!origin) return raw;
  if (raw.startsWith('/')) return origin + raw;
  return origin + '/' + raw.replace(/^\\.?\\//, '');
};

const isRemoteUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^https?:\\/\\//i.test(raw) || raw.startsWith('//');
};

const loadScriptText = (url) => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send(null);
  if (xhr.status >= 200 && xhr.status < 300) return String(xhr.responseText || '');
  throw new Error('HTTP ' + xhr.status);
};

const safeImportScript = (url) => {
  if (!url) return false;
  try {
    importScripts(url);
    return true;
  } catch {
    return false;
  }
};

const safeEvalScript = (url) => {
  if (!url) return false;
  try {
    const text = loadScriptText(url);
    const runner = new Function(text);
    runner();
    return true;
  } catch {
    return false;
  }
};

const loadLibrary = (urls) => {
  if (!Array.isArray(urls)) return false;
  for (const url of urls) {
    if (!url) continue;
    if (safeImportScript(url)) return true;
    if (safeEvalScript(url)) return true;
  }
  return false;
};

const makeCompatLodash = () => ({
  clamp: (value, lower, upper) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return lower ?? 0;
    if (Number.isFinite(lower) && num < lower) return lower;
    if (Number.isFinite(upper) && num > upper) return upper;
    return num;
  },
  max: (list) => {
    if (!Array.isArray(list) || !list.length) return undefined;
    return list.reduce((acc, cur) => (acc === undefined || cur > acc ? cur : acc), undefined);
  },
});

const makeCompatDollar = () => {
  const fn = (handler) => {
    if (typeof handler === 'function') {
      try { handler(); } catch {}
    }
    return {
      on: () => {},
      ready: (cb) => { if (typeof cb === 'function') cb(); },
    };
  };
  fn.ready = (cb) => { if (typeof cb === 'function') cb(); };
  return fn;
};

const ensureCompatGlobals = () => {
  const allowNetwork = currentSettings.allowNetwork === true;
  if (!self.window) self.window = self;
  if (!self._) {
    const lodashUrls = [resolveLibUrl('lib/lodash.min.js')];
    if (allowNetwork) lodashUrls.push('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js');
    loadLibrary(lodashUrls);
  }
  if (!self._) self._ = makeCompatLodash();
  if (!self.z) {
    const zodUrls = [resolveLibUrl('lib/zod.min.js')];
    if (allowNetwork) zodUrls.push('https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js');
    loadLibrary(zodUrls);
  }
  if (!self.z) {
    const candidate = self.Zod || self.zod;
    if (candidate && candidate.z) self.z = candidate.z;
    else if (candidate) self.z = candidate;
  }
  if (self.z) {
    const ZodType = self.z.ZodType || self.Zod?.ZodType;
    if (ZodType && typeof ZodType.prototype?.prefault !== 'function') {
      ZodType.prototype.prefault = function prefault(value) {
        if (typeof this.default === 'function') return this.default(value);
        return this;
      };
    }
  }
  if (!self.$) self.$ = makeCompatDollar();
};

const runImport = (url) => {
  ensureCompatGlobals();
  const key = String(url || '').trim();
  if (!key) return {};
  if (isRemoteUrl(key) && !currentSettings.allowNetwork) {
    callRpc('log', { level: 'warn', args: ['脚本网络已禁用，阻止加载', key] }).catch(() => {});
    return {};
  }
  if (importCache.has(key)) return importCache.get(key);
  const before = new Set(Object.keys(self));
  const prevModule = self.module;
  const prevExports = self.exports;
  const module = { exports: {} };
  self.module = module;
  self.exports = module.exports;
  let importError = null;
  try {
    importScripts(key);
  } catch (err) {
    importError = err;
  } finally {
    if (prevModule === undefined) delete self.module;
    else self.module = prevModule;
    if (prevExports === undefined) delete self.exports;
    else self.exports = prevExports;
  }
  if (importError) {
    try {
      const text = loadScriptText(key);
      const code = preprocess(text);
      const runner = new Function('module', 'exports', '__import', code);
      runner(module, module.exports, runImport);
      importError = null;
    } catch (err) {
      callRpc('log', { level: 'warn', args: ['脚本 import 失败', key, String(err?.message || err)] }).catch(() => {});
    }
  }
  const diff = {};
  Object.keys(self).forEach((keyName) => {
    if (!before.has(keyName)) diff[keyName] = self[keyName];
  });
  const result = buildModuleNamespace(module.exports, diff);
  importCache.set(key, result);
  if (importCache.size > IMPORT_CACHE_LIMIT) {
    const first = importCache.keys().next().value;
    if (first) importCache.delete(first);
  }
  return result;
};

const normalizeNamedImport = (raw) => {
  return String(raw || '')
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const m = trimmed.match(/^([\\w$]+)\\s+as\\s+([\\w$]+)$/);
      return m ? \`\${m[1]}: \${m[2]}\` : trimmed;
    })
    .filter(Boolean)
    .join(', ');
};

const parseNamedExports = (raw) => {
  return String(raw || '')
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const m = trimmed.match(/^([\\w$]+)\\s+as\\s+([\\w$]+)$/);
      return m ? { local: m[1], exported: m[2] } : { local: trimmed, exported: trimmed };
    })
    .filter(Boolean);
};

const preprocess = (code) => {
  if (!code) return '';
  let out = String(code);
  const exportNames = [];
  const exportAssignments = [];
  let exportSeq = 0;
  // export * from 'url'
  out = out.replace(
    /^\\s*export\\s+\\*\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, url) => \`Object.assign(exports, __import(\${JSON.stringify(url)}));\`,
  );
  // export { a as b } from 'url'
  out = out.replace(
    /^\\s*export\\s+\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, named, url) => {
      const entries = parseNamedExports(named);
      const modName = \`__mod\${++exportSeq}\`;
      const lines = [\`const \${modName} = __import(\${JSON.stringify(url)});\`];
      entries.forEach(({ local, exported }) => {
        lines.push(\`exports.\${exported} = \${modName}.\${local};\`);
      });
      return lines.join('\\n');
    },
  );
  // export { a as b, c }
  out = out.replace(
    /^\\s*export\\s+\\{([^}]+)\\}\\s*;?/gm,
    (_m, named) => {
      const entries = parseNamedExports(named);
      entries.forEach(({ local, exported }) => {
        exportAssignments.push(\`exports.\${exported} = \${local};\`);
      });
      return '';
    },
  );
  // export const/let/var/function/class name
  out = out.replace(
    /^\\s*export\\s+(const|let|var|function|class)\\s+([\\w$]+)/gm,
    (_m, type, name) => {
      exportNames.push(name);
      return \`\${type} \${name}\`;
    },
  );
  // import * from 'url'
  out = out.replace(/^\\s*import\\s+\\*\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm, (_m, url) => \`__import(\${JSON.stringify(url)});\`);
  // import * as name from 'url'
  out = out.replace(
    /^\\s*import\\s+\\*\\s+as\\s+([\\w$]+)\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, name, url) => \`const \${name} = __import(\${JSON.stringify(url)});\`,
  );
  // import name, { a as b } from 'url'
  out = out.replace(
    /^\\s*import\\s+([\\w$]+)\\s*,\\s*\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, name, named, url) => {
      const converted = normalizeNamedImport(named);
      return \`const { default: \${name}\${converted ? \`, \${converted}\` : ''} } = __import(\${JSON.stringify(url)});\`;
    },
  );
  // import { a as b } from 'url'
  out = out.replace(
    /^\\s*import\\s+\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, named, url) => {
      const converted = normalizeNamedImport(named);
      return \`const { \${converted} } = __import(\${JSON.stringify(url)});\`;
    },
  );
  // import name from 'url'
  out = out.replace(
    /^\\s*import\\s+([\\w$]+)\\s+from\\s+['"]([^'"]+)['"]\\s*;?/gm,
    (_m, name, url) => \`const { default: \${name} } = __import(\${JSON.stringify(url)});\`,
  );
  // import 'url'
  out = out.replace(/^\\s*import\\s+['"]([^'"]+)['"]\\s*;?/gm, (_m, url) => \`__import(\${JSON.stringify(url)});\`);
  out = out.replace(/\\bexport\\s+default\\s+/g, 'exports.default = ');
  if (exportNames.length || exportAssignments.length) {
    const lines = [];
    exportNames.forEach(name => lines.push(\`exports.\${name} = \${name};\`));
    exportAssignments.forEach(line => lines.push(line));
    out += \`\\n\${lines.join('\\n')}\\n\`;
  }
  return out;
};

const scheduleDataFlush = (() => {
  const timers = new Map();
  return (scriptId) => {
    if (!scriptId) return;
    const prev = timers.get(scriptId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      timers.delete(scriptId);
      const entry = scripts.get(scriptId);
      if (entry) {
        callRpc('script.updateData', {
          scriptId,
          data: entry.data,
          scope: entry.record?.scope || '',
          scopeId: entry.record?.scopeId || '',
        }).catch(() => {});
      }
    }, 200);
    timers.set(scriptId, timer);
  };
})();

const makeDataProxy = (scriptId, data) => {
  const base = data && typeof data === 'object' ? data : {};
  return new Proxy(base, {
    set(target, prop, value) {
      target[prop] = value;
      scheduleDataFlush(scriptId);
      return true;
    },
    deleteProperty(target, prop) {
      delete target[prop];
      scheduleDataFlush(scriptId);
      return true;
    },
  });
};

const normalizeRole = (role) => {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return '';
  if (r === 'user' || r === 'assistant' || r === 'system') return r;
  if (r === 'any') return '';
  return r;
};

const messageContentToText = (msg) => {
  if (!msg || typeof msg !== 'object') return '';
  const content = msg.content;
  if (Array.isArray(content)) {
    return content
      .map(part => (part?.type === 'text' ? String(part.text || '') : ''))
      .filter(Boolean)
      .join('\\n');
  }
  return String((typeof msg.raw === 'string' && msg.raw) ? msg.raw : (content ?? ''));
};

const makeApi = (scriptId) => {
  const call = (method, params) => callRpc(method, { ...params, sessionId: currentContext.sessionId, scriptId });
  const resolveChatMessages = async () => {
    const list = await call('chat.getMessages', {});
    return Array.isArray(list) ? list : [];
  };
  return {
    getvar: (key, options = {}) => call('variables.get', { key, options }),
    setvar: (key, value, options = {}) => call('variables.set', { key, value, options }),
    incvar: (key, delta = 1, options = {}) => call('variables.inc', { key, delta, options }),
    decvar: (key, delta = 1, options = {}) => call('variables.dec', { key, delta, options }),
    getChatMessage: async (idx, role) => {
      const list = await resolveChatMessages();
      const roleFilter = normalizeRole(role);
      const filtered = roleFilter ? list.filter(m => String(m?.role || '').trim().toLowerCase() === roleFilter) : list;
      if (!filtered.length) return '';
      let index = Number(idx);
      if (!Number.isFinite(index)) return '';
      index = Math.trunc(index);
      if (index < 0) index = filtered.length + index;
      if (index < 0 || index >= filtered.length) return '';
      return messageContentToText(filtered[index]);
    },
    getChatMessages: async (...args) => {
      const list = await resolveChatMessages();
      if (!list.length) return [];
      let start = null;
      let end = null;
      let role = '';
      if (args.length === 1) {
        start = null;
        end = Number(args[0]);
      } else if (args.length === 2) {
        if (typeof args[1] === 'string') {
          end = Number(args[0]);
          role = String(args[1] || '');
        } else {
          start = Number(args[0]);
          end = Number(args[1]);
        }
      } else if (args.length >= 3) {
        start = Number(args[0]);
        end = Number(args[1]);
        role = String(args[2] || '');
      }
      const roleFilter = normalizeRole(role);
      const filtered = roleFilter ? list.filter(m => String(m?.role || '').trim().toLowerCase() === roleFilter) : list;
      if (!filtered.length) return [];
      if (start === null) {
        const count = Number(end);
        if (!Number.isFinite(count)) return [];
        const n = Math.max(0, Math.trunc(count));
        const slice = n === 0 ? [] : filtered.slice(-n);
        return slice.map(messageContentToText);
      }
      const s = Math.max(0, Math.trunc(Number(start) || 0));
      const eRaw = Number(end);
      const e = Number.isFinite(eRaw) ? Math.max(s, Math.trunc(eRaw)) : filtered.length;
      return filtered.slice(s, e).map(messageContentToText);
    },
    getwi: (world, title, data) => call('world.getEntry', { world, title, data }),
    activewi: (world, title, force) => call('world.activate', { world, title, force }),
    getchar: (name) => call('context.getCharacter', { name }),
    getpreset: (name) => call('context.getPreset', { name }),
    getContext: () => call('context.getContext', {}),
    getcontext: () => call('context.getContext', {}),
    log: (...args) => call('log', { level: 'log', args }),
    warn: (...args) => call('log', { level: 'warn', args }),
    error: (...args) => call('log', { level: 'error', args }),
    toast: (message, level = 'info') => call('toast', { message, level }),
  };
};

const compileScript = (record) => {
  ensureCompatGlobals();
  const handlers = new Map();
  const on = (event, fn) => {
    const name = String(event || '').trim();
    if (!name || typeof fn !== 'function') return;
    const list = handlers.get(name) || [];
    list.push(fn);
    handlers.set(name, list);
  };
  const off = (event, fn) => {
    const name = String(event || '').trim();
    if (!name || !handlers.has(name)) return;
    if (!fn) {
      handlers.delete(name);
      return;
    }
    const list = handlers.get(name) || [];
    handlers.set(name, list.filter(item => item !== fn));
  };
  const api = makeApi(record.id);
  const script = {
    id: record.id,
    name: record.name,
    info: record.info || '',
    scope: record.scope || '',
    scopeId: record.scopeId || '',
    data: makeDataProxy(record.id, clone(record.data || {})),
  };
  let defaultHandler = null;
  try {
    const module = { exports: {} };
    const exports = module.exports;
    const code = preprocess(record.content || '');
    const runner = new Function('api', 'script', 'on', 'off', 'module', 'exports', '__import', code);
    const __import = (url) => runImport(url);
    runner(api, script, on, off, module, exports, __import);
    if (typeof module.exports === 'function') defaultHandler = module.exports;
    else if (module.exports && typeof module.exports.default === 'function') defaultHandler = module.exports.default;
    else if (exports && typeof exports.default === 'function') defaultHandler = exports.default;
  } catch (err) {
    callRpc('log', { level: 'error', args: ['脚本加载失败', record.name, String(err?.message || err)] }).catch(() => {});
  }
  return { record, handlers, defaultHandler, api, script };
};

const runHandlers = async (entry, eventName, payload, allowMutate) => {
  let data = payload;
  const base = data && typeof data === 'object' ? { ...data } : { value: data };
  const handlerPayload = { ...base, event: eventName, context: currentContext, api: entry.api, script: entry.script };
  const list = entry.handlers.get(eventName) || entry.handlers.get('*') || [];
  if (!list.length && entry.defaultHandler) list.push(entry.defaultHandler);
  for (const fn of list) {
    try {
      const res = await fn(handlerPayload);
      if (allowMutate && res && typeof res === 'object') {
        data = res;
      }
    } catch (err) {
      callRpc('log', { level: 'warn', args: ['脚本执行失败', entry.record?.name || '', String(err?.message || err)] }).catch(() => {});
    }
  }
  return data;
};

const dispatchEvent = async (eventName, payload, allowMutate = true) => {
  let data = payload;
  for (const entry of scripts.values()) {
    if (!entry?.record?.enabled) continue;
    data = await runHandlers(entry, eventName, data, allowMutate);
  }
  return data;
};

self.onmessage = async (e) => {
  const msg = e?.data || {};
  if (msg.type === 'rpc_result' || msg.type === 'rpc_error') {
    const pendingItem = pending.get(msg.id);
    if (!pendingItem) return;
    pending.delete(msg.id);
    if (msg.type === 'rpc_error') pendingItem.reject(msg.error);
    else pendingItem.resolve(msg.result);
    return;
  }
  if (msg.type === 'sync') {
    const list = Array.isArray(msg.scripts) ? msg.scripts : [];
    scripts.clear();
    if (msg.settings && typeof msg.settings === 'object') {
      currentSettings = { ...currentSettings, ...msg.settings };
    }
    list.forEach(item => {
      const record = { ...item };
      record.enabled = item.enabled === true;
      scripts.set(record.id, compileScript(record));
    });
    if (msg.context && typeof msg.context === 'object') {
      currentContext = { ...currentContext, ...msg.context };
    }
    postMessage({ type: 'sync_done' });
    return;
  }
  if (msg.type === 'context') {
    if (msg.context && typeof msg.context === 'object') {
      currentContext = { ...currentContext, ...msg.context };
    }
    if (msg.settings && typeof msg.settings === 'object') {
      currentSettings = { ...currentSettings, ...msg.settings };
    }
    return;
  }
  if (msg.type === 'dispatch') {
    const evt = String(msg.event || '').trim();
    if (!evt) {
      postMessage({ type: 'dispatch_result', id: msg.id, result: msg.payload });
      return;
    }
    const allowMutate = msg.allowMutate !== false;
    try {
      const result = await dispatchEvent(evt, msg.payload, allowMutate);
      if (estimateSize(result) > DISPATCH_RESULT_LIMIT) {
        throw new Error('脚本结果过大');
      }
      postMessage({ type: 'dispatch_result', id: msg.id, result });
    } catch (err) {
      postMessage({ type: 'dispatch_error', id: msg.id, error: String(err?.message || err || 'unknown error') });
    }
  }
};
`;

const toPath = (key) => String(key || '').split('.').map(p => p.trim()).filter(Boolean);

const getByPath = (obj, path) => {
  let cur = obj;
  for (const part of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
};

const setByPath = (obj, path, value) => {
  if (!obj || typeof obj !== 'object') return obj;
  let cur = obj;
  path.forEach((part, idx) => {
    if (idx === path.length - 1) {
      cur[part] = value;
      return;
    }
    if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  });
  return obj;
};

const estimatePayloadSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Infinity;
  }
};

export class ScriptRuntime {
  constructor(store) {
    this.store = store;
    this.worker = null;
    this.pending = new Map();
    this.seq = 0;
    this.oneTimeScripts = new Map();
    this.context = {
      sessionId: '',
      personaId: '',
      presetId: '',
      worldId: '',
      worldIds: [],
    };
    this.bridge = null;
    this.chatStore = null;
    this.contactsStore = null;
    this.getEffectivePersona = null;
    this.presets = null;
    this.ready = this.init();
    window.addEventListener('scripts-changed', () => {
      this.syncScripts().catch(() => {});
    });
  }

  async init() {
    await this.store?.ready;
    this.startWorker();
    await this.syncScripts();
  }

  setContext({ bridge, chatStore, contactsStore, getEffectivePersona, presets } = {}) {
    this.bridge = bridge || this.bridge;
    this.chatStore = chatStore || this.chatStore;
    this.contactsStore = contactsStore || this.contactsStore;
    this.getEffectivePersona = typeof getEffectivePersona === 'function' ? getEffectivePersona : this.getEffectivePersona;
    this.presets = presets || this.presets;
  }

  startWorker() {
    try {
      const blob = new Blob([buildWorkerScript()], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = (e) => this.handleWorkerMessage(e?.data || {});
      this.worker.onerror = (err) => {
        logger.warn('script runtime worker error', err);
        emitDebugLog({
          message: `脚本运行器异常：${err?.message || 'unknown error'}`,
          type: 'warn',
          source: 'script',
        });
      };
    } catch (err) {
      logger.warn('script runtime worker init failed', err);
      this.worker = null;
    }
  }

  restartWorker(reason = '') {
    const msg = String(reason || '脚本运行器已重启');
    try {
      this.worker?.terminate?.();
    } catch {}
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(msg));
    }
    this.pending.clear();
    emitDebugLog({ message: msg, type: 'warn', source: 'script' });
    this.startWorker();
    this.syncScripts().catch(() => {});
  }

  getSessionSettings(sessionId) {
    if (!this.chatStore?.getSessionSettings) return {};
    return this.chatStore.getSessionSettings(sessionId) || {};
  }

  isEnabled(sessionId) {
    const settings = appSettings.get();
    if (settings.scriptEnabled !== true) {
      if (sessionId && this.oneTimeScripts.get(sessionId)?.size) return true;
      return false;
    }
    if (sessionId) {
      const session = this.getSessionSettings(sessionId);
      if (typeof session.scriptEnabled === 'boolean') return session.scriptEnabled;
    }
    return true;
  }

  allowOnce(sessionId, scriptIds = []) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const list = Array.isArray(scriptIds) ? scriptIds : [scriptIds];
    if (!list.length) return;
    const set = this.oneTimeScripts.get(sid) || new Set();
    list.forEach(id => {
      const key = String(id || '').trim();
      if (key) set.add(key);
    });
    this.oneTimeScripts.set(sid, set);
    this.syncScripts({ sessionId: sid }).catch(() => {});
  }

  consumeOnce(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    if (!this.oneTimeScripts.has(sid)) return;
    this.oneTimeScripts.delete(sid);
    this.syncScripts({ sessionId: sid }).catch(() => {});
  }

  buildContext(sessionId) {
    const sid = String(sessionId || this.chatStore?.getCurrent?.() || this.context.sessionId || '').trim();
    let personaId = '';
    let personaName = '';
    if (sid && this.getEffectivePersona) {
      const persona = this.getEffectivePersona(sid);
      personaId = String(persona?.id || '').trim();
      personaName = String(persona?.name || '').trim();
    }
    let presetId = '';
    if (this.presets?.getState) {
      const state = this.presets.getState();
      presetId = String(state?.active?.sysprompt || '') || '';
    }
    const worldId = String(this.bridge?.currentWorldId || '');
    const worldIds = Array.isArray(this.bridge?.currentWorldIds) ? this.bridge.currentWorldIds.slice() : [];
    return {
      sessionId: sid,
      personaId,
      personaName,
      presetId,
      worldId,
      worldIds,
    };
  }

  findScriptScope(scriptId) {
    const id = String(scriptId || '').trim();
    if (!id) return { scope: 'global', scopeId: 'global' };
    const globalScripts = this.store?.state?.global?.scripts || [];
    if (globalScripts.some(s => s.id === id)) return { scope: 'global', scopeId: 'global' };
    const charBuckets = this.store?.state?.character || {};
    for (const [scopeId, bucket] of Object.entries(charBuckets)) {
      if (bucket?.scripts?.some?.(s => s.id === id)) return { scope: 'character', scopeId };
    }
    const presetBuckets = this.store?.state?.preset || {};
    for (const [scopeId, bucket] of Object.entries(presetBuckets)) {
      if (bucket?.scripts?.some?.(s => s.id === id)) return { scope: 'preset', scopeId };
    }
    return { scope: 'global', scopeId: 'global' };
  }

  async syncScripts(contextOverride) {
    if (!this.worker) return;
    const context = contextOverride || this.buildContext();
    this.context = { ...this.context, ...context };
    const scripts = [];
    const oneTime = this.oneTimeScripts.get(this.context.sessionId) || null;
    const seen = new Set();
    const push = (scope, scopeId) => {
      if (!this.store?.getScripts) return;
      const list = this.store.getScripts(scope, scopeId);
      list.forEach((s) => {
        if (!s || typeof s !== 'object') return;
        const id = String(s.id || '').trim();
        if (!id || seen.has(id)) return;
        const isActive = s.enabled === true && s.authorized === true;
        const allowOnce = oneTime && oneTime.has(id);
        if (!isActive && !allowOnce) return;
        const next = { ...s, scope, scopeId };
        if (allowOnce) {
          next.enabled = true;
          next.authorized = true;
        }
        scripts.push(next);
        seen.add(id);
      });
    };
    push('global', 'global');
    if (this.context.personaId) push('character', this.context.personaId);
    if (this.context.presetId) push('preset', this.context.presetId);
    let totalSize = 0;
    const filtered = [];
    const skipped = [];
    for (const script of scripts) {
      const content = String(script?.content || '');
      const size = content.length;
      if (size > SCRIPT_MAX_BYTES) {
        skipped.push(`${script?.name || script?.id || '未命名'}（过大）`);
        continue;
      }
      if (totalSize + size > SCRIPT_TOTAL_BYTES) {
        skipped.push(`${script?.name || script?.id || '未命名'}（超出总量）`);
        continue;
      }
      totalSize += size;
      filtered.push(script);
    }
    if (skipped.length) {
      const msg = `脚本加载被限制：${skipped.join('、')}`;
      logger.warn(msg);
      emitDebugLog({ message: msg, type: 'warn', source: 'script' });
    }
    const settings = appSettings.get();
    const payload = {
      scripts: filtered,
      context: this.context,
      settings: {
        allowReadMessages: settings.scriptAllowReadMessages !== false,
        allowModifyVariables: settings.scriptAllowModifyVariables !== false,
        allowNetwork: settings.scriptAllowNetwork === true,
      },
    };
    this.worker.postMessage({ type: 'sync', ...payload });
  }

  async syncContext(contextOverride) {
    if (!this.worker) return;
    const context = contextOverride || this.buildContext();
    const next = { ...this.context, ...context };
    const changed = JSON.stringify(next) !== JSON.stringify(this.context);
    this.context = next;
    const settings = appSettings.get();
    this.worker.postMessage({
      type: 'context',
      context: this.context,
      settings: {
        allowReadMessages: settings.scriptAllowReadMessages !== false,
        allowModifyVariables: settings.scriptAllowModifyVariables !== false,
        allowNetwork: settings.scriptAllowNetwork === true,
      },
    });
    if (changed) {
      await this.syncScripts(this.context);
    }
  }

  async dispatchEvent(event, payload = {}, options = {}) {
    if (!this.worker) return payload;
    const sessionId = String(payload?.sessionId || this.context.sessionId || this.chatStore?.getCurrent?.() || '').trim();
    if (!this.isEnabled(sessionId)) return payload;
    if (options?.skip === true || payload?.skipScripts === true || payload?.meta?.skipScripts === true) {
      return payload;
    }
    const payloadSize = estimatePayloadSize({ event, payload });
    if (payloadSize > SCRIPT_PAYLOAD_LIMIT) {
      const msg = '脚本执行负载过大，已跳过';
      logger.warn(msg, { size: payloadSize });
      emitDebugLog({ message: msg, type: 'warn', source: 'script' });
      return payload;
    }
    await this.syncContext({ sessionId });
    return this.callWorker('dispatch', {
      event,
      payload,
      allowMutate: options.allowMutate !== false,
    }, options.timeoutMs || 3000);
  }

  callWorker(type, payload, timeoutMs = 3000) {
    if (!this.worker) return Promise.resolve(payload?.payload);
    const id = `${Date.now()}-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new Error('script runtime timeout');
        reject(err);
        this.restartWorker('脚本执行超时，运行器已重启');
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  handleWorkerMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'dispatch_result') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      pending.resolve(msg.result);
      return;
    }
    if (msg.type === 'dispatch_error') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      pending.reject(new Error(msg.error || 'script dispatch error'));
      this.restartWorker('脚本结果过大，运行器已重启');
      return;
    }
    if (msg.type === 'rpc') {
      this.handleRpc(msg).catch((err) => {
        this.worker?.postMessage({ type: 'rpc_error', id: msg.id, error: String(err?.message || err) });
      });
      return;
    }
  }

  async handleRpc(msg) {
    const { id, method, params } = msg;
    const result = await this.processRpc(method, params || {});
    this.worker?.postMessage({ type: 'rpc_result', id, result });
  }

  async processRpc(method, params) {
    const settings = appSettings.get();
    const allowReadMessages = settings.scriptAllowReadMessages !== false;
    const allowModifyVariables = settings.scriptAllowModifyVariables !== false;
    const sessionId = String(params.sessionId || this.context.sessionId || this.chatStore?.getCurrent?.() || '').trim();
    if (method === 'variables.get') {
      const key = String(params.key || '').trim();
      const scope = String(params.options?.scope || params.scope || 'local').toLowerCase();
      if (!key) return undefined;
      const path = toPath(key);
      if (!path.length) return undefined;
      if (scope === 'global') {
        const base = this.chatStore?.getGlobalVariable?.(path[0]);
        return path.length === 1 ? base : getByPath(base, path.slice(1));
      }
      const base = this.chatStore?.getVariable?.(path[0], sessionId);
      return path.length === 1 ? base : getByPath(base, path.slice(1));
    }
    if (method === 'variables.set') {
      if (!allowModifyVariables) return false;
      const key = String(params.key || '').trim();
      const scope = String(params.options?.scope || params.scope || 'local').toLowerCase();
      if (!key) return false;
      const path = toPath(key);
      if (!path.length) return false;
      if (scope === 'global') {
        if (path.length === 1) return this.chatStore?.setGlobalVariable?.(path[0], params.value);
        const base = this.chatStore?.getGlobalVariable?.(path[0]) || {};
        const next = setByPath({ ...(base && typeof base === 'object' ? base : {}) }, path.slice(1), params.value);
        return this.chatStore?.setGlobalVariable?.(path[0], next);
      }
      if (path.length === 1) return this.chatStore?.setVariable?.(path[0], params.value, sessionId);
      const base = this.chatStore?.getVariable?.(path[0], sessionId) || {};
      const next = setByPath({ ...(base && typeof base === 'object' ? base : {}) }, path.slice(1), params.value);
      return this.chatStore?.setVariable?.(path[0], next, sessionId);
    }
    if (method === 'variables.inc' || method === 'variables.dec') {
      if (!allowModifyVariables) return false;
      const key = String(params.key || '').trim();
      const delta = Number(params.delta || 1) || 0;
      const sign = method === 'variables.dec' ? -1 : 1;
      const current = await this.processRpc('variables.get', { key, options: params.options, scope: params.scope, sessionId });
      const next = (Number(current) || 0) + sign * delta;
      await this.processRpc('variables.set', { key, value: next, options: params.options, scope: params.scope, sessionId });
      return next;
    }
    if (method === 'chat.getMessages') {
      if (!allowReadMessages) return [];
      const list = Array.isArray(this.chatStore?.getMessages?.(sessionId))
        ? this.chatStore.getMessages(sessionId)
        : [];
      return list.map(m => ({ ...m }));
    }
    if (method === 'world.getEntry') {
      const worldId = String(params.world || this.context.worldId || '').trim();
      const title = params.title;
      const world = worldId ? this.bridge?.worldStore?.load?.(worldId) : null;
      const entries = Array.isArray(world?.entries) ? world.entries : [];
      if (!entries.length) return '';
      const find = () => {
        if (title == null || title === '') return null;
        if (title instanceof RegExp) {
          return entries.find(e => title.test(String(e?.comment || e?.title || e?.id || ''))) || null;
        }
        const raw = String(title || '').trim();
        if (!raw) return null;
        const byId = entries.find(e => String(e?.id || '').trim() === raw);
        if (byId) return byId;
        return entries.find(e => String(e?.comment || e?.title || '').trim() === raw) || null;
      };
      const entry = find();
      return String(entry?.content || '');
    }
    if (method === 'world.activate') {
      const worldId = String(params.world || this.context.worldId || '').trim();
      const title = params.title;
      const force = params.force === true;
      if (!worldId) return false;
      const world = this.bridge?.worldStore?.load?.(worldId);
      const entries = Array.isArray(world?.entries) ? world.entries : [];
      const entry = entries.find(e => String(e?.comment || e?.title || e?.id || '') === String(title || '').trim());
      if (!entry) return false;
      entry.disable = false;
      if (force) entry.constant = true;
      await this.bridge?.worldStore?.save?.(worldId, { ...world, entries });
      return true;
    }
    if (method === 'context.getCharacter') {
      if (this.bridge?.contextBuilder) {
        const ctx = this.bridge.contextBuilder('');
        if (ctx?.character) return ctx.character;
      }
      const name = String(params.name || this.context.personaName || '');
      return { name, description: '' };
    }
    if (method === 'context.getPreset') {
      const name = String(params.name || '');
      if (!name && this.presets?.getActive) {
        const active = this.presets.getActive('sysprompt') || {};
        return { name: String(active?.name || '') };
      }
      return { name };
    }
    if (method === 'context.getContext') {
      return {};
    }
    if (method === 'script.updateData') {
      const scriptId = String(params.scriptId || '').trim();
      const data = params.data && typeof params.data === 'object' ? params.data : {};
      if (!scriptId) return false;
      let scope = String(params.scope || '').trim();
      let scopeId = String(params.scopeId || '').trim();
      if (!scope || !scopeId) {
        const { scope: foundScope, scopeId: foundScopeId } = this.findScriptScope(scriptId);
        scope = scope || foundScope;
        scopeId = scopeId || foundScopeId;
      }
      await this.store?.updateScriptData?.(scope || 'global', scopeId || 'global', scriptId, data);
      return true;
    }
    if (method === 'log') {
      const level = params.level || 'log';
      const args = Array.isArray(params.args) ? params.args : [params.args];
      logger[level]?.('[script]', ...args);
      const type = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
      const text = args
        .map(item => {
          if (typeof item === 'string') return item;
          try {
            return JSON.stringify(item);
          } catch {
            return String(item);
          }
        })
        .filter(Boolean)
        .join(' ');
      if (text) {
        emitDebugLog({ message: text, type, source: 'script' });
      }
      return true;
    }
    if (method === 'toast') {
      const message = String(params.message || '');
      const level = String(params.level || 'info');
      if (window?.toastr?.[level]) window.toastr[level](message);
      else window?.toastr?.info?.(message);
      return true;
    }
    return null;
  }
}
