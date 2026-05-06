export const buildLlmConversationPositionMap = (messages = []) => {
  const map = new Map();
  let position = 0;
  (Array.isArray(messages) ? messages : []).forEach((message, index) => {
    if (message && (message.role === 'user' || message.role === 'assistant')) {
      map.set(index, position);
      position += 1;
    }
  });
  return map;
};

export const resolveLlmConversationDepth = (conversationPositions, index) => {
  const map = conversationPositions instanceof Map ? conversationPositions : new Map();
  if (!map.has(index)) return undefined;
  return map.size - 1 - map.get(index);
};

export const shouldIncludeLlmHistoryMessage = (
  message,
  {
    excludeMessageIds = null,
    isRpMode = false,
    isGroupChat = false,
  } = {},
) => {
  if (!message) return false;
  if (message.status === 'pending' || message.status === 'sending') return false;
  if (excludeMessageIds && typeof excludeMessageIds.has === 'function') {
    const messageId = String(message?.id || '');
    if (excludeMessageIds.has(messageId)) return false;
  }
  if (isRpMode && message?.meta?.hiddenFromRpPrompt === true) return false;
  if (typeof message.content !== 'string') return false;
  if (message.role === 'user' || message.role === 'assistant') return true;
  return isGroupChat && message.role === 'system';
};

export const buildLlmHistoryCandidates = (
  messages = [],
  options = {},
) => {
  const list = Array.isArray(messages) ? messages : [];
  const conversationPositions = buildLlmConversationPositionMap(list);
  const out = [];
  list.forEach((message, index) => {
    if (!shouldIncludeLlmHistoryMessage(message, options)) return;
    out.push({
      message,
      depth: resolveLlmConversationDepth(conversationPositions, index),
    });
  });
  return out;
};
