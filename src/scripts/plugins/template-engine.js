import { appSettings } from '../storage/app-settings.js';
import { logger } from '../utils/logger.js';
import { emitDebugLog } from '../utils/debug-log.js';

const CACHE_LIMIT = 120;
const TEMPLATE_LOG_LIMIT = 50;
const TEMPLATE_TIMEOUT_MS = 3000;
const TEMPLATE_GUARD_LIMIT = 50000;
const TEMPLATE_OUTPUT_LIMIT = 120000;
const TEMPLATE_PAYLOAD_LIMIT = 1200000;
const TEMPLATE_RENDER_CHUNK_SIZE = 8192;
const TEMPLATE_RENDER_RESULT_LIMIT = 3000000;
const TEMPLATE_WORKER_SOURCE_URL = 'chatapp-template-worker.js';
const templateCache = new Map();
const templateExecutionLogs = [];
let templateWorkerInstance = null;

const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const shouldRecordTemplateLog = () => {
  try {
    return appSettings.get().debugExecutionLogs === true;
  } catch {
    return false;
  }
};

const truncateText = (value, maxLen = 800) => {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
};

const recordTemplateExecution = (entry = {}) => {
  if (!shouldRecordTemplateLog()) return;
  const record = {
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : Date.now(),
    stage: String(entry.stage || '').trim(),
    sessionId: String(entry.sessionId || '').trim(),
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : null,
    input: truncateText(entry.input || ''),
    output: truncateText(entry.output || ''),
    error: entry.error ? String(entry.error) : '',
  };
  templateExecutionLogs.push(record);
  if (templateExecutionLogs.length > TEMPLATE_LOG_LIMIT) {
    templateExecutionLogs.splice(0, templateExecutionLogs.length - TEMPLATE_LOG_LIMIT);
  }
};

const estimatePayloadSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Infinity;
  }
};

