import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'persona_archive_store_v1';
const MAX_ARCHIVES = 80;

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
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
  return {
    version: 1,
    archives: archives.slice(0, MAX_ARCHIVES),
  };
};

export class PersonaArchiveStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
    this._scopeToken = 0;
    this.state = normalizeState(this._load());
    this.ready = this._hydrateFromDisk();
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
    try {
      const data = await safeInvoke('load_kv', { name: storeKey });
      if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
      if (data && typeof data === 'object') {
        this.state = normalizeState(data);
        try {
          localStorage.setItem(storeKey, JSON.stringify(this.state));
        } catch {}
      }
    } catch (err) {
      logger.debug('persona archive store hydrate skipped (可能非 Tauri)', err);
    }
  }

  _persist() {
    this.state = normalizeState(this.state);
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(this.state));
    } catch (err) {
      logger.warn('persona archive store persist -> localStorage failed', err);
    }
    safeInvoke('save_kv', { name: this.storeKey, data: this.state }).catch((err) => {
      logger.debug('persona archive store save_kv failed (可能非 Tauri)', err);
    });
  }

  async setScope(scopeId = '') {
    const nextScope = normalizeScopeId(scopeId);
    if (nextScope === this.scopeId) return this.ready;
    this._scopeToken += 1;
    this.scopeId = nextScope;
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
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

  addArchive(payload = {}) {
    const now = Date.now();
    const archive = normalizeArchive({
      ...payload,
      id: String(payload?.id || '').trim() || `role-archive-${now}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Number(payload?.createdAt || 0) || now,
    });
    if (!archive) return null;
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
    this.state.archives = next;
    this._persist();
    return true;
  }

  exportState() {
    return clone(this.state, { version: 1, archives: [] });
  }
}
