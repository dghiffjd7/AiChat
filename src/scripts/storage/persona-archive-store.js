import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';
import { resolveLegacyStateTie } from './legacy-state-tie-utils.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'persona_archive_store_v1';
const MAX_ARCHIVES = 80;
const LOCAL_MIGRATION_YIELD_EVERY = 12;
const KV_LOAD_RETRY_DELAYS = [40, 120];
const LEGACY_TIE_BACKUP_SUFFIX = '__legacy_tie_backup_v1';

const getTauriInvoker = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return g?.__TAURI__?.core?.invoke
    || g?.__TAURI__?.invoke
    || g?.__TAURI_INVOKE__
    || g?.__TAURI_INTERNALS__?.invoke;
};

const isPlainRecord = value => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasArchiveStateShape = value => Boolean(
  isPlainRecord(value)
  && !value._tooLarge
  && (
    Object.prototype.hasOwnProperty.call(value, 'archives')
    || Object.prototype.hasOwnProperty.call(value, 'currentArchiveId')
    || Object.prototype.hasOwnProperty.call(value, 'version')
  )
);

const scheduleIdle = runner => {
  if (typeof runner !== 'function') return;
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g?.requestIdleCallback === 'function') {
      g.requestIdleCallback(() => runner(), { timeout: 1_500 });
      return;
    }
  } catch {}
  setTimeout(() => runner(), 600);
};

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const loadKvWithRetry = async key => {
  let lastError = null;
  for (let attempt = 0; attempt <= KV_LOAD_RETRY_DELAYS.length; attempt += 1) {
    try {
      return await safeInvoke('load_kv', { name: key });
    } catch (err) {
      lastError = err;
      if (attempt < KV_LOAD_RETRY_DELAYS.length) await wait(KV_LOAD_RETRY_DELAYS[attempt]);
    }
  }
  throw lastError || new Error('persona archive load_kv failed');
};

const normalizeArchive = (input = {}) => {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id || '').trim();
  if (!id) return null;
  const createdAt = Number(input.createdAt || input.timestamp || 0) || Date.now();
  return {
    version: 1,
    id,
    name: String(input.name || '').trim() || `角色卡存档 ${new Date(createdAt).toLocaleString()}`,
    personaId: String(input.personaId || '').trim(),
    personaName: String(input.personaName || '').trim(),
    createdAt,
    sessionArchives: Array.isArray(input.sessionArchives)
      ? input.sessionArchives.map(item => ({
          sessionId: String(item?.sessionId || '').trim(),
          archiveId: String(item?.archiveId || '').trim(),
          sessionMode: String(item?.sessionMode || '').trim() || 'chat',
          isGroup: Boolean(item?.isGroup),
        })).filter(item => item.sessionId && item.archiveId)
      : [],
    memoryOnlySnapshots: clone(input.memoryOnlySnapshots || [], []),
    globalMemorySnapshot: clone(input.globalMemorySnapshot || null, null),
    momentsSnapshot: clone(input.momentsSnapshot || null, null),
    momentSummarySnapshot: clone(input.momentSummarySnapshot || null, null),
    stats: clone(input.stats || {}, {}),
  };
};

const normalizeState = (raw = {}) => {
  const archives = Array.isArray(raw?.archives)
    ? raw.archives.map(normalizeArchive).filter(Boolean)
    : [];
  archives.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const visibleArchives = archives.slice(0, MAX_ARCHIVES);
  const currentArchiveId = String(raw?.currentArchiveId || '').trim();
  const hasCurrentArchive = currentArchiveId && visibleArchives.some(item => String(item?.id || '').trim() === currentArchiveId);
  return {
    version: 1,
    currentArchiveId: hasCurrentArchive ? currentArchiveId : '',
    archives: visibleArchives,
    updatedAt: Number(raw?.updatedAt || 0) || 0,
  };
};

const isArchiveStateEmpty = state => !Array.isArray(state?.archives) || state.archives.length === 0;

