/**
 * 配置管理 - 负责配置的持久化存储
 */

import { logger } from '../utils/logger.js';
import { normalizeGenerationParamFilterList } from '../utils/generation-param-filter-utils.js';
import { safeInvoke } from '../utils/tauri.js';

const SUPPORTED_PROVIDERS = [
    'openai',
    'makersuite',
    'vertexai',
    'anthropic',
    'deepseek',
    'ollama',
    'openrouter',
    'gemini',
    'custom',
    'novelai',
    'stability',
    'togetherai',
    'pollinations',
    'automatic1111',
    'a1111',
    'comfyui',
    'comfy',
];

const IMAGE_ONLY_PROVIDERS = new Set([
    'novelai',
    'stability',
    'togetherai',
    'pollinations',
    'automatic1111',
    'a1111',
    'comfyui',
    'comfy',
]);

const TEXT_ONLY_PROVIDERS = new Set([
    'anthropic',
    'deepseek',
    'ollama',
    'openrouter',
]);

const PROMPT_POST_PROCESSING_MODES = new Set(['none', 'merge', 'semi', 'strict', 'single']);

const normalizePromptPostProcessing = (mode) => {
    const raw = String(mode || '').trim().toLowerCase();
    return PROMPT_POST_PROCESSING_MODES.has(raw) ? raw : 'none';
};

const PROFILE_STORE_KEY = 'llm_profiles_v1';
const KEYRING_STORE_KEY = 'llm_keyring_v1';
const KEYRING_MASTER_KEY = 'llm_keyring_master_v1';

const resolveStoreKeys = (scope) => {
    const raw = String(scope || '').trim().toLowerCase();
    if (!raw || raw === 'chat') {
        return {
            profile: PROFILE_STORE_KEY,
            keyring: KEYRING_STORE_KEY,
            master: KEYRING_MASTER_KEY,
        };
    }
    const safe = raw.replace(/[^a-z0-9_-]/g, '_');
    return {
        profile: `llm_profiles_${safe}_v1`,
        keyring: `llm_keyring_${safe}_v1`,
        master: `llm_keyring_master_${safe}_v1`,
    };
};

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const encodeB64 = (buf) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str);
};

const decodeB64 = (b64) => {
    const str = atob(b64);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return bytes;
};

const maskKey = (key) => {
    const raw = String(key || '').trim();
    if (!raw) return '';
    if (raw.length <= 4) return `${raw.slice(0, 1)}••${raw.slice(-1)}`;
    return `${raw.slice(0, 2)}••••••••${raw.slice(-2)}`;
};

const isLikelyPlainApiKey = (val) => {
    const s = String(val || '').trim();
    if (!s) return false;
    if (s.length < 8 || s.length > 512) return false;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        // API key 通常为可打印 ASCII；若出現控制字元，極可能是 AES 密文 bytes 被误当成字串
        if (c < 0x20 || c > 0x7e) return false;
    }
    return true;
};

