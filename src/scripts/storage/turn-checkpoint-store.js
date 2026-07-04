import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'turn_checkpoint_v1';
// localStorage 镜像仅作启动缓存（kv 为权威）；镜像键会按会话累积，
// 真机曾把 5MB 配额占满导致所有纯 localStorage 写入静默失败，故压低单键上限。
const LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT = 64_000;
const MAX_BRANCH_TEXT_CHARS = 220_000;
const COMPACT_RECENT_TURNS = 30;
const ALLOWED_CHECKPOINT_STATES = new Set(['provisional', 'final']);
const ALLOWED_REPLY_STATES = new Set(['complete', 'partial_cancelled', 'failed', 'restored']);

const readLocalJson = key => {
  try {
    const raw = globalThis?.localStorage?.getItem?.(key);
    if (!raw || typeof raw !== 'string') return null;
    if (raw.length > LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT) {
      logger.warn('turn checkpoint local bootstrap skipped: oversized snapshot', {
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

export const checkpointHashString = (value = '') => {
  const input = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const buildTurnCheckpointSessionSuffix = (sessionId = '') => {
  const raw = String(sessionId || '').trim();
  const label = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'session';
  return `${label}_${checkpointHashString(raw)}`;
};

export const buildTurnCheckpointStoreKey = (scopeId = '', sessionId = '') =>
  makeScopedKey(`${BASE_STORE_KEY}__${buildTurnCheckpointSessionSuffix(sessionId)}`, normalizeScopeId(scopeId));

const clampText = (value, max = MAX_BRANCH_TEXT_CHARS) => {
  const text = typeof value === 'string' ? value : '';
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
};

const clone = value => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value && typeof value === 'object' ? { ...value } : value;
  }
};

export const normalizeCheckpointPointer = (raw = {}, fallback = {}) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const swipeIndexRaw = Math.trunc(Number(src.tailSwipeIndex ?? src.swipeIndex ?? fallback.tailSwipeIndex ?? 0));
  return {
    version: 1,
    sessionId: String(src.sessionId || fallback.sessionId || '').trim(),
    tailAssistantMessageId: String(src.tailAssistantMessageId || src.assistantMessageId || fallback.tailAssistantMessageId || '').trim(),
    tailSwipeIndex: Number.isFinite(swipeIndexRaw) && swipeIndexRaw >= 0 ? swipeIndexRaw : 0,
    restoredAt: Number(src.restoredAt || src.updatedAt || fallback.restoredAt || Date.now()) || Date.now(),
    source: String(src.source || fallback.source || 'turn_checkpoint').trim() || 'turn_checkpoint',
  };
};

export const normalizeArchivePointer = (raw = {}, fallback = {}) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const swipeIndexRaw = Math.trunc(Number(src.tailSwipeIndex ?? src.swipeIndex ?? fallback.tailSwipeIndex ?? 0));
  return {
    version: 1,
    archiveId: String(src.archiveId || fallback.archiveId || '').trim(),
    sessionId: String(src.sessionId || fallback.sessionId || '').trim(),
    tailAssistantMessageId: String(src.tailAssistantMessageId || src.assistantMessageId || fallback.tailAssistantMessageId || '').trim(),
    tailSwipeIndex: Number.isFinite(swipeIndexRaw) && swipeIndexRaw >= 0 ? swipeIndexRaw : 0,
    memorySnapshotId: String(src.memorySnapshotId || fallback.memorySnapshotId || '').trim(),
    restoredAt: Number(src.restoredAt || src.updatedAt || fallback.restoredAt || Date.now()) || Date.now(),
    source: String(src.source || fallback.source || 'archive_pointer').trim() || 'archive_pointer',
  };
};

export const normalizeCheckpointBranch = (raw = {}, fallback = {}) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const swipeIndexRaw = Math.trunc(Number(src.swipeIndex ?? fallback.swipeIndex ?? 0));
  const stateRaw = String(src.state || fallback.state || 'final').trim().toLowerCase();
  const replyStateRaw = String(src.replyState || fallback.replyState || 'complete').trim().toLowerCase();
  return {
    swipeIndex: Number.isFinite(swipeIndexRaw) && swipeIndexRaw >= 0 ? swipeIndexRaw : 0,
    state: ALLOWED_CHECKPOINT_STATES.has(stateRaw) ? stateRaw : 'final',
    replyState: ALLOWED_REPLY_STATES.has(replyStateRaw) ? replyStateRaw : 'complete',
    messageContent: clampText(src.messageContent ?? src.content ?? fallback.messageContent ?? ''),
    messageRaw: clampText(src.messageRaw ?? src.raw ?? fallback.messageRaw ?? ''),
    memorySnapshotId: String(src.memorySnapshotId || fallback.memorySnapshotId || '').trim(),
    memoryUpdateEntry: clone(src.memoryUpdateEntry ?? fallback.memoryUpdateEntry ?? null),
    createdAt: Number(src.createdAt || fallback.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(src.updatedAt || fallback.updatedAt || Date.now()) || Date.now(),
  };
};

export const normalizeTurnCheckpoint = (raw = {}, fallback = {}) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const branchesRaw = Array.isArray(src.branches)
    ? src.branches
    : (Array.isArray(fallback.branches) ? fallback.branches : []);
  const branches = branchesRaw
    .map((branch, index) => normalizeCheckpointBranch(branch, { swipeIndex: index }))
    .sort((a, b) => a.swipeIndex - b.swipeIndex);
  const activeSwipeRaw = Math.trunc(Number(src.activeSwipeIndex ?? fallback.activeSwipeIndex ?? 0));
  const activeSwipeIndex = Number.isFinite(activeSwipeRaw) && activeSwipeRaw >= 0 ? activeSwipeRaw : 0;
  const stateRaw = String(src.state || fallback.state || 'final').trim().toLowerCase();
  return {
    version: 1,
    sessionId: String(src.sessionId || fallback.sessionId || '').trim(),
    assistantMessageId: String(src.assistantMessageId || fallback.assistantMessageId || '').trim(),
    userMessageId: String(src.userMessageId || fallback.userMessageId || '').trim(),
    turnIndex: Number.isFinite(Number(src.turnIndex)) ? Number(src.turnIndex) : (Number(fallback.turnIndex) || 0),
    aiFloor: Number.isFinite(Number(src.aiFloor)) ? Number(src.aiFloor) : (Number(fallback.aiFloor) || 0),
    createdAt: Number(src.createdAt || fallback.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(src.updatedAt || fallback.updatedAt || Date.now()) || Date.now(),
    deletedAt: Number(src.deletedAt || fallback.deletedAt || 0) || 0,
    activeSwipeIndex,
    state: ALLOWED_CHECKPOINT_STATES.has(stateRaw) ? stateRaw : 'final',
    branches,
  };
};

const normalizeSessionState = (sessionId = '', input = {}) => {
  const raw = input && typeof input === 'object' ? input : {};
  const checkpointsRaw = raw.checkpoints && typeof raw.checkpoints === 'object' ? raw.checkpoints : {};
  const checkpoints = {};
  Object.entries(checkpointsRaw).forEach(([assistantMessageId, checkpoint]) => {
    const key = String(assistantMessageId || '').trim();
    if (!key) return;
    checkpoints[key] = normalizeTurnCheckpoint(checkpoint, { assistantMessageId: key, sessionId });
  });
  return {
    version: 1,
    sessionId: String(sessionId || raw.sessionId || '').trim(),
    updatedAt: Number(raw.updatedAt || Date.now()) || Date.now(),
    baselineSnapshotId: String(raw.baselineSnapshotId || '').trim(),
    baselineCapturedAt: Number(raw.baselineCapturedAt || 0) || 0,
    pointer: normalizeCheckpointPointer(raw.pointer || {}, { sessionId }),
    archivePointers: Object.entries(raw.archivePointers && typeof raw.archivePointers === 'object' ? raw.archivePointers : {})
      .reduce((acc, [archiveId, pointer]) => {
        const aid = String(archiveId || '').trim();
        if (!aid) return acc;
        acc[aid] = normalizeArchivePointer(pointer, { archiveId: aid, sessionId });
        return acc;
      }, {}),
    checkpoints,
  };
};

export const collectCheckpointSnapshotIds = (state = {}) => {
  const ids = new Set();
  const checkpoints = state?.checkpoints && typeof state.checkpoints === 'object' ? state.checkpoints : {};
  Object.values(checkpoints).forEach(checkpoint => {
    const branches = Array.isArray(checkpoint?.branches) ? checkpoint.branches : [];
    branches.forEach(branch => {
      const id = String(branch?.memorySnapshotId || '').trim();
      if (id) ids.add(id);
    });
  });
  const archivePointers = state?.archivePointers && typeof state.archivePointers === 'object' ? state.archivePointers : {};
  Object.values(archivePointers).forEach(pointer => {
    const id = String(pointer?.memorySnapshotId || '').trim();
    if (id) ids.add(id);
  });
  return Array.from(ids);
};

export class TurnCheckpointStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.cache = new Map();
    this.loaded = new Set();
    this.writeChains = new Map();
  }

  async setScope(scopeId = '') {
    const next = normalizeScopeId(scopeId);
    if (next === this.scopeId) return;
    this.scopeId = next;
    this.cache.clear();
    this.loaded.clear();
    this.writeChains.clear();
  }

  _getStoreKey(sessionId = '') {
    return buildTurnCheckpointStoreKey(this.scopeId, sessionId);
  }

  async _loadSession(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return normalizeSessionState('', {});
    if (this.loaded.has(sid) && this.cache.has(sid)) return this.cache.get(sid);
    const key = this._getStoreKey(sid);
    let payload = null;
    try {
      const kv = await safeInvoke('load_kv', { name: key });
      if (kv && typeof kv === 'object' && !kv._tooLarge) payload = kv;
    } catch (err) {
      logger.debug('turn checkpoint store hydrate skipped (可能非 Tauri)', err);
    }
    if (!payload) payload = readLocalJson(key);
    const state = normalizeSessionState(sid, payload || {});
    this.cache.set(sid, state);
    this.loaded.add(sid);
    return state;
  }

  _enqueueWrite(sessionId, task) {
    const sid = String(sessionId || '').trim();
    const prev = this.writeChains.get(sid) || Promise.resolve();
    const next = prev.then(task);
    this.writeChains.set(sid, next.catch(() => {}));
    return next;
  }

  _compactOldBranches(state) {
    const checkpoints = state?.checkpoints;
    if (!checkpoints || typeof checkpoints !== 'object') return;
    const entries = Object.entries(checkpoints);
    if (entries.length <= COMPACT_RECENT_TURNS) return;
    const sorted = entries
      .map(([id, cp]) => ({
        id,
        order: Number(cp.aiFloor || cp.turnIndex || 0) || (Number(cp.createdAt || 0) / 1e10),
      }))
      .sort((a, b) => b.order - a.order);
    for (let i = COMPACT_RECENT_TURNS; i < sorted.length; i += 1) {
      const cp = checkpoints[sorted[i].id];
      if (!cp || !Array.isArray(cp.branches)) continue;
      for (const branch of cp.branches) {
        if (!branch) continue;
        if (branch.messageContent) branch.messageContent = '';
        if (branch.messageRaw) branch.messageRaw = '';
      }
    }
  }

  async _persistSession(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const state = await this._loadSession(sid);
    state.updatedAt = Date.now();
    this._compactOldBranches(state);
    const key = this._getStoreKey(sid);
    writeLocalJson(key, state);
    try {
      await safeInvoke('save_kv', { name: key, data: state });
      return true;
    } catch (err) {
      logger.debug('turn checkpoint store save_kv skipped (可能非 Tauri)', err);
      return false;
    }
  }

  async getSessionState(sessionId = '') {
    const state = await this._loadSession(sessionId);
    return clone(state);
  }

  async listCheckpoints(sessionId = '') {
    const state = await this._loadSession(sessionId);
    return Object.values(state.checkpoints || {}).map(item => clone(item));
  }

  async getCheckpoint(sessionId = '', assistantMessageId = '') {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid) return null;
    const state = await this._loadSession(sid);
    const item = state.checkpoints?.[aid];
    return item ? clone(item) : null;
  }

  async upsertCheckpoint(sessionId = '', checkpoint = {}) {
    const sid = String(sessionId || checkpoint?.sessionId || '').trim();
    if (!sid) return null;
    const normalized = normalizeTurnCheckpoint(checkpoint, { sessionId: sid });
    const aid = String(normalized.assistantMessageId || '').trim();
    if (!aid) return null;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      const existing = state.checkpoints?.[aid] || { sessionId: sid, assistantMessageId: aid };
      const merged = normalizeTurnCheckpoint(
        {
          ...existing,
          ...normalized,
          branches: Array.isArray(normalized.branches) && normalized.branches.length
            ? normalized.branches
            : existing.branches,
        },
        existing,
      );
      state.checkpoints[aid] = merged;
      await this._persistSession(sid);
      return clone(merged);
    });
  }

  async patchCheckpoint(sessionId = '', assistantMessageId = '', updater = null) {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid || typeof updater !== 'function') return null;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      const existing = state.checkpoints?.[aid] || { sessionId: sid, assistantMessageId: aid };
      const draft = clone(existing) || { sessionId: sid, assistantMessageId: aid };
      const nextRaw = await updater(draft);
      if (!nextRaw) return clone(existing);
      const normalized = normalizeTurnCheckpoint(nextRaw, existing);
      state.checkpoints[aid] = normalized;
      await this._persistSession(sid);
      return clone(normalized);
    });
  }

  async removeCheckpoint(sessionId = '', assistantMessageId = '') {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid) return false;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      if (!state.checkpoints?.[aid]) return false;
      delete state.checkpoints[aid];
      if (state.pointer?.tailAssistantMessageId === aid) {
        state.pointer = normalizeCheckpointPointer({}, { sessionId: sid });
      }
      await this._persistSession(sid);
      return true;
    });
  }

  async markCheckpointDeleted(sessionId = '', assistantMessageId = '', deletedAt = Date.now()) {
    return this.patchCheckpoint(sessionId, assistantMessageId, (draft) => ({
      ...draft,
      deletedAt: Number(deletedAt || Date.now()) || Date.now(),
      updatedAt: Date.now(),
    }));
  }

  async getPointer(sessionId = '') {
    const state = await this._loadSession(sessionId);
    return clone(state.pointer);
  }

  async getBaselineSnapshotId(sessionId = '') {
    const state = await this._loadSession(sessionId);
    return String(state?.baselineSnapshotId || '').trim();
  }

  async setBaselineSnapshotId(sessionId = '', snapshotId = '') {
    const sid = String(sessionId || '').trim();
    const id = String(snapshotId || '').trim();
    if (!sid) return '';
    await this._loadSession(sid);
    await this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      state.baselineSnapshotId = id;
      state.baselineCapturedAt = id ? Date.now() : 0;
      await this._persistSession(sid);
    });
    return id;
  }

  async setPointer(sessionId = '', pointer = {}) {
    const sid = String(sessionId || pointer?.sessionId || '').trim();
    if (!sid) return null;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      state.pointer = normalizeCheckpointPointer(pointer, { sessionId: sid });
      await this._persistSession(sid);
      return clone(state.pointer);
    });
  }

  async clearPointer(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    return this.setPointer(sid, { sessionId: sid, tailAssistantMessageId: '', tailSwipeIndex: 0, restoredAt: Date.now() });
  }

  async getArchivePointer(sessionId = '', archiveId = '') {
    const sid = String(sessionId || '').trim();
    const aid = String(archiveId || '').trim();
    if (!sid || !aid) return null;
    const state = await this._loadSession(sid);
    return clone(state?.archivePointers?.[aid] || null);
  }

  async setArchivePointer(sessionId = '', archiveId = '', pointer = {}) {
    const sid = String(sessionId || pointer?.sessionId || '').trim();
    const aid = String(archiveId || pointer?.archiveId || '').trim();
    if (!sid || !aid) return null;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      if (!state.archivePointers || typeof state.archivePointers !== 'object') state.archivePointers = {};
      state.archivePointers[aid] = normalizeArchivePointer(pointer, { sessionId: sid, archiveId: aid });
      await this._persistSession(sid);
      return clone(state.archivePointers[aid]);
    });
  }

  async removeArchivePointer(sessionId = '', archiveId = '') {
    const sid = String(sessionId || '').trim();
    const aid = String(archiveId || '').trim();
    if (!sid || !aid) return false;
    await this._loadSession(sid);
    return this._enqueueWrite(sid, async () => {
      const state = await this._loadSession(sid);
      if (!state.archivePointers?.[aid]) return false;
      delete state.archivePointers[aid];
      await this._persistSession(sid);
      return true;
    });
  }

  async clearSession(sessionId = '') {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const key = this._getStoreKey(sid);
    this.cache.delete(sid);
    this.loaded.delete(sid);
    this.writeChains.delete(sid);
    try {
      globalThis?.localStorage?.removeItem?.(key);
    } catch {}
    try {
      await safeInvoke('save_kv', { name: key, data: normalizeSessionState(sid, {}) });
      return true;
    } catch (err) {
      logger.debug('turn checkpoint store clear save_kv skipped (可能非 Tauri)', err);
      return false;
    }
  }

  async renameSession(oldSessionId = '', newSessionId = '') {
    const from = String(oldSessionId || '').trim();
    const to = String(newSessionId || '').trim();
    if (!from || !to || from === to) return false;
    const state = await this._loadSession(from);
    const checkpointsRaw = state?.checkpoints && typeof state.checkpoints === 'object' ? state.checkpoints : {};
    const checkpoints = {};
    Object.entries(checkpointsRaw).forEach(([assistantMessageId, checkpoint]) => {
      const aid = String(assistantMessageId || '').trim();
      if (!aid) return;
      checkpoints[aid] = normalizeTurnCheckpoint(
        { ...(checkpoint || {}), sessionId: to, assistantMessageId: aid },
        { sessionId: to, assistantMessageId: aid },
      );
    });
    const nextState = normalizeSessionState(to, {
      ...state,
      sessionId: to,
      pointer: normalizeCheckpointPointer(state?.pointer || {}, { sessionId: to }),
      archivePointers: Object.entries(state?.archivePointers && typeof state.archivePointers === 'object' ? state.archivePointers : {})
        .reduce((acc, [archiveId, pointer]) => {
          const aid = String(archiveId || '').trim();
          if (!aid) return acc;
          acc[aid] = normalizeArchivePointer(
            { ...(pointer || {}), archiveId: aid, sessionId: to },
            { archiveId: aid, sessionId: to },
          );
          return acc;
        }, {}),
      checkpoints,
    });
    const nextKey = this._getStoreKey(to);
    writeLocalJson(nextKey, nextState);
    try {
      await safeInvoke('save_kv', { name: nextKey, data: nextState });
    } catch (err) {
      logger.debug('turn checkpoint store rename save_kv skipped (可能非 Tauri)', err);
    }
    this.cache.set(to, nextState);
    this.loaded.add(to);
    await this.clearSession(from);
    return true;
  }
}
