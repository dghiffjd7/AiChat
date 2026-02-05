import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';

const STORE_KEY = 'script_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const readLocalJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const loadKv = async (name) => {
  try {
    const data = await safeInvoke('load_kv', { name });
    if (data && typeof data === 'object') return data;
  } catch (err) {
    logger.debug('script store load_kv skipped (maybe not tauri)', err);
  }
  return null;
};

const saveKv = async (name, data) => {
  try {
    await safeInvoke('save_kv', { name, data });
    return true;
  } catch (err) {
    logger.debug('script store save_kv skipped (maybe not tauri)', err);
    return false;
  }
};

const normalizeScript = (raw = {}, overrides = {}) => {
  const base = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(base.id || overrides.id || genId('script')),
    name: String(base.name || overrides.name || '未命名脚本').trim() || '未命名脚本',
    content: String(base.content || ''),
    info: String(base.info || ''),
    enabled: base.enabled === true,
    authorized: base.authorized === true,
    schemaOnly: base.schemaOnly === true,
    data: base.data && typeof base.data === 'object' ? base.data : {},
    createdAt: Number.isFinite(Number(base.createdAt)) ? Number(base.createdAt) : Date.now(),
    updatedAt: Date.now(),
    source: String(base.source || overrides.source || 'user'),
  };
};

const flattenScriptTrees = (list = []) => {
  const out = [];
  const stack = Array.isArray(list) ? [...list] : [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || 'script');
    if (type === 'folder' && Array.isArray(item.scripts)) {
      stack.push(...item.scripts);
      continue;
    }
    out.push(item);
  }
  return out;
};

const makeDefaultState = () => ({
  version: 1,
  global: {
    scripts: [],
    variables: {},
  },
  character: {},
  preset: {},
});

const ensureScopeBucket = (state, scope, scopeId) => {
  if (scope === 'global') return state.global;
  const bucket = scope === 'character' ? state.character : state.preset;
  const key = String(scopeId || '').trim() || 'default';
  if (!bucket[key]) {
    bucket[key] = { scripts: [], variables: {} };
  }
  return bucket[key];
};

const emitChanged = (detail) => {
  try {
    window.dispatchEvent(new CustomEvent('scripts-changed', { detail }));
  } catch {}
};

export class ScriptStore {
  constructor() {
    this.state = makeDefaultState();
    this.ready = this.load();
  }

  async load() {
    const kv = await loadKv(STORE_KEY);
    let data = kv && typeof kv === 'object' && !kv._tooLarge ? kv : null;
    if (!data) data = readLocalJson(STORE_KEY);
    if (!data || typeof data !== 'object') {
      this.state = makeDefaultState();
      return;
    }
    const next = makeDefaultState();
    if (data.global && typeof data.global === 'object') {
      next.global.scripts = Array.isArray(data.global.scripts) ? data.global.scripts.map(s => normalizeScript(s)) : [];
      next.global.variables = data.global.variables && typeof data.global.variables === 'object' ? data.global.variables : {};
    }
    const normalizeBuckets = (target, source) => {
      if (!source || typeof source !== 'object') return;
      Object.entries(source).forEach(([id, bucket]) => {
        const scoped = bucket && typeof bucket === 'object' ? bucket : {};
        target[id] = {
          scripts: Array.isArray(scoped.scripts) ? scoped.scripts.map(s => normalizeScript(s)) : [],
          variables: scoped.variables && typeof scoped.variables === 'object' ? scoped.variables : {},
        };
      });
    };
    normalizeBuckets(next.character, data.character);
    normalizeBuckets(next.preset, data.preset);
    this.state = next;
  }

  async persist() {
    const payload = clone(this.state);
    const saved = await saveKv(STORE_KEY, payload);
    if (!saved) writeLocalJson(STORE_KEY, payload);
    emitChanged({});
  }

  getScripts(scope = 'global', scopeId = '') {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    return Array.isArray(bucket.scripts) ? bucket.scripts.map(s => clone(s)) : [];
  }

  listScopes() {
    return {
      character: Object.keys(this.state.character || {}),
      preset: Object.keys(this.state.preset || {}),
    };
  }

  async setScripts(scope = 'global', scopeId = '', scripts = []) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    bucket.scripts = Array.isArray(scripts) ? scripts.map(s => normalizeScript(s)) : [];
    await this.persist();
  }

  async upsertScript(scope = 'global', scopeId = '', script = {}, { source = 'user', authorized = true } = {}) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const normalized = normalizeScript({ ...script, source, authorized });
    const idx = bucket.scripts.findIndex(s => s.id === normalized.id);
    if (idx >= 0) bucket.scripts[idx] = normalized;
    else bucket.scripts.push(normalized);
    await this.persist();
    return normalized.id;
  }

  async toggleScript(scope = 'global', scopeId = '', scriptId = '', enabled = false) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const item = bucket.scripts.find(s => s.id === scriptId);
    if (!item) return false;
    item.enabled = Boolean(enabled);
    if (item.enabled) item.authorized = true;
    item.updatedAt = Date.now();
    await this.persist();
    return true;
  }

  async updateScript(scope = 'global', scopeId = '', scriptId = '', patch = {}) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const idx = bucket.scripts.findIndex(s => s.id === scriptId);
    if (idx === -1) return false;
    const next = normalizeScript({ ...bucket.scripts[idx], ...patch });
    bucket.scripts[idx] = next;
    await this.persist();
    return true;
  }

  async updateScriptData(scope = 'global', scopeId = '', scriptId = '', data = {}) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const item = bucket.scripts.find(s => s.id === scriptId);
    if (!item) return false;
    item.data = data && typeof data === 'object' ? data : {};
    item.updatedAt = Date.now();
    await this.persist();
    return true;
  }

  async deleteScript(scope = 'global', scopeId = '', scriptId = '') {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const prev = bucket.scripts.length;
    bucket.scripts = bucket.scripts.filter(s => s.id !== scriptId);
    if (bucket.scripts.length === prev) return false;
    await this.persist();
    return true;
  }

  getActiveScripts({ personaId = '', presetId = '' } = {}) {
    const out = [];
    const push = (scope, scopeId, list) => {
      (list || []).forEach(s => {
        if (!s || s.enabled !== true || s.authorized !== true) return;
        out.push({ ...clone(s), scope, scopeId });
      });
    };
    push('global', 'global', this.state.global?.scripts || []);
    if (personaId) {
      const bucket = this.state.character?.[personaId];
      if (bucket?.scripts) push('character', personaId, bucket.scripts);
    }
    if (presetId) {
      const bucket = this.state.preset?.[presetId];
      if (bucket?.scripts) push('preset', presetId, bucket.scripts);
    }
    return out;
  }

  async importTavernHelperScripts({ scripts = [], scope = 'character', scopeId = '', source = 'card' } = {}) {
    const bucket = ensureScopeBucket(this.state, scope, scopeId);
    const incoming = flattenScriptTrees(scripts).map((item) => {
      const normalized = normalizeScript(item, { source });
      normalized.enabled = false;
      normalized.authorized = false;
      return normalized;
    });
    if (!incoming.length) return { count: 0, ids: [] };
    const existingIds = new Set(bucket.scripts.map(s => s.id));
    incoming.forEach(s => {
      if (existingIds.has(s.id)) {
        s.id = genId('script');
      }
      bucket.scripts.push(s);
    });
    await this.persist();
    return { count: incoming.length, ids: incoming.map(s => s.id) };
  }
}
