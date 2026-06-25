/**
 * 世界书存取与格式转换
 * - 本地存储：localStorage（后续可加 Tauri FS）
 * - 提供 ST JSON -> 简化格式的转换
 */

import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';

const STORAGE_KEY = 'worldinfo_store';
const INDEX_STORAGE_KEY = 'worldinfo_store_index_v1';
const LOCALSTORAGE_SOFT_LIMIT = 3 * 1024 * 1024; // 3MB: avoid quota errors on mobile WebView
const scheduleIdle = (runner, { timeout = 240 } = {}) => {
    if (typeof runner !== 'function') return;
    try {
        const g = typeof globalThis !== 'undefined' ? globalThis : window;
        if (typeof g?.requestIdleCallback === 'function') {
            g.requestIdleCallback(() => runner(), { timeout });
            return;
        }
    } catch {}
    setTimeout(() => runner(), 180);
};

export class WorldInfoStore {
    constructor() {
        this.cache = {};
        this.index = this._loadIndexSnapshot();
        this.hydrated = false;
        this._readyPromise = null;
        this._prewarmScheduled = false;
    }

    get ready() {
        return this.ensureReady();
    }

    _loadIndexSnapshot() {
        try {
            const raw = localStorage.getItem(INDEX_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((item) => String(item || '').trim())
                .filter(Boolean);
        } catch (err) {
            logger.debug('世界书索引读取失败，稍后走完整缓存', err);
            return [];
        }
    }

    _persistIndex() {
        try {
            localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(this.index));
        } catch (err) {
            logger.warn('世界书索引写入失败，已跳过', err);
        }
    }

    _replaceCache(next = {}) {
        const data = next && typeof next === 'object' ? next : {};
        this.cache = data;
        this.index = Object.keys(data).map((item) => String(item || '').trim()).filter(Boolean);
        this.hydrated = true;
        this._persistIndex();
    }

    ensureReady() {
        if (!this._readyPromise) {
            this._readyPromise = this._loadCache();
        }
        return this._readyPromise;
    }

    prewarm() {
        if (this.hydrated || this._prewarmScheduled || this._readyPromise) return;
        this._prewarmScheduled = true;
        scheduleIdle(() => {
            this._prewarmScheduled = false;
            this.ensureReady().catch((err) => {
                logger.warn('世界书后台预热失败', err);
            });
        });
    }

    async _loadCache() {
        try {
            // 优先从 Tauri 持久化读取
            const kv = await safeInvoke('load_kv', { name: STORAGE_KEY });
            if (kv && typeof kv === 'object' && kv._tooLarge) {
                logger.warn('世界书持久化文件过大，跳过磁盘快照并尝试 localStorage', kv);
            } else if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                this._replaceCache(kv);
                return this.cache;
            }
        } catch (err) {
            logger.warn('世界书持久化读取失败，尝试 localStorage', err);
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                this._replaceCache(JSON.parse(raw));
                return this.cache;
            }
        } catch (err) {
            logger.warn('世界书缓存读取失败，重置为空', err);
        }
        this._replaceCache({});
        return this.cache;
    }

    list() {
        if (this.hydrated || Object.keys(this.cache).length) return Object.keys(this.cache);
        return Array.isArray(this.index) ? this.index.slice() : [];
    }

    load(name) {
        return this.cache[name] || null;
    }

    _persistLocal() {
        try {
            const payload = JSON.stringify(this.cache);
            if (payload.length > LOCALSTORAGE_SOFT_LIMIT) {
                logger.warn('世界书缓存过大，跳过 localStorage 持久化', { size: payload.length });
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch {}
                return;
            }
            localStorage.setItem(STORAGE_KEY, payload);
        } catch (err) {
            logger.warn('世界书写入 localStorage 失败，已跳过', err);
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {}
        }
    }

    async save(name, data) {
        if (!this.hydrated) await this.ensureReady();
        this.cache[name] = data;
        if (!this.index.includes(name)) {
            this.index = Array.from(new Set(this.list().concat(name).filter(Boolean)));
            this._persistIndex();
        }
        this.hydrated = true;
        this._persistLocal();
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.cache });
        } catch (err) {
            logger.warn('持久化世界书失败（继续用 cache）', err);
        }
    }

    async remove(name) {
        if (!this.hydrated) await this.ensureReady();
        delete this.cache[name];
        this.index = this.list().filter(item => item !== name);
        this.hydrated = true;
        this._persistIndex();
        this._persistLocal();
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.cache });
        } catch (err) {
            logger.warn('持久化世界书失败（继续用 cache）', err);
        }
    }

    async saveMany(map) {
        if (!this.hydrated) await this.ensureReady();
        this.cache = { ...this.cache, ...map };
        this.index = Object.keys(this.cache).map((item) => String(item || '').trim()).filter(Boolean);
        this.hydrated = true;
        this._persistIndex();
        this._persistLocal();
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.cache });
        } catch (err) {
            logger.warn('持久化世界书失败（继续用 cache）', err);
        }
    }
}

