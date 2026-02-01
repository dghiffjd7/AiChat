import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'rp_session_v1';

const normalizeGreeting = (item, idx = 0) => {
  const raw = item && typeof item === 'object' ? item : {};
  const id = String(raw.id || '').trim() || `greeting_${idx + 1}`;
  const content = String(raw.content || raw.text || '').trim();
  const title = String(raw.title || raw.name || '').trim();
  return { id, content, title };
};

const normalizeState = (input = {}) => {
  const raw = input && typeof input === 'object' ? input : {};
  const greetingsRaw = Array.isArray(raw.greetings) ? raw.greetings : [];
  const greetings = greetingsRaw.map(normalizeGreeting).filter(g => g.content);
  const activeGreetingId = String(raw.activeGreetingId || '').trim();
  const syncEvents = Array.isArray(raw.syncEvents) ? raw.syncEvents : [];
  return {
    greetings,
    activeGreetingId,
    syncEvents,
  };
};

export class RpSessionStore {
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
      const kv = await safeInvoke('load_kv', { name: storeKey });
      if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
      if (kv && typeof kv === 'object') {
        this.state = normalizeState(kv);
        try {
          localStorage.setItem(storeKey, JSON.stringify(this.state));
        } catch {}
      }
    } catch (err) {
      logger.debug('rp session store hydrate skipped (可能非 Tauri)', err);
    }
  }

  _persist() {
    const payload = normalizeState(this.state);
    this.state = payload;
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(payload));
    } catch {}
    safeInvoke('save_kv', { name: this.storeKey, data: payload }).catch(() => {});
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

  getGreetings() {
    return Array.isArray(this.state.greetings) ? [...this.state.greetings] : [];
  }

  setGreetings(list = [], { activeId = '' } = {}) {
    const greetings = Array.isArray(list) ? list.map(normalizeGreeting).filter(g => g.content) : [];
    this.state.greetings = greetings;
    const nextActive = String(activeId || this.state.activeGreetingId || '').trim();
    this.state.activeGreetingId = greetings.some(g => g.id === nextActive) ? nextActive : (greetings[0]?.id || '');
    this._persist();
    return this.state.activeGreetingId;
  }

  getActiveGreetingId() {
    return String(this.state.activeGreetingId || '').trim();
  }

  setActiveGreeting(id) {
    const next = String(id || '').trim();
    if (!next) return '';
    const list = this.getGreetings();
    if (!list.some(g => g.id === next)) return '';
    this.state.activeGreetingId = next;
    this._persist();
    return next;
  }

  getActiveGreeting() {
    const list = this.getGreetings();
    const id = this.getActiveGreetingId();
    return list.find(g => g.id === id) || list[0] || null;
  }
}
