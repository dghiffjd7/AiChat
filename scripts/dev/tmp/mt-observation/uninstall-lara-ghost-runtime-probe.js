(() => {
  const chatStore = window.appBridge?.debugUiRegistry?.stores?.chatStore;
  const trace = Array.isArray(window.__laraGhostTrace)
    ? window.__laraGhostTrace.slice()
    : [];
  if (chatStore?.__laraGhostOriginalEnsureSession) {
    chatStore._ensureSession = chatStore.__laraGhostOriginalEnsureSession;
    delete chatStore.__laraGhostOriginalEnsureSession;
  }
  delete window.__laraGhostTrace;
  return {
    ok: true,
    trace,
    sessions: chatStore?.listSessions?.() || [],
    laraExists: Boolean(chatStore?.hasSession?.('Lara Croft')),
  };
})()