const buildTemplateWorkerScript = () => `
const CACHE_LIMIT = ${CACHE_LIMIT};
const TEMPLATE_GUARD_LIMIT = ${TEMPLATE_GUARD_LIMIT};
const TEMPLATE_OUTPUT_LIMIT = ${TEMPLATE_OUTPUT_LIMIT};
const DEFAULT_RESULT_LIMIT = ${TEMPLATE_PAYLOAD_LIMIT};
const DEFAULT_CHUNK_SIZE = ${TEMPLATE_RENDER_CHUNK_SIZE};
const templateCache = new Map();

const nowMs = () => {
  if (self.performance && typeof self.performance.now === 'function') {
    return self.performance.now();
  }
  return Date.now();
};

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

const estimateSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return TEMPLATE_RESULT_LIMIT + 1;
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

const compileTemplate = (template) => {
  const cached = templateCache.get(template);
  if (cached) return cached;
  const re = /<%([=#-]?)([\\s\\S]*?)%>/g;
  let cursor = 0;
  let src = "let __out = '';\\n";
  src += 'const __emit = typeof ctx.__emit === "function" ? ctx.__emit : null;\\n';
  src += 'const __chunkLimit = typeof ctx.__chunkLimit === "number" ? ctx.__chunkLimit : 0;\\n';
  src += 'const __flush = () => { if (!__emit || !__chunkLimit) return; if (__out.length >= __chunkLimit) { __emit(__out); __out = ""; } };\\n';
  src += 'const __outLimit = typeof ctx.__outLimit === "number" ? ctx.__outLimit : ' + TEMPLATE_OUTPUT_LIMIT + ';\\n';
  src += 'const __ensureOut = () => { if (__out.length > __outLimit) throw new Error("模板输出过大"); };\\n';
  src += 'const print = (...args) => { __out += args.join(""); __ensureOut(); __flush(); };\\n';
  src += 'const __escape = __esc;\\n';
  src += 'const __guard = ctx.__guard;\\n';
  src += 'if (__guard) __guard();\\n';
  const guardLine = '__guard && __guard();\\n';
  template.replace(re, (match, flag, code, index) => {
    const text = template.slice(cursor, index);
    if (text) src += '__out += ' + JSON.stringify(text) + ';\\n__ensureOut();\\n__flush();\\n';
    if (flag === '#') {
      // comment, ignore
    } else if (flag === '=') {
      src += guardLine;
      src += '__out += __escape((' + code + ') ?? "");\\n__ensureOut();\\n__flush();\\n';
    } else if (flag === '-') {
      src += guardLine;
      src += '__out += ((' + code + ') ?? "");\\n__ensureOut();\\n__flush();\\n';
    } else {
      src += guardLine;
      src += code + '\\n';
      src += '__flush();\\n';
    }
    cursor = index + match.length;
    return '';
  });
  const rest = template.slice(cursor);
  if (rest) src += '__out += ' + JSON.stringify(rest) + ';\\n__ensureOut();\\n__flush();\\n';
  src += 'return __out;';
  const fn = new Function('ctx', '__esc', 'with (ctx) {\\n' + src + '\\n}');
  if (templateCache.size >= CACHE_LIMIT) {
    const first = templateCache.keys().next().value;
    if (first) templateCache.delete(first);
  }
  templateCache.set(template, fn);
  return fn;
};

const renderTemplate = (template, runtime) => {
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

const resolveWorldData = (worlds, worldMeta, nameRaw) => {
  if (!Array.isArray(worlds) || !worlds.length) return null;
  const name = String(nameRaw || '').trim();
  const lookup = (key) => worlds.find(w => String(w?.id || '') === key || String(w?.name || '') === key) || null;
  if (name) return lookup(name);
  const currentId = String(worldMeta?.currentWorldId || '').trim();
  if (currentId) {
    const w = lookup(currentId);
    if (w) return w;
  }
  const globalId = String(worldMeta?.globalWorldId || '').trim();
  if (globalId) return lookup(globalId);
  return null;
};

const findWorldEntry = (world, title) => {
  const entries = Array.isArray(world?.entries) ? world.entries : [];
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

const renderTemplateWithRuntime = (template, runtime) => {
  const startAt = nowMs();
  runtime.__guardCount = 0;
  runtime.__guardLimit = TEMPLATE_GUARD_LIMIT;
  runtime.__outLimit = TEMPLATE_OUTPUT_LIMIT;
  runtime.__guard = () => {
    runtime.__guardCount += 1;
    if (runtime.__guardCount > runtime.__guardLimit) {
      const err = new Error('模板执行超过最大步数');
      err.code = 'TEMPLATE_LOOP';
      throw err;
    }
    const elapsed = nowMs() - startAt;
    if (elapsed > 3000) {
      const err = new Error('模板执行超时');
      err.code = 'TEMPLATE_TIMEOUT';
      throw err;
    }
  };
  return renderTemplate(template, runtime);
};

const createRuntime = (payload) => {
  const globals = cloneValue(payload?.globals || {});
  const locals = cloneValue(payload?.locals || {});
  const initials = cloneValue(payload?.initials || {});
  const msgVars = cloneValue(payload?.messageVars || {});
  const shared = { defines: cloneValue(payload?.defines || {}) };
  const context = payload?.context || {};
  const worldMeta = payload?.worldMeta || {};
  const worlds = Array.isArray(payload?.worlds) ? payload.worlds : [];
  const worldUpdates = [];

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
      return true;
    }
    if (scope === 'global') {
      const root = path[0];
      if (!root) return false;
      if (path.length === 1) {
        globals[root] = value;
        return true;
      }
      const next = cloneValue(globals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      globals[root] = base;
      return true;
    }
    if (scope === 'local') {
      const root = path[0];
      if (!root) return false;
      if (path.length === 1) {
        locals[root] = value;
        return true;
      }
      const next = cloneValue(locals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      locals[root] = base;
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

  const getChatMessagesList = () => Array.isArray(context?.messages) ? context.messages : [];

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
    const world = resolveWorldData(worlds, worldMeta, targetWorld);
    const entry = findWorldEntry(world, targetTitle);
    const content = String(entry?.content || '');
    if (payload && typeof payload === 'object') {
      const nextContext = { ...(context || {}), data: payload };
      const nextRuntime = { ...runtime, context: nextContext };
      const res = renderTemplateWithRuntime(content, nextRuntime);
      return String(res.text ?? '');
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
    const world = resolveWorldData(worlds, worldMeta, targetWorld);
    if (!world || !Array.isArray(world.entries)) return null;
    const entry = findWorldEntry(world, targetTitle);
    if (!entry) return null;
    entry.disable = false;
    if (forceFlag) entry.constant = true;
    worldUpdates.push({
      worldId: String(world?.id || world?.name || ''),
      uid: entry?.uid,
      id: entry?.id,
      comment: entry?.comment,
      title: entry?.title,
      disable: entry?.disable,
      constant: entry?.constant,
    });
    return true;
  };

  const runtime = {
    getvar: readVar,
    getVar: readVar,
    setvar: setVar,
    setVar,
    incvar: incVar,
    decvar: decVar,
    define,
    print: (...args) => {
      runtime.__printBuffer = runtime.__printBuffer || [];
      runtime.__printBuffer.push(args.join(''));
    },
    getChatMessage,
    getChatMessages,
    getwi,
    getWorldInfo: getwi,
    activewi,
    activateWorldInfo: activewi,
    getchar: () => payload?.character || { name: '', description: '' },
    getChara: () => payload?.character || { name: '', description: '' },
    getpreset: () => payload?.preset || { name: '' },
    getPresetPrompt: () => payload?.preset || { name: '' },
    getContext: () => payload?.context || {},
    context: context || {},
    globals,
    locals,
    initials,
    messages: context?.messages || [],
    user: context?.user || {},
    character: payload?.character || context?.character || {},
    session: context?.session || {},
  };

  Object.entries(shared.defines || {}).forEach(([key, value]) => {
    runtime[key] = value;
  });

  return {
    runtime,
    globals,
    locals,
    initials,
    msgVars,
    defines: shared.defines,
    worldUpdates,
  };
};

self.onmessage = (event) => {
  const msg = event?.data || {};
  if (msg.type !== 'render') return;
  const id = msg.id;
  try {
    const payload = msg.payload || {};
    const resultLimit = Number.isFinite(Number(payload.resultLimit)) ? Number(payload.resultLimit) : DEFAULT_RESULT_LIMIT;
    const chunkSize = Number.isFinite(Number(payload.chunkSize)) ? Number(payload.chunkSize) : DEFAULT_CHUNK_SIZE;
    let sentSize = 0;
    const emitChunk = (chunk) => {
      const text = String(chunk || '');
      if (!text) return;
      sentSize += text.length;
      if (sentSize > resultLimit) {
        throw new Error('模板结果过大');
      }
      self.postMessage({ type: 'render_chunk', id, chunk: text });
    };
    const pack = createRuntime(payload);
    if (payload.chunked) {
      pack.runtime.__emit = emitChunk;
      pack.runtime.__chunkLimit = chunkSize;
    }
    const result = renderTemplateWithRuntime(payload.template || '', pack.runtime);
    const output = result.text;
    const printBuffer = pack.runtime.__printBuffer;
    const finalText = Array.isArray(printBuffer) && printBuffer.length
      ? String(output || '') + String(printBuffer.join(''))
      : output;
    if (payload.chunked && finalText) emitChunk(finalText);
    let totalSize = 0;
    const addSize = (value) => {
      totalSize += estimateSize(value);
      if (totalSize > resultLimit) {
        throw new Error('模板结果过大');
      }
    };
    if (!payload.chunked) addSize(finalText);
    addSize(pack.globals);
    addSize(pack.locals);
    addSize(pack.initials);
    addSize(pack.msgVars);
    addSize(pack.defines);
    if (pack.worldUpdates && pack.worldUpdates.length) addSize(pack.worldUpdates);
    self.postMessage({
      type: 'render_result',
      id,
      result: {
        text: payload.chunked ? '' : String(finalText ?? ''),
        error: result.error ? String(result.error?.message || result.error) : '',
        globals: pack.globals,
        locals: pack.locals,
        initials: pack.initials,
        messageVars: pack.msgVars,
        defines: pack.defines,
        worldUpdates: pack.worldUpdates,
        chunked: Boolean(payload.chunked),
      },
    });
  } catch (err) {
    self.postMessage({ type: 'render_error', id, error: String(err?.message || err || 'unknown error') });
  }
};
//# sourceURL=${TEMPLATE_WORKER_SOURCE_URL}
`;

