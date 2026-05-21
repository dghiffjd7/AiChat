export const PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS = Object.freeze({
  providerStreamEvents: 'provider_stream_events',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

export const buildProviderToolRunnerHandoff = ({
  requestPreview = null,
  loopState = null,
  runner = 'mock_provider_runner',
  network = false,
  writesChat = false,
  now = Date.now,
} = {}) => {
  const createdAt = readTimestamp(now);
  const request = isPlainObject(requestPreview) ? requestPreview : null;
  const state = isPlainObject(loopState) ? loopState : null;
  const base = {
    runner: trim(runner, 'mock_provider_runner'),
    network: network === true,
    writesChat: writesChat === true,
    inputKeys: ['requestPreview', 'loopState'],
    output: PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents,
    outputEventTypes: [
      'provider_stream_start',
      'provider_stream_delta',
      'provider_stream_end',
    ],
    createdAt,
  };

  if (!request) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'request preview missing',
    };
  }
  if (!state) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'loop state missing',
      provider: trim(request.provider),
      model: trim(request.model),
      sessionId: trim(request.sessionId),
    };
  }
  if (request.network === true || network === true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner handoff refuses network by default',
      provider: trim(request.provider || state.provider),
      model: trim(request.model || state.model),
      sessionId: trim(request.sessionId || state.sessionId),
      requestPreviewFormat: trim(request.format),
      loopStateStatus: trim(state.status),
    };
  }
  if (writesChat === true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner handoff must not write chat messages directly',
      provider: trim(request.provider || state.provider),
      model: trim(request.model || state.model),
      sessionId: trim(request.sessionId || state.sessionId),
      requestPreviewFormat: trim(request.format),
      loopStateStatus: trim(state.status),
    };
  }

  const toolResultCount = Number(request.toolResultCount || 0) || 0;
  if (!toolResultCount) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'no model-safe tool results to hand off',
      provider: trim(request.provider || state.provider),
      model: trim(request.model || state.model),
      sessionId: trim(request.sessionId || state.sessionId),
      requestPreviewFormat: trim(request.format),
      loopStateStatus: trim(state.status),
      toolResultCount,
    };
  }

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason: '',
    provider: trim(request.provider || state.provider),
    model: trim(request.model || state.model),
    sessionId: trim(request.sessionId || state.sessionId),
    requestPreviewFormat: trim(request.format),
    toolResultCount,
    loopStateStatus: trim(state.status),
    loopStatePhase: trim(state.phase),
    loopStatePhaseCount: Number(state.phaseCount || 0) || 0,
    shouldContinue: state.shouldContinue === true,
  };
};
