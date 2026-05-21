import { normalizeAgentMessagePart } from './agent-message-parts.js';

export const PROVIDER_TOOL_CALL_PART_TYPES = Object.freeze({
  call: 'provider_tool_call',
  result: 'provider_tool_result',
  permissionRequest: 'provider_tool_permission_request',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeStatus = (value = '', fallback = 'running') => {
  const status = trim(value, fallback).toLowerCase();
  if (status === 'requires_action' || status === 'requires_permission' || status === 'permission_required') {
    return 'waiting_permission';
  }
  if (status === 'complete' || status === 'completed' || status === 'ok') return 'succeeded';
  if (status === 'error') return 'failed';
  return status;
};

const getToolName = (src = {}) => trim(
  src.toolName
  || src.name
  || src.function?.name
  || src.tool?.name
  || src.call?.toolName
  || src.call?.name,
);

const getToolCallId = (src = {}) => trim(
  src.toolCallId
  || src.id
  || src.callId
  || src.tool_call_id
  || src.call?.toolCallId
  || src.call?.id,
);

const getArguments = (src = {}) => {
  if (isPlainObject(src.arguments)) return clone(src.arguments);
  if (isPlainObject(src.args)) return clone(src.args);
  if (isPlainObject(src.input)) return clone(src.input);
  if (typeof src.arguments === 'string') {
    try {
      const parsed = JSON.parse(src.arguments);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof src.function?.arguments === 'string') {
    try {
      const parsed = JSON.parse(src.function.arguments);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

export const normalizeProviderToolCall = (call = {}, {
  provider = '',
  model = '',
  runId = '',
  stepId = '',
  sessionId = '',
  source = 'provider-tool-call',
  now = Date.now,
} = {}) => {
  const src = isPlainObject(call) ? call : {};
  const toolName = getToolName(src);
  const toolCallId = getToolCallId(src) || `tool:${toolName || 'unknown'}:${toFiniteNumber(now?.(), Date.now())}`;
  const status = normalizeStatus(src.status || src.state, 'running');
  return {
    id: trim(src.id, toolCallId),
    toolCallId,
    toolName,
    provider: trim(src.provider, provider),
    model: trim(src.model, model),
    runId: trim(src.runId, runId),
    stepId: trim(src.stepId, stepId),
    sessionId: trim(src.sessionId, sessionId),
    source: trim(src.source, source),
    status,
    arguments: getArguments(src),
    summary: trim(src.summary),
    createdAt: toFiniteNumber(src.createdAt || src.startedAt, toFiniteNumber(now?.(), Date.now())),
    updatedAt: toFiniteNumber(src.updatedAt || src.finishedAt || src.createdAt || src.startedAt, toFiniteNumber(now?.(), Date.now())),
    metadata: isPlainObject(src.metadata) ? clone(src.metadata) : {},
    errorMessage: trim(src.errorMessage || src.error),
  };
};

export const buildProviderToolCallMessagePart = (call = {}, options = {}) => {
  const normalized = normalizeProviderToolCall(call, options);
  return normalizeAgentMessagePart({
    id: `provider-tool-call:${normalized.toolCallId}`,
    type: PROVIDER_TOOL_CALL_PART_TYPES.call,
    runId: normalized.runId,
    stepId: normalized.stepId,
    toolCallId: normalized.toolCallId,
    status: normalized.status,
    title: normalized.toolName || 'tool call',
    summary: normalized.summary || `provider requested ${normalized.toolName || 'tool'}`,
    source: normalized.source,
    kind: normalized.toolName,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    metadata: {
      provider: normalized.provider,
      model: normalized.model,
      sessionId: normalized.sessionId,
      arguments: normalized.arguments,
      ...(normalized.metadata || {}),
    },
    errorMessage: normalized.errorMessage,
  });
};

export const buildProviderToolResultMessagePart = ({
  toolCall = {},
  result = null,
  status = 'succeeded',
  summary = '',
  errorMessage = '',
  now = Date.now,
} = {}) => {
  const normalized = normalizeProviderToolCall(toolCall, { now });
  const nextStatus = normalizeStatus(status, 'succeeded');
  return normalizeAgentMessagePart({
    id: `provider-tool-result:${normalized.toolCallId}`,
    type: PROVIDER_TOOL_CALL_PART_TYPES.result,
    runId: normalized.runId,
    stepId: normalized.stepId,
    toolCallId: normalized.toolCallId,
    status: nextStatus,
    title: normalized.toolName || 'tool result',
    summary: trim(summary, nextStatus === 'succeeded' ? 'tool result ready' : 'tool result failed'),
    source: normalized.source,
    kind: normalized.toolName,
    createdAt: normalized.createdAt,
    updatedAt: toFiniteNumber(now?.(), Date.now()),
    metadata: {
      provider: normalized.provider,
      model: normalized.model,
      sessionId: normalized.sessionId,
      result: clone(result),
    },
    errorMessage: errorMessage || normalized.errorMessage,
  });
};

export const buildProviderToolPermissionRequestPart = ({
  toolCall = {},
  permissions = [],
  riskLevel = 'low',
  checks = [],
  decision = 'ask',
  now = Date.now,
} = {}) => {
  const normalized = normalizeProviderToolCall(toolCall, { now, source: 'provider-tool-permission' });
  const permissionList = (Array.isArray(permissions) ? permissions : [permissions])
    .map(item => trim(item))
    .filter(Boolean);
  return normalizeAgentMessagePart({
    id: `provider-tool-permission:${normalized.toolCallId}`,
    type: PROVIDER_TOOL_CALL_PART_TYPES.permissionRequest,
    runId: normalized.runId,
    stepId: normalized.stepId,
    toolCallId: normalized.toolCallId,
    status: decision === 'deny' ? 'failed' : decision === 'allow' ? 'succeeded' : 'waiting_permission',
    title: normalized.toolName || 'permission request',
    summary: decision === 'ask'
      ? `permission required for ${normalized.toolName || 'tool'}`
      : `permission ${decision} for ${normalized.toolName || 'tool'}`,
    source: 'provider-tool-permission',
    kind: normalized.toolName,
    createdAt: normalized.createdAt,
    updatedAt: toFiniteNumber(now?.(), Date.now()),
    metadata: {
      provider: normalized.provider,
      model: normalized.model,
      sessionId: normalized.sessionId,
      permissions: permissionList,
      riskLevel: trim(riskLevel, 'low'),
      argsPreview: normalized.arguments,
      checks: clone(checks),
      decision: trim(decision, 'ask'),
    },
  });
};

export const buildProviderToolMessageParts = ({
  toolCall = {},
  permission = null,
  result = null,
  now = Date.now,
} = {}) => {
  const parts = [buildProviderToolCallMessagePart(toolCall, { now })];
  if (permission) {
    parts.push(buildProviderToolPermissionRequestPart({
      toolCall,
      now,
      ...(isPlainObject(permission) ? permission : {}),
    }));
  }
  if (result) {
    parts.push(buildProviderToolResultMessagePart({
      toolCall,
      now,
      ...(isPlainObject(result) ? result : {}),
    }));
  }
  return parts;
};
