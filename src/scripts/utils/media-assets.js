import { safeInvoke } from './tauri.js';
import { logger } from './logger.js';

const STATE = {
    ready: false,
    loading: null,
    baseDir: '',
    baseType: 'web',
    manifest: { version: 1, items: [] },
    maps: {
        image: new Map(),
        audio: new Map(),
        sticker: new Map(),
    },
    urlMap: new Map(),
    fileMap: new Map(),
    custom: {
        maps: {
            image: new Map(),
            audio: new Map(),
            sticker: new Map(),
        },
        urlMap: new Map(),
        fileMap: new Map(),
    },
};

const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const normalizeKind = (kind) => {
    const k = String(kind || '').trim().toLowerCase();
    if (!k) return '';
    if (k === 'img' || k === 'image') return 'image';
    if (k === 'audio' || k === 'voice' || k === 'yy') return 'audio';
    if (k === 'sticker' || k === 'bqb' || k === 'emoji') return 'sticker';
    return '';
};

const isAssetRef = (value) => {
    const s = String(value || '').trim().toLowerCase();
    return s.startsWith('asset:') || s.startsWith('media:') || s.startsWith('local:');
};

const isLikelyUrl = (value) => {
    const s = String(value || '').trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s)) return true;
    if (/^(data|blob|file|tauri|app):/i.test(s)) return true;
    if (/^asset:\/\//i.test(s)) return true;
    if (s.startsWith('./') || s.startsWith('/assets/') || s.startsWith('/')) return true;
    if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
    return false;
};

const normalizeUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const noHash = raw.split('#')[0];
    return noHash.trim().toLowerCase();
};

const isWindowsPath = (value) => /^[a-zA-Z]:[\\/]/.test(String(value || '').trim());
const isUncPath = (value) => /^\\\\/.test(String(value || '').trim());
const isAbsolutePath = (value) => {
    const raw = String(value || '').trim();
    return isWindowsPath(raw) || isUncPath(raw) || raw.startsWith('/');
};

const toFileUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(file|asset|tauri|https?|data|blob):/i.test(raw)) return raw;
    const normalized = raw.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) return encodeURI(`file:///${normalized}`);
    if (normalized.startsWith('//')) return encodeURI(`file:${normalized}`);
    if (normalized.startsWith('/')) return encodeURI(`file://${normalized}`);
    return '';
};

const stripQuery = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.split('?')[0];
};

const getFileNameFromUrl = (value) => {
    try {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const cleaned = stripQuery(raw).split('#')[0];
        const parts = cleaned.split('/');
        return parts.length ? parts[parts.length - 1] : '';
    } catch {
        return '';
    }
};

const joinPath = (base, file) => {
    const b = String(base || '').trim();
    const f = String(file || '').trim();
    if (!b) return f;
    if (!f) return b;
    const useBackslash = b.includes('\\');
    const sep = useBackslash ? '\\' : '/';
    const left = b.replace(/[\\/]+$/, '');
    const right = f.replace(/^[\\/]+/, '');
    return `${left}${sep}${right}`;
};

const getConvertFileSrc = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g?.__TAURI__?.core?.convertFileSrc
        || g?.__TAURI__?.convertFileSrc
        || g?.__TAURI_INTERNALS__?.convertFileSrc;
};

const parseAssetRef = (value, fallbackKind) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const m = raw.match(/^(asset|media|local):(.+)$/i);
    if (!m) return null;
    let tail = String(m[2] || '').trim();
    if (!tail) return null;
    let kind = normalizeKind(fallbackKind);
    const m2 = tail.match(/^([a-z]+)[/:](.+)$/i);
    if (m2) {
        const explicit = normalizeKind(m2[1]);
        if (explicit) kind = explicit;
        tail = String(m2[2] || '').trim();
    }
    return { kind, key: normalizeKey(tail) };
};

const resetIndexes = () => {
    STATE.maps.image.clear();
    STATE.maps.audio.clear();
    STATE.maps.sticker.clear();
    STATE.urlMap.clear();
    STATE.fileMap.clear();
};

