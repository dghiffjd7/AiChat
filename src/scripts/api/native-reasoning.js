export const STREAM_EVENT_MARKER = '__chatappStream';

const pickString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }
  return '';
};

const normalizeText = (value) => String(value ?? '');

const readStructuredText = (part = {}) =>
  pickString(
    part?.text,
    part?.content,
    part?.delta,
    part?.value,
    part?.reasoning,
    part?.reasoning_content,
  );

export const createReasoningStreamEvent = (text, extra = {}) => {
  const value = normalizeText(text);
  if (!value) return null;
  return {
    [STREAM_EVENT_MARKER]: true,
    kind: 'reasoning',
    text: value,
    hidden: extra?.hidden === true,
    label: typeof extra?.label === 'string' ? extra.label : '',
    provider: typeof extra?.provider === 'string' ? extra.provider : '',
  };
};

export const isReasoningStreamEvent = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      value[STREAM_EVENT_MARKER] === true &&
      value.kind === 'reasoning',
  );

export const normalizeAssistantStreamChunk = (value) => {
  if (isReasoningStreamEvent(value)) {
    return {
      content: '',
      reasoning: normalizeText(value.text),
      reasoningHidden: value.hidden === true,
      reasoningLabel: typeof value.label === 'string' ? value.label : '',
      provider: typeof value.provider === 'string' ? value.provider : '',
    };
  }
  return {
    content: normalizeText(value),
    reasoning: '',
    reasoningHidden: false,
    reasoningLabel: '',
    provider: '',
  };
};

export const extractGeminiStreamParts = (content = null) => {
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  let contentText = '';
  let reasoningText = '';
  for (const part of parts) {
    const text = readStructuredText(part);
    if (!text) continue;
    if (part?.thought === true) {
      reasoningText += text;
    } else {
      contentText += text;
    }
  }
  return { content: contentText, reasoning: reasoningText };
};

const extractOpenAIArrayParts = (value) => {
  const parts = Array.isArray(value) ? value : [];
  let contentText = '';
  let reasoningText = '';
  for (const part of parts) {
    const text = readStructuredText(part);
    if (!text) continue;
    const type = String(part?.type || part?.content_type || part?.role || '').toLowerCase();
    if (type.includes('reason') || type.includes('think')) {
      reasoningText += text;
    } else {
      contentText += text;
    }
  }
  return { content: contentText, reasoning: reasoningText };
};

export const extractOpenAICompatibleStreamParts = (data = {}) => {
  const delta =
    (data?.choices?.[0]?.delta && typeof data.choices[0].delta === 'object')
      ? data.choices[0].delta
      : (data?.delta && typeof data.delta === 'object')
        ? data.delta
        : {};

  let contentText = '';
  let reasoningText = '';

  if (Array.isArray(delta?.content)) {
    const extracted = extractOpenAIArrayParts(delta.content);
    contentText += extracted.content;
    reasoningText += extracted.reasoning;
  } else {
    contentText += pickString(delta?.content);
  }

  if (!contentText && Array.isArray(data?.content)) {
    const extracted = extractOpenAIArrayParts(data.content);
    contentText += extracted.content;
    reasoningText += extracted.reasoning;
  }

  reasoningText += pickString(
    delta?.reasoning_content,
    delta?.reasoning,
    data?.reasoning_content,
    data?.reasoning,
  );

  if (!contentText) {
    contentText += pickString(
      data?.choices?.[0]?.text,
      delta?.text,
      data?.text,
      data?.content,
    );
  }

  return {
    content: contentText,
    reasoning: reasoningText,
  };
};

export const extractAnthropicStreamParts = (data = {}, blockKinds = new Map()) => {
  const recordBlockKind = () => {
    const index = Number.isFinite(Number(data?.index)) ? Number(data.index) : -1;
    const kind = String(data?.content_block?.type || '').trim().toLowerCase();
    if (index >= 0 && kind) blockKinds.set(index, kind);
    return { index, kind };
  };

  if (data?.type === 'content_block_start') {
    const { kind } = recordBlockKind();
    const initialText = pickString(data?.content_block?.text, data?.content_block?.thinking);
    if (!initialText) return { content: '', reasoning: '' };
    return kind === 'thinking'
      ? { content: '', reasoning: initialText }
      : { content: initialText, reasoning: '' };
  }

  if (data?.type !== 'content_block_delta') {
    return { content: '', reasoning: '' };
  }

  const index = Number.isFinite(Number(data?.index)) ? Number(data.index) : -1;
  const blockKind = String(index >= 0 ? blockKinds.get(index) || '' : '').trim().toLowerCase();
  const deltaType = String(data?.delta?.type || '').trim().toLowerCase();
  if (deltaType === 'signature_delta') return { content: '', reasoning: '' };

  const reasoningText = pickString(data?.delta?.thinking, data?.delta?.reasoning);
  if (reasoningText) {
    return { content: '', reasoning: reasoningText };
  }

  const text = pickString(data?.delta?.text);
  if (!text) return { content: '', reasoning: '' };

  if (blockKind === 'thinking' || deltaType.includes('thinking')) {
    return { content: '', reasoning: text };
  }

  return { content: text, reasoning: '' };
};