const normalizeTimestamp = (value, fallback = Date.now()) => {
    const raw = Number(value);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

const normalizeProfile = (p = {}, { touchUpdatedAt = false } = {}) => {
    const now = Date.now();
    const createdAt = normalizeTimestamp(p.createdAt, now);
    const updatedAt = touchUpdatedAt
        ? now
        : normalizeTimestamp(p.updatedAt, createdAt);
    return {
        id: p.id || genId('profile'),
        name: p.name || '未命名',
        provider: p.provider || 'openai',
        baseUrl: p.baseUrl || 'https://api.openai.com/v1',
        connectionMode: p.connectionMode === 'reverse_proxy' ? 'reverse_proxy' : 'direct',
        proxyBaseUrl: typeof p.proxyBaseUrl === 'string' ? p.proxyBaseUrl : '',
        proxyAuthHeaderName: typeof p.proxyAuthHeaderName === 'string' ? p.proxyAuthHeaderName : '',
        proxyAuthToken: typeof p.proxyAuthToken === 'string' ? p.proxyAuthToken : '',
        forwardProviderAuth: p.forwardProviderAuth !== false,
        promptPostProcessing: normalizePromptPostProcessing(p.promptPostProcessing),
        model: p.model || 'gpt-3.5-turbo',
        stream: p.stream !== false,
        excludedGenerationParams: normalizeGenerationParamFilterList(p.excludedGenerationParams),
        timeout: typeof p.timeout === 'number' ? p.timeout : 60000,
        maxRetries: typeof p.maxRetries === 'number' ? p.maxRetries : 3,
        vertexaiRegion: p.vertexaiRegion,
        vertexaiServiceAccount: p.vertexaiServiceAccount,
        openrouterReferer: typeof p.openrouterReferer === 'string' ? p.openrouterReferer : '',
        openrouterTitle: typeof p.openrouterTitle === 'string' ? p.openrouterTitle : '',
        _saEncrypted: Boolean(p._saEncrypted),
        activeKeyId: p.activeKeyId || null,
        createdAt,
        updatedAt,
    };
};

const normalizeProfileStore = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const sourceProfiles = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : null;
    if (!sourceProfiles) return null;
    const profiles = {};
    Object.entries(sourceProfiles).forEach(([id, profile]) => {
        const normalized = normalizeProfile({ ...(profile || {}), id: profile?.id || id });
        profiles[normalized.id] = normalized;
    });
    const rawActiveId = String(raw.activeProfileId || '').trim();
    const activeProfileId = rawActiveId || null;
    return {
        activeProfileId,
        profiles,
        savedAt: normalizeTimestamp(raw.savedAt, 0),
    };
};

const getLatestProfileUpdatedAt = (store) => {
    const list = Object.values(store?.profiles || {});
    let latest = 0;
    list.forEach((profile) => {
        latest = Math.max(latest, normalizeTimestamp(profile?.updatedAt, 0));
    });
    return latest;
};

const getActiveProfileUpdatedAt = (store) => {
    const activeId = String(store?.activeProfileId || '').trim();
    if (!activeId) return 0;
    return normalizeTimestamp(store?.profiles?.[activeId]?.updatedAt, 0);
};

const choosePreferredProfileStore = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const aSavedAt = normalizeTimestamp(a.savedAt, 0);
    const bSavedAt = normalizeTimestamp(b.savedAt, 0);
    if (aSavedAt !== bSavedAt) return aSavedAt > bSavedAt ? a : b;
    const aActiveUpdatedAt = getActiveProfileUpdatedAt(a);
    const bActiveUpdatedAt = getActiveProfileUpdatedAt(b);
    if (aActiveUpdatedAt !== bActiveUpdatedAt) return aActiveUpdatedAt > bActiveUpdatedAt ? a : b;
    const aLatest = getLatestProfileUpdatedAt(a);
    const bLatest = getLatestProfileUpdatedAt(b);
    if (aLatest !== bLatest) return aLatest > bLatest ? a : b;
    const aCount = Object.keys(a.profiles || {}).length;
    const bCount = Object.keys(b.profiles || {}).length;
    return aCount >= bCount ? a : b;
};

const mergeProfileStores = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const profiles = {};
    const ids = new Set([
        ...Object.keys(a.profiles || {}),
        ...Object.keys(b.profiles || {}),
    ]);
    ids.forEach((id) => {
        const left = a.profiles?.[id] || null;
        const right = b.profiles?.[id] || null;
        if (left && right) {
            const leftUpdatedAt = normalizeTimestamp(left.updatedAt, 0);
            const rightUpdatedAt = normalizeTimestamp(right.updatedAt, 0);
            profiles[id] = leftUpdatedAt >= rightUpdatedAt ? left : right;
            return;
        }
        profiles[id] = left || right;
    });
    const preferred = choosePreferredProfileStore(a, b);
    const activeCandidates = [
        preferred?.activeProfileId,
        a?.activeProfileId,
        b?.activeProfileId,
    ];
    const activeProfileId =
        activeCandidates.find((id) => {
            const sid = String(id || '').trim();
            return sid && profiles[sid];
        }) || null;
    return {
        activeProfileId,
        profiles,
        savedAt: Math.max(
            normalizeTimestamp(a.savedAt, 0),
            normalizeTimestamp(b.savedAt, 0),
            getLatestProfileUpdatedAt(a),
            getLatestProfileUpdatedAt(b),
        ),
    };
};

