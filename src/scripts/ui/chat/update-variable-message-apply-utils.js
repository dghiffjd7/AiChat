import {
  buildUpdateVariableCommandPreview,
  collectUpdateVariableCommandsFromRaw,
  resolveUpdateVariableRawText,
} from './update-variable-message-utils.js';
import { buildUpdateVariableApplyPlan } from './update-variable-persist-utils.js';

export const applyUpdateVariableFromAssistantMessage = ({
  message,
  sessionId = '',
  isTavernMvuSession = false,
  shouldAppendStatusPlaceholder = isTavernMvuSession,
  extractBlocks,
  parseCommands,
  applyCommands,
  resolveUseGlobalVariables,
  transformStored,
  transformDisplay,
  forceRenderRich = false,
  updateMessage,
  isSessionActive,
  updateUiMessage,
  logger = console,
} = {}) => {
  if (!message || message.role !== 'assistant') return false;
  const sid = String(sessionId || '').trim();
  const raw = resolveUpdateVariableRawText(message);
  if (!raw) return false;
  const { blocks, commands } = collectUpdateVariableCommandsFromRaw(raw, {
    isTavernMvuSession,
    extractBlocks,
    parseCommands,
  });
  if (!blocks.length && !commands.length && !shouldAppendStatusPlaceholder) return false;
  if (blocks.length || commands.length) {
    logger?.info?.(
      `[update-variable] parse messageId=${String(message?.id || '')} session=${sid} blocks=${blocks.length} commands=${commands.length}`,
    );
    const cmdPreview = buildUpdateVariableCommandPreview(commands, { limit: 8 });
    if (cmdPreview) logger?.info?.(`[update-variable] command-preview ${cmdPreview}`);
  }
  const useGlobal = typeof resolveUseGlobalVariables === 'function'
    ? Boolean(resolveUseGlobalVariables(sessionId, message, commands))
    : false;
  const changed = commands.length && typeof applyCommands === 'function'
    ? Boolean(applyCommands(sessionId, commands, { useGlobal }))
    : false;
  const {
    placeholderInjected,
    updatePayload,
    fallbackUpdatedMessage,
    shouldPersist,
    resultChanged,
  } = buildUpdateVariableApplyPlan({
    message,
    raw,
    isTavernMvuSession,
    shouldAppendStatusPlaceholder,
    transformStored,
    transformDisplay,
    forceRenderRich,
    variableChanged: changed,
  });
  if (!shouldPersist) return false;
  const updated = typeof updateMessage === 'function'
    ? (updateMessage(message.id, updatePayload, sessionId) || fallbackUpdatedMessage)
    : fallbackUpdatedMessage;
  if (placeholderInjected) {
    logger?.info?.(
      `[update-variable] placeholder-injected messageId=${String(message?.id || '')} session=${sid} source=${isTavernMvuSession ? 'tavern-mvu' : 'status-display-regex'}`,
    );
  }
  if (updated && typeof isSessionActive === 'function' && isSessionActive(sessionId) && typeof updateUiMessage === 'function') {
    updateUiMessage(message.id, updated);
  }
  return resultChanged;
};
