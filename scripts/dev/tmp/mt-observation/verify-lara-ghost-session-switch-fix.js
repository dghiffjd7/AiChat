(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const chatStore = stores.chatStore;
  const group = (stores.contactsStore?.listGroups?.() || [])
    .find(item => String(item?.name || '').trim() === '侍奉部');
  const sessionIds = [
    '比企谷八幡',
    '雪之下雪乃',
    group?.id || '',
  ].filter(Boolean);
  const snapshots = [];
  for (const sessionId of sessionIds) {
    chatStore?.switchSession?.(sessionId);
    window.appBridge?.setActiveSession?.(sessionId);
    await new Promise(resolve => setTimeout(resolve, 120));
    snapshots.push({
      sessionId,
      currentSessionId: chatStore?.getCurrent?.() || '',
      bridgeSessionId: window.appBridge?.activeSessionId || '',
      laraExists: Boolean(chatStore?.hasSession?.('Lara Croft')),
      traceCount: Array.isArray(window.__laraGhostTrace) ? window.__laraGhostTrace.length : 0,
    });
  }
  return {
    ok: snapshots.every(item => item.laraExists === false && item.traceCount === 0),
    snapshots,
    sessions: chatStore?.listSessions?.() || [],
    trace: window.__laraGhostTrace || [],
  };
})()
