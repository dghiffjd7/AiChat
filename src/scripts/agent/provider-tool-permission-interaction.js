import { PROVIDER_TOOL_PERMISSION_ACTIONS } from './provider-tool-permission-actions.js';

export const PROVIDER_TOOL_PERMISSION_INTERACTION_MODES = Object.freeze({
  deferredMessagePart: 'deferred_message_part',
  modalPrompt: 'modal_prompt',
});

const MODE_SET = new Set(Object.values(PROVIDER_TOOL_PERMISSION_INTERACTION_MODES));

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeMode = (value = '', fallback = PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.deferredMessagePart) => {
  const mode = trim(value, fallback).toLowerCase();
  return MODE_SET.has(mode) ? mode : fallback;
};

export const normalizeProviderToolPermissionInteraction = (value = {}, {
  sessionId = '',
  sessionGate = null,
  promptPermission = false,
  source = 'provider-tool-call',
  timeoutMs = 0,
} = {}) => {
  const src = isPlainObject(value) ? value : {};
  const mode = normalizeMode(
    src.mode || src.strategy,
    promptPermission === true
      ? PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.modalPrompt
      : PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.deferredMessagePart,
  );
  const promptModal = mode === PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.modalPrompt;
  const normalizedTimeoutMs = toFiniteNumber(src.timeoutMs, toFiniteNumber(timeoutMs, 0));
  const sessionGateEnabled = src.sessionGateEnabled === true || sessionGate?.enabled === true;
  const allowedActions = list(src.allowedActions).length
    ? list(src.allowedActions)
    : [
        PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
        PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
        PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow,
      ];
  return {
    mode,
    presentation: promptModal ? 'modal' : 'message_part',
    promptModal,
    silentPrompt: false,
    status: trim(src.status, 'waiting_permission'),
    allowedActions,
    defaultAction: allowedActions.includes(src.defaultAction)
      ? src.defaultAction
      : PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
    requiresUserAction: src.requiresUserAction !== false,
    requiresSessionGate: src.requiresSessionGate !== false,
    sessionGateEnabled,
    sessionId: trim(src.sessionId || sessionId || sessionGate?.sessionId),
    source: trim(src.source || source, 'provider-tool-call'),
    timeoutMs: normalizedTimeoutMs,
    expiresAt: toFiniteNumber(src.expiresAt, 0),
    reason: trim(
      src.reason,
      promptModal
        ? 'explicit modal prompt requested'
        : 'deferred to message part; stream callbacks must not open modal prompts',
    ),
    nextRequiredAction: trim(src.nextRequiredAction, 'user must approve or deny this tool call before execution'),
    rollback: trim(src.rollback, 'deny this permission request or disable providerToolSessionGate for this session'),
  };
};

export const buildProviderToolPermissionInteraction = (request = {}, options = {}) => {
  const interaction = isPlainObject(request?.interaction) ? request.interaction : {};
  return normalizeProviderToolPermissionInteraction(interaction, options);
};

export const buildProviderToolPermissionStrategySummary = (interaction = {}) => {
  const normalized = normalizeProviderToolPermissionInteraction(interaction);
  return {
    mode: normalized.mode,
    presentation: normalized.presentation,
    promptModal: normalized.promptModal,
    silentPrompt: normalized.silentPrompt,
    defaultAction: normalized.defaultAction,
    sessionGateEnabled: normalized.sessionGateEnabled,
    reason: normalized.reason,
  };
};
