import { getBridgeConfig } from '../config-runtime-utils.js';
import { getPresetStore } from '../preset-store-runtime-utils.js';

export const buildPresetContext = ({
  sessionId = '',
  uiMode = 'chat',
} = {}) => ({
  sessionId: String(sessionId || '').trim(),
  uiMode: String(uiMode || '').trim() || 'chat',
});

export const resolveResolvedPreset = (appBridge, presetType, context = {}) => {
  try {
    return getPresetStore(appBridge)?.getResolvedActive?.(String(presetType || '').trim(), context)?.preset || {};
  } catch {
    return {};
  }
};

export const resolveEnabledPreset = (appBridge, presetType, context = {}) => {
  const type = String(presetType || '').trim();
  if (!type) return {};
  try {
    const enabled = getPresetStore(appBridge)?.getState?.()?.enabled || {};
    if (!enabled?.[type]) return {};
  } catch {
    return {};
  }
  return resolveResolvedPreset(appBridge, type, context);
};

export const resolveOpenAIPresetFormatReminderState = (openaiResolved = {}, activeOpenAIPreset = null) => {
  const presetId = String(openaiResolved?.presetId || '').trim();
  const presetName = String(activeOpenAIPreset?.name || '').trim();
  const hasPreset = Boolean(presetId || presetName || activeOpenAIPreset);
  const isDefaultPreset =
    presetId.toLowerCase() === 'default' ||
    presetName.toLowerCase() === 'default';
  return {
    presetId,
    presetName,
    hasPreset,
    isDefaultPreset,
  };
};

export const buildPendingUserTextWithScenarioReminder = ({
  rawText = '',
  replyHint = '',
  scenarioReminder = '',
  suppressPendingUserTurn = false,
  appendScenarioReminder = false,
} = {}) => {
  if (suppressPendingUserTurn) return '';
  const pendingUserTextRaw = String(rawText ?? '').trim();
  const pendingUserHint = String(replyHint ?? '').trim();
  const baseText = !pendingUserTextRaw
    ? (pendingUserHint ? `（${pendingUserHint}）` : '')
    : (pendingUserHint ? `${pendingUserTextRaw}（${pendingUserHint}）` : pendingUserTextRaw);
  const scenario = appendScenarioReminder ? String(scenarioReminder || '').trim() : '';
  const scenarioText = scenario ? `（${scenario}）` : '';
  return [baseText, scenarioText].filter(Boolean).join('\n\n');
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
    const config = getBridgeConfig(appBridge);
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
