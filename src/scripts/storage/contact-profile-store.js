import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import {
  normalizeContactProfile,
  normalizeContactProfileSettings,
} from '../memory/contact-profile-utils.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'contact_profile_store_v1';
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const makeDefaultState = () => ({
  version: 2,
  settings: normalizeContactProfileSettings(),
  profiles: [],
  profileRevisions: Object.create(null),
  pendingUpdates: [],
});

const readLocalState = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLocalState = (key, state) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    logger.warn('contact profile store localStorage save failed', err);
  }
};

const normalizePendingUpdate = (item = {}) => {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim() || `profile-update-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const contactId = String(item.contactId || item.contact_id || '').trim();
  if (!contactId) return null;
  return {
    id,
    contactId,
    status: String(item.status || 'pending').trim() || 'pending',
    reason: String(item.reason || '').trim(),
    createdAt: Number.isFinite(Number(item.createdAt || item.created_at))
      ? Number(item.createdAt || item.created_at)
      : Date.now(),
    updatedAt: Number.isFinite(Number(item.updatedAt || item.updated_at))
      ? Number(item.updatedAt || item.updated_at)
      : Date.now(),
    scopeId: normalizeScopeId(item.scopeId || item.scope_id || item.profile?.scopeId || item.profile?.scope_id),
    baseRevision: Number.isInteger(Number(item.baseRevision ?? item.base_revision)) &&
      Number(item.baseRevision ?? item.base_revision) >= 0
      ? Number(item.baseRevision ?? item.base_revision)
      : null,
    baseExists: typeof (item.baseExists ?? item.base_exists) === 'boolean'
      ? Boolean(item.baseExists ?? item.base_exists)
      : null,
    profile: normalizeContactProfile(item.profile || {}) || null,
    raw: typeof item.raw === 'string' ? item.raw.slice(0, 120000) : '',
  };
};

const normalizeProfileRevisions = (value = {}, profiles = []) => {
  const revisions = Object.create(null);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([contactId, revision]) => {
      const id = String(contactId || '').trim();
      const number = Math.max(0, Math.trunc(Number(revision) || 0));
      if (id && number > 0) revisions[id] = number;
    });
  }
  profiles.forEach((profile) => {
    const contactId = String(profile?.contactId || '').trim();
    if (contactId && !hasOwn(revisions, contactId)) revisions[contactId] = 1;
  });
  return revisions;
};

const normalizeState = (state = {}) => {
  const src = state && typeof state === 'object' ? state : {};
  const profiles = (Array.isArray(src.profiles) ? src.profiles : [])
    .map(normalizeContactProfile)
    .filter(Boolean);
  return {
    version: 2,
    settings: normalizeContactProfileSettings(src.settings),
    profiles,
    profileRevisions: normalizeProfileRevisions(src.profileRevisions, profiles),
    pendingUpdates: (Array.isArray(src.pendingUpdates) ? src.pendingUpdates : [])
      .map(normalizePendingUpdate)
      .filter(Boolean),
  };
};

export class ContactProfileStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
    this._scopeToken = 0;
    this._persistTail = Promise.resolve();
    this.state = makeDefaultState();
    this.isLoaded = false;
    this.ready = this.load();
  }

  async load() {
    if (this.isLoaded) return this.state;
    const token = this._scopeToken;
    const storeKey = this.storeKey;
    const scopeId = this.scopeId;
    try {
      let data = await safeInvoke('load_kv', { name: storeKey }).catch(() => null);
      if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return this.state;
      if (data && typeof data === 'object' && data._tooLarge) data = null;
      if (!data) data = readLocalState(storeKey);
      this.state = normalizeState(data || makeDefaultState());
      this.isLoaded = true;
      return this.state;
    } catch (err) {
      logger.warn('contact profile store load failed, reset', err);
      this.state = makeDefaultState();
      this.isLoaded = true;
      return this.state;
    }
  }

  _persist() {
    const state = normalizeState(this.state);
    const storeKey = this.storeKey;
    const persistedState = clone(state);
    this.state = state;
    writeLocalState(storeKey, state);
    this._persistTail = this._persistTail
      .catch(() => undefined)
      .then(() => safeInvoke('save_kv', { name: storeKey, data: persistedState }))
      .catch((err) => {
        logger.warn('contact profile store save_kv failed', err);
      });
    return this._persistTail;
  }

  whenPersisted() {
    return this._persistTail;
  }

  async setScope(scopeId = '') {
    const nextScope = normalizeScopeId(scopeId);
    if (nextScope === this.scopeId) return this.ready;
    await this.whenPersisted();
    if (nextScope === this.scopeId) return this.ready;
    this._scopeToken += 1;
    this.scopeId = nextScope;
    this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
    this.state = makeDefaultState();
    this.isLoaded = false;
    this.ready = this.load();
    return this.ready;
  }

  getSettings() {
    return normalizeContactProfileSettings(this.state.settings);
  }

  updateSettings(patch = {}) {
    this.state.settings = normalizeContactProfileSettings({
      ...(this.state.settings || {}),
      ...(patch || {}),
    });
    this._persist();
    return this.getSettings();
  }

  listProfiles() {
    return (Array.isArray(this.state.profiles) ? this.state.profiles : [])
      .map(profile => clone(profile));
  }

  getProfile(contactId = '') {
    const id = String(contactId || '').trim();
    if (!id) return null;
    const profile = (Array.isArray(this.state.profiles) ? this.state.profiles : [])
      .find(item => String(item?.contactId || '').trim() === id || String(item?.id || '').trim() === id);
    return profile ? clone(profile) : null;
  }

  getScopeSnapshot() {
    return {
      scopeId: this.scopeId,
      scopeToken: this._scopeToken,
    };
  }

  getProfileSnapshot(contactId = '') {
    const requestedId = String(contactId || '').trim();
    const profile = this.getProfile(requestedId);
    const id = String(profile?.contactId || requestedId).trim();
    const revision = Math.max(0, Math.trunc(Number(this.state.profileRevisions?.[id]) || 0));
    return {
      contactId: id,
      scopeId: this.scopeId,
      scopeToken: this._scopeToken,
      exists: Boolean(profile),
      revision,
      profile,
    };
  }

  _commitNormalizedProfile(normalized, { clearPendingId = '' } = {}) {
    const contactId = String(normalized?.contactId || '').trim();
    if (!contactId) return null;
    const list = Array.isArray(this.state.profiles) ? this.state.profiles.slice() : [];
    const index = list.findIndex(item => String(item?.contactId || '').trim() === contactId);
    if (index >= 0) list[index] = normalized;
    else list.push(normalized);
    this.state.profiles = list;
    const previousRevision = Math.max(
      0,
      Math.trunc(Number(this.state.profileRevisions?.[contactId]) || 0),
    );
    const revisions = normalizeProfileRevisions(this.state.profileRevisions, list);
    revisions[contactId] = previousRevision + 1;
    this.state.profileRevisions = revisions;
    const pendingId = String(clearPendingId || '').trim();
    if (pendingId) {
      this.state.pendingUpdates = (Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : [])
        .filter(item => String(item?.id || '').trim() !== pendingId);
    }
    this._persist();
    return clone(normalized);
  }

  upsertProfile(profile = {}) {
    const normalized = normalizeContactProfile({
      ...(profile || {}),
      scopeId: this.scopeId,
    });
    if (!normalized) return null;
    return this._commitNormalizedProfile(normalized);
  }

  upsertProfileIfUnchanged(profile = {}, expected = {}) {
    const normalized = normalizeContactProfile({
      ...(profile || {}),
      scopeId: this.scopeId,
    });
    if (!normalized?.contactId) {
      return { ok: false, saved: false, conflict: false, reason: 'missing_contact_id' };
    }
    const expectedScopeId = normalizeScopeId(
      hasOwn(expected, 'expectedScopeId') ? expected.expectedScopeId : expected.scopeId,
    );
    const expectedScopeToken = hasOwn(expected, 'expectedScopeToken')
      ? expected.expectedScopeToken
      : expected.scopeToken;
    if (
      (hasOwn(expected, 'expectedScopeId') || hasOwn(expected, 'scopeId')) && expectedScopeId !== this.scopeId
    ) {
      return {
        ok: false,
        saved: false,
        conflict: true,
        reason: 'target_scope_changed',
        latestSnapshot: this.getProfileSnapshot(normalized.contactId),
      };
    }
    if (
      (hasOwn(expected, 'expectedScopeToken') || hasOwn(expected, 'scopeToken')) &&
      Number(expectedScopeToken) !== this._scopeToken
    ) {
      return {
        ok: false,
        saved: false,
        conflict: true,
        reason: 'target_scope_changed',
        latestSnapshot: this.getProfileSnapshot(normalized.contactId),
      };
    }
    const expectedContactId = String(
      hasOwn(expected, 'expectedContactId') ? expected.expectedContactId : expected.contactId || '',
    ).trim();
    if (expectedContactId && expectedContactId !== normalized.contactId) {
      return {
        ok: false,
        saved: false,
        conflict: true,
        reason: 'contact_target_changed',
        latestSnapshot: this.getProfileSnapshot(normalized.contactId),
      };
    }
    const latestSnapshot = this.getProfileSnapshot(normalized.contactId);
    const expectedRevision = hasOwn(expected, 'expectedRevision')
      ? expected.expectedRevision
      : expected.revision;
    if (
      (hasOwn(expected, 'expectedRevision') || hasOwn(expected, 'revision')) &&
      Number(expectedRevision) !== latestSnapshot.revision
    ) {
      return {
        ok: false,
        saved: false,
        conflict: true,
        reason: 'profile_changed_during_operation',
        latestSnapshot,
      };
    }
    const expectedExists = hasOwn(expected, 'expectedExists') ? expected.expectedExists : expected.exists;
    if (
      (hasOwn(expected, 'expectedExists') || hasOwn(expected, 'exists')) &&
      Boolean(expectedExists) !== latestSnapshot.exists
    ) {
      return {
        ok: false,
        saved: false,
        conflict: true,
        reason: 'profile_changed_during_operation',
        latestSnapshot,
      };
    }
    const saved = this._commitNormalizedProfile(normalized, {
      clearPendingId: expected.clearPendingId,
    });
    return {
      ok: Boolean(saved),
      saved: Boolean(saved),
      conflict: false,
      reason: saved ? '' : 'profile_save_failed',
      profile: saved,
      previousSnapshot: latestSnapshot,
      snapshot: saved ? this.getProfileSnapshot(normalized.contactId) : latestSnapshot,
    };
  }

  deleteProfile(contactId = '') {
    const id = String(contactId || '').trim();
    if (!id) return false;
    const list = Array.isArray(this.state.profiles) ? this.state.profiles : [];
    const next = list.filter(item => String(item?.contactId || '').trim() !== id && String(item?.id || '').trim() !== id);
    if (next.length === list.length) return false;
    const removed = list.find(item => !next.includes(item));
    const removedContactId = String(removed?.contactId || id).trim();
    this.state.profiles = next;
    const previousRevision = Math.max(
      0,
      Math.trunc(Number(this.state.profileRevisions?.[removedContactId]) || 0),
    );
    const revisions = normalizeProfileRevisions(this.state.profileRevisions, next);
    revisions[removedContactId] = previousRevision + 1;
    this.state.profileRevisions = revisions;
    this._persist();
    return true;
  }

  listPendingUpdates() {
    return (Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : [])
      .map(item => clone(item));
  }

  addPendingUpdate(update = {}) {
    const normalized = normalizePendingUpdate({
      ...(update || {}),
      scopeId: this.scopeId,
    });
    if (!normalized) return null;
    this.state.pendingUpdates = [
      ...(Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : []),
      normalized,
    ];
    this._persist();
    return clone(normalized);
  }

  addPendingUpdateIfCurrent(update = {}, expected = {}) {
    const expectedScopeId = normalizeScopeId(
      hasOwn(expected, 'expectedScopeId') ? expected.expectedScopeId : expected.scopeId,
    );
    const expectedScopeToken = hasOwn(expected, 'expectedScopeToken')
      ? expected.expectedScopeToken
      : expected.scopeToken;
    if (
      expectedScopeId !== this.scopeId ||
      Number(expectedScopeToken) !== this._scopeToken
    ) {
      return { ok: false, conflict: true, reason: 'target_scope_changed', pending: null };
    }
    const contactId = String(update?.contactId || update?.contact_id || '').trim();
    const latestSnapshot = this.getProfileSnapshot(contactId);
    const expectedRevision = hasOwn(expected, 'expectedRevision')
      ? expected.expectedRevision
      : expected.revision;
    const expectedExists = hasOwn(expected, 'expectedExists')
      ? expected.expectedExists
      : expected.exists;
    if (
      ((hasOwn(expected, 'expectedRevision') || hasOwn(expected, 'revision')) &&
        Number(expectedRevision) !== latestSnapshot.revision) ||
      ((hasOwn(expected, 'expectedExists') || hasOwn(expected, 'exists')) &&
        Boolean(expectedExists) !== latestSnapshot.exists)
    ) {
      return {
        ok: false,
        conflict: true,
        reason: 'profile_changed_during_operation',
        pending: null,
        latestSnapshot,
      };
    }
    const pending = this.addPendingUpdate(update);
    return {
      ok: Boolean(pending),
      conflict: false,
      reason: pending ? '' : 'pending_update_save_failed',
      pending,
    };
  }

  approvePendingUpdate(request = {}) {
    const id = String(typeof request === 'string' ? request : request?.id || '').trim();
    if (!id) return { ok: false, conflict: false, reason: 'missing_id' };
    const pending = (Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : [])
      .find(item => String(item?.id || '').trim() === id);
    if (!pending?.profile) return { ok: false, conflict: false, reason: 'missing_pending_update' };
    const pendingContactId = String(pending.contactId || '').trim();
    const profileContactId = String(pending.profile.contactId || '').trim();
    if (!pendingContactId || profileContactId !== pendingContactId) {
      return { ok: false, conflict: true, reason: 'contact_target_changed' };
    }
    const expected = {
      expectedScopeId: pending.scopeId || this.scopeId,
      expectedContactId: pendingContactId,
      clearPendingId: id,
    };
    if (pending.baseRevision !== null) expected.expectedRevision = pending.baseRevision;
    if (pending.baseExists !== null) expected.expectedExists = pending.baseExists;
    const result = this.upsertProfileIfUnchanged(pending.profile, expected);
    return {
      ...result,
      contactId: pendingContactId,
      pendingUpdateId: id,
    };
  }

  clearPendingUpdate(id = '') {
    const key = String(id || '').trim();
    if (!key) return false;
    const list = Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : [];
    const next = list.filter(item => String(item?.id || '').trim() !== key);
    if (next.length === list.length) return false;
    this.state.pendingUpdates = next;
    this._persist();
    return true;
  }
}
