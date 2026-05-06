const normalizeObject = (value) => (value && typeof value === 'object' ? value : null);

export const createActiveGenerationRecord = ({
  id = 0,
  sessionId = '',
  userMsgId = null,
  partialCommitHandler = null,
  swipeTarget = null,
} = {}) => ({
  id,
  sessionId,
  userMsgId,
  streamCtrl: null,
  streamText: '',
  streamPayload: null,
  streamMeta: null,
  reattachStream: null,
  partialCommitHandler,
  swipeTarget,
  cancelled: false,
});

export const buildCancelledAssistantPartial = ({
  generation = null,
  assistantAvatar = '',
  fallbackTime = '',
} = {}) => {
  const currentGeneration = normalizeObject(generation);
  const rawText = String(currentGeneration?.streamText || '');
  if (!rawText.trim()) return null;

  const meta = normalizeObject(currentGeneration?.streamMeta) || {};
  return {
    role: 'assistant',
    type: 'text',
    id: meta.id || currentGeneration?.streamCtrl?.id,
    name: meta.name || '助手',
    avatar: meta.avatar || assistantAvatar,
    time: meta.time || fallbackTime,
    content: rawText,
    raw: rawText,
    rawOriginal: rawText,
    meta: {
      partial: true,
      cancelled: true,
    },
  };
};
