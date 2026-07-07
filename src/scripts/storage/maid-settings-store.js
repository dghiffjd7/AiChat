import { safeInvoke } from '../utils/tauri.js';
import { DEFAULT_MAID_PROMPT } from '../agent/maid-prompt-defaults.js';

export const MAID_SETTINGS_STORE_KEY = 'maid_settings_store_v1';
export const MAID_SETTINGS_STORE_VERSION = 1;

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

const loadKvDefault = async (key = '') => safeInvoke('load_kv', { name: key });

const saveKvDefault = async (key = '', value = {}) => safeInvoke('save_kv', { name: key, data: value });

const hasExplicitSettings = (raw = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  return Boolean(trim(src.boundProfileId) || trim(src.maidPrompt) || trim(src.personaPrompt));
};

const hasExplicitPrompt = (raw = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  return Boolean(trim(src.maidPrompt) || trim(src.personaPrompt));
};

const readTimestamp = (raw = {}) => {
  const value = Number(isPlainObject(raw) ? raw.updatedAt : 0);
  return Number.isFinite(value) ? value : 0;
};

const trimPersistedText = (value = '', maxLength = 160000) => {
  const text = trim(value);
  const limit = Math.max(0, Number(maxLength) || 0);
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
};

const chooseFieldFromSources = ({
  localRaw = {},
  kvRaw = {},
  localValue = '',
  kvValue = '',
  localHasValue = false,
  kvHasValue = false,
} = {}) => {
  if (localHasValue && kvHasValue) {
    return readTimestamp(kvRaw) >= readTimestamp(localRaw) ? kvValue : localValue;
  }
  if (kvHasValue) return kvValue;
  if (localHasValue) return localValue;
  return '';
};

const toPersistedMaidSettingsState = (state = {}, { now = Date.now } = {}) => {
  const normalized = normalizeMaidSettingsState(state, { now });
  return {
    version: normalized.version,
    updatedAt: normalized.updatedAt,
    boundProfileId: normalized.boundProfileId,
    maidPrompt: normalized.maidPrompt,
    lastRequestPrompt: trimPersistedText(normalized.lastRequestPrompt),
    lastAppContext: trimPersistedText(normalized.lastAppContext, 60000),
    lastFullResponse: trimPersistedText(normalized.lastFullResponse),
    lastExchangeAt: normalized.lastExchangeAt,
    lastExchangeSource: normalized.lastExchangeSource,
  };
};

export const normalizeMaidSettingsState = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const maidPrompt = trim(src.maidPrompt || src.personaPrompt, DEFAULT_MAID_PROMPT);
  return {
    version: MAID_SETTINGS_STORE_VERSION,
    updatedAt: Number(src.updatedAt || safeNow(now)) || safeNow(now),
    boundProfileId: trim(src.boundProfileId),
    maidPrompt,
    personaPrompt: maidPrompt,
    lastRequestPrompt: trim(src.lastRequestPrompt),
    lastAppContext: trim(src.lastAppContext),
    lastFullResponse: trim(src.lastFullResponse),
    lastExchangeAt: Number(src.lastExchangeAt || 0) || 0,
    lastExchangeSource: trim(src.lastExchangeSource),
  };
};

export class MaidSettingsStore {
  constructor({
    storage = globalThis?.localStorage || null,
    loadKv = loadKvDefault,
    saveKv = saveKvDefault,
    now = Date.now,
  } = {}) {
    this.storage = storage;
    this.loadKv = typeof loadKv === 'function' ? loadKv : null;
    this.saveKv = typeof saveKv === 'function' ? saveKv : null;
    this.now = typeof now === 'function' ? now : Date.now;
    this.loaded = false;
    this.state = normalizeMaidSettingsState({}, { now: this.now });
  }

  async load() {
    const localRaw = readLocalJson(this.storage, MAID_SETTINGS_STORE_KEY) || {};
    const localState = normalizeMaidSettingsState(localRaw, {
      now: this.now,
    });
    let kvRaw = null;
    let kvState = null;
    try {
      kvRaw = await this.loadKv?.(MAID_SETTINGS_STORE_KEY);
      if (isPlainObject(kvRaw) && !kvRaw._tooLarge) {
        kvState = normalizeMaidSettingsState(kvRaw, { now: this.now });
      }
    } catch {}

    const localHasSettings = hasExplicitSettings(localRaw);
    const kvHasSettings = hasExplicitSettings(kvRaw);
    const localHasBound = Boolean(trim(localRaw.boundProfileId));
    const kvHasBound = Boolean(trim(kvRaw?.boundProfileId));
    const localHasPrompt = hasExplicitPrompt(localRaw);
    const kvHasPrompt = hasExplicitPrompt(kvRaw);
    const shouldWriteBackup = localHasSettings || kvHasSettings;

    const debugRaw = readTimestamp(kvRaw) >= readTimestamp(localRaw) ? kvRaw : localRaw;

    this.state = normalizeMaidSettingsState({
      updatedAt: Math.max(readTimestamp(localRaw), readTimestamp(kvRaw), safeNow(this.now)),
      boundProfileId: chooseFieldFromSources({
        localRaw,
        kvRaw,
        localValue: localState.boundProfileId,
        kvValue: kvState?.boundProfileId || '',
        localHasValue: localHasBound,
        kvHasValue: kvHasBound,
      }),
      maidPrompt: chooseFieldFromSources({
        localRaw,
        kvRaw,
        localValue: localState.maidPrompt,
        kvValue: kvState?.maidPrompt || '',
        localHasValue: localHasPrompt,
        kvHasValue: kvHasPrompt,
      }) || DEFAULT_MAID_PROMPT,
      lastRequestPrompt: debugRaw?.lastRequestPrompt || '',
      lastAppContext: debugRaw?.lastAppContext || '',
      lastFullResponse: debugRaw?.lastFullResponse || '',
      lastExchangeAt: debugRaw?.lastExchangeAt || 0,
      lastExchangeSource: debugRaw?.lastExchangeSource || '',
    }, { now: this.now });

    if (shouldWriteBackup && this.saveKv) {
      try {
        await this.saveKv(MAID_SETTINGS_STORE_KEY, toPersistedMaidSettingsState(this.state, { now: this.now }));
      } catch {}
    }
    if (shouldWriteBackup) {
      writeLocalJson(this.storage, MAID_SETTINGS_STORE_KEY, toPersistedMaidSettingsState(this.state, { now: this.now }));
    }
    this.loaded = true;
    return this.exportState();
  }

