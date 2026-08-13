import { applyUpdateVariableCommandsWithStore } from './update-variable-apply-utils.js';
import { applyUpdateVariableFromAssistantMessage } from './update-variable-message-apply-utils.js';
import {
  isStatusPlaceholderDisplaySession,
  isTavernMvuVariableSession,
} from './update-variable-session-utils.js';

export const createUpdateVariableCommandApplier = ({
  chatStore,
  getAt,
  setAt,
  deleteAt,
  resolveExistingPath,
  shouldEmitMvuEvent,
  emitStarted,
  emitEnded,
  isVariableRuntimeEnabled,
  logger,
} = {}) => (sessionId, commands, { useGlobal = false } = {}) => {
  const sid = String(sessionId || '').trim();
  if (typeof isVariableRuntimeEnabled === 'function' && !isVariableRuntimeEnabled(sid)) return false;
  const listVars = useGlobal
    ? (chatStore?.listGlobalVariables?.() || {})
    : (chatStore?.listVariables?.(sid) || {});
  const shouldEmitStarted = typeof shouldEmitMvuEvent === 'function'
    ? shouldEmitMvuEvent('mag_variable_update_started')
    : false;
  const shouldEmitEnded = typeof shouldEmitMvuEvent === 'function'
    ? (
      shouldEmitMvuEvent('mag_variable_update_ended') ||
      shouldEmitMvuEvent('mag_variable_update_ended_for_zod')
    )
    : false;
  const setVar = useGlobal ? chatStore?.setGlobalVariable?.bind(chatStore) : chatStore?.setVariable?.bind(chatStore);
  const deleteVar = useGlobal ? chatStore?.deleteGlobalVariable?.bind(chatStore) : chatStore?.deleteVariable?.bind(chatStore);
  return applyUpdateVariableCommandsWithStore({
    sessionId,
    commands,
    useGlobal,
    listVars,
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
    setVar,
    deleteVar,
    shouldEmitStarted,
    shouldEmitEnded,
    emitStarted,
    emitEnded,
    logger,
  });
};

export const createUpdateVariableMessageApplier = ({
  getEffectivePersona,
  listVariableSchemas,
  listActiveRegexRules,
  extractBlocks,
  parseCommands,
  applyCommands,
  resolveUseGlobalVariables,
  transformStored,
  transformDisplay,
  resolveForceRenderRich,
  updateMessage,
  isSessionActive,
  updateUiMessage,
  isVariableRuntimeEnabled,
  logger,
} = {}) => (message, sessionId) => {
  const sid = String(sessionId || '').trim();
  const variableRuntimeEnabled = typeof isVariableRuntimeEnabled === 'function'
    ? isVariableRuntimeEnabled(sid) !== false
    : true;
  const isTavernMvuSession = variableRuntimeEnabled && isTavernMvuVariableSession(sid, {
    getEffectivePersona,
    listVariableSchemas,
  });
  const shouldAppendStatusPlaceholder = variableRuntimeEnabled && (isTavernMvuSession || isStatusPlaceholderDisplaySession(sid, {
    getEffectivePersona,
    listActiveRegexRules,
  }));
  return applyUpdateVariableFromAssistantMessage({
    message,
    sessionId,
    variableRuntimeEnabled,
    isTavernMvuSession,
    shouldAppendStatusPlaceholder,
    extractBlocks,
    parseCommands,
    applyCommands,
    resolveUseGlobalVariables,
    transformStored,
    transformDisplay,
    forceRenderRich: typeof resolveForceRenderRich === 'function'
      ? Boolean(resolveForceRenderRich(sessionId, message))
      : false,
    updateMessage,
    isSessionActive,
    updateUiMessage,
    logger,
  });
};
