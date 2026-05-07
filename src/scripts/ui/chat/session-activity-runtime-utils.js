const clearChildren = (element) => {
  if (!element) return;
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren();
    return;
  }
  element.innerHTML = '';
};

export const createActiveSessionRuntime = ({
  isChatRoomVisible = () => false,
  getCurrentSessionId = () => '',
  markRead = () => {},
} = {}) => {
  const isSessionActive = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    if (!isChatRoomVisible()) return false;
    return String(getCurrentSessionId() || '').trim() === sid;
  };

  const autoMarkReadIfActive = (sessionId, messageId = '') => {
    try {
      const sid = String(sessionId || '').trim();
      if (!sid) return;
      if (!isSessionActive(sid)) return;
      markRead(sid, messageId);
    } catch {}
  };

  return {
    isSessionActive,
    autoMarkReadIfActive,
  };
};

export const createPendingFloatRuntime = ({
  pendingFloat = null,
  pendingFloatMenu = null,
  documentRef = globalThis.document,
  getCurrentSessionId = () => '',
  getPendingMessages = () => [],
  getMessages = () => [],
  addPendingMessage = () => {},
  deleteMessage = () => {},
  removeMessageDom = () => {},
  refreshChatAndContacts = () => {},
  updateMessage = () => null,
  updateMessageDom = () => {},
  appendMessage = () => {},
  addMessageDom = () => {},
  removePendingMessage = () => {},
  isSessionActive = () => false,
  isChatRoomVisible = () => false,
  toggleSheetAt = () => {},
  hideMenus = () => {},
  notifyMissingContent = () => {},
} = {}) => {
  let activePending = null;

  const clearActivePending = () => {
    activePending = null;
  };

  const getActivePending = () => activePending;

  const updatePendingFloat = (sessionId = getCurrentSessionId()) => {
    if (!pendingFloat?.el) return;
    if (!isChatRoomVisible()) {
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const sid = String(sessionId || '').trim();
    if (!sid) {
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const pending = getPendingMessages(sid) || [];
    if (!pending.length) {
      clearActivePending();
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const maxItems = 3;
    pendingFloat.titleEl.textContent = `待发送 ${pending.length} 条`;
    clearChildren(pendingFloat.listEl);
    pending.slice(-maxItems).forEach((message) => {
      const item = documentRef?.createElement?.('button');
      if (!item) return;
      item.type = 'button';
      item.className = 'pending-float-item';
      item.dataset.msgId = String(message?.id || '');
      const raw = String(message?.content ?? '').replace(/\s+/g, ' ').trim();
      item.textContent = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw || '(空)';
      pendingFloat.listEl.appendChild(item);
    });
    if (pending.length > maxItems) {
      const more = documentRef?.createElement?.('div');
      if (more) {
        more.className = 'pending-float-more';
        more.textContent = `还有 ${pending.length - maxItems} 条`;
        pendingFloat.listEl.appendChild(more);
      }
    }
    pendingFloat.el.classList.add('is-active');
  };

  const movePendingFromHistoryToQueue = (sessionId = getCurrentSessionId()) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const messages = getMessages(sid) || [];
    const pending = messages.filter((message) => message?.status === 'pending');
    if (!pending.length) return [];
    const existing = new Set((getPendingMessages(sid) || []).map((message) => String(message?.id || '')));
    pending.forEach((message) => {
      const id = String(message?.id || '').trim();
      if (!id) return;
      if (!existing.has(id)) {
        addPendingMessage(message, sid);
        existing.add(id);
      }
      deleteMessage(id, sid);
      removeMessageDom(id);
    });
    refreshChatAndContacts();
    return pending;
  };

  const finalizePendingMessages = (sessionId, sentMessages = []) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const ids = new Set(sentMessages.map((message) => String(message?.id || '')).filter(Boolean));
    if (!ids.size) return;
    const history = getMessages(sid) || [];
    history.forEach((message) => {
      const messageId = String(message?.id || '');
      if (!ids.has(messageId)) return;
      const updated = updateMessage(message.id, { status: 'sent' }, sid);
      updateMessageDom(message.id, updated || { ...message, status: 'sent' });
    });
    const pendingQueue = getPendingMessages(sid) || [];
    pendingQueue.forEach((message) => {
      const messageId = String(message?.id || '');
      if (!ids.has(messageId)) return;
      removePendingMessage(message.id, sid);
    });
  };

  const sendPendingFromFloat = async (pendingMessage, sessionId = getCurrentSessionId()) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !pendingMessage) return false;
    const content = String(pendingMessage?.content ?? '').trim();
    if (!content) {
      notifyMissingContent('未找到缓存内容');
      return false;
    }
    const messageId = String(pendingMessage?.id || '').trim();
    if (!messageId) return false;
    const history = getMessages(sid) || [];
    const existing = history.find((message) => String(message?.id || '') === messageId);
    if (existing) {
      const updated = updateMessage(existing.id, { status: 'pending' }, sid);
      if (isSessionActive(sid)) {
        updateMessageDom(existing.id, updated || { ...existing, status: 'pending' });
      }
    } else {
      const saved = appendMessage({ ...pendingMessage, status: 'pending' }, sid);
      if (isSessionActive(sid)) {
        addMessageDom(saved);
      }
    }
    removePendingMessage(messageId, sid);
    clearActivePending();
    updatePendingFloat(sid);
    refreshChatAndContacts();
    return true;
  };

  const bindPendingFloatSelection = () => {
    pendingFloat?.el?.addEventListener?.('click', (event) => {
      const target = event?.target?.closest ? event.target.closest('[data-msg-id]') : null;
      const messageId = target?.dataset?.msgId || '';
      if (!messageId) return;
      event.stopPropagation?.();
      const sid = getCurrentSessionId();
      const pending = (getPendingMessages(sid) || []).find(
        (message) => String(message?.id || '') === String(messageId),
      );
      if (!pending) return;
      activePending = pending;
      if (pendingFloatMenu) {
        toggleSheetAt(pendingFloatMenu, target, { alignRight: true, kind: 'pending-float' });
      }
    });
  };

  const bindPendingFloatMenu = () => {
    pendingFloatMenu?.addEventListener?.('click', async (event) => {
      event.stopPropagation?.();
      const action = event?.target?.closest ? event.target.closest('button')?.dataset?.action : '';
      if (!action || !activePending) return;
      const sid = getCurrentSessionId();
      if (action === 'send') {
        await sendPendingFromFloat(activePending, sid);
      } else if (action === 'delete') {
        removePendingMessage(activePending.id, sid);
        clearActivePending();
        updatePendingFloat(sid);
        refreshChatAndContacts();
      }
      hideMenus();
    });
  };

  return {
    bindPendingFloatMenu,
    bindPendingFloatSelection,
    clearActivePending,
    finalizePendingMessages,
    getActivePending,
    movePendingFromHistoryToQueue,
    sendPendingFromFloat,
    updatePendingFloat,
  };
};
