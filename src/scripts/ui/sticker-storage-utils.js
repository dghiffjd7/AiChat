export const STICKER_USAGE_STORAGE_KEY = 'sticker_usage_v1';
export const STICKER_RECENT_STORAGE_KEY = 'sticker_recents';
export const STICKER_AI_STATE_STORAGE_KEY = 'sticker_ai_state_v1';

const getDefaultLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const readJson = (storage, key, fallback) => {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const readStickerUsage = ({
  storage = getDefaultLocalStorage(),
  key = STICKER_USAGE_STORAGE_KEY,
} = {}) => {
  const parsed = readJson(storage, key, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
};

export const writeStickerUsage = (
  usage = {},
  {
    storage = getDefaultLocalStorage(),
    key = STICKER_USAGE_STORAGE_KEY,
  } = {},
) => {
  try {
    storage?.setItem?.(key, JSON.stringify(usage || {}));
    return true;
  } catch {
    return false;
  }
};

export const readStickerRecents = ({
  storage = getDefaultLocalStorage(),
  key = STICKER_RECENT_STORAGE_KEY,
  max = Number.POSITIVE_INFINITY,
} = {}) => {
  const parsed = readJson(storage, key, null);
  if (!Array.isArray(parsed)) return [];
  const limit = Math.max(0, Number(max) || 0);
  return Number.isFinite(limit) ? parsed.slice(0, limit) : parsed.slice();
};

export const writeStickerRecents = (
  recents = [],
  {
    storage = getDefaultLocalStorage(),
    key = STICKER_RECENT_STORAGE_KEY,
    max = 24,
  } = {},
) => {
  try {
    const list = Array.isArray(recents) ? recents : [];
    const limit = Math.max(0, Number(max) || 0);
    const next = limit > 0 ? list.slice(0, limit) : [];
    storage?.setItem?.(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
};

export const updateStickerRecents = (
  keyword = '',
  {
    storage = getDefaultLocalStorage(),
    key = STICKER_RECENT_STORAGE_KEY,
    max = 24,
  } = {},
) => {
  const normalized = String(keyword || '').trim();
  if (!normalized) return false;
  const list = readStickerRecents({ storage, key });
  const next = [normalized, ...list.filter(item => item !== normalized)];
  return writeStickerRecents(next, { storage, key, max });
};

export const resolveMostUsedStickerKeys = ({
  usage = {},
  storage = getDefaultLocalStorage(),
  recentKey = STICKER_RECENT_STORAGE_KEY,
  max = 48,
} = {}) => {
  const limit = Math.max(0, Number(max) || 0);
  const entries = Object.entries(usage || {})
    .map(([key, count]) => ({ key, count: Number(count || 0) }))
    .filter(item => item.key && Number.isFinite(item.count) && item.count > 0)
    .sort((a, b) => b.count - a.count);
  const keys = entries.map(item => item.key);
  if (keys.length) return limit > 0 ? keys.slice(0, limit) : [];
  return readStickerRecents({ storage, key: recentKey, max: limit });
};

export const readStickerAiState = ({
  storage = getDefaultLocalStorage(),
  key = STICKER_AI_STATE_STORAGE_KEY,
} = {}) => {
  const parsed = readJson(storage, key, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const writeStickerAiState = (
  state = {},
  {
    storage = getDefaultLocalStorage(),
    key = STICKER_AI_STATE_STORAGE_KEY,
  } = {},
) => {
  try {
    storage?.setItem?.(key, JSON.stringify(state || {}));
    return true;
  } catch {
    return false;
  }
};
