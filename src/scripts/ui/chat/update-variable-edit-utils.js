import { buildUpdateVariableFallbackStripPlan } from './update-variable-persist-utils.js';
import { isTavernMvuVariableSession } from './update-variable-session-utils.js';

export const applyUpdateVariableForMessageWithFallback = ({
  message,
  sessionId = '',
  applyUpdateVariable,
  getEffectivePersona,
  listVariableSchemas,
  transformDisplay,
  updateMessage,
  isSessionActive,
  updateUiMessage,
  logger = console,
} = {}) => {
  try {
    if (typeof applyUpdateVariable === 'function') {
      return Boolean(applyUpdateVariable(message, sessionId));
    }
  } catch (err) {
    logger?.warn?.('edit-assistant-raw: update apply via function failed', err);
  }
  try {
    const sid = String(sessionId || '').trim();
    const isTavernMvuSession = isTavernMvuVariableSession(sid, {
      getEffectivePersona,
      listVariableSchemas,
    });
    const {
      hasRaw,
      updatePayload,
      fallbackUpdatedMessage,
      shouldPersist,
    } = buildUpdateVariableFallbackStripPlan({
      message,
      isTavernMvuSession,
      transformDisplay,
    });
    if (!hasRaw || !shouldPersist) return false;
    const updatedFallback = typeof updateMessage === 'function'
      ? (updateMessage(message?.id, updatePayload, sessionId) || fallbackUpdatedMessage)
      : fallbackUpdatedMessage;
    if (updatedFallback && typeof isSessionActive === 'function' && isSessionActive(sessionId) && typeof updateUiMessage === 'function') {
      updateUiMessage(message?.id, updatedFallback);
    }
  } catch (err) {
    logger?.warn?.('edit-assistant-raw: update-variable fallback failed', err);
  }
  logger?.info?.('[update-variable] apply function unavailable yet (fallback-strip-applied)');
  return false;
};