const buildScriptErrorExcerpt = (source, line = 0, col = 0) => {
  try {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const idx = Math.max(0, Number(line || 1) - 1);
    const prev = lines[idx - 1] || '';
    const cur = lines[idx] || '';
    const next = lines[idx + 1] || '';
    return [
      prev ? `prev=${truncateText(prev, 240)}` : '',
      cur ? `line=${truncateText(cur, 240)}` : '',
      next ? `next=${truncateText(next, 240)}` : '',
      col ? `col=${Number(col || 0)}` : '',
    ].filter(Boolean).join(' ');
  } catch {
    return '';
  }
};

const parseWorkerSyntaxLocation = (err) => {
  try {
    const stack = String(err?.stack || err?.message || '');
    const m = stack.match(/<anonymous>:(\d+):(\d+)/) || stack.match(/:(\d+):(\d+)/);
    return {
      line: m ? Number(m[1] || 0) : 0,
      col: m ? Number(m[2] || 0) : 0,
    };
  } catch {
    return { line: 0, col: 0 };
  }
};

const validateTemplateWorkerScript = (source) => {
  try {
    // Parse the generated worker script before spawning a blob worker so syntax
    // regressions do not surface as opaque blob runtime errors on Android.
    new Function(String(source || ''));
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err || 'worker-parse-failed'));
  }
};

