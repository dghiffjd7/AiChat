/**
 * 世界书存取与格式转换
 * - 本地存储：localStorage（后续可加 Tauri FS）
 * - 提供 ST JSON -> 简化格式的转换
 */

import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';

const STORAGE_KEY = 'worldinfo_store';
const INDEX_STORAGE_KEY = 'worldinfo_index_v2';
const LEGACY_INDEX_STORAGE_KEY = 'worldinfo_store_index_v1';
const INDEX_VERSION = 2;
const LOCALSTORAGE_SOFT_LIMIT = 3 * 1024 * 1024; // 3MB: avoid quota errors on mobile WebView
const KV_LOAD_RETRY_DELAYS = [40, 120];
const getTauriInvoker = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g?.__TAURI__?.core?.invoke
        || g?.__TAURI__?.invoke
        || g?.__TAURI_INVOKE__
        || g?.__TAURI_INTERNALS__?.invoke;
};
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const loadKvWithRetry = async (name) => {
    let lastError = null;
    for (let attempt = 0; attempt <= KV_LOAD_RETRY_DELAYS.length; attempt += 1) {
        try {
            return await safeInvoke('load_kv', { name });
        } catch (err) {
            lastError = err;
            if (attempt < KV_LOAD_RETRY_DELAYS.length) {
                await wait(KV_LOAD_RETRY_DELAYS[attempt]);
            }
        }
    }
    throw lastError || new Error(`worldinfo load_kv failed: ${name}`);
};
const isPlainRecord = (value) => Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
);
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

const normalizeId = value => String(value || '').trim();
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const normalizeTimestamp = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
};
const collectRefIds = (data = {}) => Array.from(new Set((Array.isArray(data?.refs) ? data.refs : [])
    .map(ref => normalizeId(ref?.sourceId || ref?.worldId || ref?.source))
    .filter(Boolean)));
const makeWorldMetadata = (name, data = null, fallback = {}) => {
    const id = normalizeId(name);
    const body = isPlainRecord(data) ? data : null;
    const entries = body && Array.isArray(body.entries)
        ? body.entries
        : (body && Array.isArray(body.localEntries) ? body.localEntries : null);
    const fallbackCount = fallback?.entriesCount === null
        ? null
        : Number(fallback?.entriesCount);
    return {
        name: id,
        entriesCount: entries
            ? entries.length
            : (Number.isFinite(fallbackCount) && fallbackCount >= 0 ? Math.trunc(fallbackCount) : null),
        createdAt: normalizeTimestamp(
            body?.createdAt ?? body?.created_at ?? fallback?.createdAt ?? fallback?.created_at,
        ),
        updatedAt: normalizeTimestamp(
            body?.updatedAt ?? body?.updated_at ?? body?.createdAt ?? body?.created_at
            ?? fallback?.updatedAt ?? fallback?.updated_at,
        ),
        refs: body ? collectRefIds(body) : collectRefIds({ refs: fallback?.refs }),
    };
};
const normalizeIndex = (value) => {
    if (!isPlainRecord(value) || Number(value.version) !== INDEX_VERSION || !isPlainRecord(value.worlds)) {
        return null;
    }
    const worlds = Object.create(null);
    Object.entries(value.worlds).forEach(([rawId, metadata]) => {
        const id = normalizeId(rawId || metadata?.name);
        if (!id) return;
        worlds[id] = makeWorldMetadata(id, null, metadata);
    });
    return worlds;
};
const serializeIndex = (worlds, { legacyAggregateMigrated = false } = {}) => ({
    version: INDEX_VERSION,
    legacyAggregateMigrated: legacyAggregateMigrated === true,
    worlds: Object.fromEntries(Object.entries(worlds || {}).map(([id, metadata]) => [
        id,
        makeWorldMetadata(id, null, metadata),
    ])),
});
const metadataEquals = (left, right) => JSON.stringify(left || null) === JSON.stringify(right || null);
const metadataEqualsExceptEntriesCount = (left, right) => {
    if (!left || !right) return false;
    const { entriesCount: _leftEntriesCount, ...leftRest } = left;
    const { entriesCount: _rightEntriesCount, ...rightRest } = right;
    return metadataEquals(leftRest, rightRest);
};

