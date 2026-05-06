export const buildPresetContext = ({
  sessionId = '',
  uiMode = 'chat',
} = {}) => ({
  sessionId: String(sessionId || '').trim(),
  uiMode: String(uiMode || '').trim() || 'chat',
});

export const resolveResolvedPreset = (appBridge, presetType, context = {}) => {
  try {
    return appBridge?.presets?.getResolvedActive?.(String(presetType || '').trim(), context)?.preset || {};
  } catch {
    return {};
  }
};

export const resolveEnabledPreset = (appBridge, presetType, context = {}) => {
  const type = String(presetType || '').trim();
  if (!type) return {};
  try {
    const enabled = appBridge?.presets?.getState?.()?.enabled || {};
    if (!enabled?.[type]) return {};
  } catch {
    return {};
  }
  return resolveResolvedPreset(appBridge, type, context);
};

export const createPresetRuntime = ({
  appBridge = null,
  getSessionId = null,
  getUiMode = null,
  isDeepSeekRequest = null,
} = {}) => {
  const getPresetContext = () =>
    buildPresetContext({
      sessionId: getSessionId?.(),
      uiMode: getUiMode?.(),
    });

  const getPresetByType = (type) => resolveResolvedPreset(appBridge, type, getPresetContext());
  const getOpenAIPreset = () => getPresetByType('openai');
  const getReasoningPreset = () => getPresetByType('reasoning');

  const canUseDeepSeekPrefixCompletion = () => {
    const config = appBridge?.config?.get?.() || {};
    if (String(config?.provider || '').trim().toLowerCase() === 'custom') return false;
    return typeof isDeepSeekRequest === 'function'
      ? isDeepSeekRequest({
          provider: config?.provider,
          model: config?.model,
          baseUrl: config?.baseUrl,
        }) === true
      : false;
  };

  const canUseDeepSeekContinuePrefill = () =>
    canUseDeepSeekPrefixCompletion() && getOpenAIPreset()?.continue_prefill === true;

  return {
    getPresetContext,
    getOpenAIPreset,
    getReasoningPreset,
    canUseDeepSeekPrefixCompletion,
    canUseDeepSeekContinuePrefill,
  };
};

export const buildReplyPromptHint = (contexts = []) => {
  const list = Array.isArray(contexts) ? contexts.filter(Boolean) : [];
  if (!list.length) return '';
  const toReplyHintLine = (item) =>
    `${item.userMessage || '[消息]'}（回复了${item.replyTo?.author || '消息'}：${item.replyTo?.content || '...'}）`;
  if (list.length === 1) {
    return toReplyHintLine(list[0]);
  }
  return list.map((item, index) => `${index + 1}. ${toReplyHintLine(item)}`).join('；');
};
