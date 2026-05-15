import { appSettings } from '../storage/app-settings.js';
import { logger } from '../utils/logger.js';
import { emitDebugLog } from '../utils/debug-log.js';
import { serializeForInlineScript } from '../utils/inline-script.js';

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const SCRIPT_TOTAL_BYTES = 8 * 1024 * 1024;
const SCRIPT_PAYLOAD_LIMIT = 1200000;

const buildWorkerScript = () => `
const scripts = new Map();
let currentContext = { sessionId: '', personaId: '', presetId: '', presetIds: [], worldId: '', worldIds: [] };
let currentSettings = { allowReadMessages: true, allowModifyVariables: true, allowNetwork: false };
const DISPATCH_RESULT_LIMIT = ${SCRIPT_PAYLOAD_LIMIT};
let seq = 0;
const pending = new Map();
const importCache = new Map();
const IMPORT_CACHE_LIMIT = 32;
const listenedEvents = new Set();

const notifyListener = (eventName) => {
  const name = String(eventName || '').trim();
  if (!name || listenedEvents.has(name)) return;
  listenedEvents.add(name);
  try { postMessage({ type: 'listener_add', event: name }); } catch {}
};

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

const stringifyConsoleArg = (arg) => {
  if (arg instanceof Error) return \`\${arg.name}: \${arg.message}\`;
  if (typeof arg === 'string') return arg;
  if (arg == null) return String(arg);
  try { return JSON.stringify(arg); } catch { return String(arg); }
};

const isDevOrigin = () => {
  try {
    const origin = String(self.location?.origin || self.location?.href || '');
    return origin.includes('127.0.0.1') || origin.includes('localhost');
  } catch {
    return false;
  }
};

const installWorkerConsoleBridge = () => {
  if (self.__CHATAPP_WORKER_CONSOLE_BRIDGE__) return;
  self.__CHATAPP_WORKER_CONSOLE_BRIDGE__ = true;
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const shouldSuppressInfo = (args) => {
    if (currentSettings.debugExecutionLogs === true || currentSettings.mirrorConsole === true) return false;
    const text = args.map(stringifyConsoleArg).join(' ');
    return /^\\[(ReasoningRegexStyler|TagFixer|UAF)\\]/i.test(text);
  };
  let count = 0;
  const limit = 120;
  const mirror = (level, args) => {
    if (currentSettings.mirrorConsole === false) return;
    if (currentSettings.mirrorConsole !== true && !isDevOrigin()) return;
    if (count >= limit) return;
    count += 1;
    const text = args.map(stringifyConsoleArg).join(' ').slice(0, 1600);
    if (!text) return;
    callRpc('log', { level, args: ['[worker-console]', text] }).catch(() => {});
  };
  console.log = (...args) => {
    if (!shouldSuppressInfo(args)) original.log(...args);
  };
  console.info = (...args) => {
    if (!shouldSuppressInfo(args)) original.info(...args);
  };
  console.warn = (...args) => {
    original.warn(...args);
    mirror('warn', args);
  };
  console.error = (...args) => {
    original.error(...args);
    mirror('error', args);
  };
};

installWorkerConsoleBridge();

const legacyListenerMap = new WeakMap();
const wrapLegacyHandler = (cb) => {
  if (legacyListenerMap.has(cb)) return legacyListenerMap.get(cb);
  const wrapped = (payload) => {
    try {
      if (payload && typeof payload === 'object' && Array.isArray(payload.args)) {
        return cb(...payload.args);
      }
      return cb(payload);
    } catch (err) {
      console.error(err);
    }
  };
  legacyListenerMap.set(cb, wrapped);
  return wrapped;
};

const eventOn = (event, cb) => {
  const on = self.__chatappScriptOn;
  if (!on || typeof cb !== 'function') return;
  on(event, wrapLegacyHandler(cb));
  notifyListener(event);
};

const eventRemoveListener = (event, cb) => {
  const off = self.__chatappScriptOff;
  if (!off) return;
  if (!cb) return off(event);
  const wrapped = legacyListenerMap.get(cb) || cb;
  off(event, wrapped);
};

self.eventOn = eventOn;
self.eventRemoveListener = eventRemoveListener;
self.tavern_events = self.tavern_events || { on: eventOn, off: eventRemoveListener, eventOn, eventRemoveListener };

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

const resolveImportUrl = (value, baseUrl) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^[a-z]+:\\/\\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('tauri:') || raw.startsWith('app:')) {
    return raw;
  }
  if (raw.startsWith('//')) {
    const proto = baseUrl && /^https?:\\/\\//i.test(baseUrl) ? baseUrl.split(':')[0] : 'https';
    return proto + ':' + raw;
  }
  try {
    if (baseUrl) return new URL(raw, baseUrl).toString();
  } catch {}
  const origin = getOrigin();
  if (!origin) return raw;
  if (raw.startsWith('/')) return origin + raw;
  return origin + '/' + raw.replace(/^\\.?\\//, '');
};

const loadScriptText = (url, baseUrl) => {
  const resolved = resolveImportUrl(url, baseUrl);
  const xhr = new XMLHttpRequest();
  xhr.open('GET', resolved, false);
  xhr.send(null);
  if (xhr.status >= 200 && xhr.status < 300) return String(xhr.responseText || '');
  throw new Error('HTTP ' + xhr.status);
};

const safeImportScript = (url, baseUrl) => {
  const resolved = resolveImportUrl(url, baseUrl);
  if (!resolved) return false;
  try {
    importScripts(resolved);
    return true;
  } catch {
    return false;
  }
};

const safeEvalScript = (url, baseUrl) => {
  const resolved = resolveImportUrl(url, baseUrl);
  if (!resolved) return false;
  try {
    const text = loadScriptText(resolved);
    const runner = new Function(text);
    runner();
    return true;
  } catch {
    return false;
  }
};

const loadLibrary = (urls, baseUrl) => {
  if (!Array.isArray(urls)) return false;
  for (const url of urls) {
    if (!url) continue;
    if (safeImportScript(url, baseUrl)) return true;
    if (safeEvalScript(url, baseUrl)) return true;
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

const runCompatCallback = (fn, ...args) => {
  try {
    const result = typeof fn === 'function' ? fn(...args) : undefined;
    if (result && typeof result.catch === 'function') result.catch(err => console.error(err));
    return result;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

const makeCompatDollar = () => {
  const normalizeNodes = (selector) => {
    if (!selector) return [makeCompatElement('div')];
    if (selector === self || selector === self.window || selector === self.document) return [selector];
    if (Array.isArray(selector)) return selector.filter(Boolean);
    if (selector && typeof selector === 'object' && typeof selector.length === 'number' && typeof selector !== 'function') {
      return Array.from(selector).filter(Boolean);
    }
    if (selector && typeof selector === 'object') return [selector];
    return [makeCompatElement(String(selector || 'div').startsWith('<') ? 'div' : String(selector || 'div'))];
  };
  const makeCollection = (selector) => {
    const nodes = normalizeNodes(selector);
    const api = {
      length: nodes.length,
      get: (index) => {
        if (index == null) return nodes.slice();
        const idx = Number(index);
        return Number.isFinite(idx) ? nodes[idx] : undefined;
      },
      eq: (index) => makeCollection(nodes[Math.trunc(Number(index) || 0)]),
      each: (cb) => {
        if (typeof cb === 'function') nodes.forEach((node, index) => runCompatCallback(cb, index, node));
        return api;
      },
      ready: (cb) => {
        if (typeof cb === 'function') runCompatCallback(cb);
        return api;
      },
      on: (event, handler) => {
        nodes.forEach(node => node?.addEventListener?.(event, handler));
        return api;
      },
      off: (event, handler) => {
        nodes.forEach(node => node?.removeEventListener?.(event, handler));
        return api;
      },
      trigger: (event) => {
        nodes.forEach(node => node?.dispatchEvent?.(event));
        return api;
      },
      html: (value) => {
        if (value === undefined) return String(nodes[0]?.innerHTML ?? '');
        nodes.forEach(node => {
          if (node && typeof node === 'object') node.innerHTML = String(value ?? '');
        });
        return api;
      },
      text: (value) => {
        if (value === undefined) return String(nodes[0]?.textContent ?? '');
        nodes.forEach(node => {
          if (node && typeof node === 'object') node.textContent = String(value ?? '');
        });
        return api;
      },
      val: (value) => {
        if (value === undefined) return nodes[0]?.value ?? '';
        nodes.forEach(node => {
          if (node && typeof node === 'object') node.value = value;
        });
        return api;
      },
      attr: (name, value) => {
        if (value === undefined) return nodes[0]?.getAttribute?.(name);
        nodes.forEach(node => node?.setAttribute?.(name, value));
        return api;
      },
      prop: (name, value) => {
        if (value === undefined) return nodes[0]?.[name];
        nodes.forEach(node => {
          if (node && typeof node === 'object') node[name] = value;
        });
        return api;
      },
      css: (name, value) => {
        if (typeof name === 'string' && value === undefined) return nodes[0]?.style?.[name];
        nodes.forEach(node => {
          if (!node?.style) return;
          if (name && typeof name === 'object') Object.assign(node.style, name);
          else if (name) node.style[name] = String(value ?? '');
        });
        return api;
      },
      append: (...items) => {
        nodes.forEach(node => items.forEach(item => node?.appendChild?.(item && typeof item === 'object' ? item : makeCompatElement('span'))));
        return api;
      },
      prepend: (...items) => {
        nodes.forEach(node => {
          if (!node || !Array.isArray(node.children)) return;
          const next = items.map(item => (item && typeof item === 'object' ? item : makeCompatElement('span')));
          node.children = [...next, ...node.children];
        });
        return api;
      },
      empty: () => {
        nodes.forEach(node => {
          if (node && typeof node === 'object') {
            node.children = [];
            node.innerHTML = '';
            node.textContent = '';
          }
        });
        return api;
      },
      remove: () => {
        nodes.forEach(node => node?.remove?.());
        return api;
      },
      addClass: (...names) => {
        nodes.forEach(node => node?.classList?.add?.(...names));
        return api;
      },
      removeClass: (...names) => {
        nodes.forEach(node => node?.classList?.remove?.(...names));
        return api;
      },
      toggleClass: (name) => {
        nodes.forEach(node => node?.classList?.toggle?.(name));
        return api;
      },
      find: (selector) => makeCollection(nodes[0]?.querySelector?.(selector)),
      closest: (selector) => makeCollection(nodes[0]?.closest?.(selector)),
      parent: () => makeCollection(nodes[0]?.parentNode || makeCompatElement('div')),
      children: () => makeCollection(nodes[0]?.children || []),
      scrollTop: (value) => {
        if (value === undefined) return Number(nodes[0]?.scrollTop || 0);
        nodes.forEach(node => {
          if (node && typeof node === 'object') node.scrollTop = Number(value) || 0;
        });
        return api;
      },
      scrollLeft: (value) => {
        if (value === undefined) return Number(nodes[0]?.scrollLeft || 0);
        nodes.forEach(node => {
          if (node && typeof node === 'object') node.scrollLeft = Number(value) || 0;
        });
        return api;
      },
      hide: () => api.css('display', 'none'),
      show: () => api.css('display', ''),
    };
    nodes.forEach((node, index) => { api[index] = node; });
    return api;
  };
  const fn = (selector) => {
    if (typeof selector === 'function') {
      runCompatCallback(selector);
      return makeCollection(self.document || makeCompatElement('document'));
    }
    return makeCollection(selector);
  };
  fn.ready = (cb) => { if (typeof cb === 'function') runCompatCallback(cb); };
  return fn;
};

const compatLocalStorageState = new Map();

const makeCompatLocalStorage = () => ({
  get length() {
    return compatLocalStorageState.size;
  },
  key(index) {
    const idx = Math.trunc(Number(index) || 0);
    return Array.from(compatLocalStorageState.keys())[idx] || null;
  },
  getItem(key) {
    const name = String(key || '');
    return compatLocalStorageState.has(name) ? compatLocalStorageState.get(name) : null;
  },
  setItem(key, value) {
    compatLocalStorageState.set(String(key || ''), String(value ?? ''));
  },
  removeItem(key) {
    compatLocalStorageState.delete(String(key || ''));
  },
  clear() {
    compatLocalStorageState.clear();
  },
});

const makeCompatDomTokenList = () => ({
  add: () => {},
  remove: () => {},
  toggle: () => false,
  contains: () => false,
});

class CompatObserver {
  constructor(callback) {
    this.callback = typeof callback === 'function' ? callback : null;
  }

  observe() {}

  disconnect() {}

  unobserve() {}

  takeRecords() {
    return [];
  }
}

const makeCompatElement = (tagName = 'div') => {
  const element = {
    tagName: String(tagName || 'div').toUpperCase(),
    style: {},
    dataset: {},
    classList: makeCompatDomTokenList(),
    children: [],
    parentNode: null,
    textContent: '',
    innerHTML: '',
    value: '',
    checked: false,
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
    appendChild(child) {
      if (child && typeof child === 'object') {
        child.parentNode = element;
        element.children.push(child);
      }
      return child;
    },
    removeChild(child) {
      element.children = element.children.filter(item => item !== child);
      if (child && typeof child === 'object') child.parentNode = null;
      return child;
    },
    remove() {
      if (element.parentNode?.removeChild) element.parentNode.removeChild(element);
    },
    setAttribute(name, value) {
      element[String(name || '')] = String(value ?? '');
    },
    getAttribute(name) {
      const key = String(name || '');
      return Object.prototype.hasOwnProperty.call(element, key) ? String(element[key]) : null;
    },
    removeAttribute(name) {
      const key = String(name || '');
      if (key) delete element[key];
    },
    hasAttribute(name) {
      const key = String(name || '');
      return key ? Object.prototype.hasOwnProperty.call(element, key) : false;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    querySelector: () => makeCompatElement('div'),
    querySelectorAll: () => [],
    closest: () => makeCompatElement('div'),
    focus: () => {},
    blur: () => {},
    click: () => {},
  };
  return element;
};

const makeCompatDocument = () => {
  const body = makeCompatElement('body');
  const head = makeCompatElement('head');
  const documentElement = makeCompatElement('html');
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  return {
    readyState: 'complete',
    body,
    head,
    documentElement,
    createElement: makeCompatElement,
    createTextNode: (text = '') => ({ nodeType: 3, textContent: String(text ?? '') }),
    createDocumentFragment: () => makeCompatElement('fragment'),
    getElementById: (id = '') => makeCompatElement(id || 'div'),
    querySelector: (selector = '') => makeCompatElement(selector || 'div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
};

const defaultErrorCatched = (fn) => (...args) => {
  try {
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

const normalizeCompatVariableScope = (option = { type: 'message' }) => {
  const raw = option && typeof option === 'object'
    ? String(option.type || option.scope || option.name || '').trim().toLowerCase()
    : String(option || '').trim().toLowerCase();
  if (raw === 'global' || raw === 'world') return 'global';
  return 'chat';
};

const getCompatBaseVariables = (option = { type: 'message' }) => {
  const scope = normalizeCompatVariableScope(option);
  const globalVars = currentContext.globalVariables && typeof currentContext.globalVariables === 'object'
    ? currentContext.globalVariables
    : {};
  const localVars = currentContext.localVariables && typeof currentContext.localVariables === 'object'
    ? currentContext.localVariables
    : currentContext.variables && typeof currentContext.variables === 'object'
      ? currentContext.variables
      : {};
  return scope === 'global' ? globalVars : localVars;
};

const buildCompatVariablesSnapshot = () => {
  const globalVars = currentContext.globalVariables && typeof currentContext.globalVariables === 'object'
    ? currentContext.globalVariables
    : {};
  const localVars = currentContext.localVariables && typeof currentContext.localVariables === 'object'
    ? currentContext.localVariables
    : currentContext.variables && typeof currentContext.variables === 'object'
      ? currentContext.variables
      : {};
  const baseVars = currentContext.variables && typeof currentContext.variables === 'object' ? currentContext.variables : localVars;
  return {
    stat_data: clone(baseVars),
    variables: clone(baseVars),
    status_current_variables: clone(baseVars),
    global_variables: clone(globalVars),
    local_variables: clone(localVars),
  };
};

const getVariables = (option = { type: 'message' }) => clone(getCompatBaseVariables(option));
const getAllVariables = () => buildCompatVariablesSnapshot();

const setCompatVariables = (updates = {}, option = { type: 'message' }) => {
  const scope = normalizeCompatVariableScope(option);
  const payload = updates && typeof updates === 'object' ? updates : {};
  const targetKey = scope === 'global' ? 'globalVariables' : 'localVariables';
  const current = currentContext[targetKey] && typeof currentContext[targetKey] === 'object' ? currentContext[targetKey] : {};
  const next = { ...current, ...payload };
  currentContext[targetKey] = next;
  if (scope !== 'global') currentContext.variables = next;
  Object.entries(payload).forEach(([key, value]) => {
    callRpc('variables.set', {
      key,
      value,
      options: { scope: scope === 'global' ? 'global' : 'local' },
      sessionId: currentContext.sessionId,
    }).catch(() => {});
  });
  return getVariables(option);
};

const updateVariablesWith = (updates, option = { type: 'message' }) => {
  if (typeof updates === 'function') {
    const current = getVariables(option);
    const next = updates(current);
    return setCompatVariables(next && typeof next === 'object' ? next : {}, option);
  }
  return setCompatVariables(updates, option);
};

const splitVariablePath = (path = '') => String(path || '').split('.').map(part => part.trim()).filter(Boolean);

const deleteCompatValueAtPath = (obj, path = '') => {
  const parts = Array.isArray(path) ? path : splitVariablePath(path);
  if (!obj || typeof obj !== 'object' || !parts.length) return false;
  let cursor = obj;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor?.[parts[index]];
    if (!cursor || typeof cursor !== 'object') return false;
  }
  const last = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, last)) return false;
  delete cursor[last];
  return true;
};

const deleteVariable = (path, option = { type: 'message' }) => {
  const scope = normalizeCompatVariableScope(option);
  const targetKey = scope === 'global' ? 'globalVariables' : 'localVariables';
  const current = currentContext[targetKey] && typeof currentContext[targetKey] === 'object' ? clone(currentContext[targetKey]) : {};
  const changed = deleteCompatValueAtPath(current, path);
  currentContext[targetKey] = current;
  if (scope !== 'global') currentContext.variables = current;
  if (changed) {
    callRpc('variables.delete', {
      key: String(path || ''),
      options: { scope: scope === 'global' ? 'global' : 'local' },
      sessionId: currentContext.sessionId,
    }).catch(() => {});
  }
  return changed;
};

const replaceVariables = (text = '') => String(text ?? '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, key) => {
  const name = String(key || '').trim();
  const local = getVariables();
  const globalVars = getVariables({ type: 'global' });
  const value = local[name] ?? globalVars[name];
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
});

const EVENT_TYPES = {
  APP_READY: 'app.ready',
  CHAT_CHANGED: 'chat.changed',
  CHARACTER_SELECTED: 'character.selected',
  MESSAGE_RECEIVED: 'message.after_receive',
  MESSAGE_SENT: 'message.after_send',
};

const eventSource = {
  on: eventOn,
  off: eventRemoveListener,
  makeFirst: eventOn,
  removeListener: eventRemoveListener,
  once: (event, cb) => {
    if (typeof cb !== 'function') return;
    const wrapped = (...args) => {
      eventRemoveListener(event, wrapped);
      return cb(...args);
    };
    eventOn(event, wrapped);
  },
};

const normalizeStringList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : []
);

const getWorldbookNamesFromContext = () => {
  const names = normalizeStringList(currentContext.worldbookNames);
  const worldIds = normalizeStringList(currentContext.worldIds);
  const worldId = String(currentContext.worldId || '').trim();
  return Array.from(new Set(names.concat(worldIds, worldId ? [worldId] : []).filter(Boolean)));
};

const getActiveWorldbookIds = () => {
  const worldIds = normalizeStringList(currentContext.worldIds);
  const worldId = String(currentContext.worldId || '').trim();
  return Array.from(new Set((worldId ? [worldId] : []).concat(worldIds).filter(Boolean)));
};

const getGlobalWorldbookNames = () => getWorldbookNamesFromContext();

const getCharWorldbookNames = () => {
  const active = getActiveWorldbookIds();
  return {
    primary: active[0] || '',
    additional: active.slice(1),
  };
};

const getChatWorldbookName = () => getActiveWorldbookIds()[0] || '';

const normalizeWorldbookEntry = (entry = {}, index = 0) => ({
  ...entry,
  uid: entry.uid ?? entry.id ?? entry.key ?? index,
  id: entry.id ?? entry.uid ?? \`entry-\${index}\`,
  name: entry.name || entry.comment || entry.title || entry.id || \`Entry \${index + 1}\`,
  comment: entry.comment || entry.name || entry.title || '',
  title: entry.title || entry.comment || entry.name || '',
  content: String(entry.content || ''),
  enabled: entry.enabled !== false && entry.disable !== true,
});

const getWorldbook = async (name) => {
  const world = String(name || '').trim();
  if (!world) return [];
  const entries = await callRpc('world.getBook', { world, sessionId: currentContext.sessionId });
  return Array.isArray(entries) ? entries.map(normalizeWorldbookEntry) : [];
};

const getCurrentCharacterName = () => (
  String(currentContext.personaName || currentContext.characterName || currentContext.name2 || '').trim()
);

const buildCompatCharacters = () => {
  const name = getCurrentCharacterName();
  return [{
    id: currentContext.personaId || 'current',
    name,
    avatar: currentContext.personaAvatar || name,
    data: {
      name,
      extensions: currentContext.characterExtensions && typeof currentContext.characterExtensions === 'object'
        ? currentContext.characterExtensions
        : {},
    },
  }];
};

const getPreset = () => {
  const preset = currentContext.activePreset && typeof currentContext.activePreset === 'object'
    ? currentContext.activePreset
    : {};
  const prompts = Array.isArray(preset.prompts)
    ? preset.prompts
    : normalizeStringList([]).concat(Array.isArray(currentContext.presetPrompts) ? currentContext.presetPrompts : []);
  return {
    ...preset,
    name: preset.name || currentContext.presetName || '',
    prompts,
    prompts_unused: Array.isArray(preset.prompts_unused) ? preset.prompts_unused : [],
  };
};

const isPresetPlaceholderPrompt = (prompt = {}) => {
  const id = String(prompt.identifier || prompt.id || prompt.name || '').toLowerCase();
  return Boolean(prompt.placeholder || prompt.isPlaceholder || id.includes('placeholder'));
};

const isPresetSystemPrompt = (prompt = {}) => {
  const role = String(prompt.role || prompt.type || prompt.position || '').toLowerCase();
  return prompt.system === true || prompt.isSystem === true || role === 'system' || role === '0';
};

const buildCompatChatCompletionSettings = () => ({
  function_calling: false,
  ...(currentContext.chatCompletionSettings && typeof currentContext.chatCompletionSettings === 'object'
    ? currentContext.chatCompletionSettings
    : {}),
  prompts: getPreset().prompts,
});

const buildCompatStContext = () => ({
  characterId: 0,
  characters: buildCompatCharacters(),
  name2: getCurrentCharacterName(),
  eventSource,
  eventTypes: EVENT_TYPES,
  event_types: EVENT_TYPES,
  extensionSettings: currentContext.extensionSettings && typeof currentContext.extensionSettings === 'object'
    ? currentContext.extensionSettings
    : {},
  chatCompletionSettings: buildCompatChatCompletionSettings(),
  world_names: getWorldbookNamesFromContext(),
  selected_world_info: getActiveWorldbookIds(),
  chat_metadata: {
    ...(currentContext.chat_metadata && typeof currentContext.chat_metadata === 'object' ? currentContext.chat_metadata : {}),
    world_info: getChatWorldbookName(),
  },
});

const getContext = () => ({
  ...currentContext,
  ...buildCompatStContext(),
  chat: ensureSillyTavern().chat || [],
  messages: ensureSillyTavern().chat || [],
  currentMessageId: currentContext.currentMessageId || '',
  ...buildCompatVariablesSnapshot(),
  powerUserSettings: self.powerUserSettings || {},
});

const legacyMacros = new Map();

const buildSillyTavern = () => {
  const st = {};
  st.chat = [];
  st.characters = buildCompatCharacters();
  st.characterId = 0;
  st.extensionSettings = buildCompatStContext().extensionSettings;
  st.chatCompletionSettings = buildCompatChatCompletionSettings();
  st.eventSource = eventSource;
  st.eventTypes = EVENT_TYPES;
  st.event_types = EVENT_TYPES;
  st.getContext = getContext;
  st.ToolManager = {
    isToolCallingSupported: () => false,
    parseToolCalls: () => {},
  };
  st.getRequestHeaders = () => ({});
  st.getChatCompletionModel = () => '';
  st.getCurrentChatId = () => String(currentContext.sessionId || '');
  st.saveChat = () => Promise.resolve(true);
  st.saveSettingsDebounced = () => {};
  st.registerMacro = (name, fn) => {
    const key = String(name || '').trim();
    if (!key || typeof fn !== 'function') return;
    legacyMacros.set(key, fn);
  };
  st.unregisterMacro = (name) => {
    const key = String(name || '').trim();
    if (!key) return;
    legacyMacros.delete(key);
  };
  st.registerFunctionTool = () => {};
  st.unregisterFunctionTool = () => {};
  st.POPUP_TYPE = { TEXT: 'text', INPUT: 'input', CONFIRM: 'confirm' };
  st.POPUP_RESULT = { AFFIRMATIVE: 1, CANCELLED: 0, NEGATIVE: -1, CUSTOM1: 2 };
  st.callGenericPopup = async () => null;
  return st;
};

const ensureSillyTavern = () => {
  if (!self.SillyTavern) self.SillyTavern = buildSillyTavern();
  self.SillyTavern.characters = buildCompatCharacters();
  self.SillyTavern.characterId = 0;
  self.SillyTavern.extensionSettings = buildCompatStContext().extensionSettings;
  self.SillyTavern.chatCompletionSettings = buildCompatChatCompletionSettings();
  self.SillyTavern.eventSource = eventSource;
  self.SillyTavern.eventTypes = EVENT_TYPES;
  self.SillyTavern.event_types = EVENT_TYPES;
  self.SillyTavern.getContext = getContext;
  return self.SillyTavern;
};

const refreshSillyTavernChat = async () => {
  try {
    const list = await callRpc('chat.getMessages', { sessionId: currentContext.sessionId });
    if (Array.isArray(list)) ensureSillyTavern().chat = list;
  } catch {}
};

const ensureCompatGlobals = () => {
  const allowNetwork = currentSettings.allowNetwork === true;
  if (!self.window) self.window = self;
  if (!self.parent) self.parent = self;
  if (!self.top) self.top = self;
  if (!self.localStorage) self.localStorage = makeCompatLocalStorage();
  if (!self.document) self.document = makeCompatDocument();
  if (!self.navigator) self.navigator = { userAgent: 'ChatApp ScriptRuntime' };
  if (!self.location) self.location = { href: '', origin: '' };
  if (typeof self.requestAnimationFrame !== 'function') {
    self.requestAnimationFrame = (cb) => setTimeout(() => {
      if (typeof cb === 'function') cb(Date.now());
    }, 16);
  }
  if (typeof self.cancelAnimationFrame !== 'function') self.cancelAnimationFrame = (id) => clearTimeout(id);
  if (typeof self.MutationObserver !== 'function') self.MutationObserver = CompatObserver;
  if (typeof self.ResizeObserver !== 'function') self.ResizeObserver = CompatObserver;
  if (typeof self.IntersectionObserver !== 'function') self.IntersectionObserver = CompatObserver;
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
    if (!self.z.z) self.z.z = self.z;
    if (!self.z.ZodObject && self.Zod?.ZodObject) self.z.ZodObject = self.Zod.ZodObject;
    if (typeof self.z.looseObject !== 'function') {
      self.z.looseObject = (shape) => {
        const resolved = typeof shape === 'function' ? shape() : shape;
        const obj = self.z.object(resolved || {});
        const optional = typeof obj.partial === 'function' ? obj.partial() : obj;
        if (typeof optional.passthrough === 'function') return optional.passthrough();
        if (typeof optional.nonstrict === 'function') return optional.nonstrict();
        return optional;
      };
    }
  }
  if (!self.$) self.$ = makeCompatDollar();
  ensureSillyTavern();
  if (typeof self.getVariables !== 'function') self.getVariables = getVariables;
  if (typeof self.getAllVariables !== 'function') self.getAllVariables = getAllVariables;
  if (typeof self.setVariables !== 'function') self.setVariables = setCompatVariables;
  if (typeof self.updateVariablesWith !== 'function') self.updateVariablesWith = updateVariablesWith;
  if (typeof self.insertOrAssignVariables !== 'function') self.insertOrAssignVariables = setCompatVariables;
  if (typeof self.deleteVariable !== 'function') self.deleteVariable = deleteVariable;
  if (typeof self.replaceVariables !== 'function') self.replaceVariables = replaceVariables;
  if (typeof self.waitGlobalInitialized !== 'function') self.waitGlobalInitialized = () => Promise.resolve(true);
  if (typeof self.errorCatched !== 'function') self.errorCatched = defaultErrorCatched;
  if (typeof self.getContext !== 'function') self.getContext = getContext;
  if (typeof self.getCurrentCharacterName !== 'function') self.getCurrentCharacterName = getCurrentCharacterName;
  if (typeof self.getGlobalWorldbookNames !== 'function') self.getGlobalWorldbookNames = getGlobalWorldbookNames;
  if (typeof self.getCharWorldbookNames !== 'function') self.getCharWorldbookNames = getCharWorldbookNames;
  if (typeof self.getChatWorldbookName !== 'function') self.getChatWorldbookName = getChatWorldbookName;
  if (typeof self.getWorldbook !== 'function') self.getWorldbook = getWorldbook;
  if (typeof self.getPreset !== 'function') self.getPreset = getPreset;
  if (typeof self.isPresetPlaceholderPrompt !== 'function') self.isPresetPlaceholderPrompt = isPresetPlaceholderPrompt;
  if (typeof self.isPresetSystemPrompt !== 'function') self.isPresetSystemPrompt = isPresetSystemPrompt;
  self.eventSource = self.eventSource || eventSource;
  self.eventTypes = self.eventTypes || EVENT_TYPES;
  self.event_types = self.event_types || EVENT_TYPES;
  self.Context = getContext();
  self.powerUserSettings = self.powerUserSettings || {};
  if (!self.TavernHelper || typeof self.TavernHelper !== 'object') self.TavernHelper = {};
  const helper = self.TavernHelper;
  if (typeof helper.getTavernHelperVersion !== 'function') helper.getTavernHelperVersion = async () => '0.0.0';
  helper.getVariables = helper.getVariables || getVariables;
  helper.getAllVariables = helper.getAllVariables || getAllVariables;
  helper.setVariables = helper.setVariables || setCompatVariables;
  helper.updateVariablesWith = helper.updateVariablesWith || updateVariablesWith;
  helper.insertOrAssignVariables = helper.insertOrAssignVariables || setCompatVariables;
  helper.deleteVariable = helper.deleteVariable || deleteVariable;
  helper.replaceVariables = helper.replaceVariables || replaceVariables;
  helper.getContext = helper.getContext || getContext;
  helper.getWorldbook = helper.getWorldbook || getWorldbook;
  helper.getGlobalWorldbookNames = helper.getGlobalWorldbookNames || getGlobalWorldbookNames;
  helper.getCharWorldbookNames = helper.getCharWorldbookNames || getCharWorldbookNames;
  helper.getChatWorldbookName = helper.getChatWorldbookName || getChatWorldbookName;
  helper.getPreset = helper.getPreset || getPreset;
};

let lastSchemaDebug = null;
const resolveSchemaDefaults = (schema) => {
  if (!schema) return null;
  let value = schema;
  if (typeof value === 'function') {
    try {
      value = value();
    } catch {
      return null;
    }
  }
  const pickStat = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.stat_data && typeof obj.stat_data === 'object') return obj.stat_data;
    if (obj.statData && typeof obj.statData === 'object') return obj.statData;
    if (obj.variables && typeof obj.variables === 'object') return obj.variables;
    return obj;
  };
  let parsedData = null;
  if (value && typeof value.safeParse === 'function') {
    try {
      let parsed = value.safeParse({ stat_data: {} });
      if (!parsed?.success) parsed = value.safeParse({ statData: {} });
      if (!parsed?.success) parsed = value.safeParse({});
      if (parsed?.success) {
        const data = pickStat(parsed.data);
        if (data && typeof data === 'object') parsedData = data;
      }
    } catch {}
  }
  const getTypeName = (node) =>
    node?._def?.typeName || node?._def?.type || node?.constructor?.name || '';
  const getShape = (node) => {
    if (!node) return null;
    if (typeof node.shape === 'function') return node.shape();
    if (node.shape && typeof node.shape === 'object') return node.shape;
    if (typeof node._def?.shape === 'function') return node._def.shape();
    if (node._def?.shape && typeof node._def.shape === 'object') return node._def.shape;
    return null;
  };
  const tryDefault = (node) => {
    if (!node) return undefined;
    try {
      if (typeof node._def?.defaultValue === 'function') {
        const raw = node._def.defaultValue();
        return typeof raw === 'function' ? raw() : raw;
      }
    } catch {}
    try {
      if (typeof node.parse === 'function') return node.parse(undefined);
    } catch {}
    return undefined;
  };
  const buildDefaults = (node) => {
    if (!node) return undefined;
    const typeName = getTypeName(node);
    if (typeName === 'ZodDefault') {
      const val = tryDefault(node);
      return val !== undefined ? val : undefined;
    }
    if (typeName === 'ZodEffects') {
      const inner = node._def?.schema || node._def?.innerType;
      let base = buildDefaults(inner);
      if (base === undefined) base = tryDefault(node);
      const effect = node._def?.effect;
      if (effect?.type === 'transform' && typeof effect.transform === 'function') {
        try {
          return effect.transform(base, { addIssue: () => {}, path: [] });
        } catch {}
      }
      return base;
    }
    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      const inner = node._def?.innerType;
      const base = buildDefaults(inner);
      if (base !== undefined) return base;
      return tryDefault(node);
    }
    if (typeName === 'ZodObject') {
      const shape = getShape(node);
      if (!shape || typeof shape !== 'object') return tryDefault(node);
      const out = {};
      Object.entries(shape).forEach(([key, child]) => {
        const val = buildDefaults(child);
        if (val !== undefined) out[key] = val;
      });
      return out;
    }
    if (typeName === 'ZodRecord') {
      const rec = tryDefault(node);
      if (rec !== undefined) return rec;
      return {};
    }
    if (typeName === 'ZodArray') {
      const arr = tryDefault(node);
      if (arr !== undefined) return arr;
      return [];
    }
    return tryDefault(node);
  };
  const mergeDeep = (base, override) => {
    const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
    if (!override || typeof override !== 'object') return out;
    Object.entries(override).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        out[key] = val.slice();
      } else if (val && typeof val === 'object' && out[key] && typeof out[key] === 'object') {
        out[key] = mergeDeep(out[key], val);
      } else {
        out[key] = val;
      }
    });
    return out;
  };
  const fallback = buildDefaults(value);
  const fallbackPicked = pickStat(fallback);
  if (parsedData && typeof parsedData === 'object') {
    if (fallbackPicked && typeof fallbackPicked === 'object') {
      const merged = mergeDeep(fallbackPicked, parsedData);
      lastSchemaDebug = {
        mode: 'merge',
        parsedKeys: Object.keys(parsedData),
        fallbackKeys: Object.keys(fallbackPicked),
        mergedKeys: Object.keys(merged),
      };
      return merged;
    }
    if (Object.keys(parsedData).length) {
      lastSchemaDebug = { mode: 'parsed', parsedKeys: Object.keys(parsedData) };
      return parsedData;
    }
  }
  if (fallbackPicked && typeof fallbackPicked === 'object') {
    lastSchemaDebug = { mode: 'fallback', fallbackKeys: Object.keys(fallbackPicked) };
    return fallbackPicked;
  }
  const direct = pickStat(value);
  if (direct && typeof direct === 'object') {
    lastSchemaDebug = { mode: 'direct', directKeys: Object.keys(direct) };
    return direct;
  }
  lastSchemaDebug = { mode: 'none' };
  return null;
};

const registerVariableSchema = (schema, options = {}) => {
  try {
    ensureCompatGlobals();
    const defaults = resolveSchemaDefaults(schema);
    if (!defaults || typeof defaults !== 'object') {
      callRpc('log', { level: 'warn', args: ['[MVU] registerVariableSchema: no defaults', JSON.stringify(lastSchemaDebug || {})] }).catch(() => {});
      return false;
    }
    const keys = Object.keys(defaults);
    const sampleKeys = keys.slice(0, 6).join(',');
    const msg = '[MVU] registerVariableSchema defaults=' + keys.length +
      ' keys=' + sampleKeys + (keys.length > 6 ? ',…' : '');
    callRpc('log', {
      level: 'info',
      args: [msg, JSON.stringify(lastSchemaDebug || {})],
    }).catch(() => {});
    callRpc('variables.registerSchema', { defaults, options }).catch(() => {});
    return true;
  } catch (err) {
    callRpc('log', { level: 'warn', args: ['registerVariableSchema failed', String(err?.message || err)] }).catch(() => {});
    return false;
  }
};

if (!self.registerVariableSchema) self.registerVariableSchema = registerVariableSchema;

const runImport = (url, baseUrl) => {
  ensureCompatGlobals();
  const key = resolveImportUrl(String(url || '').trim(), baseUrl);
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
    let esmToken = null;
    let processed = '';
    try {
      const text = loadScriptText(key);
      processed = preprocess(text);
      esmToken = findEsmToken(processed);
      const runner = new Function('module', 'exports', '__import', processed);
      const localImport = (nextUrl) => runImport(nextUrl, key);
      runner(module, module.exports, localImport);
      importError = null;
    } catch (err) {
      if (esmToken) {
        const start = Math.max(0, esmToken.index - 80);
        const end = Math.min(processed.length, esmToken.index + 200);
        callRpc('log', {
          level: 'warn',
          args: ['[preprocess] unresolved', esmToken.type, key, processed.slice(start, end)],
        }).catch(() => {});
      }
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

const isWordChar = (ch) => !!ch && /[A-Za-z0-9_$]/.test(ch);

const readQuotedString = (text, start) => {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return null;
  let i = start + 1;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\\\') {
      i += 1;
      continue;
    }
    if (ch === quote) {
      return { value: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
};

const looseTransformImports = (code) => {
  const text = String(code || '');
  let out = '';
  let i = 0;
  const len = text.length;
  let state = 'code';
  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];
    if (state === 'code') {
      if (ch === "'" || ch === '"' || ch === '\`') {
        state = ch;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '/') {
        state = 'line';
        out += ch + next;
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block';
        out += ch + next;
        i += 2;
        continue;
      }
      if (
        ch === 'i' &&
        text.startsWith('import', i) &&
        !isWordChar(text[i - 1])
      ) {
        const importStart = i;
        let cursor = i + 6;
        if (text[cursor] === '.') {
          out += text[i];
          i += 1;
          continue;
        }
        while (cursor < len && /\\s/.test(text[cursor])) cursor += 1;
        if (text[cursor] === '(') {
          out += text[i];
          i += 1;
          continue;
        }
        if (text[cursor] === '"' || text[cursor] === "'") {
          const parsed = readQuotedString(text, cursor);
          if (parsed) {
            out += '__import(' + JSON.stringify(parsed.value) + ');';
            i = parsed.end;
            while (i < len && /\\s/.test(text[i])) i += 1;
            if (text[i] === ';') i += 1;
            continue;
          }
        }
        let braceDepth = 0;
        let scan = cursor;
        let fromIndex = -1;
        while (scan < len) {
          const c = text[scan];
          if (c === "'" || c === '"') {
            const quoted = readQuotedString(text, scan);
            if (quoted) {
              scan = quoted.end;
              continue;
            }
          }
          if (c === '{') braceDepth += 1;
          else if (c === '}') braceDepth = Math.max(0, braceDepth - 1);
          if (
            braceDepth === 0 &&
            text.startsWith('from', scan) &&
            !isWordChar(text[scan - 1]) &&
            !isWordChar(text[scan + 4])
          ) {
            fromIndex = scan;
            break;
          }
          scan += 1;
        }
        if (fromIndex !== -1) {
          const clause = text.slice(cursor, fromIndex).trim();
          let specStart = fromIndex + 4;
          while (specStart < len && /\\s/.test(text[specStart])) specStart += 1;
          const spec = readQuotedString(text, specStart);
          if (spec) {
            let replacement = '';
            if (clause.startsWith('{') && clause.endsWith('}')) {
              const converted = normalizeNamedImport(clause.slice(1, -1));
              replacement = 'const { ' + converted + ' } = __import(' + JSON.stringify(spec.value) + ');';
            } else if (clause.startsWith('*')) {
              const m = clause.match(/^\\*\\s*as\\s+([\\w$]+)/);
              if (m) replacement = 'const ' + m[1] + ' = __import(' + JSON.stringify(spec.value) + ');';
            } else if (clause.includes(',')) {
              const [left, rightRaw] = clause.split(',', 2);
              const defaultName = left.trim();
              const right = (rightRaw || '').trim();
              if (right.startsWith('{') && right.endsWith('}')) {
                const converted = normalizeNamedImport(right.slice(1, -1));
                replacement = 'const { default: ' + defaultName + (converted ? ', ' + converted : '') + ' } = __import(' + JSON.stringify(spec.value) + ');';
              } else if (right.startsWith('*')) {
                const m = right.match(/^\\*\\s*as\\s+([\\w$]+)/);
                if (m) {
                  replacement = 'const { default: ' + defaultName + ' } = __import(' + JSON.stringify(spec.value) + ');\\nconst ' + m[1] + ' = __import(' + JSON.stringify(spec.value) + ');';
                }
              }
            } else if (/^[\\w$]+$/.test(clause)) {
              replacement = 'const { default: ' + clause + ' } = __import(' + JSON.stringify(spec.value) + ');';
            }
            if (replacement) {
              out += replacement;
              i = spec.end;
              while (i < len && /\\s/.test(text[i])) i += 1;
              if (text[i] === ';') i += 1;
              continue;
            }
          }
        }
        out += text[importStart];
        i = importStart + 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (state === 'line') {
      out += ch;
      i += 1;
      if (ch === '\\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      out += ch;
      i += 1;
      if (ch === '*' && next === '/') {
        out += next;
        i += 1;
        state = 'code';
      }
      continue;
    }
    if (state === "'" || state === '"') {
      out += ch;
      i += 1;
      if (ch === '\\\\') {
        out += text[i] || '';
        i += 1;
        continue;
      }
      if (ch === state) state = 'code';
      continue;
    }
    if (state === '\`') {
      out += ch;
      i += 1;
      if (ch === '\\\\') {
        out += text[i] || '';
        i += 1;
        continue;
      }
      if (ch === '\`') state = 'code';
      continue;
    }
  }
  return out;
};

const findEsmToken = (code) => {
  if (!code) return null;
  const importIndex = String(code).search(/(^|[^\\w$])import\\s*(?:['"]|\\{|\\*|[\\w$]+\\s+from)/m);
  if (importIndex !== -1) return { type: 'import', index: importIndex };
  const exportIndex = String(code).search(/(^|[^\\w$])export\\s+/m);
  if (exportIndex !== -1) return { type: 'export', index: exportIndex };
  return null;
};

const preprocess = (code) => {
  if (!code) return '';
  let out = String(code);
  const exportNames = [];
  const exportAssignments = [];
  let exportSeq = 0;
  // export * from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*export\\s*\\*\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, url) => \`\${prefix}Object.assign(exports, __import(\${JSON.stringify(url)}));\`,
  );
  // export { a as b } from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*export\\s*\\{([^}]+)\\}\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, named, url) => {
      const entries = parseNamedExports(named);
      const modName = \`__mod\${++exportSeq}\`;
      const lines = [\`\${prefix}const \${modName} = __import(\${JSON.stringify(url)});\`];
      entries.forEach(({ local, exported }) => {
        lines.push(\`exports.\${exported} = \${modName}.\${local};\`);
      });
      return lines.join('\\n');
    },
  );
  // export { a as b, c }
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*export\\s*\\{([^}]+)\\}\\s*;?/g,
    (_m, prefix, named) => {
      const entries = parseNamedExports(named);
      entries.forEach(({ local, exported }) => {
        exportAssignments.push(\`exports.\${exported} = \${local};\`);
      });
      return prefix;
    },
  );
  // export const/let/var/function/class name
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*export\\s*(const|let|var|function|class)\\s+([\\w$]+)/g,
    (_m, prefix, type, name) => {
      exportNames.push(name);
      return \`\${prefix}\${type} \${name}\`;
    },
  );
  // import * from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*\\*\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, url) => \`\${prefix}__import(\${JSON.stringify(url)});\`,
  );
  // import * as name from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*\\*\\s*as\\s*([\\w$]+)\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, name, url) => \`\${prefix}const \${name} = __import(\${JSON.stringify(url)});\`,
  );
  // import name, { a as b } from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*([\\w$]+)\\s*,\\s*\\{([^}]+)\\}\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, name, named, url) => {
      const converted = normalizeNamedImport(named);
      return \`\${prefix}const { default: \${name}\${converted ? \`, \${converted}\` : ''} } = __import(\${JSON.stringify(url)});\`;
    },
  );
  // import { a as b } from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*\\{([^}]+)\\}\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, named, url) => {
      const converted = normalizeNamedImport(named);
      return \`\${prefix}const { \${converted} } = __import(\${JSON.stringify(url)});\`;
    },
  );
  // import name from 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*([\\w$]+)\\s*from\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, name, url) => \`\${prefix}const { default: \${name} } = __import(\${JSON.stringify(url)});\`,
  );
  // import 'url'
  out = out.replace(
    /(^|[\\r\\n;\\)\\}\\]])\\s*import(?!\\s*\\.)\\s*['"]([^'"]+)['"]\\s*;?/g,
    (_m, prefix, url) => \`\${prefix}__import(\${JSON.stringify(url)});\`,
  );
  if (findEsmToken(out)) {
    out = looseTransformImports(out);
  }
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
    getWorldbook: (world) => call('world.getBook', { world }),
    getWorldbookNames: () => getWorldbookNamesFromContext(),
    getGlobalWorldbookNames,
    getCharWorldbookNames,
    getChatWorldbookName,
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
    notifyListener(name);
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
  const legacyHandlerMap = new WeakMap();
  const eventOn = (event, cb) => {
    const name = String(event || '').trim();
    if (!name || typeof cb !== 'function') return;
    const wrapped = (payload) => {
      if (payload && typeof payload === 'object' && Array.isArray(payload.args)) {
        return cb(...payload.args);
      }
      return cb(payload);
    };
    legacyHandlerMap.set(cb, wrapped);
    on(name, wrapped);
    notifyListener(name);
  };
  const eventRemoveListener = (event, cb) => {
    const name = String(event || '').trim();
    if (!name) return;
    if (!cb) return off(name);
    const wrapped = legacyHandlerMap.get(cb) || cb;
    off(name, wrapped);
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
  // schemaOnly 脚本不执行代码，仅保留记录（Schema 已在导入时静态解析）
  if (record.schemaOnly === true) {
    callRpc('log', { level: 'info', args: ['[MVU] 跳过 schemaOnly 脚本执行', record.name] }).catch(() => {});
    return { record, handlers, defaultHandler, api, script };
  }
  try {
    const module = { exports: {} };
    const exports = module.exports;
    const code = preprocess(record.content || '');
    const runner = new Function(
      'api',
      'script',
      'on',
      'off',
      'eventOn',
      'eventRemoveListener',
      'module',
      'exports',
      '__import',
      code,
    );
    const __import = (url) => runImport(url, getOrigin());
    self.__chatappScriptOn = on;
    self.__chatappScriptOff = off;
    runner(api, script, on, off, eventOn, eventRemoveListener, module, exports, __import);
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

const syncCompatVariablesFromEvent = (eventName, payload = {}) => {
  const evt = String(eventName || '').trim();
  const data = payload && typeof payload === 'object' ? payload : {};
  if (evt === 'variable.changed') {
    const name = String(data.name || '').trim();
    if (!name) return;
    const scope = normalizeCompatVariableScope(data.scope || 'chat');
    const targetKey = scope === 'global' ? 'globalVariables' : 'localVariables';
    const current = currentContext[targetKey] && typeof currentContext[targetKey] === 'object' ? currentContext[targetKey] : {};
    if (data.newValue === undefined) {
      delete current[name];
    } else {
      current[name] = data.newValue;
    }
    currentContext[targetKey] = current;
    if (scope !== 'global') currentContext.variables = current;
    ensureCompatGlobals();
    return;
  }
  if (evt === 'mag_variable_initialized' || evt === 'mag_variable_update_ended' || evt === 'mag_variable_update_ended_for_zod') {
    const variables = data.variables && typeof data.variables === 'object'
      ? data.variables
      : Array.isArray(data.args) && data.args[0] && typeof data.args[0] === 'object'
        ? data.args[0]
        : null;
    if (!variables) return;
    const scope = normalizeCompatVariableScope(data.scope || 'chat');
    if (scope === 'global') {
      currentContext.globalVariables = clone(variables);
    } else {
      currentContext.localVariables = clone(variables);
      currentContext.variables = clone(variables);
    }
    ensureCompatGlobals();
  }
};

const dispatchEvent = async (eventName, payload, allowMutate = true) => {
  let data = payload;
  syncCompatVariablesFromEvent(eventName, payload);
  await refreshSillyTavernChat();
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
    if (msg.context && typeof msg.context === 'object') {
      currentContext = { ...currentContext, ...msg.context };
    }
    ensureCompatGlobals();
    list.forEach(item => {
      const record = { ...item };
      record.enabled = item.enabled === true;
      scripts.set(record.id, compileScript(record));
    });
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
    ensureCompatGlobals();
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

export const buildScriptRuntimeWorkerSourceForTests = buildWorkerScript;

const clonePlain = (value) => {
  if (value === undefined || value === null) return value;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
};

const normalizeScriptWorldEntry = (entry = {}, index = 0) => {
  const id = String(entry.id ?? entry.uid ?? `entry-${index}`);
  const name = String(entry.name || entry.comment || entry.title || id || `Entry ${index + 1}`);
  return {
    ...clonePlain(entry),
    uid: entry.uid ?? id,
    id,
    name,
    comment: entry.comment || name,
    title: entry.title || entry.comment || name,
    content: String(entry.content || ''),
    enabled: entry.enabled !== false && entry.disable !== true,
  };
};

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

const deleteByPath = (obj, path) => {
  if (!obj || typeof obj !== 'object' || !Array.isArray(path) || !path.length) return false;
  let cur = obj;
  for (let idx = 0; idx < path.length - 1; idx += 1) {
    cur = cur?.[path[idx]];
    if (!cur || typeof cur !== 'object') return false;
  }
  const last = path[path.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cur, last)) return false;
  delete cur[last];
  return true;
};

const estimatePayloadSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Infinity;
  }
};

const isEsmLikeScript = (content) => {
  const text = String(content || '');
  if (!text) return false;
  return /(^|[^\\w$])import\\s*(?:['"]|\\{|\\*|[\\w$]+\\s+from)/m.test(text) ||
    /(^|[^\\w$])export\\s+/m.test(text);
};

class ScriptIframeRuntime {
  constructor(owner) {
    this.owner = owner;
    this.iframes = new Map();
    this.windowMap = new Map();
    this.context = {};
    this.settings = {};
    this.settingsSignature = '';
    this.onMessage = this.onMessage.bind(this);
    window.addEventListener('message', this.onMessage);
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
    this.iframes.forEach(entry => {
      entry.iframe.remove();
    });
    this.iframes.clear();
    this.windowMap.clear();
  }

  buildIframeHtml(record, context, settings) {
    const baseHref = settings?.esmIframeBase || 'https://testingcf.jsdelivr.net/';
    const allowNetwork = settings?.allowNetwork === true;
    const csp = allowNetwork
      ? "default-src 'none'; script-src 'unsafe-inline' blob: https:; connect-src https:; img-src data: https:;"
      : "default-src 'none'; script-src 'unsafe-inline' blob:;";
    const vueUrl = settings?.esmIframeVueUrl || 'https://cdn.jsdelivr.net/npm/vue@3.5.22/dist/vue.global.prod.js';
    const vueEsmUrl = settings?.esmIframeVueEsmUrl || 'https://testingcf.jsdelivr.net/npm/vue@3.5.22/+esm';
    const lodashUrl = settings?.esmIframeLodashUrl || 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js';
    const jqueryUrl = settings?.esmIframeJqueryUrl || 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
    const toastrUrl = settings?.esmIframeToastrUrl || 'https://cdn.jsdelivr.net/npm/toastr@2.1.4/build/toastr.min.js';
    const zodUrl = settings?.esmIframeZodUrl || 'https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js';
    const yamlUrl = settings?.esmIframeYamlUrl || 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
    const scriptId = String(record.id || '');
    const scriptName = String(record.name || '');
    const scriptInfo = String(record.info || '');
    const scriptScope = String(record.scope || '');
    const scriptScopeId = String(record.scopeId || '');
    const scriptData = record.data && typeof record.data === 'object' ? record.data : {};
    const content = String(record.content || '');
    const contextJson = serializeForInlineScript(context || {});
    const dataJson = serializeForInlineScript(scriptData);
    const nameJson = serializeForInlineScript(scriptName);
    const infoJson = serializeForInlineScript(scriptInfo);
    const scopeJson = serializeForInlineScript(scriptScope);
    const scopeIdJson = serializeForInlineScript(scriptScopeId);
    const scriptIdJson = serializeForInlineScript(scriptId);
    const contentJson = serializeForInlineScript(content);
    const baseJson = serializeForInlineScript(baseHref);
    const cspJson = serializeForInlineScript(csp);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content=${cspJson} />
  <base href=${baseJson} />
</head>
<body>
${allowNetwork ? `
<script src="${lodashUrl}"></script>
<script src="${jqueryUrl}"></script>
<script src="${toastrUrl}"></script>
<script src="${zodUrl}"></script>
<script src="${yamlUrl}"></script>
<script src="${vueUrl}"></script>
<script>window.vue=window.Vue||window.vue;window.Vue=window.Vue||window.vue;var Vue=window.Vue;var vue=window.vue;</script>` : ''}
<script>
  const scriptId = ${scriptIdJson};
  const scriptName = ${nameJson};
  const scriptInfo = ${infoJson};
  const scriptScope = ${scopeJson};
  const scriptScopeId = ${scopeIdJson};
  let currentContext = ${contextJson};
  const pending = new Map();
  let seq = 0;
  const handlers = new Map();
  let defaultHandler = null;
  function cloneCompat(value) {
    try { return structuredClone(value); } catch {
      try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
    }
  }
  function normalizeCompatVariableScope(option) {
    const raw = option && typeof option === 'object'
      ? String(option.type || option.scope || option.name || '').trim().toLowerCase()
      : String(option || '').trim().toLowerCase();
    return raw === 'global' || raw === 'world' ? 'global' : 'chat';
  }
  function getCompatBaseVariables(option) {
    const scope = normalizeCompatVariableScope(option);
    const globals = currentContext.globalVariables && typeof currentContext.globalVariables === 'object'
      ? currentContext.globalVariables
      : {};
    const locals = currentContext.localVariables && typeof currentContext.localVariables === 'object'
      ? currentContext.localVariables
      : currentContext.variables && typeof currentContext.variables === 'object'
        ? currentContext.variables
        : {};
    return scope === 'global' ? globals : locals;
  }
  function buildCompatVariablesSnapshot() {
    const globals = currentContext.globalVariables && typeof currentContext.globalVariables === 'object'
      ? currentContext.globalVariables
      : {};
    const locals = currentContext.localVariables && typeof currentContext.localVariables === 'object'
      ? currentContext.localVariables
      : currentContext.variables && typeof currentContext.variables === 'object'
        ? currentContext.variables
        : {};
    const base = currentContext.variables && typeof currentContext.variables === 'object' ? currentContext.variables : locals;
    return {
      stat_data: cloneCompat(base),
      variables: cloneCompat(base),
      status_current_variables: cloneCompat(base),
      global_variables: cloneCompat(globals),
      local_variables: cloneCompat(locals),
    };
  }
  function getVariables(option) {
    return cloneCompat(getCompatBaseVariables(option));
  }
  function getAllVariables() {
    return buildCompatVariablesSnapshot();
  }
  function getContext() {
    return Object.assign({}, currentContext, buildCompatVariablesSnapshot(), {
      powerUserSettings: window.powerUserSettings || {},
    });
  }
  window.powerUserSettings = window.powerUserSettings || {};
  window.getVariables = window.getVariables || getVariables;
  window.getAllVariables = window.getAllVariables || getAllVariables;
  window.getContext = window.getContext || getContext;
  try {
    Object.defineProperty(window, 'Context', {
      configurable: true,
      enumerable: true,
      get: () => window.getContext(),
    });
  } catch {
    window.Context = window.getContext();
  }
  var getVariables = window.getVariables;
  var getAllVariables = window.getAllVariables;
  var getContext = window.getContext;
  var Context = window.Context;
  var powerUserSettings = window.powerUserSettings;
  function bridgeCompatGlobalsToHost(host) {
    try {
      if (!host || host === window) return;
      if (!host.powerUserSettings || typeof host.powerUserSettings !== 'object') host.powerUserSettings = window.powerUserSettings;
      if (typeof host.getContext !== 'function') host.getContext = () => window.getContext();
      if (typeof host.getVariables !== 'function') host.getVariables = (...args) => window.getVariables(...args);
      if (typeof host.getAllVariables !== 'function') host.getAllVariables = (...args) => window.getAllVariables(...args);
      try {
        Object.defineProperty(host, 'Context', {
          configurable: true,
          enumerable: true,
          get: () => host.getContext(),
        });
      } catch {
        host.Context = host.getContext();
      }
    } catch {}
  }
  bridgeCompatGlobalsToHost(window.parent);
  bridgeCompatGlobalsToHost(window.top);
  function callParent(method, params) {
    const id = String(Date.now()) + '-' + (++seq);
    const payload = { type: 'script-iframe-rpc', id, scriptId, method, params };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      parent.postMessage(payload, '*');
    });
  }
  window.addEventListener('message', (event) => {
    const msg = event && event.data ? event.data : {};
    if (msg.type === 'script-iframe-rpc-result' && msg.id) {
      const item = pending.get(msg.id);
      if (item) {
        pending.delete(msg.id);
        item.resolve(msg.result);
      }
      return;
    }
    if (msg.type === 'script-iframe-rpc-error' && msg.id) {
      const item = pending.get(msg.id);
      if (item) {
        pending.delete(msg.id);
        item.reject(msg.error);
      }
      return;
    }
    if (msg.type === 'script-iframe-context' && msg.context) {
      currentContext = Object.assign({}, currentContext, msg.context);
      try { Context = window.Context; } catch {}
      return;
    }
    if (msg.type === 'script-iframe-dispatch') {
      dispatchEvent(msg.event || '', msg.payload || {}, msg.allowMutate !== false)
        .then(result => {
          parent.postMessage({ type: 'script-iframe-dispatch-result', id: msg.id, scriptId, result }, '*');
        })
        .catch(err => {
          parent.postMessage({ type: 'script-iframe-dispatch-error', id: msg.id, scriptId, error: String(err && err.message || err) }, '*');
        });
    }
  });
  function ensureArray(map, key) {
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
  }
  const listenedEvents = new Set();
  function notifyListener(name) {
    const eventName = String(name || '').trim();
    if (!eventName || listenedEvents.has(eventName)) return;
    listenedEvents.add(eventName);
    parent.postMessage({ type: 'script-iframe-listener', event: eventName, scriptId }, '*');
  }
  function on(event, fn) {
    const name = String(event || '').trim();
    if (!name || typeof fn !== 'function') return;
    ensureArray(handlers, name).push(fn);
    notifyListener(name);
  }
  function off(event, fn) {
    const name = String(event || '').trim();
    if (!name) return;
    if (!handlers.has(name)) return;
    if (!fn) { handlers.delete(name); return; }
    handlers.set(name, handlers.get(name).filter(item => item !== fn));
  }
  window.on = on;
  window.off = off;
  window.eventOn = on;
  window.eventRemoveListener = off;
  window.eventEmit = (event, payload) => dispatchEvent(event, payload, true);
  var eventOn = on;
  var eventRemoveListener = off;
  var eventEmit = window.eventEmit;
  var on = window.on;
  var off = window.off;
  window.tavern_events = window.tavern_events || { on, off, eventOn: on, eventRemoveListener: off };
  function bridgeEventGlobalsToHost(host) {
    try {
      if (!host || host === window) return;
      if (typeof host.eventOn !== 'function') host.eventOn = on;
      if (typeof host.eventRemoveListener !== 'function') host.eventRemoveListener = off;
      if (!host.tavern_events || typeof host.tavern_events !== 'object') {
        host.tavern_events = window.tavern_events;
      }
    } catch {}
  }
  bridgeEventGlobalsToHost(window.parent);
  bridgeEventGlobalsToHost(window.top);
  function makeDataProxy(data) {
    const base = data && typeof data === 'object' ? data : {};
    return new Proxy(base, {
      set(target, prop, value) {
        target[prop] = value;
        callParent('script.updateData', { scriptId, data: base, scope: scriptScope, scopeId: scriptScopeId });
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop];
        callParent('script.updateData', { scriptId, data: base, scope: scriptScope, scopeId: scriptScopeId });
        return true;
      },
    });
  }
  function normalizeRole(role) {
    const r = String(role || '').trim().toLowerCase();
    if (!r) return '';
    if (r === 'user' || r === 'assistant' || r === 'system') return r;
    if (r === 'any') return '';
    return r;
  }
  function messageContentToText(msg) {
    if (!msg || typeof msg !== 'object') return '';
    const content = msg.content;
    if (Array.isArray(content)) {
      return content.map(part => part && part.type === 'text' ? String(part.text || '') : '').filter(Boolean).join('\\n');
    }
    return String(msg.raw || content || '');
  }
  function makeApi() {
    const call = (method, params) => callParent(method, Object.assign({}, params || {}, { sessionId: currentContext.sessionId, scriptId }));
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
        const filtered = roleFilter ? list.filter(m => String(m && m.role || '').trim().toLowerCase() === roleFilter) : list;
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
        const filtered = roleFilter ? list.filter(m => String(m && m.role || '').trim().toLowerCase() === roleFilter) : list;
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
  }
  function buildSillyTavern() {
    const st = {};
    st.chat = [];
    st.characters = [];
    st.characterId = 0;
    st.extensionSettings = {};
    st.chatCompletionSettings = { function_calling: false };
    st.ToolManager = { isToolCallingSupported: () => false, parseToolCalls: () => {} };
    st.getRequestHeaders = () => ({});
    st.getChatCompletionModel = () => '';
    st.getCurrentChatId = () => String(currentContext.sessionId || '');
    st.saveChat = () => Promise.resolve(true);
    st.saveSettingsDebounced = () => {};
    st.registerMacro = () => {};
    st.unregisterMacro = () => {};
    st.registerFunctionTool = () => {};
    st.unregisterFunctionTool = () => {};
    st.POPUP_TYPE = { TEXT: 'text', INPUT: 'input', CONFIRM: 'confirm' };
    st.POPUP_RESULT = { AFFIRMATIVE: 1, CANCELLED: 0, NEGATIVE: -1, CUSTOM1: 2 };
    st.callGenericPopup = async () => null;
    return st;
  }
  window.SillyTavern = buildSillyTavern();
  window.TavernHelper = window.TavernHelper || {
    getTavernHelperVersion: async () => '0.0.0',
  };
  var SillyTavern = window.SillyTavern;
  var TavernHelper = window.TavernHelper;
  if (!window._ && window.lodash) window._ = window.lodash;
  window._ = window._ || { clamp: (v, l, u) => {
    const num = Number(v);
    if (!Number.isFinite(num)) return l || 0;
    if (Number.isFinite(l) && num < l) return l;
    if (Number.isFinite(u) && num > u) return u;
    return num;
  }, max: (arr) => Array.isArray(arr) ? arr.reduce((a, b) => a === undefined || b > a ? b : a, undefined) : undefined };
  var _ = window._;
  if (!window.YAML && window.jsyaml) window.YAML = window.jsyaml;
  if (!window.YAML && window.jsyaml && window.jsyaml.default) window.YAML = window.jsyaml.default;
  if (!window.z) {
    const candidate = window.Zod || window.zod;
    if (candidate && candidate.z) window.z = candidate.z;
    else if (candidate) window.z = candidate;
  }
  if (window.z && !window.z.z) window.z.z = window.z;
  window.$ = window.$ || function(handler) { if (typeof handler === 'function') { try { handler(); } catch {} } return { on: () => {}, ready: (cb) => { if (cb) cb(); } }; };
  var $ = window.$;
  window.toastr = window.toastr || {
    info: (msg, title) => callParent('toast', { message: String(msg || title || ''), level: 'info' }),
    warning: (msg, title) => callParent('toast', { message: String(msg || title || ''), level: 'warning' }),
    warn: (msg, title) => callParent('toast', { message: String(msg || title || ''), level: 'warning' }),
    error: (msg, title) => callParent('toast', { message: String(msg || title || ''), level: 'error' }),
  };
  var toastr = window.toastr;
  const apiRef = makeApi();
  var api = apiRef;
  const scriptRef = { id: scriptId, name: scriptName, info: scriptInfo, scope: scriptScope, scopeId: scriptScopeId, data: makeDataProxy(${dataJson}) };
  var script = scriptRef;
  window.__chatappScript = scriptRef;
  window.__chatappApi = apiRef;
  window.api = apiRef;
  window.script = scriptRef;
  async function refreshSillyTavernChat() {
    try {
      const list = await callParent('chat.getMessages', { sessionId: currentContext.sessionId });
      if (Array.isArray(list)) {
        window.SillyTavern.chat = list;
      }
    } catch {}
  }
  async function dispatchEvent(eventName, payload, allowMutate) {
    await refreshSillyTavernChat();
    const base = payload && typeof payload === 'object' ? Object.assign({}, payload) : { value: payload };
    let data = payload;
    const handlerPayload = Object.assign({}, base, { event: eventName, context: currentContext, api, script });
    const list = handlers.get(eventName) || handlers.get('*') || [];
    const all = list.slice();
    if (!all.length && typeof defaultHandler === 'function') all.push(defaultHandler);
    for (const fn of all) {
      const res = await fn(handlerPayload);
      if (allowMutate && res && typeof res === 'object') data = res;
    }
    return data;
  }
  window.__chatappSetDefault = (fn) => { defaultHandler = fn; };
</script>
<script type="module">
  try {
    const allowNetwork = ${allowNetwork ? 'true' : 'false'};
    if (!window.Vue && allowNetwork) {
      try {
        const mod = await import(${serializeForInlineScript(vueEsmUrl)});
        const resolved = mod?.default && mod.default.createApp ? mod.default : mod;
        if (resolved) {
          window.Vue = resolved;
          window.vue = resolved;
        }
      } catch (err) {
        parent.postMessage({ type: 'script-iframe-error', scriptId: ${scriptIdJson}, error: 'vue load failed: ' + String(err && err.message || err) }, '*');
      }
    }
    const blob = new Blob([${contentJson}], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    if (mod && typeof mod.default === 'function') {
      window.__chatappSetDefault(mod.default);
    }
  } catch (err) {
    parent.postMessage({ type: 'script-iframe-error', scriptId: ${scriptIdJson}, error: String(err && err.message || err) }, '*');
  }
</script>
</body>
</html>`;
  }

  getSettingsSignature(settings = {}) {
    const pick = (value) => (value == null ? '' : String(value));
    return JSON.stringify({
      allowNetwork: settings?.allowNetwork === true,
      base: pick(settings?.esmIframeBase),
      vue: pick(settings?.esmIframeVueUrl),
      lodash: pick(settings?.esmIframeLodashUrl),
      jquery: pick(settings?.esmIframeJqueryUrl),
      toastr: pick(settings?.esmIframeToastrUrl),
      zod: pick(settings?.esmIframeZodUrl),
      yaml: pick(settings?.esmIframeYamlUrl),
    });
  }

  syncScripts(list = [], context = {}, settings = {}) {
    this.context = context || {};
    this.settings = settings || {};
    this.settingsSignature = this.getSettingsSignature(this.settings);
    const seen = new Set();
    list.forEach((record) => {
      const id = String(record?.id || '').trim();
      if (!id) return;
      seen.add(id);
      const existing = this.iframes.get(id);
      if (
        existing &&
        existing.record?.content === record.content &&
        existing.record?.enabled === record.enabled &&
        existing.settingsSignature === this.settingsSignature
      ) {
        existing.record = record;
        return;
      }
      if (existing) {
        existing.iframe.remove();
        this.windowMap.delete(existing.iframe.contentWindow);
      }
      if (!record.enabled) {
        this.iframes.delete(id);
        return;
      }
      // schemaOnly 脚本不创建 iframe（Schema 已在导入时静态解析）
      if (record.schemaOnly === true) {
        this.iframes.delete(id);
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.srcdoc = this.buildIframeHtml(record, this.context, this.settings);
      document.body.appendChild(iframe);
      const entry = { iframe, record, settingsSignature: this.settingsSignature };
      this.iframes.set(id, entry);
      if (iframe.contentWindow) this.windowMap.set(iframe.contentWindow, id);
    });
    this.iframes.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.iframe.remove();
        this.windowMap.delete(entry.iframe.contentWindow);
        this.iframes.delete(id);
      }
    });
  }

  syncContext(context = {}, settings = {}) {
    this.context = context || this.context;
    this.settings = settings || this.settings;
    this.iframes.forEach((entry) => {
      entry.iframe.contentWindow?.postMessage({ type: 'script-iframe-context', context: this.context, settings: this.settings }, '*');
    });
  }

  async dispatchEvent(event, payload, allowMutate = true) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.iframes.forEach((entry) => {
      entry.iframe.contentWindow?.postMessage({ type: 'script-iframe-dispatch', id, event, payload, allowMutate }, '*');
    });
    return payload;
  }

  async onMessage(e) {
    const msg = e?.data || {};
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'script-iframe-listener') {
      this.owner.recordListener?.(msg.event);
      return;
    }
    if (msg.type === 'script-iframe-rpc') {
      try {
        const result = await this.owner.processRpc(msg.method, msg.params || {});
        e.source?.postMessage({ type: 'script-iframe-rpc-result', id: msg.id, result }, '*');
      } catch (err) {
        e.source?.postMessage({ type: 'script-iframe-rpc-error', id: msg.id, error: String(err?.message || err) }, '*');
      }
      return;
    }
    if (msg.type === 'script-iframe-error') {
      logger.warn('[script-iframe]', msg.scriptId || '', msg.error || '');
      emitDebugLog({ message: String(msg.error || 'script iframe error'), type: 'warn', source: 'script' });
    }
  }
}

