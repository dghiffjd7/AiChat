// 变量快照存储（C 计划 M1）：与 memory-snapshot-store 同构的内容寻址快照 + refs 可达性 + prune GC。
// 用途：turn-checkpoint 分支的 variableSnapshotId 指向这里的持久快照，供 swipe 回退 / 回滚 / 归档复用。
// 与记忆侧唯一实质区别：payload 是「变量字典」而非记忆行数组，id 前缀 var_。
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';
import { buildTurnCheckpointSessionSuffix, checkpointHashString } from './turn-checkpoint-store.js';

const BASE_REF_KEY = 'variable_snapshot_refs_v1';
const BASE_PAYLOAD_KEY = 'variable_snapshot_payload_v1';
const LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT = 240_000;
const DEFAULT_UNREACHABLE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const clone = value => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value && typeof value === 'object' ? { ...value } : value;
  }
};

const stableSortObject = value => {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stableSortObject(value[key]);
    return acc;
  }, {});
};

const readLocalJson = key => {
  try {
    const raw = globalThis?.localStorage?.getItem?.(key);
    if (!raw || typeof raw !== 'string') return null;
    if (raw.length > LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT) {
      logger.warn('variable snapshot local bootstrap skipped: oversized snapshot', {
        key,
        size: raw.length,
        limit: LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT,
      });
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (key, value) => {
  try {
    const json = JSON.stringify(value);
    if (json.length > LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT) {
      try { globalThis?.localStorage?.removeItem?.(key); } catch {}
      return false;
    }
    globalThis?.localStorage?.setItem?.(key, json);
    return true;
  } catch {
    return false;
  }
};

export const buildVariableSnapshotRefsKey = (scopeId = '', sessionId = '') =>
  makeScopedKey(`${BASE_REF_KEY}__${buildTurnCheckpointSessionSuffix(sessionId)}`, normalizeScopeId(scopeId));

export const buildVariableSnapshotPayloadKey = (scopeId = '', snapshotId = '') =>
  makeScopedKey(`${BASE_PAYLOAD_KEY}__${String(snapshotId || '').trim()}`, normalizeScopeId(scopeId));

export const normalizeVariableSnapshotRecord = (raw = {}, fallback = {}) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const varsRaw = (src.variables && typeof src.variables === 'object' && !Array.isArray(src.variables))
    ? src.variables
    : ((fallback.variables && typeof fallback.variables === 'object' && !Array.isArray(fallback.variables)) ? fallback.variables : {});
  const scopeRaw = String(src.scope || fallback.scope || 'session').trim().toLowerCase();
  return {
    id: String(src.id || fallback.id || '').trim(),
    version: 1,
    sessionId: String(src.sessionId || fallback.sessionId || '').trim(),
    scope: scopeRaw === 'global' ? 'global' : 'session',
    capturedAt: Number(src.capturedAt || fallback.capturedAt || Date.now()) || Date.now(),
    schemaVersion: Number(src.schemaVersion || fallback.schemaVersion || 1) || 1,
    variables: stableSortObject(clone(varsRaw)),
  };
};

export const buildVariableSnapshotSignature = (snapshot = {}) => {
  const normalized = normalizeVariableSnapshotRecord(snapshot);
  const payload = {
    sessionId: normalized.sessionId,
    scope: normalized.scope,
    schemaVersion: normalized.schemaVersion,
    variables: normalized.variables,
  };
  return JSON.stringify(stableSortObject(payload));
};

export const buildVariableSnapshotId = (sessionId = '', snapshot = {}) => {
  const sid = String(sessionId || snapshot?.sessionId || '').trim();
  const signature = buildVariableSnapshotSignature({ ...snapshot, sessionId: sid });
  return `var_${checkpointHashString(`${sid}|${signature}`)}`;
};

const normalizeSnapshotRefs = (sessionId = '', input = {}) => {
  const raw = input && typeof input === 'object' ? input : {};
  const refsRaw = raw.refs && typeof raw.refs === 'object' ? raw.refs : {};
  const refs = {};
  Object.entries(refsRaw).forEach(([snapshotId, entry]) => {
    const id = String(snapshotId || '').trim();
    if (!id) return;
    const src = entry && typeof entry === 'object' ? entry : {};
    refs[id] = {
      snapshotId: id,
      createdAt: Number(src.createdAt || Date.now()) || Date.now(),
      lastReferencedAt: Number(src.lastReferencedAt || src.createdAt || Date.now()) || Date.now(),
      lastUnreachableAt: Number(src.lastUnreachableAt || 0) || 0,
      state: String(src.state || 'reachable').trim() || 'reachable',
    };
  });
  return {
    version: 1,
    sessionId: String(sessionId || raw.sessionId || '').trim(),
    updatedAt: Number(raw.updatedAt || Date.now()) || Date.now(),
    refs,
  };
};

export class VariableSnapshotStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.refsCache = new Map();
    this.refsLoaded = new Set();
    this.refsWriteChains = new Map();
  }

  async setScope(scopeId = '') {
    const next = normalizeScopeId(scopeId);
    if (next === this.scopeId) return;
    this.scopeId = next;
    this.refsCache.clear();
    this.refsLoaded.clear();
    this.refsWriteChains.clear();
  }

  _getRefsKey(sessionId = '') {
    return buildVariableSnapshotRefsKey(this.scopeId, sessionId);
  }

  _getPayloadKey(snapshotId = '') {
    return buildVariableSnapshotPayloadKey(this.scopeId, snapshotId);
  }

  async _loadRefs(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return normalizeSnapshotRefs('', {});
    if (this.refsLoaded.has(sid) && this.refsCache.has(sid)) return this.refsCache.get(sid);
    const key = this._getRefsKey(sid);
    let payload = null;
    try {
      const kv = await safeInvoke('load_kv', { name: key });
      if (kv && typeof kv === 'object' && !kv._tooLarge) payload = kv;
    } catch (err) {
      logger.debug('variable snapshot refs hydrate skipped (可能非 Tauri)', err);
    }
    if (!payload) payload = readLocalJson(key);
    const refs = normalizeSnapshotRefs(sid, payload || {});
    this.refsCache.set(sid, refs);
    this.refsLoaded.add(sid);
    return refs;
  }

  _enqueueRefsWrite(sessionId, task) {
    const sid = String(sessionId || '').trim();
    const prev = this.refsWriteChains.get(sid) || Promise.resolve();
    const next = prev.then(task);
    this.refsWriteChains.set(sid, next.catch(() => {}));
    return next;
  }

  async _persistRefs(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const refs = await this._loadRefs(sid);
    refs.updatedAt = Date.now();
    const key = this._getRefsKey(sid);
    writeLocalJson(key, refs);
    try {
      await safeInvoke('save_kv', { name: key, data: refs });
      return true;
    } catch (err) {
      logger.debug('variable snapshot refs save_kv skipped (可能非 Tauri)', err);
      return false;
    }
  }

  async _savePayload(snapshotId = '', payload = {}) {
    const id = String(snapshotId || '').trim();
    if (!id) return false;
    const key = this._getPayloadKey(id);
    writeLocalJson(key, payload);
    try {
      await safeInvoke('save_kv', { name: key, data: payload });
      return true;
    } catch (err) {
      logger.debug('variable snapshot payload save_kv skipped (可能非 Tauri)', err);
      return false;
    }
  }

  async getSnapshot(snapshotId = '') {
    const id = String(snapshotId || '').trim();
    if (!id) return null;
    const key = this._getPayloadKey(id);
    let payload = null;
    try {
      const kv = await safeInvoke('load_kv', { name: key });
      if (kv && typeof kv === 'object' && !kv._tooLarge) payload = kv;
    } catch (err) {
      logger.debug('variable snapshot payload hydrate skipped (可能非 Tauri)', err);
    }
    if (!payload) payload = readLocalJson(key);
    if (!payload) return null;
    return normalizeVariableSnapshotRecord(payload, { id });
  }

  async persistSnapshot(sessionId = '', snapshot = {}) {
    const sid = String(sessionId || snapshot?.sessionId || '').trim();
    if (!sid) return null;
    const normalized = normalizeVariableSnapshotRecord({ ...snapshot, sessionId: sid });
    const snapshotId = normalized.id || buildVariableSnapshotId(sid, normalized);
    const finalSnapshot = normalizeVariableSnapshotRecord({ ...normalized, id: snapshotId, sessionId: sid });
    await this._savePayload(snapshotId, finalSnapshot);
    await this._loadRefs(sid);
    await this._enqueueRefsWrite(sid, async () => {
      const refs = await this._loadRefs(sid);
      refs.refs[snapshotId] = {
        snapshotId,
        createdAt: refs.refs[snapshotId]?.createdAt || Date.now(),
        lastReferencedAt: Date.now(),
        lastUnreachableAt: 0,
        state: 'reachable',
      };
      await this._persistRefs(sid);
    });
    return { id: snapshotId, snapshot: clone(finalSnapshot) };
  }

  async listSnapshotIds(sessionId = '') {
    const refs = await this._loadRefs(sessionId);
    return Object.keys(refs.refs || {});
  }

  async markReachable(sessionId = '', reachableSnapshotIds = []) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const reachable = new Set((Array.isArray(reachableSnapshotIds) ? reachableSnapshotIds : []).map(id => String(id || '').trim()).filter(Boolean));
    await this._loadRefs(sid);
    return this._enqueueRefsWrite(sid, async () => {
      const refs = await this._loadRefs(sid);
      const now = Date.now();
      Object.values(refs.refs || {}).forEach(ref => {
        const id = String(ref?.snapshotId || '').trim();
        if (!id) return;
        if (reachable.has(id)) {
          ref.state = 'reachable';
          ref.lastReferencedAt = now;
          ref.lastUnreachableAt = 0;
        } else if (ref.state !== 'unreachable') {
          ref.state = 'unreachable';
          ref.lastUnreachableAt = now;
        }
      });
      await this._persistRefs(sid);
      return Object.values(refs.refs || {}).map(ref => clone(ref));
    });
  }

  async pruneUnreachable(sessionId = '', reachableSnapshotIds = [], { graceMs = DEFAULT_UNREACHABLE_GRACE_MS } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    await this.markReachable(sid, reachableSnapshotIds);
    const refs = await this._loadRefs(sid);
    const now = Date.now();
    const cutoff = now - Math.max(0, Number(graceMs ?? DEFAULT_UNREACHABLE_GRACE_MS));
    const removed = [];
    await this._enqueueRefsWrite(sid, async () => {
      const state = await this._loadRefs(sid);
      const entries = Object.values(state.refs || {});
      for (const ref of entries) {
        const id = String(ref?.snapshotId || '').trim();
        if (!id) continue;
        if (ref.state !== 'unreachable') continue;
        const lastUnreachableAt = Number(ref.lastUnreachableAt || 0) || 0;
        if (!lastUnreachableAt || lastUnreachableAt > cutoff) continue;
        const key = this._getPayloadKey(id);
        try {
          globalThis?.localStorage?.removeItem?.(key);
        } catch {}
        try {
          await safeInvoke('save_kv', { name: key, data: null });
        } catch (err) {
          logger.debug('variable snapshot payload prune save_kv skipped (可能非 Tauri)', err);
        }
        delete state.refs[id];
        removed.push(id);
      }
      await this._persistRefs(sid);
    });
    return removed;
  }

  async clearSession(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const refs = await this._loadRefs(sid);
    const snapshotIds = Object.keys(refs?.refs || {});
    for (const snapshotId of snapshotIds) {
      const payloadKey = this._getPayloadKey(snapshotId);
      try {
        globalThis?.localStorage?.removeItem?.(payloadKey);
      } catch {}
      try {
        await safeInvoke('save_kv', { name: payloadKey, data: null });
      } catch (err) {
        logger.debug('variable snapshot payload clear save_kv skipped (可能非 Tauri)', err);
      }
    }
    const refsKey = this._getRefsKey(sid);
    this.refsCache.delete(sid);
    this.refsLoaded.delete(sid);
    this.refsWriteChains.delete(sid);
    try {
      globalThis?.localStorage?.removeItem?.(refsKey);
    } catch {}
    try {
      await safeInvoke('save_kv', { name: refsKey, data: normalizeSnapshotRefs(sid, {}) });
      return true;
    } catch (err) {
      logger.debug('variable snapshot refs clear save_kv skipped (可能非 Tauri)', err);
      return false;
    }
  }

  async renameSession(oldSessionId = '', newSessionId = '') {
    const from = String(oldSessionId || '').trim();
    const to = String(newSessionId || '').trim();
    if (!from || !to || from === to) return false;
    const refs = await this._loadRefs(from);
    const refEntries = Object.values(refs?.refs || {});
    for (const ref of refEntries) {
      const snapshotId = String(ref?.snapshotId || '').trim();
      if (!snapshotId) continue;
      const payload = await this.getSnapshot(snapshotId);
      if (!payload) continue;
      await this._savePayload(snapshotId, normalizeVariableSnapshotRecord({
        ...payload,
        sessionId: to,
        id: snapshotId,
      }));
    }
    const nextState = normalizeSnapshotRefs(to, { ...refs, sessionId: to });
    const nextKey = this._getRefsKey(to);
    writeLocalJson(nextKey, nextState);
    try {
      await safeInvoke('save_kv', { name: nextKey, data: nextState });
    } catch (err) {
      logger.debug('variable snapshot refs rename save_kv skipped (可能非 Tauri)', err);
    }
    this.refsCache.set(to, nextState);
    this.refsLoaded.add(to);
    const oldRefsKey = this._getRefsKey(from);
    this.refsCache.delete(from);
    this.refsLoaded.delete(from);
    this.refsWriteChains.delete(from);
    try {
      globalThis?.localStorage?.removeItem?.(oldRefsKey);
    } catch {}
    try {
      await safeInvoke('save_kv', { name: oldRefsKey, data: normalizeSnapshotRefs(from, {}) });
    } catch (err) {
      logger.debug('variable snapshot refs rename clear save_kv skipped (可能非 Tauri)', err);
    }
    return true;
  }
}
