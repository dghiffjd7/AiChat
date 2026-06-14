export const REGEX_CUSTOM_PROMPT_PRESET_TYPE = 'openai';
export const REGEX_CUSTOM_PROMPT_PRESET_LABEL = '自定义提示词预设';

export const buildRegexCustomPromptPresetBind = (presetId = '') => {
  const id = String(presetId || '').trim();
  return id
    ? { type: 'preset', presetType: REGEX_CUSTOM_PROMPT_PRESET_TYPE, presetId: id }
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
