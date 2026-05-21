const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'skipped']);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

const normalizeLimit = (value, fallback = 20, max = 200) => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, numeric);
};

export const normalizeAgentMessagePart = (part = {}) => {
  const src = isPlainObject(part) ? part : {};
  const type = trim(src.type, 'agent_status');
  const runId = trim(src.runId);
  const stepId = trim(src.stepId);
  const toolCallId = trim(src.toolCallId);
  const fallbackId = [type, runId, stepId || toolCallId || 'run'].filter(Boolean).join(':');
  return {
    id: trim(src.id, fallbackId),
    type,
    runId,
    stepId,
    toolCallId,
    status: trim(src.status, 'running'),
    title: trim(src.title),
    summary: trim(src.summary),
    source: trim(src.source, 'agent-task-runtime'),
    kind: trim(src.kind),
    createdAt: toFiniteNumber(src.createdAt || src.startedAt, 0),
    updatedAt: toFiniteNumber(src.updatedAt || src.finishedAt || src.createdAt || src.startedAt, 0),
    metadata: isPlainObject(src.metadata) ? clone(src.metadata) : {},
    errorMessage: trim(src.errorMessage || src.error),
  };
};

const buildRunStatusPart = (run = {}) => normalizeAgentMessagePart({
  id: `agent-status:${trim(run.id || run.runId)}`,
  type: 'agent_status',
  runId: run.id || run.runId,
  status: run.status,
  title: run.title || run.kind,
  summary: run.summary,
  source: run.source,
  kind: run.kind,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt || run.finishedAt,
  metadata: {
    trigger: trim(run.trigger),
    sessionId: trim(run.sessionId),
    stepCount: Array.isArray(run.steps) ? run.steps.length : 0,
    toolCallCount: Array.isArray(run.toolCalls) ? run.toolCalls.length : 0,
  },
  errorMessage: run.errorMessage,
});

const buildStepPart = (run = {}, step = {}) => normalizeAgentMessagePart({
  id: `agent-step:${trim(run.id || run.runId)}:${trim(step.id || step.stepId)}`,
  type: 'agent_step',
  runId: run.id || run.runId,
  stepId: step.id || step.stepId,
  status: step.status,
  title: step.title || step.type,
  summary: step.summary,
  source: run.source || step.type,
  kind: step.type || step.kind,
  createdAt: step.startedAt || step.createdAt,
  updatedAt: step.updatedAt || step.finishedAt,
  metadata: step.metadata,
  errorMessage: step.errorMessage,
});

const buildToolPart = (run = {}, toolCall = {}) => normalizeAgentMessagePart({
  id: `agent-tool:${trim(run.id || run.runId)}:${trim(toolCall.id || toolCall.toolCallId)}`,
  type: 'agent_tool',
  runId: run.id || run.runId,
  toolCallId: toolCall.id || toolCall.toolCallId,
  status: toolCall.status,
  title: toolCall.toolName || toolCall.name,
  summary: toolCall.summary,
  source: run.source || toolCall.toolName,
  kind: toolCall.toolName || toolCall.name,
  createdAt: toolCall.startedAt || toolCall.createdAt,
  updatedAt: toolCall.updatedAt || toolCall.finishedAt,
  metadata: toolCall.metadata,
  errorMessage: toolCall.errorMessage,
});

export const buildAgentMessagePartsFromRun = (run = {}, {
  includeSucceededSteps = false,
  includeToolCalls = true,
  maxSteps = 20,
  maxToolCalls = 20,
} = {}) => {
  if (!run || typeof run !== 'object') return [];
  const parts = [buildRunStatusPart(run)];
  const stepLimit = normalizeLimit(maxSteps, 20, 200);
  const steps = (Array.isArray(run.steps) ? run.steps : [])
    .filter(step => includeSucceededSteps || !TERMINAL_STATUSES.has(trim(step?.status)) || trim(step?.status) !== 'succeeded')
    .slice(-stepLimit)
    .map(step => buildStepPart(run, step));
  parts.push(...steps);
  if (includeToolCalls) {
    const toolLimit = normalizeLimit(maxToolCalls, 20, 200);
    const tools = (Array.isArray(run.toolCalls) ? run.toolCalls : [])
      .slice(-toolLimit)
      .map(call => buildToolPart(run, call));
    parts.push(...tools);
  }
  return parts.map(normalizeAgentMessagePart);
};

export const mergeAgentMessageParts = (previous = [], next = []) => {
  const order = [];
  const byId = new Map();
  (Array.isArray(previous) ? previous : []).forEach((part) => {
    const normalized = normalizeAgentMessagePart(part);
    if (!normalized.id) return;
    if (!byId.has(normalized.id)) order.push(normalized.id);
    byId.set(normalized.id, normalized);
  });
  (Array.isArray(next) ? next : []).forEach((part) => {
    const normalized = normalizeAgentMessagePart(part);
    if (!normalized.id) return;
    if (!byId.has(normalized.id)) order.push(normalized.id);
    byId.set(normalized.id, {
      ...(byId.get(normalized.id) || {}),
      ...normalized,
      metadata: {
        ...(byId.get(normalized.id)?.metadata || {}),
        ...(normalized.metadata || {}),
      },
    });
  });
  return order.map(id => byId.get(id)).filter(Boolean);
};
