export const DRAFT_MIRROR_MAX_LENGTH = 20_000;

const getDefaultSessionStorage = () => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

export const buildDraftMirrorStorageKey = (sessionId = '') => (
  `phone_draft_${String(sessionId || '')}`
);

export const readDraftMirror = (
  sessionId = '',
  { storage = getDefaultSessionStorage() } = {},
) => {
  try {
    return storage?.getItem?.(buildDraftMirrorStorageKey(sessionId)) || '';
  } catch {
    return '';
  }
};

export const writeDraftMirror = (
  sessionId = '',
  text = '',
  {
    storage = getDefaultSessionStorage(),
    maxLength = DRAFT_MIRROR_MAX_LENGTH,
  } = {},
) => {
  const raw = String(text || '');
  const limit = Math.max(0, Number(maxLength) || 0);
  const value = limit > 0 && raw.length > limit ? raw.slice(-limit) : raw;
  try {
    storage?.setItem?.(buildDraftMirrorStorageKey(sessionId), value);
    return true;
  } catch {
    return false;
  }
};

export const removeDraftMirror = (
  sessionId = '',
  { storage = getDefaultSessionStorage() } = {},
) => {
  try {
    storage?.removeItem?.(buildDraftMirrorStorageKey(sessionId));
    return true;
  } catch {
    return false;
  }
};

export const bindDraftMirrorInput = ({
  inputEl = null,
  getSessionId = () => '',
  storage = getDefaultSessionStorage(),
  maxLength = DRAFT_MIRROR_MAX_LENGTH,
  markerAttribute = 'data-draft-mirror',
} = {}) => {
  if (!inputEl || typeof inputEl.addEventListener !== 'function') return false;
  if (typeof inputEl.hasAttribute === 'function' && inputEl.hasAttribute(markerAttribute)) return false;
  try {
    inputEl.setAttribute?.(markerAttribute, 'true');
    inputEl.addEventListener('input', () => {
      writeDraftMirror(getSessionId?.(), inputEl.value, { storage, maxLength });
    });
    return true;
  } catch {
    return false;
  }
};
