const normalizeStoredMode = (value = '') => {
  const mode = String(value || 'table').trim().toLowerCase();
  return mode === 'table' ? 'table' : 'summary';
};

const normalizeUiMode = (value = '') => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'off') return 'off';
  if (mode === 'summary') return 'summary';
  return 'table';
};

const createDetailEvent = (type, detail) => {
  if (typeof globalThis.CustomEvent === 'function') {
    return new globalThis.CustomEvent(type, { detail });
  }
  return { type, detail };
};

export const deriveMemoryStorageMode = (settings = {}) => {
  if (settings?.memoryEnabled === false) return 'off';
  return normalizeStoredMode(settings?.memoryStorageMode);
};

export const applyMemoryStorageMode = ({
  mode = 'table',
  appSettings = null,
  dispatchEvent = null,
} = {}) => {
  if (!appSettings || typeof appSettings.update !== 'function') return null;
  const nextMode = normalizeUiMode(mode);
  const current = typeof appSettings.get === 'function' ? appSettings.get() : {};
  const patch = nextMode === 'off'
    ? { memoryEnabled: false }
    : { memoryEnabled: true, memoryStorageMode: nextMode };
  const updated = appSettings.update(patch) || { ...(current || {}), ...patch };
  const storedMode = normalizeStoredMode(updated?.memoryStorageMode ?? current?.memoryStorageMode);
  if (typeof dispatchEvent === 'function') {
    dispatchEvent(createDetailEvent('memory-storage-mode-changed', { mode: nextMode }));
    dispatchEvent(createDetailEvent('app-settings-changed', {
      key: 'memoryEnabled',
      value: nextMode !== 'off',
    }));
    dispatchEvent(createDetailEvent('app-settings-changed', {
      key: 'memoryStorageMode',
      value: storedMode,
    }));
  }
  return nextMode;
};
