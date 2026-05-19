import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import {
  normalizeContactProfile,
  normalizeContactProfileSettings,
} from '../memory/contact-profile-utils.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'contact_profile_store_v1';

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const makeDefaultState = () => ({
  version: 1,
  settings: normalizeContactProfileSettings(),
  profiles: [],
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
    profile: normalizeContactProfile(item.profile || {}) || null,
    raw: typeof item.raw === 'string' ? item.raw.slice(0, 120000) : '',
  };
};

const normalizeState = (state = {}) => {
  const src = state && typeof state === 'object' ? state : {};
  return {
    version: Number(src.version || 1) || 1,
    settings: normalizeContactProfileSettings(src.settings),
    profiles: (Array.isArray(src.profiles) ? src.profiles : [])
      .map(normalizeContactProfile)
      .filter(Boolean),
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
    this.state = state;
    safeInvoke('save_kv', { name: this.storeKey, data: state }).catch((err) => {
      logger.warn('contact profile store save_kv failed', err);
    });
    writeLocalState(this.storeKey, state);
  }

  async setScope(scopeId = '') {
    const nextScope = normalizeScopeId(scopeId);
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

  upsertProfile(profile = {}) {
    const normalized = normalizeContactProfile({
      ...(profile || {}),
      scopeId: profile?.scopeId || profile?.scope_id || this.scopeId,
    });
    if (!normalized) return null;
    const list = Array.isArray(this.state.profiles) ? this.state.profiles.slice() : [];
    const index = list.findIndex(item => String(item?.contactId || '').trim() === normalized.contactId);
    if (index >= 0) list[index] = normalized;
    else list.push(normalized);
    this.state.profiles = list;
    this._persist();
    return clone(normalized);
  }

  deleteProfile(contactId = '') {
    const id = String(contactId || '').trim();
    if (!id) return false;
    const list = Array.isArray(this.state.profiles) ? this.state.profiles : [];
    const next = list.filter(item => String(item?.contactId || '').trim() !== id && String(item?.id || '').trim() !== id);
    if (next.length === list.length) return false;
    this.state.profiles = next;
    this._persist();
    return true;
  }

  listPendingUpdates() {
    return (Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : [])
      .map(item => clone(item));
  }

  addPendingUpdate(update = {}) {
    const normalized = normalizePendingUpdate(update);
    if (!normalized) return null;
    this.state.pendingUpdates = [
      ...(Array.isArray(this.state.pendingUpdates) ? this.state.pendingUpdates : []),
      normalized,
    ];
    this._persist();
    return clone(normalized);
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