class TemplateWorker {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.seq = 0;
    this.start();
  }

  start() {
    if (typeof Worker === 'undefined') return;
    try {
      const source = buildTemplateWorkerScript();
      const syntaxErr = validateTemplateWorkerScript(source);
      if (syntaxErr) {
        const loc = parseWorkerSyntaxLocation(syntaxErr);
        const excerpt = buildScriptErrorExcerpt(source, loc.line, loc.col);
        logger.error('template worker source invalid', syntaxErr, excerpt);
        emitDebugLog({
          source: 'template',
          type: 'error',
          message: `template-worker-source-invalid ${String(syntaxErr?.message || syntaxErr)}${excerpt ? ` ${excerpt}` : ''}`,
          force: true,
        });
        this.worker = null;
        return;
      }
      const blob = new Blob([source], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = (e) => this.handleMessage(e?.data || {});
      this.worker.onerror = (event) => {
        logger.warn('template worker onerror', {
          message: String(event?.message || ''),
          filename: String(event?.filename || ''),
          lineno: Number(event?.lineno || 0),
          colno: Number(event?.colno || 0),
        });
        emitDebugLog({
          source: 'template',
          type: 'warn',
          message: `template-worker-onerror ${String(event?.message || 'worker error')} file=${String(event?.filename || '')} line=${Number(event?.lineno || 0)} col=${Number(event?.colno || 0)}`,
          force: true,
        });
        this.restart('模板 Worker 异常重启');
      };
    } catch (err) {
      logger.warn('template worker start failed', err);
      this.worker = null;
    }
  }

  restart(reason = '模板 Worker 已重启') {
    try {
      this.worker?.terminate?.();
    } catch {}
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
    this.start();
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'render_chunk') {
      const pending = this.pending.get(msg.id);
      if (!pending || !pending.chunked) return;
      const chunk = String(msg.chunk || '');
      if (!chunk) return;
      pending.totalSize += chunk.length;
      if (pending.totalSize > pending.resultLimit) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        pending.reject(new Error('模板结果过大'));
        this.restart('模板结果过大，Worker 已重启');
        return;
      }
      pending.chunks.push(chunk);
      return;
    }
    if (msg.type !== 'render_result' && msg.type !== 'render_error') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'render_error') {
      pending.reject(new Error(msg.error || 'template worker error'));
      return;
    }
    const result = msg.result || {};
    let text = String(result.text || '');
    if (pending.chunked) {
      const chunks = pending.chunks || [];
      if (text) chunks.push(text);
      text = chunks.join('');
    }
    pending.resolve({ ...result, text });
  }

  render(payload, timeoutMs = TEMPLATE_TIMEOUT_MS) {
    if (!this.worker) return Promise.reject(new Error('template worker unavailable'));
    const id = `${Date.now()}-${++this.seq}`;
    const chunked = payload?.chunked === true;
    const resultLimit = Number.isFinite(Number(payload?.resultLimit))
      ? Number(payload.resultLimit)
      : TEMPLATE_PAYLOAD_LIMIT;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('template worker timeout'));
        this.restart('模板执行超时，已重启 Worker');
      }, timeoutMs);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        chunked,
        resultLimit,
        totalSize: 0,
        chunks: [],
      });
      this.worker.postMessage({ type: 'render', id, payload });
    });
  }
}

