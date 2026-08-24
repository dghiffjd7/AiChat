import { safeInvoke } from '../utils/tauri.js';

export const VOICE_REGISTRY_STORE_KEY = 'voice_registry_v1';
export const VOICE_REGISTRY_VERSION = 1;
export const VOICE_CONFIG_SCOPES = Object.freeze(['voice_shared', 'voice_tts']);

const trim = value => String(value ?? '').trim();

export const normalizeVoiceRecord = (input = {}) => {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const configRef = raw.configRef && typeof raw.configRef === 'object' && !Array.isArray(raw.configRef)
    ? raw.configRef
    : {};
  const id = trim(raw.id);
  const scope = trim(configRef.scope).toLowerCase();
  const profileId = trim(configRef.profileId);
  const providerSnapshot = trim(raw.providerSnapshot).toLowerCase();
  const voiceId = trim(raw.voiceId);
  if (!id || !VOICE_CONFIG_SCOPES.includes(scope) || !profileId || !providerSnapshot || !voiceId) return null;
  return {
    id,
    label: trim(raw.label) || voiceId,
    configRef: { scope, profileId },
    providerSnapshot,
    voiceId,
    modelOverride: trim(raw.modelOverride),
  };
};

export const normalizeVoiceRegistry = (input = {}) => {
  const rawVoices = Array.isArray(input?.voices) ? input.voices : [];
  const seen = new Set();
  const voices = [];
  rawVoices.forEach((item) => {
    const record = normalizeVoiceRecord(item);
    if (!record || seen.has(record.id)) return;
    seen.add(record.id);
    voices.push(record);
  });
  return { version: VOICE_REGISTRY_VERSION, voices };
};

export const VOICE_USAGE_STORE_KEY = 'voice_usage_v1';

// 使用记录仅本机 localStorage：低价值高频写，不进 KV
export const readVoiceUsage = (storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem?.(VOICE_USAGE_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const usage = {};
    Object.entries(parsed).forEach(([id, value]) => {
      const key = trim(id);
      const ts = Number(value);
      if (key && Number.isFinite(ts) && ts > 0) usage[key] = ts;
    });
    return usage;
  } catch {
    return {};
  }
};

export const markVoiceUsed = (id, {
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) => {
  const key = trim(id);
  if (!key) return false;
  const usage = readVoiceUsage(storage);
  usage[key] = Number(now) || Date.now();
  try {
    storage?.setItem?.(VOICE_USAGE_STORE_KEY, JSON.stringify(usage));
    return true;
  } catch {
    return false;
  }
};

// 快捷位：最近使用优先，不足时按库内顺序补齐
export const listQuickVoices = (voices = [], usage = {}, { limit = 3 } = {}) => {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  const max = Math.max(0, Math.trunc(Number(limit)) || 0);
  const used = list
    .filter(record => Number(usage?.[record.id]) > 0)
    .sort((left, right) => Number(usage[right.id]) - Number(usage[left.id]));
  const rest = list.filter(record => !(Number(usage?.[record.id]) > 0));
  return [...used, ...rest].slice(0, max);
};

const createVoiceId = () => {
  try {
    const randomId = globalThis.crypto?.randomUUID?.();
    if (randomId) return `voice_${randomId}`;
  } catch {}
  return `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const readLocal = (storage, key) => {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLocal = (storage, key, value) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
  } catch {}
};

export class VoiceRegistryStore {
  constructor({
    storageKey = VOICE_REGISTRY_STORE_KEY,
    storage = globalThis.localStorage,
    loadKv = name => safeInvoke('load_kv', { name }),
    saveKv = (name, data) => safeInvoke('save_kv', { name, data }),
  } = {}) {
    this.storageKey = trim(storageKey) || VOICE_REGISTRY_STORE_KEY;
    this.storage = storage;
    this.loadKv = loadKv;
    this.saveKv = saveKv;
    this.state = normalizeVoiceRegistry(readLocal(storage, this.storageKey) || {});
    this.listeners = new Set();
    this.ready = this.hydrate();
  }

  async hydrate() {
    let changed = false;
    try {
      const remote = await this.loadKv?.(this.storageKey);
      if (remote && typeof remote === 'object' && !remote._tooLarge) {
        this.state = normalizeVoiceRegistry(remote);
        writeLocal(this.storage, this.storageKey, this.state);
        changed = true;
      }
    } catch {}
    if (changed) this.notify();
    return this.getState();
  }

  getState() {
    return normalizeVoiceRegistry(this.state);
  }

  list() {
    return this.getState().voices;
  }

  get(id = '') {
    const key = trim(id);
    return this.list().find(item => item.id === key) || null;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => {
      try { listener(this.getState()); } catch {}
    });
  }

  async upsert(input = {}) {
    const candidate = normalizeVoiceRecord({ ...input, id: trim(input?.id) || createVoiceId() });
    if (!candidate) throw new Error('声音名称、Voice ID 与 TTS 连线设置档不能为空');
    const voices = this.list();
    const index = voices.findIndex(item => item.id === candidate.id);
    if (index >= 0) voices[index] = candidate;
    else voices.push(candidate);
    const previous = this.getState();
    this.state = normalizeVoiceRegistry({ version: VOICE_REGISTRY_VERSION, voices });
    try {
      await this.persist();
    } catch (error) {
      this.state = previous;
      writeLocal(this.storage, this.storageKey, previous);
      throw error;
    }
    return this.get(candidate.id);
  }

  async remove(id = '') {
    const key = trim(id);
    if (!key || !this.get(key)) return false;
    const previous = this.getState();
    this.state = normalizeVoiceRegistry({
      version: VOICE_REGISTRY_VERSION,
      voices: this.list().filter(item => item.id !== key),
    });
    try {
      await this.persist();
    } catch (error) {
      this.state = previous;
      writeLocal(this.storage, this.storageKey, previous);
      throw error;
    }
    return true;
  }

  async persist() {
    const snapshot = this.getState();
    writeLocal(this.storage, this.storageKey, snapshot);
    await this.saveKv?.(this.storageKey, snapshot);
    this.notify();
    return snapshot;
  }
}
