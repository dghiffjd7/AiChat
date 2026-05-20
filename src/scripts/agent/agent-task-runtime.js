import {
  AGENT_EVENT_TYPES,
  buildAgentTraceEvent,
  cloneAgentValue,
  createAgentId,
  normalizeAgentEvent,
  normalizeAgentRun,
  normalizeAgentStatus,
  normalizeAgentStep,
} from './agent-events.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = value => cloneAgentValue(value, value && typeof value === 'object' ? {} : value);

const toAgentFinishStatus = status => {
  const normalized = normalizeAgentStatus(status, '');
  if (normalized === 'running' || normalized === 'queued' || normalized === 'waiting_permission') {
    return 'succeeded';
  }
  return normalized || 'succeeded';
};

export const createAgentTaskRuntime = ({
  store = null,
  toolRegistry = null,
  recordTraceEvent = null,
  logger = console,
  now = Date.now,
  idFactory = createAgentId,
} = {}) => {
  const listeners = new Set();
  const runningTasks = new Map();
  let api = null;

  const safeNow = () => {
    try {
      const value = typeof now === 'function' ? now() : Date.now();
      return Number.isFinite(Number(value)) ? Number(value) : Date.now();
    } catch {
      return Date.now();
    }
  };

  const emit = (event = {}) => {
    const normalized = normalizeAgentEvent(event, {
      eventId: idFactory('event'),
      now: safeNow,
    });
    try {
      store?.recordEvent?.(normalized);
    } catch (err) {
      logger?.warn?.('agent event store record failed', err);
    }
    if (typeof recordTraceEvent === 'function') {
      try {
        recordTraceEvent(buildAgentTraceEvent(normalized));
      } catch (err) {
        logger?.warn?.('agent trace record failed', err);
      }
    }
    listeners.forEach((listener) => {
      try {
        listener(clone(normalized));
      } catch (err) {
        logger?.warn?.('agent event listener failed', err);
      }
    });
    return clone(normalized);
  };

  const upsertRun = (run = {}, eventType = AGENT_EVENT_TYPES.runUpdated) => {
    const normalized = normalizeAgentRun({
      ...run,
      id: run.id || run.runId || idFactory('run'),
    }, { now: safeNow });
    try {
      store?.upsertRun?.(normalized);
    } catch (err) {
      logger?.warn?.('agent run store upsert failed', err);
    }
    emit({
      type: eventType,
      runId: normalized.id,
      sessionId: normalized.sessionId,
      source: normalized.source,
      status: normalized.status,
      summary: normalized.summary,
      details: {
        kind: normalized.kind,
        trigger: normalized.trigger,
      },
      createdAt: normalized.updatedAt,
    });
    return clone(normalized);
  };

  const startRun = (run = {}) => upsertRun({
    ...run,
    status: run.status || 'running',
    createdAt: run.createdAt ?? safeNow(),
    updatedAt: run.updatedAt ?? safeNow(),
  }, AGENT_EVENT_TYPES.runStarted);

  const queueRun = (run = {}) => upsertRun({
    ...run,
    status: 'queued',
    createdAt: run.createdAt ?? safeNow(),
    updatedAt: run.updatedAt ?? safeNow(),
  }, AGENT_EVENT_TYPES.runQueued);

  const updateRun = (runId = '', patch = {}) => {
    const id = String(runId || '').trim();
    if (!id) return null;
    let run = null;
    try {
      run = store?.updateRun?.(id, {
        ...(isPlainObject(patch) ? patch : {}),
        updatedAt: patch?.updatedAt ?? safeNow(),
      });
    } catch (err) {
      logger?.warn?.('agent run store update failed', err);
    }
    if (!run) return null;
    emit({
      type: AGENT_EVENT_TYPES.runUpdated,
      runId: id,
      sessionId: run.sessionId,
      source: run.source,
      status: run.status,
      summary: run.summary,
      details: {
        kind: run.kind,
      },
      createdAt: run.updatedAt,
    });
    return clone(run);
  };

  const finishRun = (runId = '', patch = {}) => {
    const id = String(runId || '').trim();
    if (!id) return null;
    const status = toAgentFinishStatus(patch?.status);
    let run = null;
    try {
      run = store?.updateRun?.(id, {
        ...(isPlainObject(patch) ? patch : {}),
        status,
        finishedAt: patch?.finishedAt ?? safeNow(),
        updatedAt: patch?.updatedAt ?? patch?.finishedAt ?? safeNow(),
      });
    } catch (err) {
      logger?.warn?.('agent run store finish failed', err);
    }
    if (!run) return null;
    runningTasks.delete(id);
    emit({
      type: AGENT_EVENT_TYPES.runFinished,
      runId: id,
      sessionId: run.sessionId,
      source: run.source,
      status: run.status,
      summary: run.summary,
      details: {
        kind: run.kind,
        errorMessage: run.errorMessage,
        cancelReason: run.cancelReason,
      },
      createdAt: run.finishedAt ?? run.updatedAt,
    });
    return clone(run);
  };

  const startStep = (runId = '', step = {}) => {
    const id = String(runId || '').trim();
    if (!id) return null;
    const run = store?.getRun?.(id);
    const normalized = normalizeAgentStep({
      ...step,
      id: step.id || step.stepId || idFactory('step'),
      runId: id,
      status: step.status || 'running',
      startedAt: step.startedAt ?? safeNow(),
      updatedAt: step.updatedAt ?? safeNow(),
    }, { runId: id, now: safeNow });
    let saved = null;
    try {
      saved = store?.addStep?.(id, normalized);
    } catch (err) {
      logger?.warn?.('agent step store add failed', err);
    }
    if (!saved) return null;
    emit({
      type: AGENT_EVENT_TYPES.stepStarted,
      runId: id,
      stepId: saved.id,
      sessionId: run?.sessionId || '',
      source: run?.source || saved.type,
      status: saved.status,
      summary: saved.summary,
      details: {
        type: saved.type,
      },
      createdAt: saved.startedAt,
    });
    return clone(saved);
  };

  const finishStep = (runId = '', stepId = '', patch = {}) => {
    const id = String(runId || '').trim();
    const sid = String(stepId || '').trim();
    if (!id || !sid) return null;
    const run = store?.getRun?.(id);
    const status = toAgentFinishStatus(patch?.status);
    let saved = null;
    try {
      saved = store?.updateStep?.(id, sid, {
        ...(isPlainObject(patch) ? patch : {}),
        status,
        finishedAt: patch?.finishedAt ?? safeNow(),
        updatedAt: patch?.updatedAt ?? patch?.finishedAt ?? safeNow(),
      });
    } catch (err) {
      logger?.warn?.('agent step store finish failed', err);
    }
    if (!saved) return null;
    emit({
      type: AGENT_EVENT_TYPES.stepFinished,
      runId: id,
      stepId: sid,
      sessionId: run?.sessionId || '',
      source: run?.source || saved.type,
      status: saved.status,
      summary: saved.summary,
      details: {
        type: saved.type,
        errorMessage: saved.errorMessage,
      },
      createdAt: saved.finishedAt ?? saved.updatedAt,
    });
    return clone(saved);
  };

  const cancel = (runId = '', reason = '') => finishRun(runId, {
    status: 'cancelled',
    cancelReason: String(reason || '').trim(),
    summary: reason ? `cancelled: ${String(reason).trim()}` : 'cancelled',
  });

  const enqueue = (run = {}, task = null) => {
    const queued = queueRun(run);
    if (typeof task !== 'function') return Promise.resolve(queued);
    const runId = queued.id;
    const promise = Promise.resolve()
      .then(() => updateRun(runId, { status: 'running' }))
      .then(() => task({
        runId,
        startStep: step => startStep(runId, step),
        finishStep: (stepId, patch) => finishStep(runId, stepId, patch),
        emit,
        cancel: reason => cancel(runId, reason),
      }))
      .then((result) => {
        finishRun(runId, {
          status: 'succeeded',
          output: clone(result),
          summary: run.summary || 'agent task succeeded',
        });
        return result;
      }, (err) => {
        finishRun(runId, {
          status: err?.name === 'AbortError' ? 'cancelled' : 'failed',
          errorMessage: err?.message ? String(err.message) : String(err || ''),
          summary: err?.name === 'AbortError' ? 'agent task cancelled' : 'agent task failed',
        });
        throw err;
      });
    runningTasks.set(runId, promise);
    return promise;
  };

  const onEvent = (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const executeTool = (toolName = '', args = {}, context = {}) => {
    if (!toolRegistry || typeof toolRegistry.executeTool !== 'function') {
      throw new Error('agent tool registry not configured');
    }
    return toolRegistry.executeTool(toolName, args, {
      ...context,
      emit,
      runtime: api,
    });
  };

  api = {
    enqueue,
    cancel,
    emit,
    executeTool,
    finishRun,
    finishStep,
    getRun: runId => store?.getRun?.(runId) || null,
    listEvents: options => store?.listEvents?.(options) || [],
    listRuns: options => store?.listRuns?.(options) || [],
    onEvent,
    startRun,
    startStep,
    updateRun,
  };
  return api;
};