export class ConfigManager {
    constructor(options = {}) {
        const scope = String(options.scope || 'chat').trim().toLowerCase();
        const keys = resolveStoreKeys(scope);
        this.scope = scope || 'chat';
        this.profileStoreKey = keys.profile;
        this.keyringStoreKey = keys.keyring;
        this.keyringMasterKey = keys.master;
        this.config = null;
        this.isLoaded = false;
        this.profileStore = null;
        this.keyringStore = null;
        this.cryptoKey = null;
        this.storesEnsured = false;
    }

    /**
     * 加载配置
     */
    async load() {
        if (this.isLoaded && this.config) {
            return this.config;
        }

        await this.ensureStores();

        try {
            const active = this.getActiveProfile();
            this.config = await this.buildRuntimeConfig(active);
            this.isLoaded = true;
            logger.debug(`配置加载成功: ${active.name} (ID: ${active.id}), provider: ${active.provider}`);
        } catch (e) {
            logger.error('配置加载失败，回退默认值', e);
            this.config = this.getDefault();
            this.isLoaded = true;
        }

        return this.config;
    }

    /**
     * 保存配置
     */
    async save(config) {
        await this.ensureStores();

        // 验证配置完整性（API Key 允许由 keyring 提供）
        try {
            this.validate(config);
        } catch (error) {
            logger.error('配置验证失败:', error);
            throw error;
        }

        const active = this.getActiveProfile();
        const nextProfile = normalizeProfile({
            ...active,
            ...config,
            id: active.id,
            name: active.name,
            updatedAt: Date.now(),
        }, { touchUpdatedAt: true });

        // 如果传入 apiKey（代表用户新输入），保存到 keyring 并设为当前 key
        if (typeof config.apiKey === 'string' && config.apiKey.trim()) {
            const keyId = await this.addKey(nextProfile.id, config.apiKey.trim(), 'API Key');
            nextProfile.activeKeyId = keyId;
        }

        // Service Account JSON：仅在用户提交新值时做 base64，避免重复编码
        if (typeof config.vertexaiServiceAccount === 'string' && config.vertexaiServiceAccount.trim()) {
            nextProfile.vertexaiServiceAccount = btoa(config.vertexaiServiceAccount);
            nextProfile._saEncrypted = true;
        }

        this.profileStore.profiles[nextProfile.id] = nextProfile;
        this.profileStore.activeProfileId = nextProfile.id;
        logger.info(`保存配置: ${nextProfile.name} (ID: ${nextProfile.id}), 设置为活跃配置`);
        await this.persistProfiles();

        // 更新运行时 config（解密 SA + 解密 active key）
        this.config = await this.buildRuntimeConfig(nextProfile);
        this.isLoaded = true;
    }

    /**
     * 获取当前配置
     */
    get() {
        return this.config || this.getDefault();
    }

    /**
     * 更新当前配置缓存（不持久化）
     */
    set(config) {
        this.config = config;
        this.isLoaded = true;
    }

    async reload() {
        this.isLoaded = false;
        this.storesEnsured = false;
        this.profileStore = null;
        this.keyringStore = null;
        this.config = null;
        return this.load();
    }

    /**
     * 获取默认配置
     */
    getDefault() {
        const isImage = this.scope === 'image';
        return {
            provider: 'openai',
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            connectionMode: 'direct',
            proxyBaseUrl: '',
            proxyAuthHeaderName: '',
            proxyAuthToken: '',
            forwardProviderAuth: true,
            promptPostProcessing: 'none',
            model: isImage ? 'gpt-image-2' : 'gpt-3.5-turbo',
            stream: true,
            excludedGenerationParams: [],
            timeout: 60000,
            maxRetries: 3
        };
    }

