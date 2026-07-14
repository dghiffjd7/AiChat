import { estimateTokens, normalizeTokenMode } from '../../memory/memory-prompt-utils.js';

const describeMediaToken = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('data:image/')) {
    const mime = text.slice('data:'.length).split(';')[0].toLowerCase();
    if (mime.includes('gif')) return '[gif]';
    return '[图片]';
  }
  if (text.startsWith('data:audio/')) return '[语音]';
  return '';
};

const stringifyRequestContent = (content) => {
  if (Array.isArray(content)) {
    const parts = content.map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text') return String(part.text || '');
      if (part.type === 'image_url') {
        const url = String(part.image_url?.url || '').toLowerCase();
        if (url.startsWith('data:image/gif')) return '[gif]';
        return '[图片]';
      }
      if (part.type === 'input_audio') return '[语音]';
      return '';
    });
    return parts.filter(Boolean).join('\n');
  }
  const raw = String(content ?? '');
  return describeMediaToken(raw) || raw;
};

export const buildRequestPromptText = (messages) => {
  if (!Array.isArray(messages)) return '';
  const parts = messages
    .map((message) => {
      const role = String(message?.role || 'message');
      const content = stringifyRequestContent(message?.content).trim();
      if (!content) return '';
      return `${role}:\n${content}`;
    })
    .filter(Boolean);
  return parts.join('\n\n');
};

export const resolveMemoryUpdateRequestPrompt = ({
  requestPrompt = '',
  lastRequestMessages = null,
  lastEntryRequestPrompt = '',
  buildRequestPrompt = buildRequestPromptText,
} = {}) => {
  const direct = String(requestPrompt || '');
  if (direct.trim()) return direct;
  const inferred = typeof buildRequestPrompt === 'function'
    ? String(buildRequestPrompt(lastRequestMessages) || '')
    : '';
  if (inferred.trim()) return inferred;
  return String(lastEntryRequestPrompt || '');
};

export const buildPromptPreviewSnapshot = ({
  request = null,
  contactName = '',
  buildRequestPrompt = buildRequestPromptText,
  formatAt = value => new Date(value).toLocaleString(),
} = {}) => {
  const req = request && typeof request === 'object' ? request : {};
  const messages = Array.isArray(req?.messages) ? req.messages : [];
  const at = req?.at ? String(formatAt(req.at) || '').trim() : '';
  const meta = [String(contactName || '').trim(), at].filter(Boolean).join(' · ');
  const head = [
    `provider: ${req?.provider || ''}`,
    `model: ${req?.model || ''}`,
    `baseUrl: ${req?.baseUrl || ''}`,
    `stream: ${req?.stream ? 'true' : 'false'}`,
    req?.options
      ? `options: ${Object.entries(req.options)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const body = typeof buildRequestPrompt === 'function'
    ? buildRequestPrompt(messages)
    : messages
        .map(message => String(message?.content ?? ''))
        .filter(text => text.trim().length > 0)
        .join('\n\n');
  // 发送前 token 估算：预览不发请求，无 provider 真实 usage，只能本地启发式（CJK 近似、不分模型）。
  // 明确标注「估算」——真实精确值在生成后由 provider 返回并记入本次回复。
  const tokenMode = normalizeTokenMode('rough');
  const estTokens = estimateTokens(body, tokenMode);
  const tokenLine = `估算输入 token: ~${estTokens}（本地估算·非精确，真实值以生成后模型返回为准）`;
  return {
    meta,
    head: head ? `${head}\n${tokenLine}` : tokenLine,
    body,
    messages,
    estimatedInputTokens: estTokens,
  };
};

export const buildMemoryUpdateHistoryText = (
  messages,
  {
    limit = 6,
    stripAssistantText,
  } = {},
) => {
  const usable = (Array.isArray(messages) ? messages : []).filter(
    message => message && (message.role === 'user' || message.role === 'assistant' || message.role === 'system'),
  );
  const normalizedLimit = Number.isFinite(Math.trunc(Number(limit))) ? Math.max(0, Math.trunc(Number(limit))) : 6;
  if (normalizedLimit <= 0) return '';
  const rounds = [];
  let current = null;
  usable.forEach((message) => {
    if (message?.status === 'pending' || message?.status === 'sending') return;
    if (message?.role === 'user') {
      current = { messages: [message] };
      rounds.push(current);
      return;
    }
    if (message?.role === 'assistant') {
      if (!current) {
        current = { messages: [] };
        rounds.push(current);
      }
      current.messages.push(message);
      return;
    }
    if (message?.role === 'system' && current) {
      current.messages.push(message);
    }
  });
  const lines = [];
  const selected = rounds.slice(-normalizedLimit);
  selected.forEach((round) => {
    (round.messages || []).forEach((message) => {
      const name = String(
        message?.name || (message?.role === 'assistant' ? '助手' : message?.role === 'user' ? '用户' : '系统'),
      );
      const rawText = String(message?.rawOriginal || message?.raw || message?.content || '');
      let clean = message?.role === 'assistant' && typeof stripAssistantText === 'function'
        ? stripAssistantText(rawText)
        : rawText;
      if (message?.type === 'image' || rawText.startsWith('data:image')) clean = '[图片]';
      if (message?.type === 'audio' || rawText.startsWith('data:audio')) clean = '[语音]';
      if (message?.type === 'document') clean = `[文件] ${message?.content || ''}`.trim();
      const clipped = clean.length > 4000 ? `${clean.slice(0, 4000)}…` : clean;
      if (!clipped.trim()) return;
      lines.push(`${name}: ${clipped}`);
    });
  });
  return lines.join('\n');
};
