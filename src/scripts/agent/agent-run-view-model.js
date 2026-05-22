const RUNNING_STATUSES = new Set(['queued', 'running', 'waiting_permission']);
const FAILURE_STATUSES = new Set(['failed', 'cancelled']);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeLimit = (value, fallback = 50, max = 500) => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, numeric);
};

const normalizeRuns = (runs = []) => {
  if (Array.isArray(runs)) return runs.filter(Boolean);
  if (isPlainObject(runs)) return Object.values(runs).filter(Boolean);
  return [];
};

const normalizeEvents = (events = []) => (
  Array.isArray(events) ? events.filter(Boolean) : []
);

const countBy = (items = [], readKey = item => item) => {
  const counts = {};
  items.forEach((item) => {
    const key = trim(readKey(item), 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const formatTime = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  try {
    return new Date(numeric).toISOString();
  } catch {
    return String(numeric);
  }
};

const computeDurationMs = (run = {}) => {
  const started = toFiniteNumber(run.createdAt || run.startedAt, 0);
  if (!started) return 0;
  const ended = toFiniteNumber(run.finishedAt || run.updatedAt, 0);
  return ended > started ? ended - started : 0;
};

const summarizeStep = (step = {}) => ({
  id: trim(step.id || step.stepId),
  type: trim(step.type || step.kind, 'task'),
  status: trim(step.status, 'running'),
  summary: trim(step.summary),
  startedAt: toFiniteNumber(step.startedAt || step.createdAt, 0),
  updatedAt: toFiniteNumber(step.updatedAt, 0),
  finishedAt: toFiniteNumber(step.finishedAt, 0),
  errorMessage: trim(step.errorMessage || step.error),
});

export const buildAgentRunSummary = (run = {}, {
  events = [],
} = {}) => {
  const steps = Array.isArray(run.steps) ? run.steps.map(summarizeStep) : [];
  const status = trim(run.status, 'unknown');
  const runId = trim(run.id || run.runId);
  const runEvents = normalizeEvents(events).filter(event => trim(event.runId) === runId);
  const lastStep = steps.slice().sort((a, b) => (
    toFiniteNumber(b.updatedAt || b.finishedAt || b.startedAt, 0) -
    toFiniteNumber(a.updatedAt || a.finishedAt || a.startedAt, 0)
  ))[0] || null;
  return {
    id: runId,
    kind: trim(run.kind || run.type, 'task'),
    title: trim(run.title),
    sessionId: trim(run.sessionId),
    source: trim(run.source, 'agent-task-runtime'),
    trigger: trim(run.trigger),
    status,
    summary: trim(run.summary),
    errorMessage: trim(run.errorMessage || run.error),
    cancelReason: trim(run.cancelReason),
    createdAt: toFiniteNumber(run.createdAt || run.startedAt, 0),
    updatedAt: toFiniteNumber(run.updatedAt, 0),
    finishedAt: toFiniteNumber(run.finishedAt, 0),
    durationMs: computeDurationMs(run),
    isActive: RUNNING_STATUSES.has(status),
    isFailure: FAILURE_STATUSES.has(status),
    stepCount: steps.length,
    toolCallCount: Array.isArray(run.toolCalls) ? run.toolCalls.length : 0,
    eventCount: runEvents.length,
    stepStatusCounts: countBy(steps, step => step.status),
    lastStep,
  };
};

const matchesFilter = (summary = {}, {
  sessionId = '',
  status = '',
  kind = '',
  source = '',
  query = '',
} = {}) => {
  const sid = trim(sessionId);
  const statusFilter = trim(status);
  const kindFilter = trim(kind);
  const sourceFilter = trim(source);
  const q = trim(query).toLowerCase();
  if (sid && summary.sessionId !== sid) return false;
  if (statusFilter === 'active' && !summary.isActive) return false;
  else if (statusFilter === 'failure' && !summary.isFailure) return false;
  else if (statusFilter && statusFilter !== 'active' && statusFilter !== 'failure' && summary.status !== statusFilter) return false;
  if (kindFilter && summary.kind !== kindFilter) return false;
  if (sourceFilter && summary.source !== sourceFilter) return false;
  if (!q) return true;
  return [
    summary.id,
    summary.kind,
    summary.title,
    summary.sessionId,
    summary.source,
    summary.trigger,
    summary.status,
    summary.summary,
    summary.errorMessage,
    summary.lastStep?.type,
    summary.lastStep?.summary,
  ].some(value => trim(value).toLowerCase().includes(q));
};

export const buildAgentRunListView = (runs = [], {
  events = [],
  limit = 50,
  sessionId = '',
  status = '',
  kind = '',
  source = '',
  query = '',
} = {}) => {
  const allSummaries = normalizeRuns(runs).map(run => buildAgentRunSummary(run, { events }));
  const filtered = allSummaries
    .filter(summary => matchesFilter(summary, { sessionId, status, kind, source, query }))
    .sort((a, b) => (
      toFiniteNumber(b.updatedAt || b.finishedAt || b.createdAt, 0) -
      toFiniteNumber(a.updatedAt || a.finishedAt || a.createdAt, 0)
    ));
  const count = normalizeLimit(limit, 50, 500);
  const visible = filtered.slice(0, count);
  return {
    meta: {
      total: allSummaries.length,
      filtered: filtered.length,
      visible: visible.length,
      active: allSummaries.filter(summary => summary.isActive).length,
      failures: allSummaries.filter(summary => summary.isFailure).length,
      statusCounts: countBy(allSummaries, summary => summary.status),
      kindCounts: countBy(allSummaries, summary => summary.kind),
    },
    filters: {
      sessionId: trim(sessionId),
      status: trim(status),
      kind: trim(kind),
      source: trim(source),
      query: trim(query),
      limit: count,
    },
    runs: visible,
  };
};

export const buildAgentRunCacheStats = ({
  runs = [],
  events = [],
  maxRuns = 0,
  maxEvents = 0,
} = {}) => {
  const runList = normalizeRuns(runs);
  const eventList = normalizeEvents(events);
  const updatedTimes = runList
    .map(run => toFiniteNumber(run.updatedAt || run.finishedAt || run.createdAt, 0))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return {
    runCount: runList.length,
    eventCount: eventList.length,
    maxRuns: Math.max(0, Math.trunc(Number(maxRuns)) || 0),
    maxEvents: Math.max(0, Math.trunc(Number(maxEvents)) || 0),
    activeRuns: runList.filter(run => RUNNING_STATUSES.has(trim(run.status))).length,
    failedRuns: runList.filter(run => FAILURE_STATUSES.has(trim(run.status))).length,
    oldestUpdatedAt: updatedTimes[0] || 0,
    newestUpdatedAt: updatedTimes[updatedTimes.length - 1] || 0,
  };
};

export const buildAgentRunDiagnosticsMeta = (view = {}) => {
  const meta = view?.meta || {};
  return `runs=${Number(meta.visible || 0)}/${Number(meta.filtered || 0)} · total=${Number(meta.total || 0)} · active=${Number(meta.active || 0)} · failures=${Number(meta.failures || 0)}`;
};

export const formatAgentRunDiagnostics = (view = {}) => {
  const runs = Array.isArray(view?.runs) ? view.runs : [];
  if (!runs.length) return 'No agent runs';
  const filters = view?.filters || {};
  const header = [
    buildAgentRunDiagnosticsMeta(view),
    `filters: sessionId=${trim(filters.sessionId, '-')} · status=${trim(filters.status, '-')} · kind=${trim(filters.kind, '-')} · source=${trim(filters.source, '-')} · query=${trim(filters.query, '-')}`,
  ];
  const blocks = runs.map((run, index) => {
    const title = run.title ? ` · ${run.title}` : '';
    const error = run.errorMessage ? `\nerror: ${run.errorMessage}` : '';
    const cancel = run.cancelReason ? `\ncancelReason: ${run.cancelReason}` : '';
    const lastStep = run.lastStep
      ? `${run.lastStep.type} [${run.lastStep.status}]${run.lastStep.summary ? ` · ${run.lastStep.summary}` : ''}`
      : '-';
    return [
      `#${index + 1} [${run.status.toUpperCase()}] ${run.kind}${title}`,
      `runId: ${run.id || '-'}`,
      `sessionId: ${run.sessionId || '-'}`,
      `source: ${run.source || '-'}`,
      `trigger: ${run.trigger || '-'}`,
      `createdAt: ${formatTime(run.createdAt)}`,
      `updatedAt: ${formatTime(run.updatedAt)}`,
      `finishedAt: ${formatTime(run.finishedAt)}`,
      `durationMs: ${run.durationMs || 0}`,
      `steps: ${run.stepCount} · tools: ${run.toolCallCount} · events: ${run.eventCount}`,
      `lastStep: ${lastStep}`,
      `summary: ${run.summary || '-'}`,
      `${error}${cancel}`.trim(),
    ].filter(Boolean).join('\n');
  });
  return [...header, '', ...blocks].join('\n\n');
};
