const normalizeObject = (value) => (value && typeof value === 'object' ? value : null);

const buildPendingMessageMeta = ({
  attachmentsOnly = false,
  replyTarget = null,
} = {}) => {
  let meta = null;
  if (attachmentsOnly) {
    meta = { attachmentsOnly: true };
  }
  if (normalizeObject(replyTarget)) {
    meta = {
      ...(meta || {}),
      replyTo: replyTarget,
    };
  }
  return meta;
};

export const createPendingUserMessage = ({
  text = '',
  stickerKey = '',
  fallbackContent = '[附件]',
  avatar = '',
  userName = '我',
  time = '',
  replyTarget = null,
  attachmentsOnly = false,
} = {}) => {
  const rawText = typeof text === 'string' ? text : '';
  const nextFallbackContent =
    typeof fallbackContent === 'string' && fallbackContent ? fallbackContent : '[附件]';
  const nextMessage = {
    role: 'user',
    type: stickerKey ? 'sticker' : 'text',
    content: stickerKey || rawText || nextFallbackContent,
    raw: stickerKey ? rawText : undefined,
    status: 'pending',
    avatar,
    name: String(userName || '').trim() || '我',
    time,
  };
  const meta = buildPendingMessageMeta({ attachmentsOnly, replyTarget });
  if (meta) nextMessage.meta = meta;
  return nextMessage;
};

export const resolvePendingMessagesToSend = ({
  pendingMessages = [],
  targetMessageId = null,
} = {}) => {
  const nextPendingMessages = Array.isArray(pendingMessages) ? pendingMessages : [];
  if (!targetMessageId) {
    return {
      messagesToSend: nextPendingMessages.slice(),
      errorMessage: '',
    };
  }
  const targetIndex = nextPendingMessages.findIndex(
    message => message?.id === targetMessageId,
  );
  if (targetIndex === -1) {
    return {
      messagesToSend: [],
      errorMessage: '未找到指定消息',
    };
  }
  return {
    messagesToSend: nextPendingMessages.slice(0, targetIndex + 1),
    errorMessage: '',
  };
};

export const getMessageSendText = (
  message,
  buildStickerToken = (value) => String(value || ''),
) => {
  if (!message || typeof message !== 'object') return '';
  const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
  if (meta?.attachmentsOnly) return '';
  const raw = typeof message.raw === 'string' ? message.raw.trim() : '';
  if (raw) return raw;
  if (message.type === 'sticker') {
    const key = String(message.content || '').trim();
    return key ? buildStickerToken(key) : '';
  }
  if (message.type === 'image') return '[图片]';
  if (message.type === 'audio') return '[语音]';
  if (message.type === 'document') return `[文件] ${message.content || ''}`.trim();
  return String(message.content || '').trim();
};