export class WorldInfoStore {
    constructor() {
        this.cache = Object.create(null);
        this.legacyAggregateMigrated = false;
        this.metadata = this._loadIndexSnapshot();
        this.index = Object.keys(this.metadata);
        this.hydrated = false;
        this.persistenceBlocked = false;
        this._readyPromise = null;
        this._prewarmScheduled = false;
        this._loadPromises = new Map();
        this._allLoadedPromise = null;
        this.nativeMode = typeof getTauriInvoker() === 'function';
        // 懒加载后条目数在首次载入正文时才回填；UI 层可挂钩此回调刷新“条目数待载入”。
        this.onEntriesCountBackfill = null;
    }

    get ready() {
        return this.ensureReady();
    }

    _loadIndexSnapshot() {
        try {
            const raw = localStorage.getItem(INDEX_STORAGE_KEY);
            if (raw) {
                const normalized = normalizeIndex(JSON.parse(raw));
                if (normalized) return normalized;
            }
            const legacyRaw = localStorage.getItem(LEGACY_INDEX_STORAGE_KEY);
            const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
            if (!Array.isArray(legacy)) return Object.create(null);
            return Object.fromEntries(legacy
                .map(normalizeId)
                .filter(Boolean)
                .map(id => [id, makeWorldMetadata(id)]));
        } catch (err) {
            logger.debug('世界书索引快照读取失败，稍后读取权威索引', err);
            return Object.create(null);
        }
    }