const resolveArchiveLegacyTieOnDisk = async ({ key, localState, kvState }) => {
  const decision = resolveLegacyStateTie({
    local: localState,
    kv: kvState,
    isEmpty: isArchiveStateEmpty,
  });
  if (decision.action === 'keep_blocked') {
    return { resolved: false, state: localState, adopted: '', backedUp: false };
  }
  if (decision.action === 'adopt_kv') {
    return { resolved: true, state: kvState, adopted: 'kv', backedUp: false };
  }
  if (decision.backupRequired) {
    await safeInvoke('save_kv', {
      name: `${key}${LEGACY_TIE_BACKUP_SUFFIX}`,
      data: {
        local: localState,
        kv: kvState,
        resolvedAt: Date.now(),
      },
    });
  }
  await safeInvoke('save_kv', { name: key, data: localState });
  return {
    resolved: true,
    state: localState,
    adopted: 'local',
    backedUp: decision.backupRequired,
  };
};

const listLocalArchiveKeys = () => {
  const storage = globalThis?.localStorage;
  const length = Number(storage?.length || 0);
  if (!storage || !Number.isFinite(length) || length <= 0 || typeof storage.key !== 'function') return [];
  const keys = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(storage.key(index) || '');
    if (key === BASE_STORE_KEY || key.startsWith(`${BASE_STORE_KEY}__`)) keys.push(key);
  }
  return keys;
};

