import { PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS } from './provider-tool-runner-handoff.js';

const PROVIDER_STREAM_EVENT_TYPES = new Set([
  'provider_stream_start',
  'provider_stream_delta',
  'provider_stream_end',
]);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const resolveRunner = (runner = null) => {
  if (typeof runner === 'function') return runner;
  if (runner && typeof runner.run === 'function') return runner.run.bind(runner);
  return null;
};

const normalizeRunnerResult = (value = {}) => {
  if (Array.isArray(value)) return { events: value };
  return isPlainObject(value) ? value : {};
};

const normalizeProviderStreamEvent = (event = {}, index = 0, context = {}) => {
  const source = isPlainObject(event) ? event : {};
  const type = trim(source.type);
  if (!PROVIDER_STREAM_EVENT_TYPES.has(type)) {
    return {
      ok: false,
      reason: `unsupported provider stream event type: ${type || '-'}`,
      event: source,
    };
  }
  return {
    ok: true,
    event: {
      type,
      index,
      provider: trim(source.provider, context.provider),
      model: trim(source.model, context.model),
      sessionId: trim(source.sessionId, context.sessionId),
      textDelta: type === 'provider_stream_delta' ? String(source.textDelta || '') : '',
      accumulatedText: type === 'provider_stream_delta' ? String(source.accumulatedText || '') : '',
      finalText: type === 'provider_stream_end' ? String(source.finalText || '') : '',
      finishReason: type === 'provider_stream_end' ? trim(source.finishReason, 'stop') : '',
      network: source.network === true,
      writesChat: source.writesChat === true,
      createdAt: Number(source.createdAt || context.now?.() || Date.now()) || Date.now(),
    },
  };
};

export const runProviderToolRunnerFacade = async ({
  runnerRequestDraft = null,
  runner = null,
  enabled = false,
  allowNetwork = false,
  now = Date.now,
} = {}) => {
  const draft = isPlainObject(runnerRequestDraft) ? runnerRequestDraft : null;
  const createdAt = readTimestamp(now);
  const base = {
    network: false,
    writesChat: false,
    input: 'runnerRequestDraft',
    output: PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents,
    events: [],
    eventCount: 0,
    finalText: '',
    createdAt,
    updatedAt: createdAt,
  };

  if (enabled !== true) {
    return {
      ...base,
      ok: false,
      status: 'disabled',
      reason: 'provider runner facade disabled',
    };
  }
  if (!draft) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'runner request draft missing',
    };
  }
  if (draft.ok !== true) {
    return {
      ...base,
      ok: false,
      status: trim(draft.status, 'skipped'),
      reason: trim(draft.reason, 'runner request draft is not ready'),
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
    };
  }
  if (trim(draft.output) !== PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner request draft output is not provider stream events',
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
    };
  }
  if (draft.network === true && allowNetwork !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'provider runner facade refuses network by default',
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
    };
  }
  if (draft.writesChat === true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'provider runner facade must not write chat messages directly',
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
    };
  }

  const run = resolveRunner(runner);
  if (!run) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'provider runner not configured',
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
      runner: trim(draft.runner),
    };
  }

  try {
    const rawResult = await run(clone(draft), {
      allowNetwork: allowNetwork === true,
      now,
    });
    const result = normalizeRunnerResult(rawResult);
    if (result.ok === false) {
      return {
        ...base,
        ok: false,
        status: trim(result.status, 'failed'),
        reason: trim(result.reason, 'provider runner failed'),
        provider: trim(draft.provider),
        model: trim(draft.model),
        sessionId: trim(draft.sessionId),
        runner: trim(draft.runner),
        runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
        updatedAt: readTimestamp(now),
      };
    }
    if (result.network === true && allowNetwork !== true) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason: 'provider runner facade blocked network result',
        provider: trim(draft.provider),
        model: trim(draft.model),
        sessionId: trim(draft.sessionId),
        runner: trim(draft.runner),
        runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
        updatedAt: readTimestamp(now),
      };
    }
    if (result.writesChat === true) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason: 'provider runner facade blocked direct chat write',
        provider: trim(draft.provider),
        model: trim(draft.model),
        sessionId: trim(draft.sessionId),
        runner: trim(draft.runner),
        runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
        updatedAt: readTimestamp(now),
      };
    }
    if (trim(result.output, PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents) !== PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason: 'provider runner output is not provider stream events',
        provider: trim(draft.provider),
        model: trim(draft.model),
        sessionId: trim(draft.sessionId),
        runner: trim(draft.runner),
        runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
        updatedAt: readTimestamp(now),
      };
    }

    const sourceEvents = Array.isArray(result.events) ? result.events : [];
    const context = {
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
      now,
    };
    const normalized = sourceEvents.map((event, index) => normalizeProviderStreamEvent(event, index, context));
    const invalid = normalized.find(item => item.ok !== true);
    if (invalid) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason: invalid.reason,
        provider: context.provider,
        model: context.model,
        sessionId: context.sessionId,
        runner: trim(draft.runner),
        runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
        updatedAt: readTimestamp(now),
      };
    }

    const events = normalized.map(item => item.event);
    const endEvent = events.slice().reverse().find(event => event.type === 'provider_stream_end');
    const finalText = String(result.finalText || endEvent?.finalText || '');
    return {
      ...base,
      ok: true,
      status: 'succeeded',
      reason: '',
      provider: context.provider,
      model: context.model,
      sessionId: context.sessionId,
      runner: trim(draft.runner),
      payloadKind: trim(draft.payloadKind),
      requestPreviewFormat: trim(draft.requestPreviewFormat),
      events,
      eventCount: events.length,
      finalText,
      network: result.network === true,
      writesChat: false,
      runnerBoundary: isPlainObject(result.runnerBoundary) ? clone(result.runnerBoundary) : null,
      updatedAt: readTimestamp(now),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason: trim(error?.message || error, 'provider runner failed'),
      provider: trim(draft.provider),
      model: trim(draft.model),
      sessionId: trim(draft.sessionId),
      runner: trim(draft.runner),
      updatedAt: readTimestamp(now),
    };
  }
};