    _persistIndexLocal() {
        try {
            localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(serializeIndex(this.metadata, {
                legacyAggregateMigrated: this.legacyAggregateMigrated,
            })));
        } catch (err) {
            logger.warn('世界书索引镜像写入失败，已跳过', err);
        }
    }

    async _persistIndexNative() {
        const payload = serializeIndex(this.metadata, {
            legacyAggregateMigrated: this.legacyAggregateMigrated,
        });
        let nativeSaved = false;
        try {
            await safeInvoke('save_kv', { name: INDEX_STORAGE_KEY, data: payload });
            nativeSaved = true;
        } catch (err) {
            // 正文 sidecar 才是权威数据；索引失败可在下次启动从目录安全重建。
            logger.warn('世界书轻量索引持久化失败，将在下次启动重建', err);
        }
        this._persistIndexLocal();
        return nativeSaved;
    }

    async _deleteVerifiedLegacyAggregate() {
        try {
            await safeInvoke('delete_worldinfo_legacy_store');
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {}
            return true;
        } catch (err) {
            logger.warn('世界书旧整包清理失败，已保留供下次重试', err);
            return false;
        }
    }

    _replaceMetadata(next = {}, { persistLocal = false } = {}) {
        const metadata = Object.create(null);
        Object.entries(next || {}).forEach(([rawId, value]) => {
            const id = normalizeId(rawId || value?.name);
            if (!id) return;
            metadata[id] = makeWorldMetadata(id, null, value);
        });
        this.metadata = metadata;
        this.index = Object.keys(metadata);
        this.hydrated = true;
        if (persistLocal) this._persistIndexLocal();
    }

    _replaceWebCache(next = {}) {
        const data = isPlainRecord(next) ? next : {};
        this.cache = { ...data };
        const metadata = Object.create(null);
        Object.entries(data).forEach(([rawId, body]) => {
            const id = normalizeId(rawId);
            if (id) metadata[id] = makeWorldMetadata(id, body);
        });
        this._replaceMetadata(metadata, { persistLocal: true });
    }

    ensureReady() {
        if (!this._readyPromise) {
            this._readyPromise = this.nativeMode ? this._loadNativeIndex() : this._loadWebCache();
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

    async _loadWebCache() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (isPlainRecord(parsed) && !parsed._tooLarge) {
                    this._replaceWebCache(parsed);
                    return this.cache;
                }
                logger.warn('世界书 localStorage 镜像格式无效，已忽略');
            }
        } catch (err) {
            logger.warn('世界书缓存读取失败', err);
        }

        this._replaceWebCache({});
        return this.cache;
    }

    async _loadNativeIndex() {
        let rawIndex = null;
        let indexReadFailed = false;
        try {
            rawIndex = await loadKvWithRetry(INDEX_STORAGE_KEY);
        } catch (err) {
            indexReadFailed = true;
            logger.warn('世界书轻量索引读取失败，尝试从 sidecar 目录恢复', err);
        }

        let nativeIds = [];
        let nativeListReadable = false;
        try {
            nativeIds = Array.from(new Set((await safeInvoke('list_world_info_files') || [])
                .map(normalizeId)
                .filter(Boolean)));
            nativeListReadable = true;
        } catch (err) {
            logger.warn('世界书 sidecar 目录读取失败', err);
        }

        const storedIndex = normalizeIndex(rawIndex);
        if (storedIndex) {
            this.legacyAggregateMigrated = rawIndex?.legacyAggregateMigrated === true;
            const recoveryMetadata = { ...storedIndex };
            let changed = false;
            let missingIndexedSidecars = false;
            if (nativeListReadable) {
                const nativeSet = new Set(nativeIds);
                Object.keys(storedIndex).forEach((id) => {
                    if (nativeSet.has(id)) return;
                    delete storedIndex[id];
                    changed = true;
                    missingIndexedSidecars = true;
                });
                nativeIds.forEach((id) => {
                    if (hasOwn(storedIndex, id)) return;
                    storedIndex[id] = makeWorldMetadata(id);
                    changed = true;
                });
            }
            if (missingIndexedSidecars || !this.legacyAggregateMigrated) {
                // 索引声称存在但 sidecar 缺失时，回到旧整包迁移路径尝试恢复；
                // 未带迁移完成标记的旧 v2 索引也必须先核对旧整包，不能仅凭文件名删除恢复源。
                return await this._migrateLegacyAggregate(nativeIds, {
                    nativeListReadable,
                    fallbackMetadata: recoveryMetadata,
                    requiresLegacyRecovery: missingIndexedSidecars,
                });
            }
            this.persistenceBlocked = !nativeListReadable;
            this._replaceMetadata(storedIndex, { persistLocal: !this.persistenceBlocked });
            const indexVerified = changed && !this.persistenceBlocked
                ? await this._persistIndexNative()
                : !this.persistenceBlocked;
            if (nativeListReadable && indexVerified) {
                await this._deleteVerifiedLegacyAggregate();
            }
            return this.cache;
        }

        if (indexReadFailed) {
            if (!nativeListReadable) {
                this.persistenceBlocked = true;
                this._replaceMetadata(this.metadata);
                return this.cache;
            }
            const recovered = Object.create(null);
            nativeIds.forEach((id) => {
                recovered[id] = hasOwn(this.metadata, id) ? this.metadata[id] : makeWorldMetadata(id);
            });
            this._replaceMetadata(recovered, { persistLocal: true });
            await this._persistIndexNative();
            return this.cache;
        }

        return await this._migrateLegacyAggregate(nativeIds, { nativeListReadable });
    }

    async _migrateLegacyAggregate(nativeIds = [], {
        nativeListReadable = false,
        fallbackMetadata = {},
        requiresLegacyRecovery = false,
    } = {}) {
        let legacy = null;
        let legacyReadFailed = false;
        try {
            legacy = await loadKvWithRetry(STORAGE_KEY);
        } catch (err) {
            legacyReadFailed = true;
            logger.warn('旧版世界书整包读取失败，尝试只使用 sidecar', err);
        }

        const nativeSet = new Set(nativeIds);
        const metadata = Object.create(null);
        if (isPlainRecord(legacy) && !legacy._tooLarge) {
            const legacyEntries = Object.entries(legacy)
                .map(([rawId, body]) => [normalizeId(rawId), body])
                .filter(([id, body]) => id && isPlainRecord(body));
            legacyEntries.forEach(([id, body]) => {
                metadata[id] = makeWorldMetadata(id, body);
            });
            try {
                for (const [id, body] of legacyEntries) {
                    if (nativeSet.has(id)) continue;
                    await safeInvoke('save_world_info', { characterId: id, data: body });
                    nativeSet.add(id);
                }
            } catch (err) {
                // 迁移未完整落盘时继续保留整包为可读来源，并禁止覆盖。
                this.cache = { ...legacy };
                this.persistenceBlocked = true;
                this._replaceMetadata(metadata);
                logger.error('世界书 sidecar 迁移未完成，已进入只读保护', err);
                return this.cache;
            }
        }

        nativeSet.forEach((id) => {
            if (!hasOwn(metadata, id)) {
                metadata[id] = hasOwn(fallbackMetadata, id)
                    ? makeWorldMetadata(id, null, fallbackMetadata[id])
                    : makeWorldMetadata(id);
            }
        });

        if ((legacyReadFailed || legacy?._tooLarge) && requiresLegacyRecovery) {
            this.persistenceBlocked = true;
            this.legacyAggregateMigrated = false;
            this._replaceMetadata({ ...fallbackMetadata, ...metadata });
            logger.warn('世界书 sidecar 缺失且旧整包暂不可读取，已保留完整索引并进入只读保护');
            return this.cache;
        }

        if ((legacyReadFailed || legacy?._tooLarge) && !nativeSet.size) {
            this.persistenceBlocked = true;
            this._replaceMetadata(this.metadata);
            logger.warn('世界书旧整包不可读取且没有可用 sidecar，已进入只读保护');
            return this.cache;
        }

        if (!nativeListReadable && !Object.keys(metadata).length && legacyReadFailed) {
            this.persistenceBlocked = true;
            this._replaceMetadata(this.metadata);
            return this.cache;
        }

        this.cache = Object.create(null);
        this.persistenceBlocked = false;
        this.legacyAggregateMigrated = isPlainRecord(legacy) && !legacy._tooLarge;
        this._replaceMetadata(metadata, { persistLocal: true });
        const indexSaved = await this._persistIndexNative();
        if (indexSaved && nativeListReadable && this.legacyAggregateMigrated) {
            await this._deleteVerifiedLegacyAggregate();
        }
        return this.cache;
    }

    list() {
        return Array.isArray(this.index) ? this.index.slice() : [];
    }

    has(name) {
        const id = normalizeId(name);
        return Boolean(id && (hasOwn(this.metadata, id) || hasOwn(this.cache, id)));
    }

    getMetadata(name) {
        const id = normalizeId(name);
        const value = id ? this.metadata[id] : null;
        return value ? { ...value, refs: Array.isArray(value.refs) ? value.refs.slice() : [] } : null;
    }

    load(name) {
        const id = normalizeId(name);
        return id && hasOwn(this.cache, id) ? this.cache[id] : null;
    }

    async ensureLoaded(name) {
        const id = normalizeId(name);
        if (!id) return null;
        await this.ensureReady();
        if (hasOwn(this.cache, id)) return this.cache[id];
        if (!this.nativeMode || !this.has(id)) return null;
        if (this._loadPromises.has(id)) return await this._loadPromises.get(id);

        const promise = (async () => {
            const data = await safeInvoke('get_world_info', { characterId: id });
            if (!isPlainRecord(data) || !Object.keys(data).length) {
                let exists = null;
                try {
                    exists = Boolean(await safeInvoke('world_info_exists', { characterId: id }));
                } catch (err) {
                    logger.warn('世界书 sidecar 存在性确认失败，已保留索引等待重试', { id, error: err });
                }
                if (exists === false) {
                    delete this.metadata[id];
                    delete this.cache[id];
                    this.index = Object.keys(this.metadata);
                    await this._persistIndexNative();
                } else if (exists === true) {
                    logger.warn('世界书 sidecar 内容无效，已跳过加载', { id });
                }
                return null;
            }
            this.cache[id] = data;
            const previousMetadata = this.metadata[id];
            const nextMetadata = makeWorldMetadata(id, data, previousMetadata);
            if (!metadataEquals(previousMetadata, nextMetadata)) {
                this.metadata[id] = nextMetadata;
                this.index = Object.keys(this.metadata);
                const entryCountOnlyBackfill = previousMetadata?.entriesCount === null
                    && nextMetadata.entriesCount !== null
                    && metadataEqualsExceptEntriesCount(previousMetadata, nextMetadata);
                if (!entryCountOnlyBackfill) await this._persistIndexNative();
                if (previousMetadata?.entriesCount === null && nextMetadata.entriesCount !== null) {
                    try {
                        this.onEntriesCountBackfill?.(id, nextMetadata);
                    } catch (err) {
                        logger.warn('世界书条目数回填通知失败', { id, error: err });
                    }
                }
            }
            return data;
        })().finally(() => this._loadPromises.delete(id));
        this._loadPromises.set(id, promise);
        return await promise;
    }

    async ensureLoadedMany(names = [], { includeRefs = true } = {}) {
        let frontier = Array.from(new Set((Array.isArray(names) ? names : [names]).map(normalizeId).filter(Boolean)));
        const visited = new Set();
        const loaded = [];
        while (frontier.length) {
            const layer = frontier.filter((id) => {
                if (!id || visited.has(id)) return false;
                visited.add(id);
                return true;
            });
            if (!layer.length) break;
            const layerResults = await Promise.all(layer.map(async id => ({
                id,
                data: await this.ensureLoaded(id),
            })));
            const next = [];
            layerResults.forEach(({ data }) => {
                if (!data) return;
                loaded.push(data);
                if (!includeRefs) return;
                collectRefIds(data).forEach((refId) => {
                    if (!visited.has(refId)) next.push(refId);
                });
            });
            frontier = Array.from(new Set(next));
        }
        return loaded;
    }

    async loadAll() {
        await this.ensureReady();
        if (!this._allLoadedPromise) {
            this._allLoadedPromise = this.ensureLoadedMany(this.list(), { includeRefs: true })
                .finally(() => { this._allLoadedPromise = null; });
        }
        await this._allLoadedPromise;
        return this.cache;
    }

    _persistWebCache() {
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

    assertWritable() {
        if (!this.persistenceBlocked) return;
        const error = new Error('世界书存储暂时无法读取，已阻止写入以保护现有数据。请重新载入 APP 后重试。');
        error.code = 'worldinfo_store_read_unavailable';
        throw error;
    }

    async save(name, data, { skipNative = false } = {}) {
        if (!this.hydrated) await this.ensureReady();
        this.assertWritable();
        const id = normalizeId(name);
        if (!id) throw new Error('world info id empty');
        if (this.nativeMode && !skipNative) {
            await safeInvoke('save_world_info', { characterId: id, data });
        }
        this.cache[id] = data;
        this.metadata[id] = makeWorldMetadata(id, data, this.metadata[id]);
        this.index = Object.keys(this.metadata);
        this.hydrated = true;
        if (this.nativeMode) await this._persistIndexNative();
        else this._persistWebCache();
        return data;
    }

    async remove(name, { skipNative = false, nativeDeleted: knownNativeDeleted = false } = {}) {
        if (!this.hydrated) await this.ensureReady();
        this.assertWritable();
        const id = normalizeId(name);
        if (!id) return { nativeAvailable: this.nativeMode, nativeDeleted: false };
        let nativeDeleted = Boolean(knownNativeDeleted);
        if (this.nativeMode && !skipNative) {
            nativeDeleted = Boolean(await safeInvoke('delete_world_info', { characterId: id }));
        }
        delete this.cache[id];
        delete this.metadata[id];
        this.index = Object.keys(this.metadata);
        this.hydrated = true;
        if (this.nativeMode) await this._persistIndexNative();
        else this._persistWebCache();
        return { nativeAvailable: this.nativeMode, nativeDeleted };
    }

    async saveMany(map) {
        if (!this.hydrated) await this.ensureReady();
        this.assertWritable();
        const entries = Object.entries(isPlainRecord(map) ? map : {})
            .map(([rawId, data]) => [normalizeId(rawId), data])
            .filter(([id]) => Boolean(id));
        if (this.nativeMode) {
            for (const [id, data] of entries) {
                await safeInvoke('save_world_info', { characterId: id, data });
            }
        }
        entries.forEach(([id, data]) => {
            this.cache[id] = data;
            this.metadata[id] = makeWorldMetadata(id, data, this.metadata[id]);
        });
        this.index = Object.keys(this.metadata);
        this.hydrated = true;
        if (this.nativeMode) await this._persistIndexNative();
        else this._persistWebCache();
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
