/**
 * Regex Store (SillyTavern-like, scoped)
 * Scopes:
 *  1) global: always applies
 *  2) local: bound to preset/world (auto applies when bound target active)
 *  3) session: per chat session id
 */
import { logger } from '../utils/logger.js';

// ST-like placement enum (subset used by our app too)
export const regex_placement = {
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6,
};

export const substitute_find_regex = {
    NONE: 0,
    RAW: 1,
    ESCAPED: 2,
};

const safeInvoke = async (cmd, args) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const invoker = g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'regex_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const ensureObj = (v, fallback) => (v && typeof v === 'object') ? v : fallback;
const ensureArr = (v) => Array.isArray(v) ? v : [];

const ensureNumOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Normalize a regex script (ST-like)
 * Back-compat: also accepts legacy {when/pattern/flags/replacement} rules and converts.
 */
const normalizeRule = (r = {}) => {
    // Legacy format -> ST-like
    const hasLegacy = ('pattern' in r) || ('when' in r) || ('replacement' in r);
    if (hasLegacy && !('findRegex' in r)) {
        const when = (r.when === 'input' || r.when === 'output' || r.when === 'both') ? r.when : 'both';
        const pattern = String(r.pattern || '');
        const flags = (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags);
        const repl = String(r.replacement ?? '');
        const placement = [];
        if (when === 'input' || when === 'both') placement.push(regex_placement.USER_INPUT);
        if (when === 'output' || when === 'both') placement.push(regex_placement.AI_OUTPUT);
        const findRegex = pattern ? `/${pattern}/${flags}` : '';
        return {
            id: r.id || genId('re'),
            scriptName: String(r.name || '').trim(),
            findRegex,
            replaceString: repl,
            trimStrings: [],
            placement,
            disabled: r.enabled === false,
            markdownOnly: false,
            promptOnly: false,
            runOnEdit: false,
            substituteRegex: substitute_find_regex.NONE,
            minDepth: null,
            maxDepth: null,
        };
    }

    // ST-like format
    const placement = Array.isArray(r.placement) ? r.placement.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    return {
        id: r.id || genId('re'),
        scriptName: String(r.scriptName || r.name || '').trim(),
        findRegex: String(r.findRegex || ''),
        replaceString: String(r.replaceString ?? r.replacement ?? ''),
        trimStrings: Array.isArray(r.trimStrings) ? r.trimStrings.map((s) => String(s || '')).filter(Boolean) : [],
        placement,
        disabled: Boolean(r.disabled),
        markdownOnly: Boolean(r.markdownOnly),
        promptOnly: Boolean(r.promptOnly),
        runOnEdit: Boolean(r.runOnEdit),
        substituteRegex: (r.substituteRegex === 1 || r.substituteRegex === 2) ? Number(r.substituteRegex) : 0,
        minDepth: ensureNumOrNull(r.minDepth),
        maxDepth: ensureNumOrNull(r.maxDepth),
    };
};

const normalizeLocalSet = (s = {}) => ({
    id: s.id || genId('re-set'),
    name: String(s.name || '未命名正则').trim() || '未命名正则',
    enabled: s.enabled !== false,
    // bind: null | { type:'preset', presetType, presetId } | { type:'world', worldId }
    bind: (s.bind && typeof s.bind === 'object') ? s.bind : null,
    rules: ensureArr(s.rules).map(normalizeRule),
    createdAt: s.createdAt || Date.now(),
    updatedAt: Date.now(),
});

const makeDefaultState = () => ({
    version: 1,
    global: {
        enabled: true,
        rules: [],
    },
    local: {
        order: [],
        sets: {},
    },
    session: {}, // sessionId -> { enabled, rules }
});

const matchBind = (bind, ctx) => {
    if (!bind || typeof bind !== 'object') return false;
    const type = bind.type;
    if (type === 'preset') {
        const pt = String(bind.presetType || '');
        const pid = String(bind.presetId || '');
        if (!pt || !pid) return false;
        return String(ctx?.activePresets?.[pt] || '') === pid;
    }
    if (type === 'world') {
        const wid = String(bind.worldId || '');
        if (!wid) return false;
        const primary = String(ctx?.worldId || '');
        if (primary === wid) return true;
        const list = Array.isArray(ctx?.worldIds) ? ctx.worldIds.map(String) : [];
        return list.includes(wid);
    }
    return false;
};

export class RegexStore {
    constructor() {
        this.state = null;
        this.isLoaded = false;
        this.ready = this.load();
    }