const resetCustomIndexes = () => {
    STATE.custom.maps.image.clear();
    STATE.custom.maps.audio.clear();
    STATE.custom.maps.sticker.clear();
    STATE.custom.urlMap.clear();
    STATE.custom.fileMap.clear();
};

const addAlias = (kind, alias, item) => {
    const k = normalizeKind(kind);
    const key = normalizeKey(alias);
    if (!k || !key) return;
    STATE.maps[k].set(key, item);
    if (k === 'sticker') {
        // Allow [img-xxx] to resolve sticker assets too.
        STATE.maps.image.set(key, item);
    }
};

const addCustomAlias = (kind, alias, item) => {
    const k = normalizeKind(kind);
    const key = normalizeKey(alias);
    if (!k || !key) return;
    STATE.custom.maps[k].set(key, item);
    if (k === 'sticker') {
        STATE.custom.maps.image.set(key, item);
    }
};

const addUrlMapping = (url, item) => {
    const u = normalizeUrl(url);
    if (!u) return;
    STATE.urlMap.set(u, item);
    const stripped = normalizeUrl(stripQuery(u));
    if (stripped) STATE.urlMap.set(stripped, item);
    const filename = normalizeKey(getFileNameFromUrl(u));
    if (filename) STATE.fileMap.set(filename, item);
};

const addCustomUrlMapping = (url, item) => {
    const u = normalizeUrl(url);
    if (!u) return;
    STATE.custom.urlMap.set(u, item);
    const stripped = normalizeUrl(stripQuery(u));
    if (stripped) STATE.custom.urlMap.set(stripped, item);
    const filename = normalizeKey(getFileNameFromUrl(u));
    if (filename) STATE.custom.fileMap.set(filename, item);
};

const normalizeManifestItems = (manifest) => {
    const items = [];
    if (manifest && Array.isArray(manifest.items)) items.push(...manifest.items);
    if (manifest && Array.isArray(manifest.images)) {
        manifest.images.forEach(it => items.push({ ...it, kind: 'image' }));
    }
    if (manifest && Array.isArray(manifest.audio)) {
        manifest.audio.forEach(it => items.push({ ...it, kind: 'audio' }));
    }
    if (manifest && Array.isArray(manifest.stickers)) {
        manifest.stickers.forEach(it => items.push({ ...it, kind: 'sticker' }));
    }
    return items.filter(Boolean);
};

const dedupeUrls = (urls = []) => {
    const out = [];
    const seen = new Set();
    urls.forEach((value) => {
        const raw = String(value || '').trim();
        if (!raw) return;
        const key = normalizeUrl(raw) || raw;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(raw);
    });
    return out;
};

const buildFallbackUrls = (resolvedUrl, item) => {
    const urls = [];
    if (resolvedUrl) urls.push(resolvedUrl);
    if (item && typeof item === 'object') {
        const rawFile = String(item.file || item.path || '').trim();
        if (rawFile) {
            const isAbs = isAbsolutePath(rawFile);
            if (STATE.baseType === 'tauri') {
                const full = isAbs ? rawFile : joinPath(STATE.baseDir, rawFile);
                const convert = getConvertFileSrc();
                if (typeof convert === 'function') {
                    try {
                        const converted = convert(full);
                        if (converted) urls.push(converted);
                    } catch {}
                }
                const fileUrl = toFileUrl(full);
                if (fileUrl) urls.push(fileUrl);
                urls.push(full);
            } else if (STATE.baseDir) {
                const full = isAbs ? rawFile : joinPath(STATE.baseDir, rawFile);
                urls.push(full);
            } else {
                urls.push(rawFile);
            }
        }
        if (Array.isArray(item.sources)) {
            item.sources.forEach((src) => {
                if (src) urls.push(src);
            });
        }
    }
    return dedupeUrls(urls);
};