    async ensureStores() {
        if (this.storesEnsured && this.profileStore && this.keyringStore) return;

        // profiles
        let profiles = null;
        try {
            profiles = await safeInvoke('load_kv', { name: this.profileStoreKey });
            if (profiles && typeof profiles === 'object' && profiles._tooLarge) {
                logger.warn('profiles load_kv payload too large, fallback to localStorage', profiles);
                profiles = null;
            }
            if (profiles) {
                logger.debug(`load_kv profiles 成功 (Tauri): activeProfileId=${profiles.activeProfileId}, profiles数量=${Object.keys(profiles.profiles || {}).length}`);
            }
        } catch (err) {
            logger.debug('load_kv profiles failed (可能非 Tauri)', err);
        }
        if (!profiles || typeof profiles !== 'object') profiles = null;

        // keyring
        let keyring = null;
        try {
            keyring = await safeInvoke('load_kv', { name: this.keyringStoreKey });
            if (keyring && typeof keyring === 'object' && keyring._tooLarge) {
                logger.warn('keyring load_kv payload too large, fallback to localStorage', keyring);
                keyring = null;
            }
            if (keyring) {
                logger.debug('load_kv keyring 成功 (Tauri)');
            }
        } catch (err) {
            logger.debug('load_kv keyring failed (可能非 Tauri)', err);
        }
        if (!keyring || typeof keyring !== 'object') keyring = null;

        // master key + WebCrypto（在某些 WebView 可能缺失，需降级但仍保证落盘）
        try {
            if (crypto?.subtle?.importKey && crypto?.getRandomValues) {
                let masterB64 = null;
                try {
                    const mk = await safeInvoke('load_kv', { name: this.keyringMasterKey });
                    if (mk && typeof mk === 'object' && !mk._tooLarge && mk.master) masterB64 = mk.master;
                } catch (err) {
                    logger.debug('load_kv master key failed (可能非 Tauri)', err);
                }
                // browser fallback (dev mode): keyring master 可能直接存 string
                if (!masterB64) {
                    try {
                        const raw = localStorage.getItem(this.keyringMasterKey);
                        if (raw) masterB64 = raw;
                    } catch {}
                }
                if (!masterB64) {
                    const bytes = crypto.getRandomValues(new Uint8Array(32));
                    masterB64 = encodeB64(bytes);
                    try {
                        await safeInvoke('save_kv', { name: this.keyringMasterKey, data: { master: masterB64 } });
                    } catch (err) {
                        logger.warn('save_kv master key failed (可能非 Tauri)', err);
                        try {
                            localStorage.setItem(this.keyringMasterKey, masterB64);
                        } catch {}
                    }
                }
                const rawKey = decodeB64(masterB64);
                this.cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
            } else {
                this.cryptoKey = null;
                logger.warn('WebCrypto 不可用，Keyring 将使用弱加密（base64）');
            }
        } catch (err) {
            this.cryptoKey = null;
            logger.warn('初始化 Keyring 加密失败，将使用弱加密（base64）', err);
        }

        // fallback localStorage for non-tauri
        let localProfiles = null;
        if (!profiles) {
            try {
                const raw = localStorage.getItem(this.profileStoreKey);
                if (raw) {
                    localProfiles = JSON.parse(raw);
                    profiles = localProfiles;
                    logger.debug(`localStorage profiles 加载成功（备份）: activeProfileId=${profiles.activeProfileId}, profiles数量=${Object.keys(profiles.profiles || {}).length}`);
                }
            } catch (err) {
                logger.error('localStorage profiles 加载失败', err);
            }
        } else {
            try {
                const raw = localStorage.getItem(this.profileStoreKey);
                if (raw) {
                    localProfiles = JSON.parse(raw);
                    logger.debug(`localStorage profiles 对比加载成功（备份）: activeProfileId=${localProfiles.activeProfileId}, profiles数量=${Object.keys(localProfiles.profiles || {}).length}`);
                }
            } catch (err) {
                logger.error('localStorage profiles 对比加载失败', err);
            }
        }
        if (!keyring) {
            try {
                const raw = localStorage.getItem(this.keyringStoreKey);
                if (raw) {
                    keyring = JSON.parse(raw);
                    logger.info('localStorage keyring 加载成功（备份）');
                }
            } catch (err) {
                logger.error('localStorage keyring 加载失败', err);
            }
        }

        // init store
        const normalizedProfiles = normalizeProfileStore(profiles);
        const normalizedLocalProfiles = normalizeProfileStore(localProfiles);
        profiles = mergeProfileStores(normalizedProfiles, normalizedLocalProfiles) || { activeProfileId: null, profiles: {}, savedAt: 0 };
        if (!Object.prototype.hasOwnProperty.call(profiles, 'activeProfileId')) {
            profiles.activeProfileId = null;
        }
        if (!keyring || !keyring.keysByProfile) {
            keyring = { keysByProfile: {} };
        }

        this.profileStore = profiles;
        this.keyringStore = keyring;

        // migration: if no profile, create default from old config
        const hasAnyProfile = Object.keys(this.profileStore.profiles || {}).length > 0;
        if (!hasAnyProfile) {
            const base = await this.migrateLegacyConfig();
            const profile = normalizeProfile({ ...base, name: '默认' });
            this.profileStore.profiles[profile.id] = profile;
            this.profileStore.activeProfileId = profile.id;

            // legacy apiKey -> keyring
            if (base.apiKey && String(base.apiKey).trim()) {
                const keyId = await this.addKey(profile.id, String(base.apiKey).trim(), 'API Key');
                this.profileStore.profiles[profile.id].activeKeyId = keyId;
            }
            await this.persistProfiles(this.profileStore);
            await this.persistKeyring(this.keyringStore);
        }

        // ensure active profile - 按照 updatedAt 排序选择最近使用的
        if (!this.profileStore.activeProfileId || !this.profileStore.profiles[this.profileStore.activeProfileId]) {
            const profileList = Object.values(this.profileStore.profiles).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            this.profileStore.activeProfileId = profileList[0]?.id || null;
            if (this.profileStore.activeProfileId) {
                logger.info(`自动选择最近使用的配置: ${profileList[0]?.name}`);
                await this.persistProfiles(this.profileStore);
            }
        }

        if (normalizedProfiles && normalizedLocalProfiles) {
            const preferredStore = choosePreferredProfileStore(normalizedProfiles, normalizedLocalProfiles);
            const preferredActive = String(preferredStore?.activeProfileId || '').trim();
            const currentActive = String(this.profileStore?.activeProfileId || '').trim();
            if ((preferredActive && preferredActive !== currentActive) || preferredStore?.savedAt !== this.profileStore?.savedAt) {
                await this.persistProfiles(this.profileStore);
            }
        }

        this.storesEnsured = true;
    }

