/**
 * Contacts store
 * - 保存已添加的好友/群聊信息
 * - 目前主要用于在「联系人」页渲染所有聊天室入口
 */

import { logger } from '../utils/logger.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const isQuotaError = (err) => {
    try {
        const name = String(err?.name || '');
        const msg = String(err?.message || '');
        return name === 'QuotaExceededError'
            || name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || Number(err?.code) === 22
            || /quota/i.test(msg);
    } catch {
        return false;
    }
};

const getInvoker = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
};

const waitForInvoker = async (timeoutMs = 5000) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g?.__TAURI__) return null;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const inv = getInvoker();
        if (typeof inv === 'function') return inv;
        await new Promise(r => setTimeout(r, 50));
    }
    return null;
};

const safeInvoke = async (cmd, args) => {
    const invoker = getInvoker() || await waitForInvoker();
    if (typeof invoker !== 'function') throw new Error('Tauri invoke not available');
    return invoker(cmd, args);
};

const BASE_STORE_KEY = 'contacts_store_v1';
const LEGACY_MIGRATION_KEY = `${BASE_STORE_KEY}__scoped_migrated`;
const LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT = 220_000;

const readLocalState = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (typeof raw === 'string' && raw.length > LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT) {
            logger.warn('contacts store local bootstrap skipped: oversized localStorage snapshot', {
                key,
                size: raw.length,
                limit: LOCAL_BOOTSTRAP_JSON_SOFT_LIMIT,
            });
            return null;
        }
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const isLegacyMigrated = () => {
    try {
        return localStorage.getItem(LEGACY_MIGRATION_KEY) === '1';
    } catch {
        return false;
    }
};

const markLegacyMigrated = () => {
    try {
        localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
    } catch {}
};

const isScopedDataMatch = (data, scopeId) => {
    try {
        const stored = String(data?.scopeId ?? '').trim();
        if (!stored) return true; // legacy data without scope marker
        return stored === String(scopeId || '').trim();
    } catch {
        return true;
    }
};

const normalizeId = (id) => String(id || '').trim();
const displayNameFromId = (id) => {
    const s = normalizeId(id);
    return s.startsWith('group:') ? s.replace(/^group:/, '') : s;
};

export class ContactsStore {
    constructor({ scopeId = '' } = {}) {
        this.scopeId = normalizeScopeId(scopeId);
        this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
        this._scopeToken = 0;
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
        this._lsDisabled = false;
        this._lsQuotaWarned = false;
        this._hydrateRetryCount = 0;
    }

    _load() {
        const data = readLocalState(this.storeKey);
        if (data && isScopedDataMatch(data, this.scopeId)) {
            if (this.scopeId) markLegacyMigrated();
            return data;
        }
        if (this.scopeId && !isLegacyMigrated()) {
            const legacy = readLocalState(BASE_STORE_KEY);
            if (legacy) {
                markLegacyMigrated();
                return legacy;
            }
        }
        return { contacts: {} };
    }

