const STORAGE_KEY = 'agent_center_failure_read_state_v1';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeSurface = value => trim(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'global';

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const readState = (storage = globalThis?.localStorage) => {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeState = (state = {}, storage = globalThis?.localStorage) => {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(isPlainObject(state) ? state : {}));
    return true;
  } catch {
    return false;
  }
};

export const getAgentFailureSeenAt = ({
  surface = '',
  storage = globalThis?.localStorage,
} = {}) => {
  const state = readState(storage);
  const globalSeenAt = toFiniteNumber(state.global, 0);
  const surfaceKey = normalizeSurface(surface);
  const surfaceSeenAt = surfaceKey === 'global' ? 0 : toFiniteNumber(state[surfaceKey], 0);
  return Math.max(globalSeenAt, surfaceSeenAt);
};

export const markAgentFailuresSeen = ({
  surface = '',
  at = Date.now(),
  storage = globalThis?.localStorage,
} = {}) => {
  const state = readState(storage);
  const key = normalizeSurface(surface);
  const value = Math.max(toFiniteNumber(at, Date.now()), toFiniteNumber(state[key], 0));
  state[key] = value;
  writeState(state, storage);
  return value;
};