export const migratePersonaArchiveLocalMirrors = async () => {
  const result = {
    scanned: 0,
    removed: 0,
    backfilled: 0,
    retained: 0,
  };
  if (typeof getTauriInvoker() !== 'function') return result;

  const storage = globalThis?.localStorage;
  const keys = listLocalArchiveKeys();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    result.scanned += 1;
    let localState = null;
    try {
      const raw = storage?.getItem?.(key);
      localState = raw ? JSON.parse(raw) : null;
    } catch {}
    if (!hasArchiveStateShape(localState)) {
      result.retained += 1;
      continue;
    }

    let kv = null;
    try {
      kv = await safeInvoke('load_kv', { name: key });
    } catch (err) {
      logger.debug('persona archive local migration read skipped', { key, error: err });
      result.retained += 1;
      continue;
    }

    const normalizedLocal = normalizeState(localState);
    if (hasArchiveStateShape(kv)) {
      const normalizedKv = normalizeState(kv);
      if (JSON.stringify(normalizedKv) !== JSON.stringify(normalizedLocal)) {
        try {
          const resolution = await resolveArchiveLegacyTieOnDisk({
            key,
            localState: normalizedLocal,
            kvState: normalizedKv,
          });
          if (!resolution.resolved) {
            logger.warn('persona archive local/KV conflict retained for recovery', { key });
            result.retained += 1;
            continue;
          }
          logger.info('persona archive legacy tie resolved during local migration', {
            key,
            adopted: resolution.adopted,
            backedUp: resolution.backedUp,
          });
        } catch (err) {
          logger.warn('persona archive legacy tie migration failed; mirror retained', { key, error: err });
          result.retained += 1;
          continue;
        }
      }
    } else if (isPlainRecord(kv) && !Object.keys(kv).length) {
      try {
        await safeInvoke('save_kv', { name: key, data: normalizedLocal });
        result.backfilled += 1;
      } catch (err) {
        logger.debug('persona archive local migration backfill skipped', { key, error: err });
        result.retained += 1;
        continue;
      }
    } else {
      result.retained += 1;
      continue;
    }

    try {
      storage?.removeItem?.(key);
      result.removed += 1;
    } catch {
      result.retained += 1;
    }

    if ((index + 1) % LOCAL_MIGRATION_YIELD_EVERY === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return result;
};

let localArchiveMigrationScheduled = false;
const schedulePersonaArchiveLocalMigration = () => {
  if (localArchiveMigrationScheduled || typeof getTauriInvoker() !== 'function') return;
  localArchiveMigrationScheduled = true;
  scheduleIdle(async () => {
    try {
      const result = await migratePersonaArchiveLocalMirrors();
      if (result.scanned) logger.info('persona archive local migration complete', result);
    } catch (err) {
      logger.warn('persona archive local migration failed', err);
    }
  });
};

export class PersonaArchiveStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
    this._scopeToken = 0;
    this.persistenceBlocked = typeof getTauriInvoker() === 'function';
    this.state = normalizeState(this._load());
    this.ready = this._hydrateFromDisk();
    schedulePersonaArchiveLocalMigration();
  }

  _load() {
    try {
      const raw = localStorage.getItem(this.storeKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async _hydrateFromDisk() {
    const token = this._scopeToken;
    const storeKey = this.storeKey;
    const scopeId = this.scopeId;
    const expectsKv = typeof getTauriInvoker() === 'function';
    if (!expectsKv) {
      this.persistenceBlocked = false;
      return;
    }
    let localState = null;
    try {
      const raw = localStorage.getItem(storeKey);
      localState = raw ? JSON.parse(raw) : null;
    } catch {}
    try {
      const data = await loadKvWithRetry(storeKey);
      if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
      if (hasArchiveStateShape(data)) {
        const normalizedKv = normalizeState(data);
        const normalizedLocal = hasArchiveStateShape(localState) ? normalizeState(localState) : null;
        const statesMatch = normalizedLocal
          && JSON.stringify(normalizedLocal) === JSON.stringify(normalizedKv);
        if (normalizedLocal && normalizedLocal.updatedAt === normalizedKv.updatedAt && !statesMatch) {
          this.state = normalizedLocal;
          try {
            const resolution = await resolveArchiveLegacyTieOnDisk({
              key: storeKey,
              localState: normalizedLocal,
              kvState: normalizedKv,
            });
            if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
            if (!resolution.resolved) {
              this.persistenceBlocked = true;
              logger.warn('persona archive local/KV timestamps tie with different content; writes blocked', {
                key: storeKey,
              });
            } else {
              this.state = resolution.state;
              this.persistenceBlocked = false;
              try { localStorage.removeItem(storeKey); } catch {}
              logger.info('persona archive legacy tie resolved', {
                key: storeKey,
                adopted: resolution.adopted,
                backedUp: resolution.backedUp,
              });
            }
          } catch (err) {
            if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
            this.persistenceBlocked = true;
            logger.warn('persona archive legacy tie recovery failed; mirror retained and writes blocked', {
              key: storeKey,
              error: err,
            });
          }
        } else if (normalizedLocal && normalizedLocal.updatedAt > normalizedKv.updatedAt) {
          try {
            await safeInvoke('save_kv', { name: storeKey, data: normalizedLocal });
            this.state = normalizedLocal;
            this.persistenceBlocked = false;
            try { localStorage.removeItem(storeKey); } catch {}
          } catch (err) {
            this.state = normalizedLocal;
            this.persistenceBlocked = true;
            logger.warn('persona archive newer local recovery could not reach KV; mirror retained and writes blocked', {
              key: storeKey,
              error: err,
            });
          }
        } else {
          this.state = normalizedKv;
          this.persistenceBlocked = false;
          try { localStorage.removeItem(storeKey); } catch {}
        }
      } else if (isPlainRecord(data) && !Object.keys(data).length) {
        const normalizedLocal = normalizeState(localState || this.state);
        if (normalizedLocal.archives.length || normalizedLocal.currentArchiveId) {
          this.state = normalizedLocal;
          try {
            await safeInvoke('save_kv', { name: storeKey, data: normalizedLocal });
            this.persistenceBlocked = false;
            try { localStorage.removeItem(storeKey); } catch {}
          } catch (err) {
            this.persistenceBlocked = true;
            logger.warn('persona archive local recovery could not reach KV; mirror retained and writes blocked', {
              key: storeKey,
              error: err,
            });
          }
        } else {
          this.state = normalizedLocal;
          this.persistenceBlocked = false;
          try { localStorage.removeItem(storeKey); } catch {}
        }
      } else {
        this.persistenceBlocked = true;
        logger.warn('persona archive KV payload is uncertain; writes blocked', { key: storeKey });
      }
    } catch (err) {
      if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
      this.persistenceBlocked = true;
      logger.warn('persona archive KV read failed; writes blocked', { key: storeKey, error: err });
    }
  }

  assertWritable() {
    if (!this.persistenceBlocked) return;
    const error = new Error('角色档案暂时无法读取，已阻止写入以保护现有数据。请重新载入 APP 后重试。');
    error.code = 'persona_archive_store_read_unavailable';
    throw error;
  }

  _persist() {
    this.assertWritable();
    this.state = normalizeState(this.state);
    this.state.updatedAt = Date.now();
    const storeKey = this.storeKey;
    const payload = this.state;
    if (typeof getTauriInvoker() !== 'function') {
      try {
        localStorage.setItem(storeKey, JSON.stringify(payload));
      } catch (err) {
        logger.warn('persona archive store persist -> localStorage failed', err);
      }
      return Promise.resolve(false);
    }
    const persistPromise = safeInvoke('save_kv', { name: storeKey, data: payload })
      .then(() => {
        try { localStorage.removeItem(storeKey); } catch {}
        return true;
      })
      .catch((err) => {
        try { localStorage.setItem(storeKey, JSON.stringify(payload)); } catch {}
        logger.debug('persona archive store save_kv failed; retained local fallback', err);
        return false;
      });
    this._lastPersistPromise = persistPromise;
    return persistPromise;
  }

  async setScope(scopeId = '') {
    const nextScope = normalizeScopeId(scopeId);
    if (nextScope === this.scopeId) return this.ready;
    this._scopeToken += 1;
    this.scopeId = nextScope;
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
    this.persistenceBlocked = typeof getTauriInvoker() === 'function';
    this.state = normalizeState(this._load());
    this.ready = this._hydrateFromDisk();
    return this.ready;
  }

  listArchives() {
    return (this.state.archives || []).map(item => clone(item, item));
  }

  getArchive(id = '') {
    const aid = String(id || '').trim();
    if (!aid) return null;
    const found = (this.state.archives || []).find(item => String(item?.id || '').trim() === aid);
    return found ? clone(found, found) : null;
  }

  getCurrentArchiveId() {
    return String(this.state.currentArchiveId || '').trim();
  }

  setCurrentArchiveId(id = '') {
    const aid = String(id || '').trim();
    if (aid && !(this.state.archives || []).some(item => String(item?.id || '').trim() === aid)) return false;
    if (String(this.state.currentArchiveId || '').trim() === aid) return true;
    this.assertWritable();
    this.state.currentArchiveId = aid;
    this._persist();
    return true;
  }

  clearCurrentArchiveId() {
    return this.setCurrentArchiveId('');
  }

  addArchive(payload = {}) {
    const now = Date.now();
    const archive = normalizeArchive({
      ...payload,
      id: String(payload?.id || '').trim() || `role-archive-${now}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Number(payload?.createdAt || 0) || now,
    });
    if (!archive) return null;
    this.assertWritable();
    const list = (this.state.archives || []).filter(item => String(item?.id || '') !== archive.id);
    list.unshift(archive);
    this.state.archives = list;
    this._persist();
    return clone(archive, archive);
  }

  deleteArchive(id = '') {
    const aid = String(id || '').trim();
    if (!aid) return false;
    const list = this.state.archives || [];
    const next = list.filter(item => String(item?.id || '').trim() !== aid);
    if (next.length === list.length) return false;
    this.assertWritable();
    this.state.archives = next;
    if (String(this.state.currentArchiveId || '').trim() === aid) {
      this.state.currentArchiveId = '';
    }
    this._persist();
    return true;
  }

  exportState() {
    return clone(this.state, { version: 1, currentArchiveId: '', archives: [] });
  }
}