const getTemplateWorker = () => {
  if (!templateWorkerInstance) {
    templateWorkerInstance = new TemplateWorker();
  }
  return templateWorkerInstance;
};

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
  src += 'const __emit = typeof ctx.__emit === "function" ? ctx.__emit : null;\n';
  src += 'const __chunkLimit = typeof ctx.__chunkLimit === "number" ? ctx.__chunkLimit : 0;\n';
  src += 'const __flush = () => { if (!__emit || !__chunkLimit) return; if (__out.length >= __chunkLimit) { __emit(__out); __out = ""; } };\n';
  src += 'const __outLimit = typeof ctx.__outLimit === "number" ? ctx.__outLimit : ' + TEMPLATE_OUTPUT_LIMIT + ';\n';
  src += 'const __ensureOut = () => { if (__out.length > __outLimit) throw new Error("模板输出过大"); };\n';
  src += 'const print = (...args) => { __out += args.join(""); __ensureOut(); __flush(); };\n';
  src += 'const __escape = __esc;\n';
  src += 'const __guard = ctx.__guard;\n';
  src += 'if (__guard) __guard();\n';
  const guardLine = '__guard && __guard();\n';
  template.replace(re, (match, flag, code, index) => {
    const text = template.slice(cursor, index);
    if (text) src += '__out += ' + JSON.stringify(text) + ';\n__ensureOut();\n__flush();\n';
    if (flag === '#') {
      // comment, ignore
    } else if (flag === '=') {
      src += guardLine;
      src += '__out += __escape((' + code + ') ?? "");\n__ensureOut();\n__flush();\n';
    } else if (flag === '-') {
      src += guardLine;
      src += '__out += ((' + code + ') ?? "");\n__ensureOut();\n__flush();\n';
    } else {
      src += guardLine;
      src += code + '\n';
      src += '__flush();\n';
    }
    cursor = index + match.length;
    return '';
  });
  const rest = template.slice(cursor);
  if (rest) src += '__out += ' + JSON.stringify(rest) + ';\n__ensureOut();\n__flush();\n';
  src += 'return __out;';
  const fn = new Function('ctx', '__esc', 'with (ctx) {\n' + src + '\n}');
  if (templateCache.size >= CACHE_LIMIT) {
    const first = templateCache.keys().next().value;
    if (first) templateCache.delete(first);
  }
  templateCache.set(template, fn);
  return fn;
};

const createRuntime = ({ chatStore, sessionId, messageVars, initialVars, state, context, readOnly = false }) => {
  const sourceGlobals = chatStore?.listGlobalVariables?.() || {};
  const sourceLocals = chatStore?.listVariables?.(sessionId) || {};
  const sourceInitials = initialVars || chatStore?.listInitialVariables?.(sessionId) || {};
  const sourceMessageVars = messageVars || {};
  const globals = readOnly ? cloneValue(sourceGlobals) : sourceGlobals;
  const locals = readOnly ? cloneValue(sourceLocals) : sourceLocals;
  const initials = readOnly ? cloneValue(sourceInitials) : sourceInitials;
  const msgVars = readOnly ? cloneValue(sourceMessageVars) : sourceMessageVars;
  const runtimeContext = readOnly ? cloneValue(context || {}) : (context || {});
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
      if (!readOnly && chatStore?.setInitialVariable) {
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
        if (!readOnly) chatStore?.setGlobalVariable?.(root, value);
        return true;
      }
      const next = cloneValue(globals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      globals[root] = base;
      if (!readOnly) chatStore?.setGlobalVariable?.(root, base);
      return true;
    }
    if (scope === 'local') {
      const root = path[0];
      if (!root) return false;
      if (path.length === 1) {
        locals[root] = value;
        if (!readOnly) chatStore?.setVariable?.(root, value, sessionId);
        return true;
      }
      const next = cloneValue(locals[root]);
      const base = (next && typeof next === 'object') ? next : {};
      setByPath(base, path.slice(1), value);
      locals[root] = base;
      if (!readOnly) chatStore?.setVariable?.(root, base, sessionId);
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
    const loadWorld = (id) => {
      const loaded = appBridge.worldStore?.load?.(id) || null;
      return readOnly && loaded ? cloneValue(loaded) : loaded;
    };
    const name = String(nameRaw || '').trim();
    if (name) {
      return loadWorld(name);
    }
    const current = String(appBridge.currentWorldId || '').trim();
    if (current) return loadWorld(current);
    const globalId = String(appBridge.globalWorldId || '').trim();
    if (globalId) return loadWorld(globalId);
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
          context: { ...runtimeContext, data: payload },
          state: shared,
          readOnly,
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
      if (!readOnly && worldId && appBridge?.worldStore?.save) {
        appBridge.worldStore.save(worldId, { ...worldData, entries: worldData.entries });
      }
    } catch {}
    return entry;
  };

  const getchar = (name) => {
    const char = runtimeContext?.character || {};
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
    context: runtimeContext,
    globals,
    locals,
    initials,
    messages: runtimeContext?.messages || [],
    user: runtimeContext?.user || {},
    character: runtimeContext?.character || {},
    session: runtimeContext?.session || {},
  };

  Object.entries(shared.defines || {}).forEach(([key, value]) => {
    runtime[key] = value;
  });

  return { runtime, messageVars: msgVars, shared };
};