  ensureLoaded() {
    if (!this.loaded) {
      this.state = normalizeMaidSettingsState(readLocalJson(this.storage, MAID_SETTINGS_STORE_KEY) || {}, {
        now: this.now,
      });
      this.loaded = true;
    }
  }

  async write() {
    this.ensureLoaded();
    this.state.updatedAt = safeNow(this.now);
    const persisted = toPersistedMaidSettingsState(this.state, { now: this.now });
    let kvSaved = false;
    try {
      await this.saveKv?.(MAID_SETTINGS_STORE_KEY, persisted);
      kvSaved = Boolean(this.saveKv);
    } catch {}
    const localSaved = writeLocalJson(this.storage, MAID_SETTINGS_STORE_KEY, persisted);
    return kvSaved || localSaved;
  }

  getBoundProfileId() {
    this.ensureLoaded();
    return trim(this.state.boundProfileId);
  }

  // 可选模型覆盖：连接沿用绑定档，仅替换 model；空 = 用档内保存的模型
  getBoundModelOverride() {
    this.ensureLoaded();
    return trim(this.state.boundModelOverride);
  }

  async setBoundModelOverride(model = '') {
    this.ensureLoaded();
    this.state.boundModelOverride = trim(model);
    await this.write();
    return this.getBoundModelOverride();
  }

  getPersonaPrompt() {
    return this.getMaidPrompt();
  }

  getMaidPrompt() {
    this.ensureLoaded();
    return trim(this.state.maidPrompt, DEFAULT_MAID_PROMPT);
  }

  getLastRequestPrompt() {
    this.ensureLoaded();
    return trim(this.state.lastRequestPrompt);
  }

  getLastFullResponse() {
    this.ensureLoaded();
    return trim(this.state.lastFullResponse);
  }

  getLastAppContext() {
    this.ensureLoaded();
    return trim(this.state.lastAppContext);
  }

  getLastExchange() {
    this.ensureLoaded();
    return {
      requestPrompt: trim(this.state.lastRequestPrompt),
      appContext: trim(this.state.lastAppContext),
      fullResponse: trim(this.state.lastFullResponse),
      at: Number(this.state.lastExchangeAt || 0) || 0,
      source: trim(this.state.lastExchangeSource),
    };
  }

  async setBoundProfileId(profileId = '') {
    this.ensureLoaded();
    this.state.boundProfileId = trim(profileId);
    await this.write();
    return this.getBoundProfileId();
  }

  async setPersonaPrompt(personaPrompt = '') {
    return this.setMaidPrompt(personaPrompt);
  }

  async setMaidPrompt(maidPrompt = '') {
    this.ensureLoaded();
    this.state.maidPrompt = trim(maidPrompt, DEFAULT_MAID_PROMPT);
    this.state.personaPrompt = this.state.maidPrompt;
    await this.write();
    return this.getMaidPrompt();
  }

  async savePatch(patch = {}) {
    this.ensureLoaded();
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'boundProfileId')) {
      this.state.boundProfileId = trim(patch.boundProfileId);
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'personaPrompt')) {
      this.state.maidPrompt = trim(patch.personaPrompt, DEFAULT_MAID_PROMPT);
      this.state.personaPrompt = this.state.maidPrompt;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'maidPrompt')) {
      this.state.maidPrompt = trim(patch.maidPrompt, DEFAULT_MAID_PROMPT);
      this.state.personaPrompt = this.state.maidPrompt;
    }
    await this.write();
    return this.exportState();
  }

  setLastExchange({
    requestPrompt = '',
    appContext = '',
    fullResponse = '',
    at = safeNow(this.now),
    source = '',
  } = {}) {
    this.ensureLoaded();
    this.state.lastRequestPrompt = trim(requestPrompt);
    this.state.lastAppContext = trim(appContext);
    this.state.lastFullResponse = trim(fullResponse);
    this.state.lastExchangeAt = Number(at || 0) || safeNow(this.now);
    this.state.lastExchangeSource = trim(source);
    void this.write();
    return this.getLastExchange();
  }

  exportState() {
    this.ensureLoaded();
    return clone(this.state);
  }
}
