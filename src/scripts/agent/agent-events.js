export const AGENT_RUN_SCHEMA_VERSION = 1;

export const AGENT_STATUSES = Object.freeze([
  'queued',
  'running',
  'waiting_permission',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);

export const AGENT_EVENT_TYPES = Object.freeze({
  runQueued: 'agent.run.queued',
  runStarted: 'agent.run.started',
  runUpdated: 'agent.run.updated',
  runFinished: 'agent.run.finished',
  stepStarted: 'agent.step.started',
  stepUpdated: 'agent.step.updated',
  stepFinished: 'agent.step.finished',
  toolStarted: 'agent.tool.started',
  toolFinished: 'agent.tool.finished',
  permissionRequested: 'agent.permission.requested',
});

const STATUS_SET = new Set(AGENT_STATUSES);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trimString = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeTimestamp = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return fallback;
};

export const cloneAgentValue = (value, fallback = null) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) return value.slice();
    return isPlainObject(value) ? { ...value } : fallback;
  }
};

export const createAgentId = (prefix = 'agent') => {
  const head = trimString(prefix, 'agent').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${head}:${crypto.randomUUID()}`;
  }
  return `${head}:${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const normalizeAgentStatus = (status = '', fallback = 'queued') => {
  const token = trimString(status, '').toLowerCase();
  if (STATUS_SET.has(token)) return token;
  return STATUS_SET.has(fallback) ? fallback : 'queued';
};

export const normalizeAgentStep = (raw = {}, {
  runId = '',
  stepId = '',
  now = Date.now,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const fallbackNow = normalizeTimestamp(now?.(), Date.now());
  const startedAt = normalizeTimestamp(src.startedAt ?? src.createdAt, fallbackNow);
  const finishedAt = src.finishedAt == null ? null : normalizeTimestamp(src.finishedAt, startedAt);
  const id = trimString(src.id || src.stepId || stepId, createAgentId('step'));
  return {
    id,
    runId: trimString(src.runId || runId, ''),
    type: trimString(src.type || src.kind, 'task'),
    title: trimString(src.title, ''),
    status: normalizeAgentStatus(src.status, finishedAt == null ? 'running' : 'succeeded'),
    summary: trimString(src.summary, ''),
    input: cloneAgentValue(src.input, null),
    output: cloneAgentValue(src.output, null),
    metadata: isPlainObject(src.metadata) ? cloneAgentValue(src.metadata, {}) : {},
    errorMessage: trimString(src.errorMessage || src.error, ''),
    startedAt,
    updatedAt: normalizeTimestamp(src.updatedAt, finishedAt ?? startedAt),
    finishedAt,
  };
};

export const normalizeAgentToolCall = (raw = {}, {
  runId = '',
  stepId = '',
  toolCallId = '',
  now = Date.now,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const fallbackNow = normalizeTimestamp(now?.(), Date.now());
  const startedAt = normalizeTimestamp(src.startedAt ?? src.createdAt, fallbackNow);
  const finishedAt = src.finishedAt == null ? null : normalizeTimestamp(src.finishedAt, startedAt);
  const id = trimString(src.id || src.toolCallId || toolCallId, createAgentId('tool'));
  return {
    id,
    runId: trimString(src.runId || runId, ''),
    stepId: trimString(src.stepId || stepId, ''),
    toolName: trimString(src.toolName || src.name, ''),
    status: normalizeAgentStatus(src.status, finishedAt == null ? 'running' : 'succeeded'),
    args: cloneAgentValue(src.args, null),
    result: cloneAgentValue(src.result, null),
    metadata: isPlainObject(src.metadata) ? cloneAgentValue(src.metadata, {}) : {},
    errorMessage: trimString(src.errorMessage || src.error, ''),
    startedAt,
    updatedAt: normalizeTimestamp(src.updatedAt, finishedAt ?? startedAt),
    finishedAt,
  };
};

export const normalizeAgentRun = (raw = {}, {
  runId = '',
  now = Date.now,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const fallbackNow = normalizeTimestamp(now?.(), Date.now());
  const createdAt = normalizeTimestamp(src.createdAt ?? src.startedAt, fallbackNow);
  const finishedAt = src.finishedAt == null ? null : normalizeTimestamp(src.finishedAt, createdAt);
  const id = trimString(src.id || src.runId || runId, createAgentId('run'));
  const statusFallback = src.status ? 'queued' : (finishedAt == null ? 'queued' : 'succeeded');
  return {
    id,
    version: AGENT_RUN_SCHEMA_VERSION,
    kind: trimString(src.kind || src.type, 'task'),
    title: trimString(src.title, ''),
    sessionId: trimString(src.sessionId, ''),
    surface: trimString(src.surface, ''),
    trigger: trimString(src.trigger, ''),
    source: trimString(src.source, 'agent-task-runtime'),
    status: normalizeAgentStatus(src.status, statusFallback),
    summary: trimString(src.summary, ''),
    errorMessage: trimString(src.errorMessage || src.error, ''),
    cancelReason: trimString(src.cancelReason, ''),
    exportable: src.exportable !== false,
    metadata: isPlainObject(src.metadata) ? cloneAgentValue(src.metadata, {}) : {},
    steps: (Array.isArray(src.steps) ? src.steps : [])
      .map(step => normalizeAgentStep(step, { runId: id, now })),
    toolCalls: (Array.isArray(src.toolCalls) ? src.toolCalls : [])
      .map(call => normalizeAgentToolCall(call, { runId: id, now })),
    createdAt,
    updatedAt: normalizeTimestamp(src.updatedAt, finishedAt ?? createdAt),
    finishedAt,
  };
};

export const normalizeAgentEvent = (raw = {}, {
  eventId = '',
  now = Date.now,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const createdAt = normalizeTimestamp(src.createdAt ?? src.startedAt, normalizeTimestamp(now?.(), Date.now()));
  return {
    id: trimString(src.id || src.eventId || eventId, createAgentId('event')),
    type: trimString(src.type, AGENT_EVENT_TYPES.runUpdated),
    runId: trimString(src.runId, ''),
    stepId: trimString(src.stepId, ''),
    toolCallId: trimString(src.toolCallId, ''),
    sessionId: trimString(src.sessionId, ''),
    source: trimString(src.source, 'agent-task-runtime'),
    status: normalizeAgentStatus(src.status, 'running'),
    summary: trimString(src.summary, ''),
    details: isPlainObject(src.details) ? cloneAgentValue(src.details, {}) : {},
    createdAt,
  };
};

export const buildAgentTraceEvent = (event = {}) => {
  const normalized = normalizeAgentEvent(event);
  return {
    category: 'agent',
    phase: normalized.type.replace(/^agent\./, ''),
    sessionId: normalized.sessionId,
    source: normalized.source,
    status: normalized.status,
    startedAt: normalized.createdAt,
    summary: normalized.summary,
    details: {
      runId: normalized.runId,
      stepId: normalized.stepId,
      toolCallId: normalized.toolCallId,
      ...normalized.details,
    },
  };
};