const indexManifest = (manifest) => {
    resetIndexes();
    const items = normalizeManifestItems(manifest);
    items.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const kind = normalizeKind(raw.kind);
        if (!kind) return;
        const idRaw = raw.id || raw.key || raw.name || raw.label || raw.file || raw.path || '';
        const id = normalizeKey(idRaw);
        const file = String(raw.file || raw.path || '').trim();
        if (!id && !file) return;
        const item = {
            kind,
            id: id || normalizeKey(file),
            file,
            label: String(raw.label || raw.name || raw.id || raw.key || '').trim(),
            aliases: Array.isArray(raw.aliases) ? raw.aliases.slice() : [],
            sources: Array.isArray(raw.sources) ? raw.sources.slice() : Array.isArray(raw.urls) ? raw.urls.slice() : [],
        };
        addAlias(kind, item.id, item);
        if (item.label) addAlias(kind, item.label, item);
        item.aliases.forEach(a => addAlias(kind, a, item));
        if (file) {
            const filename = normalizeKey(file.split(/[\\/]/).pop());
            if (filename) STATE.fileMap.set(filename, item);
        }
        item.sources.forEach(url => addUrlMapping(url, item));
    });
};

const indexCustomItems = (items = []) => {
    resetCustomIndexes();
    const list = Array.isArray(items) ? items : [];
    list.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const kind = normalizeKind(raw.kind);
        if (!kind) return;
        const idRaw = raw.id || raw.key || raw.name || raw.label || raw.file || raw.path || '';
        const id = normalizeKey(idRaw);
        const file = String(raw.file || raw.path || '').trim();
        if (!id && !file) return;
        const item = {
            kind,
            id: id || normalizeKey(file),
            file,
            label: String(raw.label || raw.name || raw.id || raw.key || '').trim(),
            aliases: Array.isArray(raw.aliases) ? raw.aliases.slice() : [],
            sources: Array.isArray(raw.sources) ? raw.sources.slice() : Array.isArray(raw.urls) ? raw.urls.slice() : [],
        };
        addCustomAlias(kind, item.id, item);
        if (item.label) addCustomAlias(kind, item.label, item);
        item.aliases.forEach(a => addCustomAlias(kind, a, item));
        if (file) {
            const filename = normalizeKey(file.split(/[\\/]/).pop());
            if (filename) STATE.custom.fileMap.set(filename, item);
        }
        item.sources.forEach(url => addCustomUrlMapping(url, item));
    });
};

const resolveItemUrl = (item) => {
    if (!item || typeof item !== 'object') return '';
    const rawFile = String(item.file || item.path || '').trim();
    if (!rawFile) return '';
    if (isLikelyUrl(rawFile) && !isWindowsPath(rawFile) && !isUncPath(rawFile)) return rawFile;
    if (STATE.baseType === 'tauri' && STATE.baseDir) {
        const full = isAbsolutePath(rawFile) ? rawFile : joinPath(STATE.baseDir, rawFile);
        const convert = getConvertFileSrc();
        if (typeof convert === 'function') {
            try {
                return convert(full);
            } catch {}
        }
        return toFileUrl(full) || full;
    }
    const baseDir = STATE.baseDir || './assets/media';
    return isAbsolutePath(rawFile) ? rawFile : joinPath(baseDir, rawFile);
};

