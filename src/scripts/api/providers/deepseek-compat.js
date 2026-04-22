const EMPTY_USER_TURN_CONTENT = ' ';

export const normalizeChatRole = (role) => {
  const r = String(role || '').trim().toLowerCase();
  return r === 'user' || r === 'assistant' || r === 'system' ? r : 'system';
};

export const stringifyChatContent = (content) => {
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? String(part.text || '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
};

export const joinChatBlocks = (blocks = []) => {
  const parts = Array.isArray(blocks) ? blocks : [blocks];
  return parts
    .map((text) => String(text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, ''))
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
};

export const isDeepSeekApiRequest = ({ provider, model, baseUrl } = {}) => {
  const p = String(provider || '').trim().toLowerCase();
  const m = String(model || '').trim().toLowerCase();
  const url = String(baseUrl || '').trim().toLowerCase();
  return p === 'deepseek' || m.includes('deepseek') || url.includes('deepseek.com');
};

export const isDeepSeekReasonerModel = (model) => {
  const token = String(model || '').trim().toLowerCase();
  return token.includes('deepseek-reasoner');
};

export const shouldUseDeepSeekReasonerCompatibility = ({ provider, model, baseUrl } = {}) =>
  isDeepSeekApiRequest({ provider, model, baseUrl }) && isDeepSeekReasonerModel(model);

const previousNonSystemIndex = (messages, idx) => {
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (normalizeChatRole(messages[i]?.role || 'system') !== 'system') return i;
  }
  return -1;
};

const hasLaterNonSystem = (messages, idx) => {
  for (let i = idx + 1; i < messages.length; i += 1) {
    if (normalizeChatRole(messages[i]?.role || 'system') !== 'system') return true;
  }
  return false;
};

export const normalizeDeepSeekReasonerMessages = (messages, request = {}) => {
  const input = Array.isArray(messages) ? messages : [];
  if (!shouldUseDeepSeekReasonerCompatibility(request)) {
    return { messages: input, changed: false, merged: 0, separated: 0, systemToUser: 0 };
  }

  const out = input.map((msg) => (
    msg && typeof msg === 'object'
      ? { ...msg, role: normalizeChatRole(msg.role) }
      : msg
  ));
  let merged = 0;
  let separated = 0;
  let systemToUser = 0;
  let seenNonSystem = false;

  for (let i = 0; i < out.length; i += 1) {
    const role = normalizeChatRole(out[i]?.role || 'system');
    if (role === 'system') {
      if (seenNonSystem) {
        out[i] = { ...out[i], role: 'user' };
        systemToUser += 1;
      }
      continue;
    }
    seenNonSystem = true;
  }

  for (let i = 0; i < out.length; i += 1) {
    if (normalizeChatRole(out[i]?.role || 'system') !== 'assistant') continue;

    const prevIdx = previousNonSystemIndex(out, i);
    if (prevIdx < 0) {
      out.splice(i, 0, { role: 'user', content: EMPTY_USER_TURN_CONTENT });
      separated += 1;
      i += 1;
      continue;
    }
    if (normalizeChatRole(out[prevIdx]?.role || 'system') !== 'assistant') continue;

    if (!hasLaterNonSystem(out, i)) {
      out.splice(i, 0, { role: 'user', content: EMPTY_USER_TURN_CONTENT });
      separated += 1;
      i += 1;
      continue;
    }

    const prev = out[prevIdx];
    const current = out[i];
    out[prevIdx] = {
      ...prev,
      content: joinChatBlocks([
        stringifyChatContent(prev?.content),
        stringifyChatContent(current?.content),
      ]),
    };
    out.splice(i, 1);
    merged += 1;
    i -= 1;
  }

  return {
    messages: out,
    changed: merged > 0 || separated > 0 || systemToUser > 0,
    merged,
    separated,
    systemToUser,
  };
};

export const ensureTailAssistantPrefillUserTurn = (messages) => {
  const input = Array.isArray(messages) ? messages : [];
  if (!input.length) return { messages: input, inserted: false };
  const lastIndex = input.length - 1;
  if (normalizeChatRole(input[lastIndex]?.role || 'system') !== 'assistant') {
    return { messages: input, inserted: false };
  }
  const prevIdx = previousNonSystemIndex(input, lastIndex);
  if (prevIdx >= 0 && normalizeChatRole(input[prevIdx]?.role || 'system') !== 'assistant') {
    return { messages: input, inserted: false };
  }
  const out = input.slice();
  out.splice(lastIndex, 0, { role: 'user', content: EMPTY_USER_TURN_CONTENT });
  return { messages: out, inserted: true };
};

export const resolveDeepSeekBetaBaseUrl = (baseUrl) => {
  const raw = String(baseUrl || '').trim() || 'https://api.deepseek.com/v1';
  if (!/deepseek\.com/i.test(raw)) return raw.replace(/\/+$/, '');
  if (/\/beta\/?$/i.test(raw)) return raw.replace(/\/+$/, '');
  if (/\/v1\/?$/i.test(raw)) return raw.replace(/\/v1\/?$/i, '/beta');
  return `${raw.replace(/\/+$/, '')}/beta`;
};