    async migrateLegacyConfig() {
        // 1) try old tauri load_config (可能不含 apiKey)
        try {
            const cfg = await safeInvoke('load_config');
            if (cfg && typeof cfg === 'object') {
                return { ...this.getDefault(), ...cfg };
            }
        } catch (err) {
            logger.debug('legacy load_config skipped', err);
        }
        // 2) localStorage legacy
        try {
            const stored = localStorage.getItem('llm_configs');
            if (stored) {
                const all = JSON.parse(stored);
                const provider = all.currentProvider || 'openai';
                const p = all[provider] ? { ...all[provider], provider } : null;
                if (p) {
                    // decode SA if needed
                    if (p._saEncrypted && p.vertexaiServiceAccount) {
                        try { p.vertexaiServiceAccount = atob(p.vertexaiServiceAccount); } catch {}
                    }
                    // decode apiKey if existed
                    if (p._encrypted && p.apiKey) {
                        try { p.apiKey = atob(p.apiKey); } catch {}
                    }
                    return { ...this.getDefault(), ...p };
                }
            }
        } catch {}
        return this.getDefault();
    }

    async persistProfiles(next = this.profileStore) {
        this.profileStore = {
            ...(next || {}),
            savedAt: Date.now(),
        };
        const toSave = {
            activeProfileId: this.profileStore.activeProfileId,
            profiles: this.profileStore.profiles,
            savedAt: this.profileStore.savedAt,
        };
        logger.info(`持久化配置: activeProfileId=${toSave.activeProfileId}, profiles数量=${Object.keys(toSave.profiles || {}).length}`);

        let kvSaved = false;
        try {
            await safeInvoke('save_kv', { name: this.profileStoreKey, data: toSave });
            kvSaved = true;
            logger.info('save_kv profiles 成功 (Tauri)');
        } catch (err) {
            logger.warn('save_kv profiles failed (可能非 Tauri)，回退 localStorage', err);
        }

        // 同时保存到 localStorage 作为备份
        try {
            localStorage.setItem(this.profileStoreKey, JSON.stringify(toSave));
            logger.info('localStorage profiles 保存成功（备份）');
        } catch (localErr) {
            if (kvSaved) {
                try { localStorage.removeItem(this.profileStoreKey); } catch {}
                const reason = String(localErr?.name || localErr?.message || localErr || '').trim();
                logger.warn(`localStorage profiles 备份失败（KV 已保存，可忽略）${reason ? `: ${reason}` : ''}`);
            } else {
                logger.error('localStorage profiles 保存失败', localErr);
            }
        }
    }