    async load() {
        if (this.isLoaded && this.state) return this.state;

        let state = null;
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) state = kv;
        } catch (err) {
            logger.debug('load_kv regex store failed (可能非 Tauri)', err);
        }

        if (!state) {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) state = JSON.parse(raw);
            } catch {}
        }

        if (!state || typeof state !== 'object') {
            state = makeDefaultState();
            await this.persist(state);
        } else {
            state.version = 1;
            state.global = ensureObj(state.global, { enabled: true, rules: [] });
            state.global.enabled = state.global.enabled !== false;
            state.global.rules = ensureArr(state.global.rules).map(normalizeRule);

            state.local = ensureObj(state.local, { order: [], sets: {} });
            state.local.order = ensureArr(state.local.order);
            state.local.sets = ensureObj(state.local.sets, {});

            // normalize sets and order
            const normalizedSets = {};
            for (const [id, s] of Object.entries(state.local.sets)) {
                const next = normalizeLocalSet({ ...s, id });
                normalizedSets[next.id] = next;
            }
            state.local.sets = normalizedSets;
            const existingIds = new Set(Object.keys(state.local.sets));
            state.local.order = state.local.order.filter(id => existingIds.has(id));
            for (const id of existingIds) {
                if (!state.local.order.includes(id)) state.local.order.push(id);
            }

            state.session = ensureObj(state.session, {});
            for (const [sid, v] of Object.entries(state.session)) {
                const obj = ensureObj(v, {});
                state.session[sid] = {
                    enabled: obj.enabled !== false,
                    rules: ensureArr(obj.rules).map(normalizeRule),
                };
            }

            await this.persist(state);
        }

        this.state = state;
        this.isLoaded = true;
        return this.state;
    }

    async persist(next = this.state) {
        this.state = next;
        try {
            await safeInvoke('save_kv', { name: STORE_KEY, data: this.state });
        } catch (err) {
            logger.warn('save_kv regex store failed (可能非 Tauri)，回退 localStorage', err);
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch {}
        }
    }

    getState() {
        return this.state ? clone(this.state) : null;
    }

    /* ---------------- Global ---------------- */
    getGlobal() {
        return clone(this.state?.global || { enabled: true, rules: [] });
    }

    async setGlobal(next) {
        await this.ready;
        this.state.global = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };
        await this.persist();
        return this.getGlobal();
    }

    /* ---------------- Local sets ---------------- */
    listLocalSets() {
        const order = ensureArr(this.state?.local?.order);
        const sets = ensureObj(this.state?.local?.sets, {});
        return order.map(id => sets[id]).filter(Boolean).map(clone);
    }

    getLocalSet(id) {
        const s = this.state?.local?.sets?.[id];
        return s ? clone(s) : null;
    }

    async upsertLocalSet({ id, name, enabled, bind, rules }) {
        await this.ready;
        const next = normalizeLocalSet({ id, name, enabled, bind, rules });
        this.state.local ||= { order: [], sets: {} };
        this.state.local.sets ||= {};
        this.state.local.order ||= [];
        this.state.local.sets[next.id] = next;
        if (!this.state.local.order.includes(next.id)) this.state.local.order.push(next.id);
        await this.persist();
        return next.id;
    }

    async removeLocalSet(id) {
        await this.ready;
        if (!id) return;
        delete this.state?.local?.sets?.[id];
        if (Array.isArray(this.state?.local?.order)) {
            this.state.local.order = this.state.local.order.filter(x => x !== id);
        }
        await this.persist();
    }

    /**
     * Auto-enable preset-bound local sets for the currently active preset,
     * and auto-disable preset-bound sets for inactive presets (same presetType).
     *
     * This matches the product requirement: switching presets automatically switches bound regex.
     */
    async syncPresetBindings(activePresets = {}) {
        await this.ready;
        const sets = ensureObj(this.state?.local?.sets, {});
        let changed = false;
        for (const s of Object.values(sets)) {
            if (!s || typeof s !== 'object') continue;
            const bind = s.bind;
            if (!bind || typeof bind !== 'object' || bind.type !== 'preset') continue;
            const pt = String(bind.presetType || '').trim();
            const pid = String(bind.presetId || '').trim();
            if (!pt || !pid) continue;
            const shouldEnable = String(activePresets?.[pt] || '') === pid;
            if (s.enabled !== shouldEnable) {
                s.enabled = shouldEnable;
                s.updatedAt = Date.now();
                changed = true;
            }
        }
        if (changed) await this.persist();
        return changed;
    }

    async syncWorldBindings(activeWorldIds = []) {
        await this.ready;
        const ids = new Set(
            (Array.isArray(activeWorldIds) ? activeWorldIds : [activeWorldIds])
                .map(v => String(v || '').trim())
                .filter(Boolean),
        );
        const sets = ensureObj(this.state?.local?.sets, {});
        let changed = false;
        for (const s of Object.values(sets)) {
            if (!s || typeof s !== 'object') continue;
            const bind = s.bind;
            if (!bind || typeof bind !== 'object' || bind.type !== 'world') continue;
            const wid = String(bind.worldId || '').trim();
            if (!wid) continue;
            const shouldEnable = ids.has(wid);
            if (s.enabled !== shouldEnable) {
                s.enabled = shouldEnable;
                s.updatedAt = Date.now();
                changed = true;
            }
        }
        if (changed) await this.persist();
        return changed;
    }

    /* ---------------- Session ---------------- */
    getSession(sessionId) {
        const sid = String(sessionId || '');
        if (!sid) return { enabled: true, rules: [] };
        const v = this.state?.session?.[sid];
        if (!v) return { enabled: true, rules: [] };
        return clone(v);
    }

    async setSession(sessionId, next) {
        await this.ready;
        const sid = String(sessionId || '');
        if (!sid) return;
        this.state.session ||= {};
        this.state.session[sid] = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };
        await this.persist();
        return this.getSession(sid);
    }

    /* ---------------- Apply ---------------- */
    computeActiveRules(ctx = {}) {
        const out = [];

        const g = this.state?.global;
        if (g?.enabled !== false) {
            for (const r of ensureArr(g?.rules)) {
                if (!r) continue;
                out.push(r);
            }
        }

        const sets = ensureObj(this.state?.local?.sets, {});
        const order = ensureArr(this.state?.local?.order);
        for (const id of order) {
            const s = sets[id];
            if (!s || s.enabled === false) continue;
            const bind = s.bind;
            // local set without bind: treat as disabled by default (to keep "局部"语义清晰)
            if (!bind) continue;
            if (!matchBind(bind, ctx)) continue;
            for (const r of ensureArr(s.rules)) {
                if (!r) continue;
                out.push(r);
            }
        }

        const sid = String(ctx?.sessionId || '');
        const ses = sid ? this.state?.session?.[sid] : null;
        if (ses?.enabled !== false) {
            for (const r of ensureArr(ses?.rules)) {
                if (!r) continue;
                out.push(r);
            }
        }

        return out.map(normalizeRule);
    }

    regexFromString(input) {
        try {
            const str = String(input ?? '');
            // Same parser as ST: /(\/?)(.+)\1([a-z]*)/i
            const m = str.match(/(\/?)(.+)\1([a-z]*)/i);
            if (!m) return;
            // Invalid flags => let RegExp throw
            if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) {
                return RegExp(str);
            }
            return new RegExp(m[2], m[3]);
        } catch {
            return;
        }
    }

    sanitizeRegexMacro(x) {
        return (x && typeof x === 'string') ?
            x.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, function (s) {
                switch (s) {
                    case '\n': return '\\\\n';
                    case '\r': return '\\\\r';
                    case '\t': return '\\\\t';
                    case '\v': return '\\\\v';
                    case '\f': return '\\\\f';
                    case '\0': return '\\\\0';
                    default: return '\\\\' + s;
                }
            }) : x;
    }

    applyMacros(text, vars, { escape = false } = {}) {
        const raw = String(text ?? '');
        if (!raw) return '';
        const normalizeKey = (val) => String(val || '').trim();
        const toPath = (val) => {
            const rawKey = normalizeKey(val);
            if (!rawKey) return [];
            const bracketed = rawKey.replace(/\[([^\]]+)\]/g, '.$1');
            return bracketed
                .split('.')
                .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
        };
        const getByPath = (obj, key) => {
            const parts = toPath(key);
            if (!parts.length) return undefined;
            let cur = obj;
            for (const part of parts) {
                if (cur === null || cur === undefined) return undefined;
                const idx = /^\d+$/.test(part) ? Number(part) : null;
                if (idx !== null && Array.isArray(cur)) {
                    cur = cur[idx];
                    continue;
                }
                if (typeof cur !== 'object') return undefined;
                if (!(part in cur)) return undefined;
                cur = cur[part];
            }
            return cur;
        };
        const formatValue = (value) => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        };
        return raw.replace(/{{\s*([^}]+)\s*}}/g, (_m, rawKey) => {
            const key = normalizeKey(rawKey);
            if (!key) return '';
            const lower = key.toLowerCase();
            let lookupKey = key;
            if (lower.startsWith('getvar::')) lookupKey = key.slice(8);
            else if (lower.startsWith('getvar:')) lookupKey = key.slice(7);
            const value = getByPath(vars, lookupKey);
            const out = formatValue(value);
            return escape ? this.sanitizeRegexMacro(out) : out;
        });
    }

    filterString(rawString, trimStrings = [], vars) {
        let out = String(rawString ?? '');
        (Array.isArray(trimStrings) ? trimStrings : []).forEach((t) => {
            const sub = this.applyMacros(String(t || ''), vars, { escape: false });
            if (!sub) return;
            out = out.split(sub).join('');
        });
        return out;
    }

    runRegexScript(script, rawString, vars) {
        let newString = String(rawString ?? '');
        if (!script || script.disabled || !script.findRegex || !newString) return newString;
        const STATUS_TOKEN = '__CHATAPP_STATUS__';

        const getRegexString = () => {
            const mode = Number(script.substituteRegex ?? 0);
            switch (mode) {
                case substitute_find_regex.NONE:
                    return script.findRegex;
                case substitute_find_regex.RAW:
                    return this.applyMacros(script.findRegex, vars, { escape: false });
                case substitute_find_regex.ESCAPED:
                    return this.applyMacros(script.findRegex, vars, { escape: true });
                default:
                    return script.findRegex;
            }
        };

        const regexString = getRegexString();
        const findRegex = this.regexFromString(regexString);
        if (!findRegex) return newString;

        newString = newString.replace(findRegex, function () {
            const args = [...arguments];
            const replaceString = String(script.replaceString ?? '').replace(/{{match}}/gi, '$0');
            const replaceWithGroups = replaceString.replace(/\$(\d+)|\$<([^>]+)>/g, (_m, num, groupName) => {
                let match = '';
                if (num) {
                    match = args[Number(num)] || '';
                } else if (groupName) {
                    const groups = args[args.length - 1];
                    match = (groups && typeof groups === 'object' && groups[groupName]) ? groups[groupName] : '';
                }
                if (!match) return '';
                return this.filterString(match, script.trimStrings, vars);
            });

            let replaced = replaceWithGroups;
            const statusInFind = /StatusPlaceHolderImpl/i.test(String(script.findRegex || ''));
            const statusInReplace = /StatusPlaceHolderImpl/i.test(String(script.replaceString || ''));
            if (statusInFind || statusInReplace) {
                const looksLikeScripted =
                    /<script\b/i.test(replaced) ||
                    /getAllVariables\s*\(/i.test(replaced) ||
                    /waitGlobalInitialized\s*\(/i.test(replaced) ||
                    /\bMvu\b/i.test(replaced) ||
                    /\beventOn\s*\(/i.test(replaced);
                if (!looksLikeScripted) {
                    const statusRe = /<StatusPlaceHolderImpl\s*\/?>/gi;
                    if (statusRe.test(replaced)) {
                        replaced = replaced.replace(statusRe, STATUS_TOKEN);
                    } else {
                        const insertIdx = replaced.lastIndexOf('</');
                        if (insertIdx > -1) {
                            replaced = `${replaced.slice(0, insertIdx)}${STATUS_TOKEN}${replaced.slice(insertIdx)}`;
                        } else {
                            replaced = `${replaced}${STATUS_TOKEN}`;
                        }
                    }
                }
            }
            return this.applyMacros(replaced, vars, { escape: false });
        }.bind(this));

        return newString;
    }

    /**
     * ST-like apply:
     * - placement controls where it applies
     * - markdownOnly/promptOnly control ephemerality
     */
    apply(text, ctx = {}, placement, { isMarkdown = false, isPrompt = false, isEdit = false, depth } = {}) {
        const raw = String(text ?? '');
        if (!raw) return raw;
        const scripts = this.computeActiveRules(ctx);
        const vars = ctx?.macroVars || {};
        let out = raw;

        const p = Number(placement);
        for (const s of scripts) {
            if (!s || s.disabled) continue;

            const mdOnly = Boolean(s.markdownOnly);
            const prOnly = Boolean(s.promptOnly);
            const allow =
                (mdOnly && isMarkdown) ||
                (prOnly && isPrompt) ||
                (!mdOnly && !prOnly && (isPrompt || (!isMarkdown && !isPrompt)));
            if (!allow) continue;

            if (isEdit && !s.runOnEdit) continue;

            if (typeof depth === 'number' && Number.isFinite(depth)) {
                const minD = (typeof s.minDepth === 'number' && Number.isFinite(s.minDepth)) ? s.minDepth : null;
                const maxD = (typeof s.maxDepth === 'number' && Number.isFinite(s.maxDepth)) ? s.maxDepth : null;
                if (minD !== null && minD >= -1 && depth < minD) continue;
                if (maxD !== null && maxD >= 0 && depth > maxD) continue;
                if (minD !== null && maxD !== null && maxD < minD) continue;
            }

            const placements = Array.isArray(s.placement) ? s.placement : [];
            if (Number.isFinite(p) && placements.length && !placements.includes(p)) continue;

            out = this.runRegexScript(s, out, vars);
        }

        return out;
    }
}
