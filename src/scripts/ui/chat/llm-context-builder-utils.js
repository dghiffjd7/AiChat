import {
  buildLlmCharacterContext,
  buildLlmGroupContext,
  buildLlmSessionContext,
  buildLlmUserContext,
} from './llm-context-section-utils.js';
import {
  buildLlmContextMeta,
  buildLlmContextMetaInput,
  resolveLlmMemoryRuntimeConfig,
} from './llm-context-meta-utils.js';

export const resolveMemoryTablePlace = (uiMode = '') => {
  const mode = String(uiMode || '').trim().toLowerCase();
  if (mode === 'rp' || mode === 'writing' || mode === 'creative') return 'writing';
  if (mode === 'moments' || mode === 'moment') return 'moments';
  return 'chat';
};

export const isMemoryTablePlaceEnabled = (settings = null, uiMode = '') => {
  const place = resolveMemoryTablePlace(uiMode);
  if (place === 'writing') return settings?.memoryTableEnabledWriting !== false;
  if (place === 'moments') return settings?.memoryTableEnabledMoments !== false;
  return settings?.memoryTableEnabledChat !== false;
};

export const buildLlmContextPayload = ({
  activePersona = null,
  activeUser = null,
  attachmentParts = [],
  buildHistory = null,
  characterName = '',
  continueTarget = null,
  disableSummary = false,
  getContactName = null,
  groupMembers = [],
  injectedPromptBlocks = [],
  isGroupChat = false,
  isRpMode = false,
  lastChatBridgeSessionId = '',
  memoryAutoExtract = false,
  memoryStorageMode = '',
  autoImagePromptModelHint = '',
  openaiPreset = null,
  pendingUserText = '',
  promptUserName = '',
  replyPromptHint = '',
  rpBridgeSessionId = '',
  rpUiMode = false,
  sessionId = '',
  sessionSettings = null,
  settings = null,
  sharedVariables = false,
  skipInputRegex = false,
  skipScripts = false,
  skipTemplate = false,
  stagePromptBlocks = [],
  uiMode = 'chat',
} = {}) => {
  const memoryRuntime = resolveLlmMemoryRuntimeConfig({ openaiPreset, settings });
  const tablePlaceEnabled = isMemoryTablePlaceEnabled(settings, uiMode);
  const effectiveMemoryStorageMode =
    String(memoryStorageMode || '').trim().toLowerCase() === 'table' && !tablePlaceEnabled
      ? 'off'
      : memoryStorageMode;
  const effectiveMemoryAutoExtract = Boolean(memoryAutoExtract) && tablePlaceEnabled;
  return {
    user: buildLlmUserContext({
      promptUserName,
      activeUser,
    }),
    character: buildLlmCharacterContext({
      characterName,
      activePersona,
    }),
    session: buildLlmSessionContext({
      sessionId,
      isGroupChat,
      characterName,
      sessionSettings: sessionSettings || {},
    }),
    meta: buildLlmContextMeta(buildLlmContextMetaInput({
      disableSummary,
      skipInputRegex,
      continueTarget,
      rpUiMode,
      uiMode,
      sharedVariables,
      isRpMode,
      rpBridgeSessionId,
      lastChatBridgeSessionId,
      memoryStorageMode: effectiveMemoryStorageMode,
      memoryAutoExtract: effectiveMemoryAutoExtract,
      memoryRuntime,
      autoImagePromptModelHint,
      attachmentParts,
      replyPromptHint,
      stagePromptBlocks,
      injectedPromptBlocks,
      skipTemplate,
      skipScripts,
    })),
    group: buildLlmGroupContext({
      isGroupChat,
      sessionId,
      characterName,
      groupMembers,
      getContactName,
    }),
    history: typeof buildHistory === 'function' ? buildHistory(pendingUserText) : [],
  };
};
