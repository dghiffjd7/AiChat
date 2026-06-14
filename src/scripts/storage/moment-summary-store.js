import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'moment_summary_store_v1';
const LEGACY_MIGRATION_KEY = `${BASE_STORE_KEY}__scoped_migrated`;

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

const readLocalState = (key) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const clampString = (raw, max = 120_000) => {
    const s = String(raw || '');
    if (!s) return '';
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
};

const normalizeSummaryItem = (it) => {
    if (!it) return null;
    if (typeof it === 'string') {
        const text = String(it || '').trim();
        if (!text) return null;
        return { at: Date.now(), text };
    }
    if (typeof it === 'object') {
        const text = String(it.text || '').trim();
        if (!text) return null;
        const at = Number(it.at || 0) || Date.now();
        return { at, text };
    }
    return null;
};

const normalizeCompactedSummary = (cs) => {
    if (!cs || typeof cs !== 'object') return null;
    const text = String(cs.text || '').trim();
    if (!text) return null;
    const at = Number(cs.at || 0) || Date.now();
    const raw = typeof cs.raw === 'string' ? clampString(cs.raw) : '';
    return { at, text, raw };
};

const normalizeCompactedRaw = (rawObj) => {
    if (!rawObj || typeof rawObj !== 'object') return null;
    const raw = String(rawObj.raw || '').trim();
    if (!raw) return null;
    const at = Number(rawObj.at || 0) || Date.now();
    return { at, raw: clampString(raw) };
};

const makeDefaultState = () => ({
    version: 1,
    summaries: [],
    compactedSummary: null,
    compactedSummaryLastRaw: null,
});

const normalizeState = (input = {}) => {
    const raw = input && typeof input === 'object' ? input : {};
    return {
        version: Number(raw.version || 1) || 1,
        summaries: (Array.isArray(raw.summaries) ? raw.summaries : []).map(normalizeSummaryItem).filter(Boolean),
        compactedSummary: normalizeCompactedSummary(raw.compactedSummary),
        compactedSummaryLastRaw: normalizeCompactedRaw(raw.compactedSummaryLastRaw),
    };
};

export class MomentSummaryStore {
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
            let data = await safeInvoke('load_kv', { name: storeKey });
            if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return this.state;
            if (data && this.scopeId) markLegacyMigrated();
            if (!data && this.scopeId && !isLegacyMigrated()) {
                const legacy = await safeInvoke('load_kv', { name: BASE_STORE_KEY });
                if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return this.state;
                if (legacy && typeof legacy === 'object') {
                    data = legacy;
                    markLegacyMigrated();
                    try {
                        await safeInvoke('save_kv', { name: storeKey, data: legacy });
                    } catch (err) {
                        logger.debug('moment summary store legacy migrate failed (可能非 Tauri)', err);
                    }
                }
            }
            if (!data) {
                data = readLocalState(storeKey);
                if (data && this.scopeId) markLegacyMigrated();
            }
            if (!data && this.scopeId && !isLegacyMigrated()) {
                data = readLocalState(BASE_STORE_KEY);
                if (data) markLegacyMigrated();
            }
            if (!data || typeof data !== 'object') {
                this.state = makeDefaultState();
                this.isLoaded = true;
                return this.state;
            }

