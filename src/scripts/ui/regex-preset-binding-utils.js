export const REGEX_CUSTOM_PROMPT_PRESET_TYPE = 'openai';
export const REGEX_CUSTOM_PROMPT_PRESET_LABEL = '自定义提示词预设';

export const normalizeRegexCustomPromptPresetIds = (presetIds = []) => {
  const out = [];
  const seen = new Set();
  (Array.isArray(presetIds) ? presetIds : [presetIds]).forEach((value) => {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
};

export const getRegexPresetBindIds = (bind = null, presetType = '') => {
  if (!bind || typeof bind !== 'object' || bind.type !== 'preset') return [];
  const expectedType = String(presetType || '').trim();
  if (expectedType && String(bind.presetType || '').trim() !== expectedType) return [];
  return normalizeRegexCustomPromptPresetIds([
    ...(Array.isArray(bind.presetIds) ? bind.presetIds : []),
    bind.presetId,
  ]);
};

export const detachRegexPresetBind = (bind = null, {
  presetType = '',
  presetId = '',
} = {}) => {
  const type = String(presetType || '').trim();
  const id = String(presetId || '').trim();
  const ids = getRegexPresetBindIds(bind, type);
  if (!id || !ids.includes(id)) {
    return { matched: false, remainingIds: ids, bind };
  }
  const remainingIds = ids.filter(item => item !== id);
  if (!remainingIds.length) {
    return { matched: true, remainingIds, bind: null };
  }
  const { presetIds: _presetIds, presetId: _presetId, ...base } = bind;
  return {
    matched: true,
    remainingIds,
    bind: {
      ...base,
      type: 'preset',
      presetType: type || String(bind.presetType || '').trim(),
      presetId: remainingIds[0],
      presetIds: remainingIds,
    },
  };
};

export const getRegexCustomPromptPresetBindIds = (bind = null) => {
  return getRegexPresetBindIds(bind, REGEX_CUSTOM_PROMPT_PRESET_TYPE);
};

export const buildRegexCustomPromptPresetBind = (presetIds = '') => {
  const ids = normalizeRegexCustomPromptPresetIds(presetIds);
  if (!ids.length) return null;
  const bind = {
    type: 'preset',
    presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    presetId: ids[0],
  };
  return (ids.length > 1 || Array.isArray(presetIds))
    ? { ...bind, presetIds: ids }
    : bind;
};

export const formatRegexCustomPromptPresetBindName = (bind = null, presetStore = null) => {
  const ids = getRegexCustomPromptPresetBindIds(bind);
  if (!ids.length) return '';
  const presets = typeof presetStore?.list === 'function'
    ? presetStore.list(REGEX_CUSTOM_PROMPT_PRESET_TYPE)
    : [];
  const names = ids.map((id) => {
    const preset = Array.isArray(presets)
      ? presets.find(item => String(item?.id || '') === id)
      : null;
    return String(preset?.name || id).trim() || id;
  });
  return names.join('、');
};

export const buildRegexCustomPromptPresetBindSummary = (bind = null, presetStore = null) => {
  const name = formatRegexCustomPromptPresetBindName(bind, presetStore);
  return name
    ? `${REGEX_CUSTOM_PROMPT_PRESET_LABEL} / ${name}`
    : null;
};

export const listRegexCustomPromptPresetChoices = (presetStore = null) => {
  const presets = typeof presetStore?.list === 'function'
    ? presetStore.list(REGEX_CUSTOM_PROMPT_PRESET_TYPE)
    : [];
  if (!Array.isArray(presets)) return [];
  return presets
    .map((preset) => {
      const id = String(preset?.id || '').trim();
      if (!id) return null;
      const name = String(preset?.name || id).trim() || id;
      return { id, name };
    })
    .filter(Boolean);
};

export const resolveImportedRegexPresetBindTarget = ({
  importType = '',
  presetId = '',
  presetStore = null,
} = {}) => {
  if (String(importType || '').trim() !== REGEX_CUSTOM_PROMPT_PRESET_TYPE) return null;
  const id = String(presetId || '').trim();
  if (!id) return null;
  const choices = listRegexCustomPromptPresetChoices(presetStore);
  if (choices.length && !choices.some(preset => preset.id === id)) return null;
  return {
    presetId: id,
    bind: buildRegexCustomPromptPresetBind(id),
  };
};
