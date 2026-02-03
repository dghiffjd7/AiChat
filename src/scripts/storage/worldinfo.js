/**
 * 世界书存取与格式转换
 * - 本地存储：localStorage（后续可加 Tauri FS）
 * - 提供 ST JSON -> 简化格式的转换
 */

import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';

const STORAGE_KEY = 'worldinfo_store';

export class WorldInfoStore {
    constructor() {
        this.cache = {};
        this.ready = this._loadCache();
    }

    async _loadCache() {
        try {
            // 优先从 Tauri 持久化读取
            const kv = await safeInvoke('load_kv', { name: STORAGE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                this.cache = kv;
                return kv;
            }
        } catch (err) {
            logger.warn('世界书持久化读取失败，尝试 localStorage', err);
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                this.cache = JSON.parse(raw);
                return this.cache;
            }
        } catch (err) {
            logger.warn('世界书缓存读取失败，重置为空', err);
        }
        this.cache = {};
        return this.cache;
    }

    list() {
        return Object.keys(this.cache);
    }

    load(name) {
        return this.cache[name] || null;
    }

    async save(name, data) {
        this.cache[name] = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.cache });
        } catch (err) {
            logger.warn('持久化世界书失败（继续用 cache）', err);
        }
    }

    async remove(name) {
        delete this.cache[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
        try {
            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.cache });
        } catch (err) {
            logger.warn('持久化世界书失败（继续用 cache）', err);
        }
    }

    async saveMany(map) {
        this.cache = { ...this.cache, ...map };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
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

    const rawEntries = stJson.entries || [];
    const entriesList = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);

    const entries = entriesList.map((e, idx) => {
        const preserved = { ...(e || {}) };

        const uid = Number.isInteger(preserved.uid) ? preserved.uid : null;
        const id = preserved.id ?? (uid != null ? String(uid) : `entry-${idx}`);
        const comment = preserved.comment ?? preserved.title ?? `entry-${idx}`;
        const key = normalizeArray(preserved.key ?? preserved.triggers);
        const keysecondary = normalizeArray(preserved.keysecondary ?? preserved.secondary);
        const order = toNumber(preserved.order ?? preserved.priority, 100);
        const depth = toNumber(preserved.depth, 4);
        const position = toNumber(preserved.position, 0);
        const probability = toNumber(preserved.probability, 100);
        const useProbability = preserved.useProbability !== false;

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
            selective: preserved.selective === true,
            selectiveLogic: toNumber(preserved.selectiveLogic, 0),
            disable: Boolean(preserved.disable),
            constant: Boolean(preserved.constant),
            ignoreBudget: Boolean(preserved.ignoreBudget),
            excludeRecursion: Boolean(preserved.excludeRecursion),
            preventRecursion: Boolean(preserved.preventRecursion),
            matchPersonaDescription: Boolean(preserved.matchPersonaDescription),
            matchCharacterDescription: Boolean(preserved.matchCharacterDescription),
            matchCharacterPersonality: Boolean(preserved.matchCharacterPersonality),
            matchCharacterDepthPrompt: Boolean(preserved.matchCharacterDepthPrompt),
            matchScenario: Boolean(preserved.matchScenario),
            matchCreatorNotes: Boolean(preserved.matchCreatorNotes),
            delayUntilRecursion: toNumber(preserved.delayUntilRecursion, 0),
            probability,
            useProbability,
            group: preserved.group || '',
            groupOverride: Boolean(preserved.groupOverride),
            groupWeight: toNumber(preserved.groupWeight, 100),
            scanDepth: preserved.scanDepth ?? null,
            caseSensitive: preserved.caseSensitive ?? null,
            matchWholeWords: preserved.matchWholeWords ?? null,
            useGroupScoring: preserved.useGroupScoring ?? null,
            automationId: preserved.automationId || '',
            role: toNumber(preserved.role, 0),
            sticky: preserved.sticky ?? null,
            cooldown: preserved.cooldown ?? null,
            delay: preserved.delay ?? null,
            vectorized: Boolean(preserved.vectorized),
            addMemo: Boolean(preserved.addMemo),
        };
    });

    return { name, entries };
}
