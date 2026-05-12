export const normalizeRuntimeMemoryPosition = (positionRaw, depthRaw, fallback = '') => {
  const token = String(positionRaw || '').trim().toLowerCase();
  const depthNum = Math.trunc(Number(depthRaw));
  const depth = Number.isFinite(depthNum) ? Math.max(0, depthNum) : 0;
  if (!token || token === 'template') return String(fallback || '').trim().toLowerCase();
  if (token === 'history_depth' && depth === 0) return 'history_after';
  return token;
};

export const resolveLlmMemoryRuntimeConfig = ({
  openaiPreset = null,
  settings = null,
} = {}) => {
  const presetMemoryInjectDepthRaw = Math.trunc(Number(openaiPreset?.memory_data_depth));
  const presetMemoryInjectDepth = Number.isFinite(presetMemoryInjectDepthRaw)
    ? Math.max(0, presetMemoryInjectDepthRaw)
    : 0;
  const presetMemoryInjectPosition = normalizeRuntimeMemoryPosition(
    openaiPreset?.memory_data_position,
    presetMemoryInjectDepth,
    '',
  );
  const settingsMemoryInjectDepthRaw = Math.trunc(Number(settings?.memoryInjectDepth));
  const settingsMemoryInjectDepth = Number.isFinite(settingsMemoryInjectDepthRaw)
    ? Math.max(0, settingsMemoryInjectDepthRaw)
    : 0;
  const settingsMemoryInjectPosition = normalizeRuntimeMemoryPosition(
    settings?.memoryInjectPosition || 'history_after',
    settingsMemoryInjectDepth,
    'history_after',
  );
  const memoryInjectPosition = presetMemoryInjectPosition || settingsMemoryInjectPosition;
  const memoryInjectDepth = presetMemoryInjectPosition && Number.isFinite(presetMemoryInjectDepthRaw)
    ? Math.max(0, presetMemoryInjectDepthRaw)
    : settingsMemoryInjectDepth;

  const presetMemoryGuideDepthRaw = Math.trunc(Number(openaiPreset?.memory_guide_depth));
  const memoryGuideDepth = Number.isFinite(presetMemoryGuideDepthRaw)
    ? Math.max(0, presetMemoryGuideDepthRaw)
    : 0;
  const memoryGuidePosition = normalizeRuntimeMemoryPosition(
    openaiPreset?.memory_guide_position,
    presetMemoryGuideDepthRaw,
    '',
  );

  return {
    memoryInjectPosition,
    memoryInjectDepth,
    memoryGuidePosition,
    memoryGuideDepth,
  };
};

export const buildLlmContextMeta = ({
  disableSummary = false,
  skipInputRegex = false,
  continueTarget = null,
  rpUiMode = false,
  uiMode = 'chat',
  sharedVariables = false,
  defaultRpBridgeSessionId = '',
  defaultChatBridgeSessionId = '',
  memoryStorageMode = '',
  memoryAutoExtract = false,
  memoryRuntime = null,
  autoImagePromptModelHint = '',
  attachmentParts = [],
  replyPromptHint = '',
  extraPromptBlocks = [],
  skipTemplate = false,
  skipScripts = false,
} = {}) => {
  const meta = {
    disableSummary: Boolean(disableSummary),
    skipInputRegex: Boolean(skipInputRegex),
    appendUserToHistory: continueTarget ? false : undefined,
    suppressPendingUserTurn: Boolean(continueTarget),
    chatGuideMode: rpUiMode ? 'summary-only' : 'full',
    disableChatGuide: false,
    disableScenarioHint: Boolean(rpUiMode),
    disableMomentSummary: Boolean(rpUiMode),
    disablePhoneFormat: Boolean(rpUiMode),
    uiMode: String(uiMode || 'chat'),
    useGlobalVariables: Boolean(sharedVariables),
    sharedMemory: false,
    defaultRpBridgeSessionId: String(defaultRpBridgeSessionId || '').trim(),
    defaultChatBridgeSessionId: String(defaultChatBridgeSessionId || '').trim(),
    memoryStorageMode: String(memoryStorageMode || ''),
    memoryAutoExtract: Boolean(memoryAutoExtract),
    memoryInjectPosition: String(memoryRuntime?.memoryInjectPosition || ''),
    memoryInjectDepth: Number.isFinite(Number(memoryRuntime?.memoryInjectDepth))
      ? Math.max(0, Math.trunc(Number(memoryRuntime.memoryInjectDepth)))
      : 0,
    memoryGuidePosition: String(memoryRuntime?.memoryGuidePosition || ''),
    memoryGuideDepth: Number.isFinite(Number(memoryRuntime?.memoryGuideDepth))
      ? Math.max(0, Math.trunc(Number(memoryRuntime.memoryGuideDepth)))
      : 0,
    userAttachmentParts: Array.isArray(attachmentParts) ? attachmentParts : [],
    replyPromptHint: String(replyPromptHint || ''),
    extraPromptBlocks: Array.isArray(extraPromptBlocks) ? extraPromptBlocks : [],
  };

  if (continueTarget) {
    meta.assistantContinuation = {
      enabled: true,
      messageId: continueTarget.messageId,
      prefix: String(continueTarget.prefix || ''),
    };
  }
  const imagePromptModelHint = String(autoImagePromptModelHint || '').trim();
  if (imagePromptModelHint) meta.autoImagePromptModelHint = imagePromptModelHint;
  if (skipTemplate) meta.templateEnabled = false;
  if (skipScripts) meta.skipScripts = true;
  return meta;
};

export const buildLlmContextMetaInput = ({
  disableSummary = false,
  skipInputRegex = false,
  continueTarget = null,
  rpUiMode = false,
  uiMode = 'chat',
  sharedVariables = false,
  isRpMode = false,
  rpBridgeSessionId = '',
  lastChatBridgeSessionId = '',
  memoryStorageMode = '',
  memoryAutoExtract = false,
  memoryRuntime = null,
  autoImagePromptModelHint = '',
  attachmentParts = [],
  replyPromptHint = '',
  stagePromptBlocks = [],
  injectedPromptBlocks = [],
  skipTemplate = false,
  skipScripts = false,
} = {}) => {
  const out = {
    disableSummary: Boolean(disableSummary),
    skipInputRegex: Boolean(skipInputRegex),
    continueTarget,
    rpUiMode: Boolean(rpUiMode),
    uiMode: String(uiMode || 'chat'),
    sharedVariables: Boolean(sharedVariables),
    defaultRpBridgeSessionId: isRpMode ? '' : String(rpBridgeSessionId || '').trim(),
    defaultChatBridgeSessionId: isRpMode ? String(lastChatBridgeSessionId || '').trim() : '',
    memoryStorageMode: String(memoryStorageMode || ''),
    memoryAutoExtract: Boolean(memoryAutoExtract),
    memoryRuntime,
    attachmentParts: Array.isArray(attachmentParts) ? attachmentParts : [],
    replyPromptHint: String(replyPromptHint || ''),
    extraPromptBlocks: [
      ...(Array.isArray(stagePromptBlocks) ? stagePromptBlocks : []),
      ...(Array.isArray(injectedPromptBlocks) ? injectedPromptBlocks : []),
    ],
    skipTemplate: Boolean(skipTemplate),
    skipScripts: Boolean(skipScripts),
  };
  const imagePromptModelHint = String(autoImagePromptModelHint || '').trim();
  if (imagePromptModelHint) out.autoImagePromptModelHint = imagePromptModelHint;
  return out;
};
