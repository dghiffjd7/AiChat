import { ensureDebugUiRegistry } from './debug-ui-registry-utils.js';

export const DEBUG_TRACE_TIMELINE_MAX_EVENTS = 500;

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeText = (value, fallback = '') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const normalizeOptionalText = value => normalizeText(value, '');

const normalizeTimestamp = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return fallback;
};

const normalizeDuration = (value, startedAt, endedAt) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  if (endedAt == null) return null;
  return Math.max(0, Number(endedAt) - Number(startedAt || endedAt));
};

const normalizeRelatedIds = (relatedIds) => (
  Array.isArray(relatedIds) ? relatedIds : []
).map(id => String(id || '').trim()).filter(Boolean);

export const normalizeDebugTraceEvent = (event = {}, {
  eventId = '',
  now = Date.now,
} = {}) => {
  const fallbackNow = normalizeTimestamp(now?.(), Date.now());
  const startedAt = normalizeTimestamp(event?.startedAt, fallbackNow);
  const endedAt = event?.endedAt == null ? null : normalizeTimestamp(event.endedAt, startedAt);
  return {
    eventId: normalizeText(event?.eventId, eventId || `trace-${startedAt}`),
    category: normalizeText(event?.category, 'general'),
    phase: normalizeText(event?.phase, 'event'),
    sessionId: normalizeText(event?.sessionId, ''),
    hookName: normalizeOptionalText(event?.hookName),
    runtimeLabel: normalizeOptionalText(event?.runtimeLabel),
    messageId: normalizeOptionalText(event?.messageId),
    momentId: normalizeOptionalText(event?.momentId),
    source: normalizeText(event?.source, 'unknown'),
    status: normalizeText(event?.status, 'info'),
    startedAt,
    endedAt,
    durationMs: normalizeDuration(event?.durationMs, startedAt, endedAt),
    summary: normalizeText(event?.summary, ''),
    details: isPlainObject(event?.details) ? { ...event.details } : {},
    relatedIds: normalizeRelatedIds(event?.relatedIds),
  };
};

export const createDebugTraceTimeline = ({
  maxEvents = DEBUG_TRACE_TIMELINE_MAX_EVENTS,
  now = Date.now,
} = {}) => {
  const events = [];
  const limit = Math.max(1, Number(maxEvents) || DEBUG_TRACE_TIMELINE_MAX_EVENTS);
  let counter = 0;

  const createEventId = () => `trace-${normalizeTimestamp(now?.(), Date.now())}-${counter += 1}`;
  const trimEvents = () => {
    while (events.length > limit) events.shift();
  };

  const record = (event = {}) => {
    const normalized = normalizeDebugTraceEvent(event, {
      eventId: createEventId(),
      now,
    });
    events.push(normalized);
    trimEvents();
    return normalized;
  };

  const start = (event = {}) => record({
    ...event,
    status: event?.status || 'started',
    endedAt: null,
    durationMs: null,
  });

  const finish = (eventId, patch = {}) => {
    const id = normalizeText(eventId, '');
    if (!id) return null;
    const index = events.findIndex(event => event.eventId === id);
    if (index < 0) return null;
    const previous = events[index];
    const endedAt = normalizeTimestamp(patch?.endedAt, normalizeTimestamp(now?.(), Date.now()));
    const next = normalizeDebugTraceEvent({
      ...previous,
      ...patch,
      eventId: id,
      startedAt: previous.startedAt,
      endedAt,
      status: patch?.status || 'success',
      durationMs: patch?.durationMs ?? Math.max(0, endedAt - Number(previous.startedAt || endedAt)),
    }, {
      eventId: id,
      now,
    });
    events[index] = next;
    return next;
  };

  const clear = () => {
    events.length = 0;
  };

  const snapshot = ({
    category = '',
    sessionId = '',
    status = '',
    limit: snapshotLimit = 0,
  } = {}) => {
    const categoryFilter = normalizeText(category, '');
    const sessionFilter = normalizeText(sessionId, '');
    const statusFilter = normalizeText(status, '');
    const filtered = events.filter((event) => {
      if (categoryFilter && event.category !== categoryFilter) return false;
      if (sessionFilter && event.sessionId !== sessionFilter) return false;
      if (statusFilter && event.status !== statusFilter) return false;
      return true;
    });
    const count = Math.max(0, Number(snapshotLimit) || 0);
    return count > 0 ? filtered.slice(-count) : filtered.slice();
  };

  return {
    maxEvents: limit,
    record,
    start,
    finish,
    clear,
    snapshot,
  };
};

export const ensureDebugTraceTimeline = (appBridge, options = {}) => {
  const registry = ensureDebugUiRegistry(appBridge);
  if (!registry) return null;
  if (!isPlainObject(registry.stores)) registry.stores = {};
  if (!isPlainObject(registry.actions)) registry.actions = {};
  const current = registry.stores.traceTimeline;
  const timeline = current && typeof current.record === 'function' && typeof current.snapshot === 'function'
    ? current
    : createDebugTraceTimeline(options);
  registry.stores.traceTimeline = timeline;
  registry.actions.recordTraceEvent = event => timeline.record(event);
  registry.actions.startTraceEvent = event => timeline.start(event);
  registry.actions.finishTraceEvent = (eventId, patch = {}) => timeline.finish(eventId, patch);
  return timeline;
};
