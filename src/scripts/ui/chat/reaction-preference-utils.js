import { DEFAULT_REACTION_EMOJIS } from './message-interaction-utils.js';

export const REACTION_USAGE_STORAGE_KEY = 'chat_reaction_usage_v1';
export const DEFAULT_QUICK_REACTION_EMOJIS = Object.freeze(DEFAULT_REACTION_EMOJIS.slice(0, 3));

const getDefaultStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const normalizeReactionUsage = (input = null) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const normalized = {};
  Object.entries(input).forEach(([emoji, rawCount]) => {
    const key = String(emoji || '').trim();
    const count = Math.max(0, Math.trunc(Number(rawCount) || 0));
    if (key && count > 0) normalized[key] = count;
  });
  return normalized;
};

export const readReactionUsage = ({
  storage = getDefaultStorage(),
  key = REACTION_USAGE_STORAGE_KEY,
} = {}) => {
  try {
    const raw = storage?.getItem?.(key);
    return normalizeReactionUsage(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
};

export const writeReactionUsage = (usage = {}, {
  storage = getDefaultStorage(),
  key = REACTION_USAGE_STORAGE_KEY,
} = {}) => {
  try {
    storage?.setItem?.(key, JSON.stringify(normalizeReactionUsage(usage)));
    return true;
  } catch {
    return false;
  }
};

export const recordReactionUse = (emoji = '', options = {}) => {
  const key = String(emoji || '').trim();
  if (!key) return readReactionUsage(options);
  const usage = readReactionUsage(options);
  usage[key] = Math.min(Number.MAX_SAFE_INTEGER, (usage[key] || 0) + 1);
  writeReactionUsage(usage, options);
  return usage;
};

export const resolveQuickReactionEmojis = ({
  usage = {},
  defaults = DEFAULT_QUICK_REACTION_EMOJIS,
  limit = 3,
} = {}) => {
  const max = Math.max(0, Math.trunc(Number(limit) || 0));
  if (!max) return [];
  const normalizedUsage = normalizeReactionUsage(usage);
  const fallback = Array.from(new Set((Array.isArray(defaults) ? defaults : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
  const fallbackOrder = new Map(fallback.map((emoji, index) => [emoji, index]));
  const ranked = Object.entries(normalizedUsage)
    .sort(([emojiA, countA], [emojiB, countB]) => (
      countB - countA ||
      (fallbackOrder.get(emojiA) ?? Number.MAX_SAFE_INTEGER) -
        (fallbackOrder.get(emojiB) ?? Number.MAX_SAFE_INTEGER) ||
      emojiA.localeCompare(emojiB)
    ))
    .map(([emoji]) => emoji);
  return Array.from(new Set([...ranked, ...fallback])).slice(0, max);
};

export const resolveFrequentReactionEmojis = ({
  usage = {},
  defaults = DEFAULT_REACTION_EMOJIS,
  limit = 18,
} = {}) => resolveQuickReactionEmojis({ usage, defaults, limit });
