const toTimestamp = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : null;
};

const toTokenCount = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? Math.trunc(next) : null;
};

export const buildFirstTokenResponseDiagnostics = (current = null, {
  requestStartedAt = 0,
  firstTokenAt = 0,
  stream = true,
} = {}) => {
  const previous = current && typeof current === 'object' ? current : {};
  if (toTimestamp(previous.firstTokenAt) || Number.isFinite(Number(previous.firstTokenLatencyMs))) {
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
  };
};

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
  const firstTokenLatencyMs = Number.isFinite(Number(previous.firstTokenLatencyMs))
    ? Math.max(0, Math.trunc(Number(previous.firstTokenLatencyMs)))
    : null;
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
    firstTokenLatencyMs,
    outputDurationMs,
    tokensPerSecond,
    promptTokens: toTokenCount(usage?.promptTokens),
    completionTokens,
    totalTokens: toTokenCount(usage?.totalTokens),
    finishReason: String(usage?.finishReason || '').trim(),
    systemFingerprint: String(usage?.systemFingerprint || '').trim(),
  };
};

