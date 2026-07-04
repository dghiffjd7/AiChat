import { makeScopedKey, normalizeScopeId } from './store-scope.js';

export const MAID_GUIDE_STORE_BASE_KEY = 'maid_guide_store_v1';
export const MAID_GUIDE_STORE_VERSION = 1;

const DEFAULT_MAX_COMPLETED = 300;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const safeNow = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  } catch {
    return Date.now();
  }
};

const readLocalJson = (storage, key = '') => {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (storage, key = '', value = {}) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const removeLocalJson = (storage, key = '') => {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
};

export const buildMaidGuideStoreKey = (scopeId = '') =>
  makeScopedKey(MAID_GUIDE_STORE_BASE_KEY, normalizeScopeId(scopeId));

const normalizeGuideRecord = (guideId = '', raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const id = trim(src.guideId || guideId);
  if (!id) return null;
  const completedAt = Number(src.completedAt);
  return {
    guideId: id,
    featureId: trim(src.featureId),
    title: trim(src.title),
    completedAt: Number.isFinite(completedAt) && completedAt > 0 ? completedAt : safeNow(now),
    count: Math.max(1, Math.trunc(Number(src.count) || 1)),
  };
};

export const normalizeMaidGuideStoreState = (raw = {}, {
  now = Date.now,
  maxCompleted = DEFAULT_MAX_COMPLETED,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const completedRaw = isPlainObject(src.completed) ? src.completed : {};
  const completed = {};
  Object.entries(completedRaw).forEach(([guideId, record]) => {
    const normalized = normalizeGuideRecord(guideId, record, { now });
    if (normalized) completed[normalized.guideId] = normalized;
  });

  const max = Math.max(1, Math.trunc(Number(maxCompleted) || DEFAULT_MAX_COMPLETED));
  const keepIds = Object.values(completed)
    .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0))
    .slice(0, max)
    .map(record => record.guideId);
  const keep = new Set(keepIds);
  Object.keys(completed).forEach((guideId) => {
    if (!keep.has(guideId)) delete completed[guideId];
  });

  return {
    version: MAID_GUIDE_STORE_VERSION,
    updatedAt: Number(src.updatedAt || safeNow(now)) || safeNow(now),
    completed,
  };
};

export class MaidGuideStore {
  constructor({
    scopeId = '',
    storage = globalThis?.localStorage || null,
    loadKv = null,
    saveKv = null,
    now = Date.now,
    maxCompleted = DEFAULT_MAX_COMPLETED,
  } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.storage = storage;
    this.loadKv = typeof loadKv === 'function' ? loadKv : null;
    this.saveKv = typeof saveKv === 'function' ? saveKv : null;
    this.now = typeof now === 'function' ? now : Date.now;
    this.maxCompleted = Math.max(1, Math.trunc(Number(maxCompleted) || DEFAULT_MAX_COMPLETED));
    this.loaded = false;
    this.state = normalizeMaidGuideStoreState({}, {
      now: this.now,
      maxCompleted: this.maxCompleted,
    });
  }

  get storeKey() {
    return buildMaidGuideStoreKey(this.scopeId);
  }

  load() {
    this.state = normalizeMaidGuideStoreState(readLocalJson(this.storage, this.storeKey) || {}, {
      now: this.now,
      maxCompleted: this.maxCompleted,
    });
    this.loaded = true;
    return this.exportState();
  }

  ensureLoaded() {
    if (!this.loaded) this.load();
  }

  // kv 为权威通道（localStorage 配额满时写入静默失败）：取 updatedAt 较新的一侧。
  async hydrate() {
    this.load();
    if (!this.loadKv) return this.exportState();
    try {
      const kvRaw = await this.loadKv(this.storeKey);
      if (kvRaw && typeof kvRaw === 'object' && !kvRaw._tooLarge) {
        const kvState = normalizeMaidGuideStoreState(kvRaw, {
          now: this.now,
          maxCompleted: this.maxCompleted,
        });
        if (Number(kvState.updatedAt || 0) >= Number(this.state.updatedAt || 0)) {
          this.state = kvState;
        }
      }
    } catch {}
    return this.exportState();
  }

  write() {
    this.ensureLoaded();
    this.state.updatedAt = safeNow(this.now);
    const localOk = writeLocalJson(this.storage, this.storeKey, this.state);
    if (this.saveKv) {
      Promise.resolve(this.saveKv(this.storeKey, clone(this.state))).catch(() => {});
      return true;
    }
    return localOk;
  }

  isCompleted(guideId = '') {
    this.ensureLoaded();
    return Boolean(this.state.completed[trim(guideId)]);
  }

  getGuide(guideId = '') {
    this.ensureLoaded();
    const record = this.state.completed[trim(guideId)] || null;
    return record ? clone(record) : null;
  }

  listCompleted() {
    this.ensureLoaded();
    return Object.values(this.state.completed)
      .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0))
      .map(clone);
  }

  markCompleted(guideId = '', details = {}) {
    this.ensureLoaded();
    const id = trim(guideId);
    if (!id) return null;
    const prev = this.state.completed[id] || null;
    const completedAt = safeNow(this.now);
    const record = normalizeGuideRecord(id, {
      ...prev,
      ...(isPlainObject(details) ? details : {}),
      guideId: id,
      completedAt,
      count: Math.max(1, Math.trunc(Number(prev?.count || 0)) + 1),
    }, { now: this.now });
    this.state.completed[id] = record;
    this.write();
    return clone(record);
  }

  resetGuide(guideId = '') {
    this.ensureLoaded();
    const id = trim(guideId);
    if (!id || !this.state.completed[id]) return false;
    delete this.state.completed[id];
    this.write();
    return true;
  }

  resetAll() {
    this.state = normalizeMaidGuideStoreState({}, {
      now: this.now,
      maxCompleted: this.maxCompleted,
    });
    this.loaded = true;
    return removeLocalJson(this.storage, this.storeKey);
  }

  exportState() {
    this.ensureLoaded();
    return clone(this.state);
  }
}
