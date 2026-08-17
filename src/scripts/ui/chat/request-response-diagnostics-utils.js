const toTimestamp = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : null;
};

const toTokenCount = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? Math.trunc(next) : null;
};

const toNonNegativeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : null;
};

const identityText = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || String(fallback ?? '').trim();
};

export const buildFirstTokenResponseDiagnostics = (current = null, {
  requestStartedAt = 0,
  firstTokenAt = 0,
  stream = true,
} = {}) => {
  const previous = current && typeof current === 'object' ? current : {};
  if (
    toTimestamp(previous.firstMeaningfulDeltaAt ?? previous.firstTokenAt)
    || toNonNegativeNumber(previous.firstMeaningfulDeltaLatencyMs ?? previous.firstTokenLatencyMs) !== null
  ) {
    return previous;
  }
  const startedAt = toTimestamp(requestStartedAt);
  const tokenAt = toTimestamp(firstTokenAt);
  if (!startedAt || !tokenAt || tokenAt < startedAt) return previous;
  return {
    ...previous,
    stream: Boolean(stream),
    firstTokenAt: tokenAt,
    firstTokenLatencyMs: tokenAt - startedAt,
    firstMeaningfulDeltaAt: tokenAt,
    firstMeaningfulDeltaLatencyMs: tokenAt - startedAt,
  };
};

export const buildFirstMeaningfulDeltaResponseDiagnostics = buildFirstTokenResponseDiagnostics;

export const buildCompletedResponseDiagnostics = (current = null, {
  requestStartedAt = 0,
  completedAt = 0,
  usage = null,
  stream = null,
} = {}) => {
  const previous = current && typeof current === 'object' ? current : {};
  const startedAt = toTimestamp(requestStartedAt);
  const endedAt = toTimestamp(completedAt);
  const latencyMs = startedAt && endedAt && endedAt >= startedAt
    ? endedAt - startedAt
    : null;
  const firstMeaningfulDeltaAt = toTimestamp(
    previous.firstMeaningfulDeltaAt ?? previous.firstTokenAt,
  );
  const firstMeaningfulDeltaLatency = toNonNegativeNumber(
    previous.firstMeaningfulDeltaLatencyMs ?? previous.firstTokenLatencyMs,
  );
  const firstTokenLatencyMs = firstMeaningfulDeltaLatency === null
    ? null
    : Math.trunc(firstMeaningfulDeltaLatency);
  const outputDurationMs = latencyMs !== null && firstTokenLatencyMs !== null
    ? Math.max(0, latencyMs - firstTokenLatencyMs)
    : null;
  const completionTokens = toTokenCount(usage?.completionTokens);
  const tokensPerSecond = completionTokens !== null && completionTokens > 0 && outputDurationMs > 0
    ? Math.round((completionTokens / (outputDurationMs / 1000)) * 10) / 10
    : null;

  return {
    ...previous,
    stream: stream === null ? Boolean(previous.stream) : Boolean(stream),
    completedAt: endedAt,
    latencyMs,
    firstMeaningfulDeltaAt,
    firstMeaningfulDeltaLatencyMs: firstTokenLatencyMs,
    firstTokenLatencyMs,
    outputDurationMs,
    tokensPerSecond,
    promptTokens: toTokenCount(usage?.promptTokens),
    completionTokens,
    totalTokens: toTokenCount(usage?.totalTokens),
    finishReason: String(usage?.finishReason || '').trim(),
    systemFingerprint: identityText(usage?.systemFingerprint, previous.systemFingerprint),
    modelVersion: identityText(usage?.modelVersion, previous.modelVersion),
    responseId: identityText(usage?.responseId, previous.responseId),
    responseModel: identityText(usage?.responseModel, previous.responseModel),
    routedProvider: identityText(usage?.routedProvider, previous.routedProvider),
  };
};

export const mergeResponseDiagnosticsIntoUsage = (
  usage = null,
  responseDiagnostics = null,
  { providerCalls = [] } = {},
) => {
  const src = usage && typeof usage === 'object' ? usage : {};
  const diagnostics = responseDiagnostics && typeof responseDiagnostics === 'object'
    ? responseDiagnostics
    : {};
  const calls = Array.isArray(providerCalls) ? providerCalls.map(call => ({ ...call })) : [];
  if (!Object.keys(src).length && !Object.keys(diagnostics).length && !calls.length) return null;
  return {
    ...src,
    latencyMs: toTokenCount(diagnostics.latencyMs ?? src.latencyMs),
    firstTokenLatencyMs: toTokenCount(
      diagnostics.firstTokenLatencyMs
      ?? diagnostics.firstMeaningfulDeltaLatencyMs
      ?? src.firstTokenLatencyMs,
    ),
    firstMeaningfulDeltaLatencyMs: toTokenCount(
      diagnostics.firstMeaningfulDeltaLatencyMs
      ?? diagnostics.firstTokenLatencyMs
      ?? src.firstMeaningfulDeltaLatencyMs,
    ),
    outputDurationMs: toTokenCount(diagnostics.outputDurationMs ?? src.outputDurationMs),
    tokensPerSecond: toNonNegativeNumber(diagnostics.tokensPerSecond ?? src.tokensPerSecond),
    systemFingerprint: identityText(diagnostics.systemFingerprint, src.systemFingerprint),
    modelVersion: identityText(diagnostics.modelVersion, src.modelVersion),
    responseId: identityText(diagnostics.responseId, src.responseId),
    responseModel: identityText(diagnostics.responseModel, src.responseModel),
    routedProvider: identityText(diagnostics.routedProvider, src.routedProvider),
    ...(calls.length ? { providerCalls: calls } : {}),
  };
};