    async _hydrateFromDisk() {
        const token = this._scopeToken;
        const storeKey = this.storeKey;
        const scopeId = this.scopeId;
        try {
            let kv = await safeInvoke('load_kv', { name: storeKey });
            if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
            if (kv && !isScopedDataMatch(kv, scopeId)) {
                kv = null;
            }
            if (!kv && this.scopeId && !isLegacyMigrated()) {
                const legacy = await safeInvoke('load_kv', { name: BASE_STORE_KEY });
                if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
                if (legacy && legacy.contacts) {
                    kv = legacy;
                    markLegacyMigrated();
                    try {
                        await safeInvoke('save_kv', { name: storeKey, data: legacy });
                    } catch (err) {
                        logger.debug('contacts store legacy migrate failed (可能非 Tauri)', err);
                    }
                }
            }
            if (kv && kv.contacts) {
                if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
                this.state = kv;
                if (this.scopeId) markLegacyMigrated();
                try {
                    localStorage.setItem(storeKey, JSON.stringify({ ...this.state, scopeId }));
                } catch (err) {
                    if (isQuotaError(err)) {
                        this._lsDisabled = true;
                        if (!this._lsQuotaWarned) {
                            this._lsQuotaWarned = true;
                            logger.warn('contacts store: localStorage quota exceeded; will rely on Tauri KV (data should remain after restart).', err);
                        }
                        try { localStorage.removeItem(this.storeKey); } catch {}
                    } else {
                        logger.warn('contacts store hydrate -> localStorage failed', err);
                    }
                }
                logger.info('contacts store hydrated from disk');
                logger.info(
                    `[Persona_test] contactsStore.hydrated scope=${scopeId || 'default'} key=${storeKey} contacts=${
                        Object.keys(this.state.contacts || {}).length
                    }`
                );
                try {
                    window.dispatchEvent(new CustomEvent('store-hydrated', { detail: { store: 'contacts' } }));
                } catch {}
            }
        } catch (err) {
            logger.debug('contacts store disk load skipped (可能非 Tauri)', err);
            try {
                const g = typeof globalThis !== 'undefined' ? globalThis : window;
                const msg = String(err?.message || '');
                const canRetry = Boolean(g?.__TAURI__) && msg.includes('invoke not available');
                if (token === this._scopeToken && canRetry && this._hydrateRetryCount < 3) {
                    const attempt = ++this._hydrateRetryCount;
                    logger.warn(`contacts store hydrate retry scheduled (${attempt}/3)`);
                    setTimeout(() => { this._hydrateFromDisk(); }, 800 * attempt);
                }
            } catch {}
        }
    }

    _persist() {
        // Always try disk first; localStorage is best-effort (may exceed quota due to base64 avatars)
        const payload = { ...this.state, scopeId: this.scopeId };
        safeInvoke('save_kv', { name: this.storeKey, data: payload }).catch((err) => {
            logger.debug('contacts store save_kv failed (可能非 Tauri)', err);
        });
        if (this._lsDisabled) return;
        try {
            localStorage.setItem(this.storeKey, JSON.stringify(payload));
        } catch (err) {
            if (isQuotaError(err)) {
                this._lsDisabled = true;
                if (!this._lsQuotaWarned) {
                    this._lsQuotaWarned = true;
                    logger.warn('contacts store: localStorage quota exceeded; disabling localStorage writes and relying on Tauri KV.', err);
                }
                try { localStorage.removeItem(this.storeKey); } catch {}
            } else {
                logger.warn('contacts store persist -> localStorage failed', err);
            }
        }
    }

    async setScope(scopeId = '') {
        const nextScope = normalizeScopeId(scopeId);
        if (nextScope === this.scopeId) return this.ready;
        const prevScope = this.scopeId;
        const prevKey = this.storeKey;
        logger.info(
            `[Persona_test] contactsStore.setScope begin scope=${prevScope || 'default'} key=${prevKey} -> ${nextScope || 'default'}`
        );
        this._scopeToken += 1;
        this.scopeId = nextScope;
        this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
        this._lsDisabled = false;
        this._lsQuotaWarned = false;
        this._hydrateRetryCount = 0;
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
        const ready = this.ready;
        ready
            .then(() => {
                logger.info(
                    `[Persona_test] contactsStore.setScope ready scope=${this.scopeId || 'default'} key=${this.storeKey} contacts=${
                        Object.keys(this.state.contacts || {}).length
                    }`
                );
            })
            .catch((err) => {
                const msg = String(err?.message || err || '');
                logger.warn(`[Persona_test] contactsStore.setScope hydrate failed scope=${nextScope || 'default'} err=${msg}`);
            });
        return ready;
    }

    listContacts() {
        const list = Object.values(this.state.contacts || {});
        return list.sort((a, b) => {
            const ta = a.addedAt || 0;
            const tb = b.addedAt || 0;
            if (tb !== ta) return tb - ta;
            return String(a.name || a.id).localeCompare(String(b.name || b.id));
        });
    }

