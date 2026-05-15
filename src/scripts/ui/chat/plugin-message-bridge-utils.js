export const normalizePluginSendMessageOptions = (content, options = {}) => {
  const opts = options && typeof options === 'object' ? options : {};
  return {
    text: String(content ?? ''),
    role: String(opts.role || 'user').toLowerCase(),
    silent: Boolean(opts.silent),
    skipInputRegex: Boolean(opts.skipInputRegex),
    skipScripts: Boolean(opts.skipScripts),
    name: typeof opts.name === 'string' ? opts.name : '',
    type: typeof opts.type === 'string' ? opts.type : '',
    avatar: typeof opts.avatar === 'string' ? opts.avatar : '',
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : null,
  };
};

export const buildPluginInjectedMessage = ({
  text = '',
  role = 'user',
  skipInputRegex = false,
  sessionId = '',
  userName = '我',
  now = '',
  appBridge = null,
  userAvatar = '',
  assistantAvatar = '',
  isRpSession = false,
  name = '',
  type = '',
  avatar = '',
  meta = null,
} = {}) => {
  const normalizedRole = String(role || 'user').toLowerCase();
  const isSystem = normalizedRole === 'system';
  const isAssistant = normalizedRole === 'assistant';
  let display = String(text ?? '');
  let stored = String(text ?? '');
  if (!isSystem && !isAssistant) {
    stored = skipInputRegex
      ? display
      : (appBridge?.applyInputStoredRegex?.(display, { isEdit: false }) ?? display);
    display = skipInputRegex
      ? stored
      : (appBridge?.applyInputDisplayRegex?.(stored, { isEdit: false, depth: 0 }) ?? stored);
  }
  const message = {
    role: normalizedRole,
    type: type || (isSystem ? 'meta' : 'text'),
    content: display,
    raw: stored,
    name: String(name || '').trim() || (isSystem ? '系统' : (isAssistant ? '助手' : userName)),
    avatar: avatar || (isAssistant ? assistantAvatar : userAvatar),
    time: now,
  };
  if (meta && typeof meta === 'object') {
    message.meta = { ...(message.meta || {}), ...meta };
  }
  if (isAssistant && isRpSession) {
    message.meta = { ...(message.meta || {}), renderRich: true };
  }
  return {
    message,
    isSystem,
    isAssistant,
    isUser: normalizedRole === 'user',
    sessionId: String(sessionId || '').trim(),
  };
};

export const runPluginSendMessageFlow = async (
  {
    content = '',
    options = {},
  } = {},
  {
    chatStore = null,
    ui = null,
    appBridge = null,
    avatars = {},
    getActiveUserProfile = () => null,
    formatNowTime = () => '',
    getAssistantAvatarForSession = () => '',
    isRpSessionId = () => false,
    isSessionActive = () => false,
    refreshChatAndContacts = () => {},
    handleSend = async () => false,
    dispatchAfterSendEvents = () => {},
    emitPluginAfterReceive = () => {},
    scriptRuntime = null,
    pluginRuntime = null,
    logger = null,
    recordTraceEvent = null,
  } = {},
) => {
  const { text, role, silent, skipInputRegex, skipScripts, name, type, avatar, meta } = normalizePluginSendMessageOptions(content, options);
  const sessionId = String(chatStore?.getCurrent?.() || '').trim();
  if (!sessionId) return null;

  if (role !== 'user' || silent) {
    const activeUser = getActiveUserProfile();
    const userName = String(activeUser?.name || '').trim() || '我';
    const { message, isAssistant, isUser } = buildPluginInjectedMessage({
      text,
      role,
      skipInputRegex,
      sessionId,
      userName,
      now: formatNowTime(),
      appBridge,
      userAvatar: avatars.user,
      assistantAvatar: getAssistantAvatarForSession(sessionId),
      isRpSession: isRpSessionId(sessionId),
      name,
      type,
      avatar,
      meta,
    });
    if (isSessionActive(sessionId)) ui?.addMessage?.(message);
    const saved = chatStore?.appendMessage?.(message, sessionId) || message;
    refreshChatAndContacts();
    if (isUser) {
      dispatchAfterSendEvents({
        messages: [saved || message],
        sessionId,
        scriptRuntime,
        pluginRuntime,
        logger,
        recordTraceEvent,
      });
    }
    if (isAssistant) emitPluginAfterReceive(saved, sessionId, { skipScripts });
    return saved;
  }

  if (!text.trim()) return null;
  await handleSend(null, { overrideText: text, ignorePending: true, skipInputRegex });
  const list = chatStore?.getMessages?.(sessionId) || [];
  return [...list].reverse().find(message => message && message.role === 'user') || null;
};
