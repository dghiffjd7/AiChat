// 会话格式画像存储（格式修复触发与自定义格式计划 §4 缺口 6）。
// 缓存女仆调查链（格式提醒 -> 正则 -> 世界书/角色卡）提取的自定义格式规范，
// 二次修复免重查；修复引擎在无 formatHint 时自动取用。

export const MAID_FORMAT_PROFILE_STORE_KEY = 'maid_format_profile_store_v1';
export const MAID_FORMAT_PROFILE_STORE_VERSION = 1;

const MAX_PROFILES = 80;
const MAX_GUIDE_LENGTH = 6000;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeNow = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  } catch {
    return Date.now();
  }
};

const normalizeSources = value => (Array.isArray(value) ? value : [])
  .map(item => ({
    type: trim(item?.type, 'unknown'),
    ref: trim(item?.ref).slice(0, 160),
  }))
  .filter(item => item.type !== 'unknown' || item.ref)
  .slice(0, 8);

const normalizeProfile = (sessionId = '', raw = {}, { now = Date.now } = {}) => {
  const sid = trim(sessionId || raw?.sessionId);
  const guide = trim(raw?.guide).slice(0, MAX_GUIDE_LENGTH);
  if (!sid || !guide) return null;
  return {
    sessionId: sid,
    guide,
    sources: normalizeSources(raw?.sources),
    updatedAt: Number(raw?.updatedAt) > 0 ? Number(raw.updatedAt) : safeNow(now),
  };
};

export const normalizeMaidFormatProfileState = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const profilesRaw = isPlainObject(src.profiles) ? src.profiles : {};
  const profiles = {};
  Object.entries(profilesRaw).forEach(([sessionId, profile]) => {
    const normalized = normalizeProfile(sessionId, profile, { now });
    if (normalized) profiles[normalized.sessionId] = normalized;
  });
  const keptIds = Object.values(profiles)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PROFILES)
    .map(profile => profile.sessionId);
  const keptSet = new Set(keptIds);
  Object.keys(profiles).forEach((sessionId) => {
    if (!keptSet.has(sessionId)) delete profiles[sessionId];
  });
  return {
    version: MAID_FORMAT_PROFILE_STORE_VERSION,
    updatedAt: Number(src.updatedAt) > 0 ? Number(src.updatedAt) : safeNow(now),
    profiles,
  };
};

export const createMaidFormatProfileStore = ({
  storage = globalThis?.localStorage || null,
  loadKv = null,
  saveKv = null,
  key = MAID_FORMAT_PROFILE_STORE_KEY,
  now = Date.now,
  logger = console,
} = {}) => {
  let state = null;

  const load = () => {
    if (state) return state;
    let raw = null;
    try {
      const text = storage?.getItem?.(key);
      raw = text ? JSON.parse(text) : null;
    } catch {}
    state = normalizeMaidFormatProfileState(raw || {}, { now });
    return state;
  };

  // kv 为主通道（localStorage 可能配额已满，写入会静默失败），localStorage 仅作尽力缓存。
  const hydrate = async () => {
    load();
    if (typeof loadKv !== 'function') return state;
    try {
      const kvRaw = await loadKv(key);
      if (kvRaw && typeof kvRaw === 'object' && !kvRaw._tooLarge) {
        const kvState = normalizeMaidFormatProfileState(kvRaw, { now });
        if (Number(kvState.updatedAt || 0) >= Number(state.updatedAt || 0) ||
          !Object.keys(state.profiles).length) {
          state = kvState;
        }
      }
    } catch (err) {
      logger?.debug?.('maid format profile kv hydrate skipped', err);
    }
    return state;
  };

  const save = () => {
    if (!state) return false;
    state.updatedAt = safeNow(now);
    const payload = JSON.stringify(state);
    let localOk = false;
    try {
      storage?.setItem?.(key, payload);
      localOk = true;
    } catch {}
    if (typeof saveKv === 'function') {
      Promise.resolve(saveKv(key, JSON.parse(payload))).catch((err) => {
        logger?.warn?.('maid format profile kv save failed', err);
      });
      return true;
    }
    return localOk;
  };

  return {
    hydrate,
    get(sessionId = '') {
      const sid = trim(sessionId);
      const profile = sid ? load().profiles[sid] : null;
      return profile ? { ...profile, sources: profile.sources.map(item => ({ ...item })) } : null;
    },
    set(sessionId = '', profile = {}) {
      const normalized = normalizeProfile(sessionId, profile, { now });
      if (!normalized) return null;
      load().profiles[normalized.sessionId] = normalized;
      state = normalizeMaidFormatProfileState(state, { now });
      save();
      return { ...normalized };
    },
    remove(sessionId = '') {
      const sid = trim(sessionId);
      if (!sid || !load().profiles[sid]) return false;
      delete state.profiles[sid];
      save();
      return true;
    },
    list() {
      return Object.values(load().profiles)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(profile => ({ ...profile }));
    },
  };
};
