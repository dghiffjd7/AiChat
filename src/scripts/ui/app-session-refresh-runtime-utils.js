export const rerenderCurrentSessionHistory = async ({
  getCurrentSessionId = () => '',
  getHistoryRevision = null,
  ensureRecentMessagesLoaded = async () => [],
  cancelInitialHistoryFill = () => {},
  clearMessages = () => {},
  decorateMessagesForDisplay = (messages) => messages,
  preloadHistory = () => {},
  setRenderState = () => {},
  refreshChatAndContacts = () => {},
  pageSize = 90,
} = {}) => {
  try {
    const sessionId = getCurrentSessionId();
    const historyRevision = typeof getHistoryRevision === 'function'
      ? getHistoryRevision(sessionId)
      : null;
    const messages = await ensureRecentMessagesLoaded(sessionId);
    if (String(getCurrentSessionId() || '') !== String(sessionId || '')) return false;
    if (
      typeof getHistoryRevision === 'function'
      && getHistoryRevision(sessionId) !== historyRevision
    ) return false;
    cancelInitialHistoryFill(sessionId);
    clearMessages();
    const limit = Math.max(0, Number(pageSize) || 0);
    const start = Math.max(0, (messages || []).length - limit);
    preloadHistory(decorateMessagesForDisplay((messages || []).slice(start), { sessionId }));
    setRenderState(sessionId, { start });
    refreshChatAndContacts();
    return true;
  } catch {
    return false;
  }
};

export const applyMemoryTablePushEvent = ({
  detail = null,
  getCurrentSessionId = () => '',
  getAssistantAvatarForSession = () => '',
  formatNowTime = () => '',
  addMessage = () => {},
  appendMessage = (message) => message,
  autoMarkReadIfActive = () => {},
  refreshChatAndContacts = () => {},
} = {}) => {
  const sessionId = String(detail?.sessionId || '').trim();
  const content = String(detail?.content || '').trim();
  if (!sessionId || !content) return null;
  const message = {
    role: 'assistant',
    type: 'text',
    name: '助手',
    avatar: getAssistantAvatarForSession(sessionId),
    time: formatNowTime(),
    content,
    meta: { renderRich: true, kind: 'memory-table-push' },
  };
  if (String(getCurrentSessionId() || '') === sessionId) {
    addMessage(message);
  }
  const saved = appendMessage(message, sessionId);
  autoMarkReadIfActive(sessionId, saved?.id || message?.id || '');
  refreshChatAndContacts();
  return saved || message;
};