    async persistKeyring(next = this.keyringStore) {
        this.keyringStore = next;
        try {
            await safeInvoke('save_kv', { name: this.keyringStoreKey, data: this.keyringStore });
        } catch (err) {
            logger.warn('save_kv keyring failed (可能非 Tauri)，回退 localStorage', err);
            localStorage.setItem(this.keyringStoreKey, JSON.stringify(this.keyringStore));
        }
    }

    getProfiles() {
        const profiles = Object.values(this.profileStore?.profiles || {}).map(p => normalizeProfile(p));
        profiles.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return profiles;
    }

    getActiveProfileId() {
        return this.profileStore?.activeProfileId || null;
    }

    getActiveProfile() {
        const id = this.getActiveProfileId();
        const p = id ? this.profileStore?.profiles?.[id] : null;
        if (p) return normalizeProfile(p);
        const profileList = this.getProfiles();
        return profileList[0] || normalizeProfile({ name: '默认' });
    }

    getProfileById(profileId) {
        const id = String(profileId || '').trim();
        if (!id) return null;
        const p = this.profileStore?.profiles?.[id];
        return p ? normalizeProfile(p) : null;
    }

    async setActiveProfile(profileId) {
        await this.ensureStores();
        if (!profileId || !this.profileStore?.profiles?.[profileId]) {
            logger.warn(`尝试切换到不存在的配置: ${profileId}`);
            return;
        }
        this.profileStore.profiles[profileId] = normalizeProfile(this.profileStore.profiles[profileId], { touchUpdatedAt: true });
        this.profileStore.activeProfileId = profileId;
        await this.persistProfiles();
        const p = this.getActiveProfile();
        logger.info(`切换活跃配置: ${p.name} (ID: ${profileId})`);
        this.config = await this.buildRuntimeConfig(p);
        this.isLoaded = true;
        return this.config;
    }

    async createProfile(name = '新配置', base = {}) {
        await this.ensureStores();
        const profile = normalizeProfile({ ...this.getDefault(), ...base, name });
        this.profileStore.profiles[profile.id] = profile;
        this.profileStore.activeProfileId = profile.id;
        await this.persistProfiles();
        this.config = await this.buildRuntimeConfig(profile);
        this.isLoaded = true;
        return profile;
    }

    async renameProfile(profileId, newName) {
        await this.ensureStores();
        const p = this.profileStore.profiles[profileId];
        if (!p) return;
        p.name = String(newName || '').trim() || p.name;
        p.updatedAt = Date.now();
        await this.persistProfiles();
    }

    async deleteProfile(profileId) {
        await this.ensureStores();
        if (!this.profileStore.profiles[profileId]) return;
        delete this.profileStore.profiles[profileId];
        // delete keys
        if (this.keyringStore.keysByProfile) {
            delete this.keyringStore.keysByProfile[profileId];
            await this.persistKeyring();
        }
        const ids = Object.keys(this.profileStore.profiles);
        this.profileStore.activeProfileId = ids[0] || null;
        await this.persistProfiles();
        const p = this.getActiveProfile();
        this.config = await this.buildRuntimeConfig(p);
        this.isLoaded = true;
    }

