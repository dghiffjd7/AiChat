const cloneJson = (value, fallback = null) => {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
};

export const normalizePresetImportName = (value) => (
  String(value || '').trim().replace(/\s+/g, ' ')
);

export const normalizePresetImportNameKey = (value) => (
  normalizePresetImportName(value).toLowerCase()
);

export const getImportedPresetName = ({
  presetPayload = {},
  type = '',
} = {}) => (
  normalizePresetImportName(presetPayload?.name)
  || normalizePresetImportName(presetPayload?.data?.name)
  || normalizePresetImportName(type)
  || '导入预设'
);

export const buildImportedPresetCacheKey = ({
  type = '',
  presetName = '',
} = {}) => (
  `${String(type || '').trim().toLowerCase()}\u0000${normalizePresetImportNameKey(presetName)}`
);

export const findPresetIdByName = ({
  presetStore = null,
  type = '',
  presetName = '',
} = {}) => {
  const targetNameKey = normalizePresetImportNameKey(presetName);
  if (!presetStore || !targetNameKey) return '';
  const t = String(type || '').trim().toLowerCase();

  const state = presetStore.getState?.() || {};
  const bucket = state?.presets?.[t] && typeof state.presets[t] === 'object'
    ? state.presets[t]
    : null;
  if (bucket) {
    for (const [id, preset] of Object.entries(bucket)) {
      if (normalizePresetImportNameKey(preset?.name || id) === targetNameKey) {
        return String(id || '').trim();
      }
    }
  }

  try {
    const list = typeof presetStore.list === 'function' ? presetStore.list(t) : [];
    for (const preset of Array.isArray(list) ? list : []) {
      if (normalizePresetImportNameKey(preset?.name || preset?.id) === targetNameKey) {
        return String(preset?.id || '').trim();
      }
    }
  } catch {}

  return '';
};

export const buildImportedPresetUpsertPayload = ({
  presetPayload = {},
  presetName = '',
} = {}) => ({
  name: normalizePresetImportName(presetName),
  data: cloneJson(presetPayload?.data || {}, {}),
  makeActive: false,
});

export const resolveImportedPresetIdByName = async ({
  presetStore = null,
  type = '',
  presetPayload = {},
  cache = null,
  upsertPayloadBuilder = buildImportedPresetUpsertPayload,
} = {}) => {
  if (!presetPayload?.data || !presetStore?.upsert) return '';
  const presetName = getImportedPresetName({ presetPayload, type });
  const cacheKey = buildImportedPresetCacheKey({ type, presetName });
  if (cache?.has?.(cacheKey)) return String(cache.get(cacheKey) || '').trim();

  const existingId = findPresetIdByName({ presetStore, type, presetName });
  if (existingId) {
    cache?.set?.(cacheKey, existingId);
    return existingId;
  }

  const presetId = await presetStore.upsert(
    type,
    upsertPayloadBuilder({ presetPayload, presetName, type }),
  );
  const nextId = String(presetId || '').trim();
  if (nextId) cache?.set?.(cacheKey, nextId);
  return nextId;
};