const createRuntimeSnapshot = ({ chatStore, sessionId, messageVars, initialVars, state, context } = {}) => {
  const globals = chatStore?.listGlobalVariables?.() || {};
  const locals = chatStore?.listVariables?.(sessionId) || {};
  const initials = initialVars || chatStore?.listInitialVariables?.(sessionId) || {};
  const msgVars = messageVars || {};
  const shared = state || { defines: Object.create(null) };
  return {
    globals: cloneValue(globals),
    locals: cloneValue(locals),
    initials: cloneValue(initials),
    messageVars: cloneValue(msgVars),
    defines: cloneValue(shared.defines || {}),
    context: context || {},
  };
};

const sanitizeContextForWorker = (context) => {
  if (!context || typeof context !== 'object') return {};
  const pickKeys = ['session', 'user', 'character', 'messages', 'data', 'meta', 'worldIds', 'worldId', 'preset'];
  const out = {};
  pickKeys.forEach((key) => {
    if (context[key] !== undefined) out[key] = cloneValue(context[key]);
  });
  return out;
};

const buildWorldSnapshot = (context) => {
  const appBridge = (typeof window !== 'undefined' && window.appBridge) ? window.appBridge : null;
  const worldStore = appBridge?.worldStore;
  if (!worldStore?.load) return { worlds: [], worldMeta: {} };
  const ids = new Set();
  const resolved = appBridge?.getResolvedWorldState?.(appBridge?.activeSessionId, {
    uiMode: String(context?.meta?.uiMode || context?.uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat',
    groupMemberIds: Array.isArray(context?.group?.members) ? context.group.members : [],
    isGroupChat: Boolean(context?.session?.isGroup) || String(context?.session?.id || '').startsWith('group:'),
  }) || null;
  const list = Array.isArray(resolved?.worldIds) && resolved.worldIds.length
    ? resolved.worldIds
    : (Array.isArray(appBridge?.currentWorldIds) ? appBridge.currentWorldIds : []);
  const currentId = String(appBridge?.currentWorldId || '').trim();
  const globalId = String(appBridge?.globalWorldId || '').trim();
  if (currentId) ids.add(currentId);
  if (globalId) ids.add(globalId);
  list.forEach(id => {
    const key = String(id || '').trim();
    if (key) ids.add(key);
  });
  const allIds = typeof worldStore.list === 'function' ? worldStore.list() : [];
  if (Array.isArray(allIds) && allIds.length > 0 && allIds.length <= 6) {
    allIds.forEach(id => {
      const key = String(id || '').trim();
      if (key) ids.add(key);
    });
  }
  const worlds = [];
  ids.forEach((id) => {
    const raw = worldStore.load(id);
    if (!raw || typeof raw !== 'object') return;
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    worlds.push({
      id: String(raw.name || id || ''),
      name: String(raw.name || id || ''),
      entries: entries.map(entry => ({
        uid: entry?.uid,
        id: entry?.id,
        comment: entry?.comment,
        title: entry?.title,
        content: entry?.content,
        disable: entry?.disable,
        constant: entry?.constant,
      })),
    });
  });
  return {
    worlds,
    worldMeta: {
      currentWorldId: currentId,
      globalWorldId: globalId,
    },
  };
};

const applyVariableUpdates = ({ chatStore, sessionId, before, after, scope } = {}) => {
  if (!chatStore || !scope) return;
  const beforeVars = before && typeof before === 'object' ? before : {};
  const afterVars = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(beforeVars), ...Object.keys(afterVars)]);
  const isSame = (a, b) => {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return a === b;
    }
  };
  keys.forEach((key) => {
    const beforeVal = beforeVars[key];
    const hasAfter = Object.prototype.hasOwnProperty.call(afterVars, key);
    const afterVal = afterVars[key];
    if (hasAfter && isSame(beforeVal, afterVal)) return;
    if (!hasAfter) {
      if (scope === 'global' && typeof chatStore.deleteGlobalVariable === 'function') {
        chatStore.deleteGlobalVariable(key);
      } else if (scope === 'local' && typeof chatStore.deleteVariable === 'function') {
        chatStore.deleteVariable(key, sessionId);
      }
      return;
    }
    if (scope === 'global') {
      chatStore.setGlobalVariable?.(key, afterVal);
    } else if (scope === 'local') {
      chatStore.setVariable?.(key, afterVal, sessionId);
    } else if (scope === 'initial') {
      chatStore.setInitialVariable?.(key, afterVal, sessionId);
    }
  });
};