export const initMediaAssets = async () => {
    if (STATE.loading) return STATE.loading;
    STATE.loading = (async () => {
        let manifest = null;
        let baseDir = '';
        let baseType = 'web';
        try {
            const resp = await safeInvoke('ensure_media_bundle', {});
            if (resp && typeof resp === 'object') {
                if (resp.base_dir) baseDir = String(resp.base_dir || '');
                if (resp.manifest && typeof resp.manifest === 'object') {
                    manifest = resp.manifest;
                    baseType = 'tauri';
                }
                if (resp.warning) logger.warn('media bundle warning', resp.warning);
            }
        } catch (err) {
            logger.debug('media bundle: tauri invoke skipped', err);
        }

        if (!manifest) {
            try {
                const res = await fetch('./assets/media/manifest.json', { cache: 'no-cache' });
                if (res.ok) {
                    manifest = await res.json();
                    baseDir = './assets/media';
                    baseType = 'web';
                }
            } catch (err) {
                logger.debug('media bundle: web manifest missing', err);
            }
        }

        if (!manifest) {
            manifest = { version: 1, items: [] };
            if (!baseDir) baseDir = './assets/media';
            baseType = 'web';
        }

        STATE.baseDir = baseDir;
        STATE.baseType = baseType;
        STATE.manifest = manifest;
        indexManifest(manifest);
        STATE.ready = true;
        return STATE;
    })();
    return STATE.loading;
};

export const resolveMediaAsset = (kind, value) => {
    const input = String(value || '').trim();
    const k = normalizeKind(kind);
    if (!input || !k) return null;
    if (!STATE.ready && !STATE.loading) {
        if (isLikelyUrl(input)) return { url: input, direct: true, fallbacks: [input] };
        return null;
    }
    const ref = parseAssetRef(input, k);
    if (ref) {
        const hit = STATE.custom.maps[ref.kind || k]?.get(ref.key) || STATE.maps[ref.kind || k]?.get(ref.key);
        if (hit) {
            const url = resolveItemUrl(hit);
            return { url, item: hit, fallbacks: buildFallbackUrls(url, hit) };
        }
        return null;
    }
    if (isLikelyUrl(input)) {
        const norm = normalizeUrl(input);
        const hit =
            STATE.custom.urlMap.get(norm)
            || STATE.custom.urlMap.get(normalizeUrl(stripQuery(norm)))
            || STATE.urlMap.get(norm)
            || STATE.urlMap.get(normalizeUrl(stripQuery(norm)));
        if (hit) {
            const url = resolveItemUrl(hit);
            return { url, item: hit, fallbacks: buildFallbackUrls(url, hit) };
        }
        const filename = normalizeKey(getFileNameFromUrl(norm));
        const byFile = filename
            ? (STATE.custom.fileMap.get(filename) || STATE.fileMap.get(filename))
            : null;
        if (byFile) {
            const url = resolveItemUrl(byFile);
            return { url, item: byFile, fallbacks: buildFallbackUrls(url, byFile) };
        }
        return { url: input, direct: true, fallbacks: [input] };
    }
    const key = normalizeKey(input);
    const map = STATE.maps[k];
    const hit = STATE.custom.maps[k].get(key) || map.get(key);
    if (hit) {
        const url = resolveItemUrl(hit);
        return { url, item: hit, fallbacks: buildFallbackUrls(url, hit) };
    }
    if (k === 'sticker') {
        const fallback = STATE.custom.maps.image.get(key) || STATE.maps.image.get(key);
        if (fallback) {
            const url = resolveItemUrl(fallback);
            return { url, item: fallback, fallbacks: buildFallbackUrls(url, fallback) };
        }
    }
    return null;
};

export const listMediaAssets = (kind) => {
    const k = normalizeKind(kind);
    if (!k) return [];
    const items = normalizeManifestItems(STATE.manifest)
        .filter((raw) => normalizeKind(raw?.kind) === k);
    return items.map((raw) => {
        const file = String(raw?.file || raw?.path || '').trim();
        const idRaw = raw?.id || raw?.key || raw?.name || raw?.label || file;
        const id = String(idRaw || '').trim();
        const label = String(raw?.label || raw?.name || raw?.id || raw?.key || '').trim();
        const aliases = Array.isArray(raw?.aliases) ? raw.aliases.slice() : [];
        const item = {
            kind: k,
            id: id || normalizeKey(file),
            file,
            label,
            aliases,
        };
        return { ...item, url: resolveItemUrl(item) };
    });
};

export const setCustomMediaItems = (items = []) => {
    indexCustomItems(items);
};

export { isLikelyUrl, isAssetRef };
