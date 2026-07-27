const isCommittedConversationMessage = message => (
  ['user', 'assistant'].includes(String(message?.role || '')) &&
  message?.status !== 'pending' &&
  message?.status !== 'sending'
);

export const hasDownstreamConversationContext = (
  messages = [],
  messageId = '',
) => {
  const source = Array.isArray(messages) ? messages : [];
  const id = String(messageId || '');
  const index = source.findIndex(message => String(message?.id || '') === id);
  if (index < 0) return false;
  return source.slice(index + 1).some(isCommittedConversationMessage);
};

export const buildUserMessageEditPatch = ({
  text = '',
  applyStoredRegex = value => value,
  applyDisplayRegex = value => value,
  now = Date.now,
} = {}) => {
  const rawInput = String(text ?? '');
  const storedResult = applyStoredRegex(rawInput, { isEdit: true });
  const raw = String(storedResult ?? rawInput);
  const displayResult = applyDisplayRegex(raw, { isEdit: true, depth: 0 });
  const content = String(displayResult ?? raw);
  const editedAt = Number(typeof now === 'function' ? now() : now) || Date.now();
  return {
    content,
    raw,
    rawInput,
    editedAt,
  };
};
