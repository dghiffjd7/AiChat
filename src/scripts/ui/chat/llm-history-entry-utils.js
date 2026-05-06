export const isPromptImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('data:image/')) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  return false;
};

export const resolveLlmHistoryImageAttachment = (
  message,
  { isAttachmentExpired = () => false } = {},
) => {
  if (!message || typeof message !== 'object') return '';
  if (isAttachmentExpired(message.meta)) return '';
  if (message.type === 'image' && typeof message.content === 'string') {
    const raw = String(message.content || '').trim();
    if (!raw || raw === '[binary omitted]' || raw === '[图片]') return '';
    return isPromptImageUrl(raw) ? raw : '';
  }
  const raw = typeof message.content === 'string' ? message.content.trim() : '';
  if (isPromptImageUrl(raw)) return raw;
  return '';
};

export const resolveLlmCreativeHistorySummary = ({
  directSummary = '',
  compactedSummary = '',
  summaries = [],
} = {}) => {
  const direct = String(directSummary || '').trim();
  if (direct) return direct;
  const compactedText = String(
    typeof compactedSummary === 'string' ? compactedSummary : compactedSummary?.text || '',
  ).trim();
  if (compactedText) return compactedText;
  const list = Array.isArray(summaries) ? summaries : [];
  const last = list[list.length - 1];
  return String(typeof last === 'string' ? last : last?.text || '').trim();
};

export const loadLlmCreativeSummarySource = ({
  getCompactedSummary = null,
  getSummaries = null,
} = {}) => {
  let compactedSummary = '';
  try {
    compactedSummary = typeof getCompactedSummary === 'function' ? (getCompactedSummary() || '') : '';
  } catch {}
  let summaries = [];
  try {
    summaries = typeof getSummaries === 'function' ? (getSummaries() || []) : [];
  } catch {}
  return {
    compactedSummary,
    summaries,
  };
};

export const buildLlmHistoryEntry = (
  message,
  {
    isGroupChat = false,
    isRpMode = false,
    rpUiMode = false,
    depth = undefined,
    creativeSummary = '',
    resolvePlainText = null,
    resolveStickerKeyword = null,
    buildStickerToken = null,
    resolveImageAttachment = null,
  } = {},
) => {
  if (!message || typeof message.content !== 'string') return null;
  const isCreativeReply =
    message?.role === 'assistant' &&
    (Boolean(message?.meta?.renderRich) || isRpMode);
  if (isGroupChat && message.role === 'system') {
    const raw = String(message.content || '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/^系统消息[:：]?\s*/i, '').trim();
    const systemLine = `系统消息（我们能解析的这种）：${cleaned || raw}`;
    return {
      role: 'assistant',
      content: systemLine,
      name: '系统',
      __creative: false,
    };
  }
  let content = typeof message.raw === 'string' ? message.raw : message.content;
  const reasoning =
    message.role === 'assistant' && typeof message?.meta?.reasoning === 'string'
      ? message.meta.reasoning
      : '';
  const imageUrl = typeof resolveImageAttachment === 'function' ? resolveImageAttachment(message) : '';
  if (imageUrl) {
    const out = {
      role: message.role,
      content: '[图片]',
      name: typeof message.name === 'string' ? message.name : '',
      __creative: isCreativeReply,
      __reasoning: reasoning,
    };
    if (message.role === 'user') {
      out.__mediaKind = 'image';
      out.__mediaUrl = imageUrl;
    }
    return out;
  }
  if (message.type === 'image') {
    return {
      role: message.role,
      content: '[图片]',
      name: typeof message.name === 'string' ? message.name : '',
      __creative: isCreativeReply,
      __reasoning: reasoning,
    };
  }
  if (message.type === 'audio' || (typeof content === 'string' && content.startsWith('data:audio'))) {
    return {
      role: message.role,
      content: '[语音]',
      name: typeof message.name === 'string' ? message.name : '',
      __creative: isCreativeReply,
      __reasoning: reasoning,
    };
  }
  if (message.type === 'document') {
    return {
      role: message.role,
      content: `[文件] ${message.content || ''}`.trim(),
      name: typeof message.name === 'string' ? message.name : '',
      __creative: isCreativeReply,
      __reasoning: reasoning,
    };
  }
  if (rpUiMode && (message.role === 'assistant' || message.role === 'user')) {
    const plain = typeof resolvePlainText === 'function'
      ? resolvePlainText(message, {
          depth,
          preferRawSource: isCreativeReply,
        })
      : '';
    if (plain) {
      content = plain;
    }
  } else if (message.role === 'assistant' && message?.meta?.renderRich) {
    if (!String(creativeSummary || '').trim()) return null;
    content = creativeSummary;
  } else {
    const key = typeof resolveStickerKeyword === 'function' ? resolveStickerKeyword(message) : '';
    if (key && typeof buildStickerToken === 'function') content = buildStickerToken(key);
  }
  if (!String(content || '').trim()) return null;
  return {
    role: message.role,
    content,
    name: typeof message.name === 'string' ? message.name : '',
    __creative: isCreativeReply,
    __reasoning: reasoning,
  };
};