export class ScriptRuntime {
  constructor(store) {
    this.store = store;
    this.worker = null;
    this.iframeRuntime = new ScriptIframeRuntime(this);
    this.pending = new Map();
    this.seq = 0;
    this.oneTimeScripts = new Map();
    this.listenerEvents = new Set();
    this.context = {
      sessionId: '',
      personaId: '',
      presetId: '',
      presetIds: [],
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
    window.addEventListener('app-settings-changed', (event) => {
      const key = String(event?.detail?.key || '');
      if (!key || !key.startsWith('script')) return;
      this.syncScripts().catch(() => {});
    });
  }

  recordListener(eventName) {
    const name = String(eventName || '').trim();
    if (!name) return;
    this.listenerEvents.add(name);
  }

  hasListener(eventName) {
    const name = String(eventName || '').trim();
    if (!name) return false;
    return this.listenerEvents.has(name);
  }

  async init() {
    await this.store?.ready;
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
    const uiMode = sid.startsWith('rp:') ? 'rp' : 'chat';
    let personaId = '';
    let personaName = '';
    if (sid && this.getEffectivePersona) {
      const persona = this.getEffectivePersona(sid);
      personaId = String(persona?.id || '').trim();
      personaName = String(persona?.name || '').trim();
    }
    let presetId = '';
    const presetIds = [];
    const pushPresetId = (value) => {
      const id = String(value || '').trim();
      if (!id || presetIds.includes(id)) return;
      presetIds.push(id);
    };
    if (this.presets?.getResolvedActiveId) {
      const presetContext = { sessionId: sid, uiMode };
      const resolvedOpenAI = this.presets.getResolvedActiveId('openai', presetContext);
      const resolvedSysPrompt = this.presets.getResolvedActiveId('sysprompt', presetContext);
      const resolvedContext = this.presets.getResolvedActiveId('context', presetContext);
      const resolvedInstruct = this.presets.getResolvedActiveId('instruct', presetContext);
      const resolvedReasoning = this.presets.getResolvedActiveId('reasoning', presetContext);
      presetId = String(resolvedSysPrompt?.presetId || resolvedOpenAI?.presetId || '').trim();
      pushPresetId(resolvedOpenAI?.presetId);
      pushPresetId(resolvedSysPrompt?.presetId);
      pushPresetId(resolvedContext?.presetId);
      pushPresetId(resolvedInstruct?.presetId);
      pushPresetId(resolvedReasoning?.presetId);
    } else if (this.presets?.getState) {
      const state = this.presets.getState();
      presetId = String(state?.active?.sysprompt || state?.active?.openai || '').trim();
      pushPresetId(state?.active?.openai);
      pushPresetId(state?.active?.sysprompt);
      pushPresetId(state?.active?.context);
      pushPresetId(state?.active?.instruct);
      pushPresetId(state?.active?.reasoning);
    }
    if (!presetId && presetIds.length) presetId = presetIds[0];
    const resolvedWorldState = this.bridge?.getResolvedWorldState?.(sid, {
      uiMode,
    }) || null;
    const worldIds = Array.isArray(resolvedWorldState?.worldIds) && resolvedWorldState.worldIds.length
      ? resolvedWorldState.worldIds.slice()
      : (Array.isArray(this.bridge?.currentWorldIds) ? this.bridge.currentWorldIds.slice() : []);
    const worldId = String(this.bridge?.currentWorldId || worldIds[0] || '');
    const worldbookNames = Array.from(new Set([
      ...(Array.isArray(this.bridge?.worldStore?.list?.()) ? this.bridge.worldStore.list() : []),
      ...(Array.isArray(worldIds) ? worldIds : []),
      ...(worldId ? [worldId] : []),
    ].map(item => String(item || '').trim()).filter(Boolean)));
    const activeOpenAiPreset = this.presets?.getActive?.('openai') || {};
    const activePresetPrompts = Array.isArray(activeOpenAiPreset?.prompts)
      ? clonePlain(activeOpenAiPreset.prompts)
      : [];
    const activePreset = {
      name: String(activeOpenAiPreset?.name || ''),
      prompts: activePresetPrompts,
      prompts_unused: Array.isArray(activeOpenAiPreset?.prompts_unused)
        ? clonePlain(activeOpenAiPreset.prompts_unused)
        : [],
    };
    const localVariables = sid && this.chatStore?.listVariables
      ? (this.chatStore.listVariables(sid) || {})
      : {};
    const globalVariables = this.chatStore?.listGlobalVariables?.() || {};
    const sharedVariables = this.bridge?.isSharedVariableSession?.(sid) === true;
    const variables = sharedVariables ? globalVariables : localVariables;
    return {
      sessionId: sid,
      personaId,
      personaName,
      presetId,
      presetIds,
      worldId,
      worldIds,
      worldbookNames,
      activePreset,
      presetPrompts: activePreset.prompts,
      presetName: activePreset.name,
      variables: clonePlain(variables) || {},
      localVariables: clonePlain(localVariables) || {},
      globalVariables: clonePlain(globalVariables) || {},
      sharedVariables,
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
    const context = contextOverride
      ? { ...this.buildContext(contextOverride.sessionId), ...contextOverride }
      : this.buildContext();
    this.context = { ...this.context, ...context };
    const settings = appSettings.get();
    const runtimeSettings = {
      allowReadMessages: settings.scriptAllowReadMessages !== false,
      allowModifyVariables: settings.scriptAllowModifyVariables !== false,
      allowNetwork: settings.scriptAllowNetwork === true,
      debugExecutionLogs: settings.debugExecutionLogs === true,
    };
    if (!this.isEnabled(this.context.sessionId)) {
      if (this.worker) {
        this.worker.postMessage({
          type: 'sync',
          scripts: [],
          context: this.context,
          settings: runtimeSettings,
        });
      }
      if (this.iframeRuntime) {
        this.iframeRuntime.syncScripts([], this.context, runtimeSettings);
      }
      return;
    }
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
    const activePresetIds = Array.isArray(this.context.presetIds)
      ? this.context.presetIds.map(id => String(id || '').trim()).filter(Boolean)
      : [];
    if (!activePresetIds.length && this.context.presetId) activePresetIds.push(String(this.context.presetId || '').trim());
    activePresetIds.forEach((id) => push('preset', id));
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
    const workerScripts = [];
    const iframeScripts = [];
    filtered.forEach((script) => {
      const content = String(script?.content || '');
      if (isEsmLikeScript(content)) iframeScripts.push(script);
      else workerScripts.push(script);
    });
    if (workerScripts.length && !this.worker) {
      this.startWorker();
    }
    if (this.worker) {
      this.worker.postMessage({
        type: 'sync',
        scripts: workerScripts,
        context: this.context,
        settings: runtimeSettings,
      });
    }
    if (this.iframeRuntime) {
      this.iframeRuntime.syncScripts(iframeScripts, this.context, runtimeSettings);
    }
  }

  async syncContext(contextOverride) {
    const context = contextOverride
      ? { ...this.buildContext(contextOverride.sessionId), ...contextOverride }
      : this.buildContext();
    const next = { ...this.context, ...context };
    const changed = JSON.stringify(next) !== JSON.stringify(this.context);
    this.context = next;
    const settings = appSettings.get();
    const runtimeSettings = {
      allowReadMessages: settings.scriptAllowReadMessages !== false,
      allowModifyVariables: settings.scriptAllowModifyVariables !== false,
      allowNetwork: settings.scriptAllowNetwork === true,
      debugExecutionLogs: settings.debugExecutionLogs === true,
    };
    if (this.worker) {
      this.worker.postMessage({
        type: 'context',
        context: this.context,
        settings: runtimeSettings,
      });
    }
    if (this.iframeRuntime) {
      this.iframeRuntime.syncContext(this.context, runtimeSettings);
    }
    if (changed) {
      await this.syncScripts(this.context);
    }
  }

  async dispatchEvent(event, payload = {}, options = {}) {
    const sessionId = String(payload?.sessionId || this.context.sessionId || this.chatStore?.getCurrent?.() || '').trim();
    if (!this.isEnabled(sessionId)) return payload;
    if (options?.skip === true || payload?.skipScripts === true || payload?.meta?.skipScripts === true) {
      return payload;
    }
    if (event === 'variable.changed' && !this.hasListener(event) && !this.hasListener('*')) {
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
    const allowMutate = options.allowMutate !== false;
    let result = payload;
    if (this.worker) {
      result = await this.callWorker('dispatch', {
        event,
        payload,
        allowMutate,
      }, options.timeoutMs || 3000);
    }
    if (this.iframeRuntime) {
      this.iframeRuntime.dispatchEvent(event, result, allowMutate).catch(() => {});
    }
    return result;
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
    if (msg.type === 'listener_add') {
      this.recordListener(msg.event);
      return;
    }
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
    if (method === 'variables.delete') {
      if (!allowModifyVariables) return false;
      const key = String(params.key || '').trim();
      const scope = String(params.options?.scope || params.scope || 'local').toLowerCase();
      if (!key) return false;
      const path = toPath(key);
      if (!path.length) return false;
      if (scope === 'global') {
        if (path.length === 1) return this.chatStore?.deleteGlobalVariable?.(path[0]) ?? false;
        const base = this.chatStore?.getGlobalVariable?.(path[0]) || {};
        if (!base || typeof base !== 'object') return false;
        const next = clonePlain(base) || {};
        const changed = deleteByPath(next, path.slice(1));
        if (!changed) return false;
        return this.chatStore?.setGlobalVariable?.(path[0], next) ?? false;
      }
      if (path.length === 1) return this.chatStore?.deleteVariable?.(path[0], sessionId) ?? false;
      const base = this.chatStore?.getVariable?.(path[0], sessionId) || {};
      if (!base || typeof base !== 'object') return false;
      const next = clonePlain(base) || {};
      const changed = deleteByPath(next, path.slice(1));
      if (!changed) return false;
      return this.chatStore?.setVariable?.(path[0], next, sessionId) ?? false;
    }
    if (method === 'variables.patch') {
      if (!allowModifyVariables) return false;
      const scope = String(params.options?.scope || params.scope || 'local').toLowerCase();
      const patch = params.patch && typeof params.patch === 'object' ? params.patch : {};
      const results = await Promise.all(Object.entries(patch).map(([key, value]) => (
        value === undefined
          ? this.processRpc('variables.delete', { key, options: { scope }, sessionId })
          : this.processRpc('variables.set', { key, value, options: { scope }, sessionId })
      )));
      return results.some(Boolean);
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
    if (method === 'variables.registerSchema') {
      if (!allowModifyVariables) return false;
      const rawDefaults = params.defaults && typeof params.defaults === 'object' ? params.defaults : null;
      if (!rawDefaults) return false;
      const scope = String(params.options?.scope || params.scope || params.options?.type || '').toLowerCase();
      const useGlobal = scope === 'global';
      const defaults =
        rawDefaults.stat_data && typeof rawDefaults.stat_data === 'object'
          ? rawDefaults.stat_data
          : rawDefaults.statData && typeof rawDefaults.statData === 'object'
            ? rawDefaults.statData
            : rawDefaults;
      if (!defaults || typeof defaults !== 'object') return false;
      const isPlainObject = (val) => val && typeof val === 'object' && !Array.isArray(val);
      const mergeDeep = (base, override) => {
        const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
        if (!override || typeof override !== 'object') return out;
        Object.entries(override).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            out[key] = value.slice();
          } else if (isPlainObject(value) && isPlainObject(out[key])) {
            out[key] = mergeDeep(out[key], value);
          } else {
            out[key] = value;
          }
        });
        return out;
      };
      const deepEqual = (a, b) => {
        if (Object.is(a, b)) return true;
        if (typeof a !== typeof b) return false;
        if (Array.isArray(a)) {
          if (!Array.isArray(b) || a.length !== b.length) return false;
          return a.every((v, i) => deepEqual(v, b[i]));
        }
        if (isPlainObject(a)) {
          if (!isPlainObject(b)) return false;
          const keysA = Object.keys(a);
          const keysB = Object.keys(b);
          if (keysA.length !== keysB.length) return false;
          return keysA.every(k => deepEqual(a[k], b[k]));
        }
        return false;
      };
      const inferSchema = (name, value) => {
        let type = typeof value;
        if (Array.isArray(value)) type = 'array';
        else if (value === null) type = 'string';
        else if (type !== 'number' && type !== 'boolean' && type !== 'string' && type !== 'object') type = 'string';
        return {
          type,
          default: value,
          ui: { display: 'hidden', label: String(name || '') },
        };
      };
      const listVars = useGlobal
        ? (this.chatStore?.listGlobalVariables?.() || {})
        : (this.chatStore?.listVariables?.(sessionId) || {});
      const setVar = useGlobal
        ? (key, value) => this.chatStore?.setGlobalVariable?.(key, value)
        : (key, value) => this.chatStore?.setVariable?.(key, value, sessionId);
      Object.entries(defaults).forEach(([key, value]) => {
        const name = String(key || '').trim();
        if (!name) return;
        const existing = listVars[name];
        let next = value;
        if (isPlainObject(value) && isPlainObject(existing)) {
          next = mergeDeep(value, existing);
        } else if (existing !== undefined) {
          next = existing;
        }
        if (!deepEqual(existing, next)) {
          setVar(name, next);
          if (!useGlobal && this.chatStore?.getInitialVariable?.(name, sessionId) === undefined) {
            this.chatStore?.setInitialVariable?.(name, next, sessionId);
          }
        }
        if (!useGlobal && this.chatStore?.getVariableSchema?.(name, sessionId) == null) {
          this.chatStore?.setVariableSchema?.(name, inferSchema(name, next), sessionId);
        }
      });
      emitDebugLog({
        message: `[MVU] registerSchema applied=${Object.keys(defaults).length} scope=${useGlobal ? 'global' : 'session'} session=${sessionId || 'unknown'}`,
        type: 'info',
        source: 'script',
      });
      return true;
    }
    if (method === 'chat.getMessages') {
      if (!allowReadMessages) return [];
      const list = Array.isArray(this.chatStore?.getMessages?.(sessionId))
        ? this.chatStore.getMessages(sessionId)
        : [];
      return list.map(m => ({ ...m }));
    }
    if (method === 'chat.updateMessage') {
      if (!allowReadMessages) return null;
      if (!this.chatStore || !sessionId) return null;
      const id = String(params.id || '').trim();
      const data = params.data && typeof params.data === 'object' ? params.data : null;
      if (!id || !data) return null;
      const updated = this.chatStore.updateMessage(id, data, sessionId);
      const ui = this.bridge?.chatUI || null;
      if (updated && ui && typeof ui.updateMessage === 'function' && this.chatStore.getCurrent?.() === sessionId) {
        ui.updateMessage(id, updated);
      }
      return updated || null;
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
    if (method === 'world.list') {
      const names = Array.from(new Set([
        ...(Array.isArray(this.bridge?.worldStore?.list?.()) ? this.bridge.worldStore.list() : []),
        ...(Array.isArray(this.context.worldbookNames) ? this.context.worldbookNames : []),
        ...(Array.isArray(this.context.worldIds) ? this.context.worldIds : []),
        ...(this.context.worldId ? [this.context.worldId] : []),
      ].map(item => String(item || '').trim()).filter(Boolean)));
      return names;
    }
    if (method === 'world.getBook') {
      const worldId = String(params.world || this.context.worldId || '').trim();
      if (!worldId) return [];
      const world = this.bridge?.worldStore?.load?.(worldId);
      const entries = Array.isArray(world?.entries) ? world.entries : [];
      return entries.map((entry, index) => normalizeScriptWorldEntry(entry, index));
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
      if (!name || name === 'in_use' || name === 'current') {
        const activeOpenAiPreset = this.presets?.getActive?.('openai') || {};
        return {
          name: String(activeOpenAiPreset?.name || this.context.presetName || ''),
          prompts: Array.isArray(activeOpenAiPreset?.prompts)
            ? clonePlain(activeOpenAiPreset.prompts)
            : clonePlain(this.context.presetPrompts || []),
          prompts_unused: Array.isArray(activeOpenAiPreset?.prompts_unused)
            ? clonePlain(activeOpenAiPreset.prompts_unused)
            : [],
        };
      }
      if (!name && this.presets?.getActive) {
        const active = this.presets.getActive('sysprompt') || {};
        return { name: String(active?.name || '') };
      }
      return { name };
    }
    if (method === 'context.getContext') {
      const localVariables = sessionId && this.chatStore?.listVariables
        ? (this.chatStore.listVariables(sessionId) || {})
        : {};
      const globalVariables = this.chatStore?.listGlobalVariables?.() || {};
      const sharedVariables = this.bridge?.isSharedVariableSession?.(sessionId) === true;
      const variables = sharedVariables ? globalVariables : localVariables;
      const chat = allowReadMessages && Array.isArray(this.chatStore?.getMessages?.(sessionId))
        ? this.chatStore.getMessages(sessionId).map(m => ({ ...m }))
        : [];
      return {
        ...this.context,
        sessionId,
        chat,
        messages: chat,
        variables: clonePlain(variables) || {},
        stat_data: clonePlain(variables) || {},
        status_current_variables: clonePlain(variables) || {},
        local_variables: clonePlain(localVariables) || {},
        global_variables: clonePlain(globalVariables) || {},
        localVariables: clonePlain(localVariables) || {},
        globalVariables: clonePlain(globalVariables) || {},
        sharedVariables,
        powerUserSettings: {},
      };
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
