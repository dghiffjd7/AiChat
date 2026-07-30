(() => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const chatStore = stores.chatStore;
  return {
    ok: true,
    scopeId: chatStore?.scopeId || '',
    currentSessionId: chatStore?.getCurrent?.() || '',
    bridgeSessionId: window.appBridge?.activeSessionId || '',
    sessions: chatStore?.listSessions?.() || [],
    laraExists: Boolean(chatStore?.hasSession?.('Lara Croft')),
    trace: window.__laraGhostTrace || [],
  };
})()
