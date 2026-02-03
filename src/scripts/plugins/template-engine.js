import { appSettings } from '../storage/app-settings.js';
import { logger } from '../utils/logger.js';

const CACHE_LIMIT = 120;
const templateCache = new Map();

const escapeHtml = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const toPath = (key) => {
  const raw = String(key || '').trim();
  if (!raw) return [];
  return raw.split('.').map(seg => seg.trim()).filter(Boolean);
};

const getByPath = (obj, path, fallback = undefined) => {
  const parts = Array.isArray(path) ? path : toPath(path);
  if (!parts.length) return fallback;
  let cur = obj;
  for (const key of parts) {
    if (!cur || typeof cur !== 'object' || !(key in cur)) return fallback;
    cur = cur[key];
  }
  return cur === undefined ? fallback : cur;
};

const setByPath = (obj, path, value) => {
  const parts = Array.isArray(path) ? path : toPath(path);
  if (!parts.length || !obj || typeof obj !== 'object') return obj;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
};

const cloneValue = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeScope = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'global' || s === 'g') return 'global';
  if (s === 'local' || s === 'chat') return 'local';
  if (s === 'message' || s === 'msg') return 'message';
  if (s === 'initial') return 'initial';
  if (s === 'cache') return 'cache';
  return '';
};

const normalizeFlags = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'nx' || s === 'xx' || s === 'n' || s === 'nxs' || s === 'xxs') return s;
  return '';
};

const parseOptions = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    const scope = normalizeScope(raw);
    if (scope) return { scope };
    const flags = normalizeFlags(raw);
    if (flags) return { flags };
    return {};
  }
  if (typeof raw === 'object') return { ...raw };
  return {};
};

const getTemplateSettings = () => {
  const settings = appSettings.get();
  return {
    enabled: settings.templateEnabled !== false,
    before: settings.templateExecuteBeforeGenerate !== false,
    after: settings.templateExecuteAfterRender !== false,
    showError: settings.templateShowErrorToast !== false,
  };
};

const shouldRunTemplate = (stage, context) => {
  const settings = getTemplateSettings();
  if (!settings.enabled) return false;
  if (stage === 'generate' && !settings.before) return false;
  if (stage === 'render' && !settings.after) return false;
  const sessionSetting = context?.session?.settings?.templateEnabled;
  const metaSetting = context?.meta?.templateEnabled;
  if (typeof metaSetting === 'boolean') return metaSetting;
  if (typeof sessionSetting === 'boolean') return sessionSetting;
  return true;
};

