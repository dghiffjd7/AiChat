const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const normalizeEventType = (type = '') => {
  const value = trim(type);
  if (value === 'mock_provider_stream_start') return 'provider_stream_start';
  if (value === 'mock_provider_stream_delta') return 'provider_stream_delta';
  if (value === 'mock_provider_stream_end') return 'provider_stream_end';
  return value || 'provider_stream_event';
};

const normalizeRunnerEvent = (event = {}, index = 0, context = {}) => {
  const source = isPlainObject(event) ? event : {};
  const type = normalizeEventType(source.type);
  return {
    type,
    sourceType: trim(source.type, type),
    index,
    provider: trim(source.provider, context.provider),
    model: trim(source.model, context.model),
    sessionId: trim(source.sessionId, context.sessionId),
    textDelta: type === 'provider_stream_delta' ? String(source.textDelta || '') : '',
    accumulatedText: type === 'provider_stream_delta' ? String(source.accumulatedText || '') : '',
    finalText: type === 'provider_stream_end' ? String(source.finalText || '') : '',
    finishReason: type === 'provider_stream_end' ? trim(source.finishReason, 'stop') : '',
    network: false,
    writesChat: false,
    createdAt: Number(source.createdAt || context.now?.() || Date.now()) || Date.now(),
  };
};

export const buildProviderToolRunnerDryRun = ({
  runnerHandoff = null,
  mockProviderRun = null,
  now = Date.now,
} = {}) => {
  const handoff = isPlainObject(runnerHandoff) ? runnerHandoff : null;
  const run = isPlainObject(mockProviderRun) ? mockProviderRun : null;
  const createdAt = readTimestamp(now);
  const base = {
    network: false,
    writesChat: false,
    createdAt,
    updatedAt: createdAt,
  };
  if (!handoff) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'runner handoff missing',
      events: [],
      eventCount: 0,
      finalText: '',
    };
  }
  if (handoff.ok !== true) {
    return {
      ...base,
      ok: false,
      status: trim(handoff.status, 'skipped'),
      reason: trim(handoff.reason, 'runner handoff is not ready'),
      runner: trim(handoff.runner),
      output: trim(handoff.output),
      events: [],
      eventCount: 0,
      finalText: '',
    };
  }
  if (!run || run.ok !== true) {
    return {
      ...base,
      ok: false,
      status: trim(run?.status, 'skipped'),
      reason: trim(run?.reason, 'mock provider run is not ready'),
      runner: trim(handoff.runner),
      output: trim(handoff.output),
      provider: trim(handoff.provider),
      model: trim(handoff.model),
      sessionId: trim(handoff.sessionId),
      events: [],
      eventCount: 0,
      finalText: '',
    };
  }

  const sourceEvents = Array.isArray(run.events) ? run.events : [];
  const context = {
    provider: trim(handoff.provider || run.provider),
    model: trim(handoff.model || run.model),
    sessionId: trim(handoff.sessionId || run.sessionId),
    now,
  };
  const events = sourceEvents.map((event, index) => normalizeRunnerEvent(event, index, context));
  return {
    ...base,
    ok: true,
    status: 'succeeded',
    reason: '',
    runner: trim(handoff.runner),
    output: trim(handoff.output),
    provider: context.provider,
    model: context.model,
    sessionId: context.sessionId,
    events,
    eventCount: events.length,
    finalText: String(run.finalText || events.at(-1)?.finalText || ''),
    updatedAt: readTimestamp(now),
  };
};
