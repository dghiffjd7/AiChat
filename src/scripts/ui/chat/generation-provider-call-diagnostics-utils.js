import {
  buildCompletedResponseDiagnostics,
  buildFirstMeaningfulDeltaResponseDiagnostics,
} from './request-response-diagnostics-utils.js';

const text = value => String(value ?? '').trim().slice(0, 512);

const timestamp = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
};

const clone = value => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value && typeof value === 'object' ? { ...value } : value;
  }
};

export const isMeaningfulTextStreamDelta = chunk => (
  typeof chunk === 'string' && chunk.trim().length > 0
);

export const createGenerationProviderCallDiagnosticsTracker = ({ now = Date.now } = {}) => {
  const calls = [];
  let activeCallId = '';
  let sequence = 0;

  const getCall = callId => calls.find(call => call.callId === callId) || null;

  const start = ({
    mode = '',
    provider = '',
    model = '',
    stream = false,
    startedAt = null,
  } = {}) => {
    const at = timestamp(startedAt, timestamp(now?.(), Date.now()));
    const callIndex = sequence += 1;
    const callId = `provider-call-${callIndex}`;
    calls.push({
      callId,
      callIndex,
      mode: text(mode),
      provider: text(provider),
      model: text(model),
      stream: stream === true,
      outcome: 'running',
      startedAt: at,
      completedAt: null,
      latencyMs: null,
      firstTokenAt: null,
      firstTokenLatencyMs: null,
      firstMeaningfulDeltaAt: null,
      firstMeaningfulDeltaLatencyMs: null,
      outputDurationMs: null,
      tokensPerSecond: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      finishReason: '',
      systemFingerprint: '',
      modelVersion: '',
      responseId: '',
      responseModel: '',
      routedProvider: '',
      webSearchRequests: null,
      webSearchTokens: null,
      webSearchEngine: '',
    });
    activeCallId = callId;
    return callId;
  };

  const markFirstMeaningfulDelta = (callId = activeCallId, { at = null } = {}) => {
    const call = getCall(callId);
    if (!call || call.outcome !== 'running' || call.firstMeaningfulDeltaAt) return false;
    const next = buildFirstMeaningfulDeltaResponseDiagnostics(call, {
      requestStartedAt: call.startedAt,
      firstTokenAt: timestamp(at, timestamp(now?.(), Date.now())),
      stream: call.stream,
    });
    Object.assign(call, next);
    return Boolean(call.firstMeaningfulDeltaAt);
  };

  const observeUsage = (callId = activeCallId, usage = null) => {
    const call = getCall(callId);
    if (!call || call.outcome !== 'running') return false;
    if (usage && typeof usage === 'object') {
      const next = buildCompletedResponseDiagnostics(call, {
        requestStartedAt: call.startedAt,
        completedAt: timestamp(now?.(), Date.now()),
        usage,
        stream: call.stream,
      });
      const { completedAt: _completedAt, latencyMs: _latencyMs, ...usageFacts } = next;
      Object.assign(call, usageFacts, {
        provider: text(usage.provider) || call.provider,
        model: text(usage.model) || call.model,
      });
    }
    return true;
  };

  const finish = (callId = activeCallId, {
    outcome = 'succeeded',
    completedAt = null,
    usage = null,
  } = {}) => {
    const call = getCall(callId);
    if (!call || call.outcome !== 'running') return false;
    if (usage && typeof usage === 'object') observeUsage(callId, usage);
    const next = buildCompletedResponseDiagnostics(call, {
      requestStartedAt: call.startedAt,
      completedAt: timestamp(completedAt, timestamp(now?.(), Date.now())),
      usage: call,
      stream: call.stream,
    });
    Object.assign(call, next, { outcome: text(outcome) || 'succeeded' });
    if (activeCallId === callId) activeCallId = '';
    return true;
  };

  return {
    start,
    markFirstMeaningfulDelta,
    observeUsage,
    finish,
    getActiveCallId: () => activeCallId,
    snapshot: () => calls.map(call => clone(call)),
  };
};