const applyWorldUpdates = (updates = []) => {
  const appBridge = (typeof window !== 'undefined' && window.appBridge) ? window.appBridge : null;
  const worldStore = appBridge?.worldStore;
  if (!worldStore?.load || !worldStore?.save) return;
  const grouped = new Map();
  (Array.isArray(updates) ? updates : []).forEach(update => {
    const worldId = String(update?.worldId || '').trim();
    if (!worldId) return;
    if (!grouped.has(worldId)) grouped.set(worldId, []);
    grouped.get(worldId).push(update);
  });
  grouped.forEach((list, worldId) => {
    const world = worldStore.load(worldId);
    if (!world || !Array.isArray(world.entries)) return;
    let mutated = false;
    list.forEach(update => {
      const entries = world.entries;
      const match = entries.find(entry => {
        if (update?.uid != null && Number(entry?.uid) === Number(update.uid)) return true;
        if (update?.id != null && String(entry?.id || '') === String(update.id)) return true;
        const comment = String(entry?.comment || entry?.title || '').trim();
        const target = String(update?.comment || update?.title || '').trim();
        if (comment && target && comment === target) return true;
        return false;
      });
      if (!match) return;
      if (update?.disable !== undefined) match.disable = update.disable;
      if (update?.constant !== undefined) match.constant = update.constant;
      mutated = true;
    });
    if (mutated) {
      worldStore.save(worldId, { ...world, entries: world.entries });
    }
  });
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
    readOnly: options.readOnly === true,
  });
  const startAt = nowMs();
  const timeoutMs = TEMPLATE_TIMEOUT_MS;
  const hasTemplate = template.includes('<%');
  if (runtimePack?.runtime) {
    runtimePack.runtime.__guardCount = 0;
    runtimePack.runtime.__guardLimit = TEMPLATE_GUARD_LIMIT;
    runtimePack.runtime.__outLimit = TEMPLATE_OUTPUT_LIMIT;
    runtimePack.runtime.__guard = () => {
      const elapsed = nowMs() - startAt;
      runtimePack.runtime.__guardCount += 1;
      if (runtimePack.runtime.__guardCount > runtimePack.runtime.__guardLimit) {
        const err = new Error(`模板执行超过最大步数（>${runtimePack.runtime.__guardLimit}）`);
        err.code = 'TEMPLATE_LOOP';
        throw err;
      }
      if (elapsed > timeoutMs) {
        const err = new Error(`模板执行超时（>${timeoutMs}ms）`);
        err.code = 'TEMPLATE_TIMEOUT';
        throw err;
      }
    };
  }
  const result = renderTemplate(template, runtimePack);
  const durationMs = Math.round(nowMs() - startAt);
  if (hasTemplate || result.error) {
    recordTemplateExecution({
      stage,
      sessionId: options.sessionId || '',
      input: template,
      output: result.text,
      error: result.error ? (result.error?.message || String(result.error)) : '',
      durationMs,
    });
  }
  if (result.error) {
    logger.warn('template render failed', result.error);
    emitDebugLog({
      message: `模板执行失败(${stage}): ${result.error?.message || result.error}`,
      type: 'error',
      source: 'template',
    });
    notifyError(result.error, stage);
  }
  return {
    text: result.text,
    error: result.error,
    messageVars: runtimePack.messageVars,
    state: runtimePack.shared,
  };
};