/**
 * 将 ST 世界书 JSON 转为简化格式
 * @param {object} stJson - SillyTavern world JSON
 * @param {string} name - 名称
 * @returns {object} simplified worldinfo
 */
export function convertSTWorld(stJson = {}, name = 'imported') {
    const normalizeArray = (val) => {
        if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
        if (typeof val === 'string') return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
        return [];
    };
    const toNumber = (val, def) => {
        const n = Number(val);
        return Number.isFinite(n) ? n : def;
    };
    const toBool = (val, def) => (typeof val === 'boolean' ? val : def);
    const readExt = (ext, camel, snake) => {
        if (!ext || typeof ext !== 'object') return undefined;
        if (ext[camel] !== undefined) return ext[camel];
        if (snake && ext[snake] !== undefined) return ext[snake];
        return undefined;
    };
    const resolvePosition = (entry, ext) => {
        const extPos = readExt(ext, 'position', 'position');
        if (Number.isFinite(Number(extPos))) return Number(extPos);
        const rawPos = entry?.position;
        if (Number.isFinite(Number(rawPos))) return Number(rawPos);
        const posStr = typeof rawPos === 'string' ? rawPos.trim().toLowerCase() : '';
        if (posStr === 'before_char') return 0;
        if (posStr === 'after_char') return 1;
        return 0;
    };
    const resolveDepth = (entry, ext) => {
        const extDepth = readExt(ext, 'depth', 'depth');
        if (Number.isFinite(Number(extDepth))) return Number(extDepth);
        if (Number.isFinite(Number(entry?.depth))) return Number(entry.depth);
        return 4;
    };

    const rawEntries = stJson.entries || [];
    const entriesList = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);

    const entries = entriesList.map((e, idx) => {
        const preserved = { ...(e || {}) };
        const ext = preserved.extensions && typeof preserved.extensions === 'object' ? preserved.extensions : {};

        const uid = Number.isInteger(preserved.uid) ? preserved.uid : null;
        const id = preserved.id ?? (uid != null ? String(uid) : `entry-${idx}`);
        const comment = preserved.comment ?? preserved.title ?? `entry-${idx}`;
        const key = normalizeArray(preserved.keys ?? preserved.key ?? preserved.triggers);
        const keysecondary = normalizeArray(preserved.secondary_keys ?? preserved.keysecondary ?? preserved.secondary);
        const order = toNumber(preserved.insertion_order ?? preserved.order ?? preserved.priority, 100);
        const depth = resolveDepth(preserved, ext);
        const position = resolvePosition(preserved, ext);
        const probability = toNumber(readExt(ext, 'probability', 'probability') ?? preserved.probability, 100);
        const useProbability = toBool(readExt(ext, 'useProbability', 'use_probability') ?? preserved.useProbability, true);
        let selective = (typeof preserved.selective === 'boolean') ? preserved.selective : undefined;
        const disable = (typeof preserved.disable === 'boolean')
            ? preserved.disable
            : (typeof preserved.enabled === 'boolean' ? !preserved.enabled : false);
        const constant = disable ? false : Boolean(preserved.constant);
        if (disable) selective = false;

        return {
            ...preserved,
            id,
            uid,
            comment,
            title: comment, // 旧别名
            content: preserved.content || '',
            key,
            triggers: key, // 旧别名：主触发
            keysecondary,
            secondary: keysecondary, // 旧别名：副触发
            order,
            priority: order, // 旧别名：顺序
            depth,
            position,
            selective,
            selectiveLogic: toNumber(readExt(ext, 'selectiveLogic', 'selectiveLogic') ?? preserved.selectiveLogic, 0),
            disable,
            constant,
            ignoreBudget: Boolean(readExt(ext, 'ignoreBudget', 'ignore_budget') ?? preserved.ignoreBudget),
            excludeRecursion: Boolean(readExt(ext, 'excludeRecursion', 'exclude_recursion') ?? preserved.excludeRecursion),
            preventRecursion: Boolean(readExt(ext, 'preventRecursion', 'prevent_recursion') ?? preserved.preventRecursion),
            matchPersonaDescription: Boolean(readExt(ext, 'matchPersonaDescription', 'match_persona_description') ?? preserved.matchPersonaDescription),
            matchCharacterDescription: Boolean(readExt(ext, 'matchCharacterDescription', 'match_character_description') ?? preserved.matchCharacterDescription),
            matchCharacterPersonality: Boolean(readExt(ext, 'matchCharacterPersonality', 'match_character_personality') ?? preserved.matchCharacterPersonality),
            matchCharacterDepthPrompt: Boolean(readExt(ext, 'matchCharacterDepthPrompt', 'match_character_depth_prompt') ?? preserved.matchCharacterDepthPrompt),
            matchScenario: Boolean(readExt(ext, 'matchScenario', 'match_scenario') ?? preserved.matchScenario),
            matchCreatorNotes: Boolean(readExt(ext, 'matchCreatorNotes', 'match_creator_notes') ?? preserved.matchCreatorNotes),
            delayUntilRecursion: toNumber(readExt(ext, 'delayUntilRecursion', 'delay_until_recursion') ?? preserved.delayUntilRecursion, 0),
            probability,
            useProbability,
            group: String(readExt(ext, 'group', 'group') ?? preserved.group ?? '').trim(),
            groupOverride: Boolean(readExt(ext, 'groupOverride', 'group_override') ?? preserved.groupOverride),
            groupWeight: toNumber(readExt(ext, 'groupWeight', 'group_weight') ?? preserved.groupWeight, 100),
            scanDepth: readExt(ext, 'scanDepth', 'scan_depth') ?? preserved.scanDepth ?? null,
            caseSensitive: readExt(ext, 'caseSensitive', 'case_sensitive') ?? preserved.caseSensitive ?? null,
            matchWholeWords: readExt(ext, 'matchWholeWords', 'match_whole_words') ?? preserved.matchWholeWords ?? null,
            useGroupScoring: readExt(ext, 'useGroupScoring', 'use_group_scoring') ?? preserved.useGroupScoring ?? null,
            automationId: readExt(ext, 'automationId', 'automation_id') ?? preserved.automationId ?? '',
            role: toNumber(readExt(ext, 'role', 'role') ?? preserved.role, 0),
            sticky: readExt(ext, 'sticky', 'sticky') ?? preserved.sticky ?? null,
            cooldown: readExt(ext, 'cooldown', 'cooldown') ?? preserved.cooldown ?? null,
            delay: readExt(ext, 'delay', 'delay') ?? preserved.delay ?? null,
            vectorized: Boolean(readExt(ext, 'vectorized', 'vectorized') ?? preserved.vectorized),
            addMemo: Boolean(preserved.addMemo),
            triggers: Array.isArray(readExt(ext, 'triggers', 'triggers')) ? readExt(ext, 'triggers', 'triggers') : preserved.triggers,
        };
    });

    return { name, entries };
}
