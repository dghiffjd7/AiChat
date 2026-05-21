const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const chunkText = (text = '', chunkChars = 24) => {
  const source = String(text ?? '');
  const size = Math.max(1, Math.trunc(Number(chunkChars || 0)) || 24);
  const chars = Array.from(source);
  const chunks = [];
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(''));
  }
  return chunks;
};

const buildSkippedRun = ({
  status = 'skipped',
  reason = '',
  mockLoopPreview = null,
  now = Date.now,
} = {}) => {
  const timestamp = readTimestamp(now);
  return {
    ok: false,
    status,
    reason: trim(reason, status),
    provider: trim(mockLoopPreview?.provider || mockLoopPreview?.requestPreview?.provider),
    model: trim(mockLoopPreview?.requestPreview?.model),
    network: false,
    events: [],
    eventCount: 0,
    finalText: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const buildProviderToolMockProviderRun = ({
  mockLoopPreview = null,
  now = Date.now,
  chunkChars = 24,
} = {}) => {
  if (!isPlainObject(mockLoopPreview)) {
    return buildSkippedRun({
      status: 'skipped',
      reason: 'mock loop preview missing',
      mockLoopPreview,
      now,
    });
  }
  const requestPreview = isPlainObject(mockLoopPreview.requestPreview)
    ? mockLoopPreview.requestPreview
    : {};
  if (mockLoopPreview.network === true || requestPreview.network === true) {
    return buildSkippedRun({
      status: 'blocked',
      reason: 'mock provider runner refuses network previews',
      mockLoopPreview,
      now,
    });
  }
  if (mockLoopPreview.ok !== true) {
    return buildSkippedRun({
      status: trim(mockLoopPreview.status, 'skipped'),
      reason: trim(mockLoopPreview.reason, 'mock loop preview is not ready'),
      mockLoopPreview,
      now,
    });
  }

  const provider = trim(mockLoopPreview.provider || requestPreview.provider);
  if (provider !== 'openai') {
    return buildSkippedRun({
      status: 'unsupported',
      reason: `mock provider runner only supports openai, got ${provider || '-'}`,
      mockLoopPreview,
      now,
    });
  }

  const assistantPreview = isPlainObject(mockLoopPreview.assistantPreview)
    ? mockLoopPreview.assistantPreview
    : {};
  const finalText = trim(assistantPreview.content);
  if (!finalText) {
    return buildSkippedRun({
      status: 'skipped',
      reason: 'assistant preview content missing',
      mockLoopPreview,
      now,
    });
  }

  const createdAt = readTimestamp(now);
  const model = trim(requestPreview.model);
  const sessionId = trim(requestPreview.sessionId);
  const chunks = chunkText(finalText, chunkChars);
  let accumulatedText = '';
  const events = [
    {
      type: 'mock_provider_stream_start',
      provider,
      model,
      sessionId,
      role: 'assistant',
      createdAt,
    },
  ];
  chunks.forEach((textDelta, index) => {
    accumulatedText += textDelta;
    events.push({
      type: 'mock_provider_stream_delta',
      provider,
      model,
      sessionId,
      index,
      textDelta,
      accumulatedText,
      createdAt: readTimestamp(now),
    });
  });
  events.push({
    type: 'mock_provider_stream_end',
    provider,
    model,
    sessionId,
    finishReason: 'stop',
    finalText,
    createdAt: readTimestamp(now),
  });

  return {
    ok: true,
    status: 'succeeded',
    provider,
    model,
    sessionId,
    network: false,
    requestPreview,
    assistantPreview,
    events,
    eventCount: events.length,
    finalText,
    chars: Array.from(finalText).length,
    createdAt,
    updatedAt: readTimestamp(now),
  };
};