export const renderTemplateTextAsync = async (rawText, options = {}) => {
  const template = String(rawText ?? '');
  const stage = String(options.stage || '').trim().toLowerCase() || 'render';
  const state = options.state || { defines: Object.create(null) };
  if (!template.includes('<%')) {
    return {
      text: template,
      error: null,
      messageVars: options.messageVars || {},
      state,
    };
  }
  const startAt = nowMs();
  const safeContext = sanitizeContextForWorker(options.context);
  const snapshot = createRuntimeSnapshot({
    chatStore: options.chatStore,
    sessionId: options.sessionId,
    messageVars: options.messageVars,
    initialVars: options.initialVars,
    state,
    context: safeContext,
  });
  const { worlds, worldMeta } = buildWorldSnapshot(safeContext);
  const payload = {
    template,
    globals: snapshot.globals,
    locals: snapshot.locals,
    initials: snapshot.initials,
    messageVars: snapshot.messageVars,
    defines: snapshot.defines,
    context: snapshot.context,
    worlds,
    worldMeta,
    character: safeContext?.character,
    preset: safeContext?.preset,
  };
  if (stage === 'render') {
    payload.chunked = true;
    payload.chunkSize = TEMPLATE_RENDER_CHUNK_SIZE;
    payload.resultLimit = TEMPLATE_RENDER_RESULT_LIMIT;
  }
  const payloadSize = estimatePayloadSize(payload);
  if (payloadSize > TEMPLATE_PAYLOAD_LIMIT) {
    const err = new Error('模板上下文过大，已跳过执行');
    logger.warn('template payload too large, skip worker', { size: payloadSize });
    emitDebugLog({ message: '模板上下文过大，已跳过执行', type: 'warn', source: 'template' });
    recordTemplateExecution({
      stage,
      sessionId: options.sessionId || '',
      input: template,
      output: template,
      error: err.message,
      durationMs: null,
    });
    return { text: template, error: err, messageVars: options.messageVars || {}, state };
  }
  try {
    const worker = getTemplateWorker();
    const result = await worker.render(payload, TEMPLATE_TIMEOUT_MS);
    const durationMs = Math.round(nowMs() - startAt);
    if (options.readOnly !== true && result?.globals && options.chatStore) {
      applyVariableUpdates({
        chatStore: options.chatStore,
        sessionId: options.sessionId,
        before: snapshot.globals,
        after: result.globals,
        scope: 'global',
      });
    }
    if (options.readOnly !== true && result?.locals && options.chatStore) {
      applyVariableUpdates({
        chatStore: options.chatStore,
        sessionId: options.sessionId,
        before: snapshot.locals,
        after: result.locals,
        scope: 'local',
      });
    }
    if (options.readOnly !== true && result?.initials && options.chatStore) {
      applyVariableUpdates({
        chatStore: options.chatStore,
        sessionId: options.sessionId,
        before: snapshot.initials,
        after: result.initials,
        scope: 'initial',
      });
    }
    if (options.readOnly !== true && Array.isArray(result?.worldUpdates) && result.worldUpdates.length) {
      applyWorldUpdates(result.worldUpdates);
    }
    if (state && result?.defines && typeof result.defines === 'object') {
      state.defines = { ...result.defines };
    }
    const errorText = result?.error ? String(result.error || '') : '';
    if (errorText) {
      const err = new Error(errorText);
      logger.warn('template render failed', err);
      emitDebugLog({
        message: `模板执行失败(${stage}): ${errorText}`,
        type: 'error',
        source: 'template',
      });
      notifyError(err, stage);
      recordTemplateExecution({
        stage,
        sessionId: options.sessionId || '',
        input: template,
        output: result.text,
        error: errorText,
        durationMs,
      });
      return {
        text: template,
        error: err,
        messageVars: result?.messageVars || {},
        state,
      };
    }
    recordTemplateExecution({
      stage,
      sessionId: options.sessionId || '',
      input: template,
      output: result.text,
      error: '',
      durationMs,
    });
    return {
      text: String(result?.text ?? ''),
      error: null,
      messageVars: result?.messageVars || {},
      state,
    };
  } catch (err) {
    logger.warn('template worker failed, fallback to sync', err);
    emitDebugLog({
      message: `模板 Worker 失败(${stage}): ${err?.message || err}`,
      type: 'warn',
      source: 'template',
    });
    const msg = String(err?.message || err || '');
    if (msg.includes('timeout') || msg.includes('超时')) {
      notifyError(err, stage);
      recordTemplateExecution({
        stage,
        sessionId: options.sessionId || '',
        input: template,
        output: template,
        error: msg || 'template timeout',
        durationMs: null,
      });
      return {
        text: template,
        error: err,
        messageVars: options.messageVars || {},
        state,
      };
    }
    return renderTemplateText(rawText, options);
  }
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
      return { ...msg, content };
    }
    if (Array.isArray(content)) {
      return { ...msg, content: content.slice() };
    }
    return msg;
  });
  for (let i = 0; i < out.length; i++) {
    const msg = out[i];
    if (!msg || typeof msg !== 'object') continue;
    const content = msg.content;
    if (typeof content === 'string') {
      const res = await renderTemplateTextAsync(content, { ...options, stage, state: shared });
      if (res.error) errors.push(res.error);
      out[i] = { ...msg, content: res.text };
      continue;
    }
    if (Array.isArray(content)) {
      const parts = [];
      for (const part of content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          const res = await renderTemplateTextAsync(part.text, { ...options, stage, state: shared });
          if (res.error) errors.push(res.error);
          parts.push({ ...part, text: res.text });
        } else {
          parts.push(part);
        }
      }
      out[i] = { ...msg, content: parts };
    }
  }
  if (errors.length) {
    logger.warn(`template render encountered ${errors.length} errors`);
    errors.slice(0, 2).forEach(err => notifyError(err, stage));
  }
  return { messages: out, errors };
};

export const templateDebug = {
  getLogs() {
    return templateExecutionLogs.map(entry => ({ ...entry }));
  },
  clearLogs() {
    templateExecutionLogs.length = 0;
  },
};

export const templateSettings = {
  get: getTemplateSettings,
  shouldRun: shouldRunTemplate,
};