            this.state = normalizeState(data);
            this.isLoaded = true;
            return this.state;
        } catch (err) {
            logger.warn('moment summary store load failed, reset', err);
            this.state = makeDefaultState();
            this.isLoaded = true;
            return this.state;
        }
    }

    _persist() {
        try {
            localStorage.setItem(this.storeKey, JSON.stringify(this.state));
        } catch (err) {
            logger.warn('moment summary store persist -> localStorage failed', err);
        }
        safeInvoke('save_kv', { name: this.storeKey, data: this.state }).catch((err) => {
            logger.warn('moment summary store save_kv failed (可能非 Tauri)', err);
        });
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

    getSummaries() {
        const list = Array.isArray(this.state.summaries) ? this.state.summaries : [];
        return list.slice();
    }

    addSummary(summaryText) {
        const text = String(summaryText || '').trim();
        if (!text) return false;
        if (!Array.isArray(this.state.summaries)) this.state.summaries = [];
        this.state.summaries.push({ at: Date.now(), text });
        this._persist();
        return true;
    }

    clearSummaries() {
        this.state.summaries = [];
        this._persist();
        return true;
    }

    setSummaries(items = []) {
        const normalized = (Array.isArray(items) ? items : [])
            .map(normalizeSummaryItem)
            .filter(Boolean);
        this.state.summaries = normalized;
        this._persist();
        return true;
    }

    deleteSummaryItems(items = []) {
        const list = Array.isArray(this.state.summaries) ? this.state.summaries : [];
        const keys = new Set(
            (Array.isArray(items) ? items : []).map((it) => {
                if (!it) return '';
                const at = Number(it.at || 0) || 0;
                const text = String(it.text || '');
                return `${at}|${text}`;
            }).filter(Boolean),
        );
        if (!keys.size) return false;
        const next = list.filter((it) => {
            const at = Number(it?.at || 0) || 0;
            const text = String(it?.text || '');
            return !keys.has(`${at}|${text}`);
        });
        this.state.summaries = next;
        this._persist();
        return true;
    }

    updateSummaryItems(updates = []) {
        const list = Array.isArray(this.state.summaries) ? this.state.summaries : [];
        const map = new Map();
        (Array.isArray(updates) ? updates : []).forEach((u) => {
            if (!u || typeof u !== 'object') return;
            const at = Number(u.at || 0) || 0;
            const fromText = String(u.fromText ?? u.text ?? '');
            const toText = String(u.toText ?? '').trim();
            if (!at || !fromText || !toText) return;
            map.set(`${at}|${fromText}`, toText);
        });
        if (!map.size) return false;
        const next = list.map((it) => {
            const at = Number(it?.at || 0) || 0;
            const text = String(it?.text || '');
            const key = `${at}|${text}`;
            if (!map.has(key)) return it;
            return { at, text: map.get(key) };
        });
        this.state.summaries = next;
        this._persist();
        return true;
    }

    getCompactedSummary() {
        const cs = this.state.compactedSummary;
        if (!cs || typeof cs !== 'object') return null;
        const text = String(cs.text || '').trim();
        if (!text) return null;
        const at = Number(cs.at || 0) || 0;
        const raw = typeof cs.raw === 'string' ? cs.raw : '';
        return { at, text, raw };
    }

    getCompactedSummaryRaw() {
        const cs = this.state.compactedSummary;
        if (cs && typeof cs === 'object' && typeof cs.raw === 'string' && cs.raw.trim()) return cs.raw;
        const lr = this.state.compactedSummaryLastRaw;
        if (lr && typeof lr === 'object' && typeof lr.raw === 'string' && lr.raw.trim()) return lr.raw;
        return '';
    }

    setCompactedSummaryRaw(raw, { at = Date.now() } = {}) {
        const text = String(raw || '').trim();
        if (!text) return false;
        this.state.compactedSummaryLastRaw = { at: Number(at || Date.now()) || Date.now(), raw: clampString(text) };
        this._persist();
        return true;
    }

    setCompactedSummary(summaryText, { at = Date.now(), raw } = {}) {
        const text = String(summaryText || '').trim();
        if (!text) return false;
        const ts = Number(at || Date.now()) || Date.now();
        const rawText = (typeof raw === 'string') ? clampString(raw) : (this.state.compactedSummary?.raw || '');
        this.state.compactedSummary = { at: ts, text, raw: rawText };
        this._persist();
        return true;
    }

    clearCompactedSummary() {
        this.state.compactedSummary = null;
        this.state.compactedSummaryLastRaw = null;
        this._persist();
        return true;
    }

    exportState() {
        return {
            version: Number(this.state.version || 1) || 1,
            summaries: this.getSummaries(),
            compactedSummary: this.getCompactedSummary(),
            compactedSummaryLastRaw: this.state.compactedSummaryLastRaw
                ? { ...this.state.compactedSummaryLastRaw }
                : null,
        };
    }

    importState(state = {}) {
        this.state = normalizeState(state);
        this._persist();
        return this.exportState();
    }
}