    listKeys(profileId) {
        const pid = profileId || this.getActiveProfileId();
        const list = (this.keyringStore?.keysByProfile?.[pid] || []).slice();
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return list;
    }

    async setActiveKey(profileId, keyId) {
        await this.ensureStores();
        const pid = profileId || this.getActiveProfileId();
        const p = this.profileStore.profiles[pid];
        if (!p) return;
        p.activeKeyId = keyId;
        p.updatedAt = Date.now();
        await this.persistProfiles();
        this.config = await this.buildRuntimeConfig(normalizeProfile(p));
        this.isLoaded = true;
    }

    async addKey(profileId, plainKey, label = '') {
        await this.ensureStores();
        const pid = profileId || this.getActiveProfileId();
        const key = String(plainKey || '').trim();
        if (!key) throw new Error('API Key 为空');

        let enc = '';
        let alg = 'b64';
        if (this.cryptoKey && crypto?.subtle?.encrypt && crypto?.getRandomValues) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.cryptoKey, new TextEncoder().encode(key));
            const packed = new Uint8Array(iv.byteLength + ct.byteLength);
            packed.set(iv, 0);
            packed.set(new Uint8Array(ct), iv.byteLength);
            enc = encodeB64(packed);
            alg = 'aesgcm';
        } else {
            enc = btoa(key);
        }

        const record = {
            id: genId('key'),
            label: String(label || '').trim() || 'API Key',
            preview: maskKey(key),
            enc,
            alg,
            createdAt: Date.now(),
        };
        if (!this.keyringStore.keysByProfile[pid]) this.keyringStore.keysByProfile[pid] = [];
        this.keyringStore.keysByProfile[pid].push(record);
        await this.persistKeyring();
        return record.id;
    }

    async removeKey(profileId, keyId) {
        await this.ensureStores();
        const pid = profileId || this.getActiveProfileId();
        const list = this.keyringStore.keysByProfile[pid] || [];
        this.keyringStore.keysByProfile[pid] = list.filter(k => k.id !== keyId);
        await this.persistKeyring();
        const p = this.profileStore.profiles[pid];
        if (p?.activeKeyId === keyId) {
            p.activeKeyId = this.keyringStore.keysByProfile[pid][0]?.id || null;
            await this.persistProfiles();
        }
        this.config = await this.buildRuntimeConfig(normalizeProfile(p || {}));
        this.isLoaded = true;
    }

    async decryptKey(profileId, keyId) {
        await this.ensureStores();
        const pid = profileId || this.getActiveProfileId();
        const record = (this.keyringStore.keysByProfile[pid] || []).find(k => k.id === keyId);
        if (!record) return '';

        // 已標記算法：嚴格按算法解密
        if (record.alg === 'b64') {
            try {
                return atob(record.enc);
            } catch {
                return '';
            }
        }

        if (record.alg === 'aesgcm') {
            if (!this.cryptoKey || !crypto?.subtle?.decrypt) return '';
            const bytes = decodeB64(record.enc);
            const iv = bytes.slice(0, 12);
            const ct = bytes.slice(12);
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.cryptoKey, ct);
            return new TextDecoder().decode(pt);
        }

        // 旧资料迁移：先尝试 AES-GCM，再尝试 base64 明文（可打印判断）
        if (this.cryptoKey && crypto?.subtle?.decrypt) {
            try {
                const bytes = decodeB64(record.enc);
                const iv = bytes.slice(0, 12);
                const ct = bytes.slice(12);
                const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.cryptoKey, ct);
                const plain = new TextDecoder().decode(pt);
                record.alg = 'aesgcm';
                await this.persistKeyring();
                return plain;
            } catch (err) {
                logger.debug('AES-GCM decrypt failed, try b64 fallback', err);
            }
        }

        try {
            const plain = atob(record.enc);
            if (isLikelyPlainApiKey(plain)) {
                record.alg = 'b64';
                await this.persistKeyring();
                return plain;
            }
        } catch {}

        return '';
    }

    async buildRuntimeConfig(profile) {
        const p = normalizeProfile(profile);
        const runtime = {
            provider: p.provider,
            baseUrl: p.baseUrl,
            connectionMode: p.connectionMode === 'reverse_proxy' ? 'reverse_proxy' : 'direct',
            proxyBaseUrl: String(p.proxyBaseUrl || '').trim(),
            proxyAuthHeaderName: String(p.proxyAuthHeaderName || '').trim(),
            proxyAuthToken: String(p.proxyAuthToken || ''),
            forwardProviderAuth: p.forwardProviderAuth !== false,
            promptPostProcessing: normalizePromptPostProcessing(p.promptPostProcessing),
            model: p.model,
            stream: p.stream,
            excludedGenerationParams: normalizeGenerationParamFilterList(p.excludedGenerationParams),
            timeout: p.timeout,
            maxRetries: p.maxRetries,
        };
        if (p.vertexaiRegion) runtime.vertexaiRegion = p.vertexaiRegion;
        if (p.openrouterReferer) runtime.openrouterReferer = p.openrouterReferer;
        if (p.openrouterTitle) runtime.openrouterTitle = p.openrouterTitle;
        if (p.vertexaiServiceAccount) {
            if (p._saEncrypted) {
                try {
                    runtime.vertexaiServiceAccount = atob(p.vertexaiServiceAccount);
                } catch {
                    runtime.vertexaiServiceAccount = p.vertexaiServiceAccount;
                }
            } else {
                runtime.vertexaiServiceAccount = p.vertexaiServiceAccount;
            }
        }
        if (p.activeKeyId) {
            try {
                runtime.apiKey = await this.decryptKey(p.id, p.activeKeyId);
            } catch (err) {
                logger.warn('解密 API Key 失败', err);
                runtime.apiKey = '';
            }
        } else {
            runtime.apiKey = '';
        }
        return runtime;
    }

    async getRuntimeConfigByProfileId(profileId) {
        await this.ensureStores();
        const p = this.getProfileById(profileId);
        if (!p) return null;
        return this.buildRuntimeConfig(p);
    }

    /**
     * 验证配置完整性
     */
    validate(config) {
        const required = ['provider', 'baseUrl', 'model'];
        const provider = String(config?.provider || '').trim().toLowerCase();
        const supportedProviders = this.scope === 'image'
            ? SUPPORTED_PROVIDERS.filter(item => !TEXT_ONLY_PROVIDERS.has(item))
            : SUPPORTED_PROVIDERS.filter(item => !IMAGE_ONLY_PROVIDERS.has(item));

        for (const key of required) {
            if (!config[key]) {
                throw new Error(`缺少必需的配置项: ${key}`);
            }
        }

        // 验证 provider
        if (!supportedProviders.includes(provider)) {
            throw new Error(`无效的 provider: ${config.provider}。可用: ${supportedProviders.join(', ')}`);
        }
        config.provider = provider;
        config.excludedGenerationParams = normalizeGenerationParamFilterList(config.excludedGenerationParams);

        // 验证 URL
        try {
            new URL(config.baseUrl);
        } catch (e) {
            throw new Error(`无效的 baseUrl: ${config.baseUrl}`);
        }

        const mode = String(config.connectionMode || 'direct').trim().toLowerCase();
        if (!['direct', 'reverse_proxy'].includes(mode)) {
            throw new Error(`无效的 connectionMode: ${config.connectionMode}`);
        }
        if (mode === 'reverse_proxy') {
            if (!config.proxyBaseUrl) {
                throw new Error('启用反代时必须填写反代 Base URL');
            }
            try {
                new URL(config.proxyBaseUrl);
            } catch (e) {
                throw new Error(`无效的 proxyBaseUrl: ${config.proxyBaseUrl}`);
            }
        }
        config.promptPostProcessing = normalizePromptPostProcessing(config.promptPostProcessing);

        return true;
    }

    /**
     * 重置为默认配置
     */
    async reset() {
        await this.ensureStores();
        const active = this.getActiveProfile();
        const profile = normalizeProfile({ ...this.getDefault(), id: active.id, name: active.name });
        this.profileStore.profiles[profile.id] = profile;
        await this.persistProfiles();
        this.config = await this.buildRuntimeConfig(profile);
        logger.info('配置已重置为默认值');
    }
}