const compileTemplate = (template) => {
  const cached = templateCache.get(template);
  if (cached) return cached;
  const re = /<%([=#-]?)([\s\S]*?)%>/g;
  let cursor = 0;
  let src = "let __out = '';\n";
  src += 'const print = (...args) => { __out += args.join(""); };\n';
  src += 'const __escape = __esc;\n';
  template.replace(re, (match, flag, code, index) => {
    const text = template.slice(cursor, index);
    if (text) src += `__out += ${JSON.stringify(text)};\n`;
    if (flag === '#') {
      // comment, ignore
    } else if (flag === '=') {
      src += `__out += __escape((${code}) ?? "");\n`;
    } else if (flag === '-') {
      src += `__out += ((${code}) ?? "");\n`;
    } else {
      src += `${code}\n`;
    }
    cursor = index + match.length;
    return '';
  });
  const rest = template.slice(cursor);
  if (rest) src += `__out += ${JSON.stringify(rest)};\n`;
  src += 'return __out;';
  const fn = new Function('ctx', '__esc', `with (ctx) {\n${src}\n}`);
  if (templateCache.size >= CACHE_LIMIT) {
    const first = templateCache.keys().next().value;
    if (first) templateCache.delete(first);
  }
  templateCache.set(template, fn);
  return fn;
};

const createRuntime = ({ chatStore, sessionId, messageVars, initialVars, state, context }) => {
  const globals = chatStore?.listGlobalVariables?.() || {};
  const locals = chatStore?.listVariables?.(sessionId) || {};
  const initials = initialVars || chatStore?.listInitialVariables?.(sessionId) || {};
  const msgVars = messageVars || {};
  const shared = state || { defines: Object.create(null) };
  const appBridge = (typeof window !== 'undefined' && window.appBridge) ? window.appBridge : null;

  const getScopedStore = (scope) => {
    if (scope === 'global') return globals;
    if (scope === 'local') return locals;
    if (scope === 'initial') return initials;
    if (scope === 'message') return msgVars;
    if (scope === 'cache') return null;
    return null;
  };

  const readVar = (key, options = {}) => {
    const opts = parseOptions(options);
    const scope = normalizeScope(opts.scope) || 'cache';
    const path = toPath(key);
    if (!path.length) return undefined;
    if (scope === 'cache') {
      const ordered = [msgVars, locals, globals, initials];
      for (const store of ordered) {
        const val = getByPath(store, path);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }
    const store = getScopedStore(scope);
    if (!store) return opts.defaults;
    const val = getByPath(store, path);
    return val === undefined ? opts.defaults : val;
  };

  const writeStoreValue = (scope, path, value) => {
    if (scope === 'message') {
      setByPath(msgVars, path, value);
      return true;
    }
    if (scope === 'initial') {
      setByPath(initials, path, value);
      if (chatStore?.setInitialVariable) {
        const root = path[0];
        if (root) chatStore.setInitialVariable(root, initials[root], sessionId);
      }
      return true;
    }
    if (scope === 'global') {
      const root = path[0];
      if (!root) return false;
      if (path.length === 1) {
        globals[root] = value;
        chatStore?.setGlobalVariable?.(root, value);
        return true;
      }
      const next = cloneValue(globals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      globals[root] = base;
      chatStore?.setGlobalVariable?.(root, base);
      return true;
    }
    if (scope === 'local') {
      const root = path[0];
      if (!root) return false;
      if (path.length === 1) {
        locals[root] = value;
        chatStore?.setVariable?.(root, value, sessionId);
        return true;
      }
      const next = cloneValue(locals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      locals[root] = base;
      chatStore?.setVariable?.(root, base, sessionId);
      return true;
    }
    return false;
  };

  const setVar = (key, value, options = {}) => {
    const opts = parseOptions(options);
    const scope = normalizeScope(opts.scope) || 'message';
    const flags = normalizeFlags(opts.flags) || '';
    const path = toPath(key);
    if (!path.length) return undefined;
    const existing = readVar(key, { scope: scope === 'cache' ? 'cache' : scope });
    if (flags === 'nx' && existing !== undefined) return undefined;
    if (flags === 'xx' && existing === undefined) return undefined;
    const ok = writeStoreValue(scope, path, value);
    return ok ? value : undefined;
  };

  const incVar = (key, delta = 1, options = {}) => {
    const current = Number(readVar(key, options)) || 0;
    const next = current + (Number(delta) || 0);
    setVar(key, next, options);
    return next;
  };

  const decVar = (key, delta = 1, options = {}) => {
    const current = Number(readVar(key, options)) || 0;
    const next = current - (Number(delta) || 0);
    setVar(key, next, options);
    return next;
  };

  const define = (name, value, merge = false) => {
    const key = String(name || '').trim();
    if (!key) return;
    if (merge && typeof shared.defines?.[key] === 'object' && typeof value === 'object') {
      shared.defines[key] = { ...shared.defines[key], ...value };
    } else {
      shared.defines[key] = value;
    }
  };

  const normalizeRole = (role) => {
    const r = String(role || '').trim().toLowerCase();
    if (!r) return '';
    if (r === 'user' || r === 'assistant' || r === 'system') return r;
    if (r === 'any') return '';
    return r;
  };

  const getChatMessagesList = () => {
    if (!chatStore || !sessionId) return [];
    const list = chatStore.getMessages?.(sessionId) || [];
    return Array.isArray(list) ? list : [];
  };

  const messageContentToText = (msg) => {
    if (!msg || typeof msg !== 'object') return '';
    const content = msg.content;
    if (Array.isArray(content)) {
      return content
        .map(part => (part?.type === 'text' ? String(part.text || '') : ''))
        .filter(Boolean)
        .join('\n');
    }
    return String((typeof msg.raw === 'string' && msg.raw) ? msg.raw : (content ?? ''));
  };

  const getChatMessage = (idx, role) => {
    const list = getChatMessagesList();
    const roleFilter = normalizeRole(role);
    const filtered = roleFilter ? list.filter(m => String(m?.role || '').trim().toLowerCase() === roleFilter) : list;
    if (!filtered.length) return '';
    let index = Number(idx);
    if (!Number.isFinite(index)) return '';
    index = Math.trunc(index);
    if (index < 0) index = filtered.length + index;
    if (index < 0 || index >= filtered.length) return '';
    return messageContentToText(filtered[index]);
  };

  const getChatMessages = (...args) => {
    const list = getChatMessagesList();
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
  };

  const resolveWorldData = (nameRaw) => {
    if (!appBridge) return null;
    const name = String(nameRaw || '').trim();
    if (name) {
      return appBridge.worldStore?.load?.(name) || null;
    }
    const current = String(appBridge.currentWorldId || '').trim();
    if (current) return appBridge.worldStore?.load?.(current) || null;
    const globalId = String(appBridge.globalWorldId || '').trim();
    if (globalId) return appBridge.worldStore?.load?.(globalId) || null;
    return null;
  };

  const findWorldEntry = (world, title) => {
    const data = resolveWorldData(world);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    if (!entries.length) return null;
    if (title == null || title === '') return null;
    if (title instanceof RegExp) {
      return entries.find(e => title.test(String(e?.comment || e?.title || e?.id || ''))) || null;
    }
    const raw = String(title || '').trim();
    if (!raw) return null;
    const num = Number(raw);
    if (Number.isFinite(num)) {
      const byId = entries.find(e => Number(e?.uid) === num || Number(e?.id) === num);
      if (byId) return byId;
    }
    return (
      entries.find(e => String(e?.id || '').trim() === raw) ||
      entries.find(e => String(e?.comment || e?.title || '').trim() === raw) ||
      null
    );
  };

  const getwi = (lorebook, title, data) => {
    let targetWorld = lorebook;
    let targetTitle = title;
    let payload = data;
    if (typeof title === 'object' && title && data == null) {
      targetWorld = '';
      targetTitle = lorebook;
      payload = title;
    } else if (title == null && data == null && (typeof lorebook === 'string' || lorebook instanceof RegExp || typeof lorebook === 'number')) {
      targetWorld = '';
      targetTitle = lorebook;
      payload = null;
    }
    const entry = findWorldEntry(targetWorld, targetTitle);
    const content = String(entry?.content || '');
    if (payload && typeof payload === 'object') {
      try {
        const res = renderTemplateText(content, {
          stage: 'generate',
          chatStore,
          sessionId,
          context: { ...(context || {}), data: payload },
          state: shared,
        });
        return String(res.text ?? '');
      } catch {
        return content;
      }
    }
    return content;
  };

  const activewi = (lorebook, title, force = false) => {
    let targetWorld = lorebook;
    let targetTitle = title;
    let forceFlag = force;
    if (typeof title === 'boolean' && (typeof lorebook === 'string' || lorebook instanceof RegExp || typeof lorebook === 'number')) {
      targetWorld = '';
      targetTitle = lorebook;
      forceFlag = title;
    } else if (title == null && (typeof lorebook === 'string' || lorebook instanceof RegExp || typeof lorebook === 'number')) {
      targetWorld = '';
      targetTitle = lorebook;
      forceFlag = Boolean(force);
    }
    const worldData = resolveWorldData(targetWorld);
    if (!worldData || !Array.isArray(worldData.entries)) return null;
    const entry = findWorldEntry(targetWorld, targetTitle);
    if (!entry) return null;
    entry.disable = false;
    if (forceFlag) entry.constant = true;
    try {
      const worldId = String(worldData.name || targetWorld || appBridge?.currentWorldId || '').trim();
      if (worldId && appBridge?.worldStore?.save) {
        appBridge.worldStore.save(worldId, { ...worldData, entries: worldData.entries });
      }
    } catch {}
    return entry;
  };

  const getchar = (name) => {
    const char = context?.character || {};
    if (name && typeof name === 'string' && String(char.name || '').trim() !== String(name).trim()) {
      return { name: String(name), description: '' };
    }
    return {
      name: String(char.name || ''),
      description: String(char.description || ''),
      personality: String(char.personality || ''),
      scenario: String(char.scenario || ''),
      depthPrompt: String(char.depthPrompt || ''),
    };
  };

  const getpreset = (name) => {
    const raw = String(name || '').trim();
    if (!appBridge?.presets?.getActive) return raw ? { name: raw } : undefined;
    if (!raw) {
      const active = appBridge.presets.getActive('sysprompt') || {};
      return { name: String(active?.name || '') };
    }
    return { name: raw };
  };

  const variablesProxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined;
        return readVar(prop, { scope: 'cache' });
      },
      set(_t, prop, value) {
        if (typeof prop !== 'string') return false;
        setVar(prop, value, { scope: 'message' });
        return true;
      },
    },
  );

  const runtime = {
    variables: variablesProxy,
    getvar: (key, options) => readVar(key, options),
    setvar: (key, value, options) => setVar(key, value, options),
    incvar: (key, value, options) => incVar(key, value, options),
    decvar: (key, value, options) => decVar(key, value, options),
    define,
    getChatMessage,
    getChatMessages,
    getwi,
    getWorldInfo: getwi,
    activewi,
    activateWorldInfo: activewi,
    getchar,
    getChara: getchar,
    getpreset,
    getPresetPrompt: getpreset,
    getContext: () => ({}),
    context: context || {},
    globals,
    locals,
    initials,
    messages: context?.messages || [],
    user: context?.user || {},
    character: context?.character || {},
    session: context?.session || {},
  };

  Object.entries(shared.defines || {}).forEach(([key, value]) => {
    runtime[key] = value;
  });

  return { runtime, messageVars: msgVars, shared };
};

const renderTemplate = (template, { runtime }) => {
  if (!template || typeof template !== 'string') {
    return { text: template, error: null };
  }
  if (!template.includes('<%')) {
    return { text: template, error: null };
  }
  try {
    const fn = compileTemplate(template);
    const text = fn(runtime, escapeHtml);
    return { text: String(text ?? ''), error: null };
  } catch (err) {
    return { text: template, error: err };
  }
};

const notifyError = (err, stage) => {
  if (!err) return;
  const settings = getTemplateSettings();
  if (!settings.showError) return;
  const msg = `模板执行失败（${stage}）：${err.message || err}`;
  try {
    window.toastr?.warning?.(msg);
  } catch {}
};

export const renderTemplateText = (rawText, options = {}) => {
  const template = String(rawText ?? '');
  const stage = String(options.stage || '').trim().toLowerCase() || 'render';
  const state = options.state || { defines: Object.create(null) };
  const runtimePack = createRuntime({
    chatStore: options.chatStore,
    sessionId: options.sessionId,
    messageVars: options.messageVars,
    initialVars: options.initialVars,
    state,
    context: options.context,
  });
  const result = renderTemplate(template, runtimePack);
  if (result.error) {
    logger.warn('template render failed', result.error);
    notifyError(result.error, stage);
  }
  return {
    text: result.text,
    error: result.error,
    messageVars: runtimePack.messageVars,
    state: runtimePack.shared,
  };
};

export const renderTemplateMessages = async (messages, options = {}) => {
  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return { messages: list, errors: [] };
  const stage = String(options.stage || '').trim().toLowerCase() || 'generate';
  const errors = [];
  const shared = options.state || { defines: Object.create(null) };
  const out = list.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const content = msg.content;
    if (typeof content === 'string') {
      const res = renderTemplateText(content, { ...options, stage, state: shared });
      if (res.error) errors.push(res.error);
      return { ...msg, content: res.text };
    }
    if (Array.isArray(content)) {
      const parts = content.map((part) => {
        if (part?.type === 'text' && typeof part.text === 'string') {
          const res = renderTemplateText(part.text, { ...options, stage, state: shared });
          if (res.error) errors.push(res.error);
          return { ...part, text: res.text };
        }
        return part;
      });
      return { ...msg, content: parts };
    }
    return msg;
  });
  if (errors.length) {
    logger.warn(`template render encountered ${errors.length} errors`);
    errors.slice(0, 2).forEach(err => notifyError(err, stage));
  }
  return { messages: out, errors };
};

export const templateSettings = {
  get: getTemplateSettings,
  shouldRun: shouldRunTemplate,
};
