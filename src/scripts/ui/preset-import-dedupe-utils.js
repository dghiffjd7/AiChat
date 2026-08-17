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
  requiredAppScope = '',
} = {}) => (
  `${String(type || '').trim().toLowerCase()}\u0000${normalizePresetImportNameKey(presetName)}`
  + (requiredAppScope ? `\u0000scope:${String(requiredAppScope).trim().toLowerCase()}` : '')
);

const normalizeAppScope = (value, fallback = '') => {
  const scope = String(value || '').trim().toLowerCase();
  return ['creative', 'chat', 'all'].includes(scope) ? scope : fallback;
};

const presetSatisfiesAppScope = (preset = {}, requiredAppScope = '') => {
  const required = normalizeAppScope(requiredAppScope);
  if (!required) return true;
  const actual = normalizeAppScope(preset?.app_scope ?? preset?.appScope, 'all');
  return actual === 'all' || actual === required;
};

export const findPresetIdByName = ({
  presetStore = null,
  type = '',
  presetName = '',
  requiredAppScope = '',
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
      if (
        normalizePresetImportNameKey(preset?.name || id) === targetNameKey
        && presetSatisfiesAppScope(preset, requiredAppScope)
      ) {
        return String(id || '').trim();
      }
    }
  }

  try {
    const list = typeof presetStore.list === 'function' ? presetStore.list(t) : [];
    for (const preset of Array.isArray(list) ? list : []) {
      if (
        normalizePresetImportNameKey(preset?.name || preset?.id) === targetNameKey
        && presetSatisfiesAppScope(preset, requiredAppScope)
      ) {
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
  appScope: 'creative',
  makeActive: false,
});

export const buildRestoredPresetUpsertPayload = (options = {}) => ({
  ...buildImportedPresetUpsertPayload(options),
  appScope: 'all',
});

export const resolveImportedPresetIdByName = async ({
  presetStore = null,
  type = '',
  presetPayload = {},
  cache = null,
  upsertPayloadBuilder = buildImportedPresetUpsertPayload,
  requiredAppScope = '',
} = {}) => {
  if (!presetPayload?.data || !presetStore?.upsert) return '';
  const presetName = getImportedPresetName({ presetPayload, type });
  const normalizedRequiredScope = normalizeAppScope(requiredAppScope);
  const cacheKey = buildImportedPresetCacheKey({
    type,
    presetName,
    requiredAppScope: normalizedRequiredScope,
  });
  if (cache?.has?.(cacheKey)) return String(cache.get(cacheKey) || '').trim();

  const existingId = findPresetIdByName({
    presetStore,
    type,
    presetName,
    requiredAppScope: normalizedRequiredScope,
  });
  if (existingId) {
    cache?.set?.(cacheKey, existingId);
    return existingId;
  }

  const builtPayload = upsertPayloadBuilder({ presetPayload, presetName, type });
  const presetId = await presetStore.upsert(type, {
    ...(builtPayload && typeof builtPayload === 'object' ? builtPayload : {}),
    ...(normalizedRequiredScope ? { appScope: normalizedRequiredScope } : {}),
  });
  const nextId = String(presetId || '').trim();
  if (nextId) cache?.set?.(cacheKey, nextId);
  return nextId;
};

export const bindImportedPresetToSession = async ({
  presetStore = null,
  type = '',
  sessionId = '',
  presetId = '',
} = {}) => {
  const sid = String(sessionId || '').trim();
  const expectedPresetId = String(presetId || '').trim();
  if (!presetStore?.setSessionBinding || !sid || !expectedPresetId) {
    return { ok: false, reason: 'preset_session_binding_unavailable', actualPresetId: '' };
  }
  const bindings = await presetStore.setSessionBinding(type, sid, expectedPresetId);
  const actualPresetId = String(
    presetStore.getSessionBindingId?.(type, sid)
    || bindings?.sessions?.[sid]
    || '',
  ).trim();
  return actualPresetId === expectedPresetId
    ? { ok: true, reason: '', actualPresetId }
    : { ok: false, reason: 'preset_session_binding_rejected', actualPresetId };
};