    getContact(id) {
        return this.state.contacts[normalizeId(id)] || null;
    }

    upsertContact(contact) {
        const id = normalizeId(contact?.id);
        if (!id) return;
        const prev = this.state.contacts[id] || {};
        const nextMembers = Array.isArray(contact?.members)
            ? contact.members.map(normalizeId).filter(Boolean)
            : Array.isArray(prev?.members)
                ? prev.members.map(normalizeId).filter(Boolean)
                : [];
        this.state.contacts[id] = {
            id,
            name: contact.name ?? prev.name ?? displayNameFromId(id),
            avatar: contact.avatar ?? prev.avatar ?? '',
            isGroup: contact.isGroup ?? prev.isGroup ?? id.startsWith('group:'),
            addedAt: contact.addedAt ?? prev.addedAt ?? Date.now(),
            members: nextMembers,
            description: contact.description ?? prev.description ?? '',
            // 标签（用于显示 name badge；未设置时不影响 UI）
            labels: Array.isArray(contact?.labels)
                ? contact.labels.map(v => String(v || '').trim()).filter(Boolean)
                : Array.isArray(prev?.labels)
                    ? prev.labels.map(v => String(v || '').trim()).filter(Boolean)
                    : [],
            // 角色库标签（用于默认头像色系等；未设置不影响现有逻辑）
            libraryTags: Array.isArray(contact?.libraryTags)
                ? contact.libraryTags.map(v => String(v || '').trim()).filter(Boolean)
                : Array.isArray(prev?.libraryTags)
                    ? prev.libraryTags.map(v => String(v || '').trim()).filter(Boolean)
                    : [],
            // 角色来源信息（角色库自动添加时使用）
            libraryCharacterId: contact.libraryCharacterId ?? prev.libraryCharacterId ?? '',
            source: contact.source ?? prev.source ?? '',
            // 是否为用户自建角色（角色库添加时设为 false）
            isUserCreated: contact.isUserCreated ?? prev.isUserCreated ?? true,
            updatedAt: Date.now(),
        };
        this._persist();
    }

    removeContact(id) {
        delete this.state.contacts[normalizeId(id)];
        this._persist();
    }

    /**
     * 確保所有現有 session 都在联系人里可见（不会覆盖已有资料）
     */
    ensureFromSessions(sessionIds = [], { defaultAvatar = '' } = {}) {
        let changed = false;
        const added = [];
        sessionIds.forEach((sid) => {
            const id = normalizeId(sid);
            if (!id) return;
            if (!this.state.contacts[id]) {
                this.state.contacts[id] = {
                    id,
                    name: displayNameFromId(id),
                    avatar: defaultAvatar,
                    isGroup: id.startsWith('group:'),
                    addedAt: Date.now(),
                    members: [],
                    description: '',
                    updatedAt: Date.now(),
                };
                added.push(id);
                changed = true;
            }
        });
        if (changed) {
            const preview = added.slice(0, 6).join(', ');
            const suffix = added.length > 6 ? '...' : '';
            logger.info(
                `[Persona_test] contactsStore.ensureFromSessions added=${added.length} scope=${this.scopeId || 'default'} ids=${preview}${suffix}`
            );
            this._persist();
        }
    }

    listGroups() {
        return this.listContacts().filter(c => c && c.isGroup);
    }

    listFriends() {
        return this.listContacts().filter(c => c && !c.isGroup);
    }

    /**
     * Find group session id by display name (exact match, normalized).
     */
    findGroupIdByName(name) {
        const raw = String(name || '').trim();
        if (!raw) return '';
        const norm = raw.toLowerCase().replace(/\s+/g, '');
        const list = this.listGroups();
        const exact = list.find(g => String(g?.name || '').trim().toLowerCase().replace(/\s+/g, '') === norm);
        return exact?.id || '';
    }
}
