const clampNonNegativeInt = (value, fallback = 0) => {
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
};

export const buildLlmHistoryReasoningConfig = ({
  reasoningSettings = null,
  reasoningPreset = null,
  applyMacros = value => String(value ?? ''),
} = {}) => ({
  enabled: reasoningSettings?.reasoningAddToPrompts === true,
  prefix: String(reasoningPreset?.prefix ?? ''),
  suffix: String(reasoningPreset?.suffix ?? ''),
  separator: String(reasoningPreset?.separator ?? ''),
  maxAdditions: clampNonNegativeInt(reasoningSettings?.reasoningMaxAdditions, 1),
  applyMacros,
});

export const buildLlmHistoryFinalizeOptions = ({
  pendingUserText = '',
  settings = null,
  openaiPreset = null,
  rpUiMode = false,
  reasoningPreset = null,
  applyMacros = value => String(value ?? ''),
} = {}) => ({
  pendingUserText,
  chatHistoryLimit: clampNonNegativeInt(settings?.chatHistoryMax, 0),
  openaiPreset: openaiPreset || {},
  rpUiMode: Boolean(rpUiMode),
  creativeHistoryLimit: clampNonNegativeInt(settings?.creativeHistoryMax, 0),
  deferHistoryTokenBudget: true,
  reasoning: buildLlmHistoryReasoningConfig({
    reasoningSettings: settings,
    reasoningPreset,
    applyMacros,
  }),
});
