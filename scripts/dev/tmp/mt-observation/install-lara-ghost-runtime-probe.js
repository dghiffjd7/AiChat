(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const panels = registry.panels || {};
  const chatStore = stores.chatStore;
  if (!chatStore?._ensureSession) return { ok: false, reason: 'chat_store_missing' };
  window.__laraGhostTrace = [];
  if (!chatStore.__laraGhostOriginalEnsureSession) {
    chatStore.__laraGhostOriginalEnsureSession = chatStore._ensureSession;
    chatStore._ensureSession = function probedEnsureSession(id) {
      const sid = String(id || '').trim();
      const existed = Boolean(this.state?.sessions?.[sid]);
      if (sid === 'Lara Croft' && !existed) {
        window.__laraGhostTrace.push({
          at: Date.now(),
          scopeId: this.scopeId || '',
          currentSessionId: this.getCurrent?.() || '',
          bridgeSessionId: window.appBridge?.activeSessionId || '',
          stack: new Error('Lara Croft ghost session creation').stack || '',
        });
      }
      return this.__laraGhostOriginalEnsureSession.call(this, id);
    };
  }
  const removed = await panels.sessionPanel?.removeCore?.('Lara Croft');
  panels.sessionPanel?.refresh?.();
  return {
    ok: true,
    removed,
    scopeId: chatStore.scopeId || '',
    currentSessionId: chatStore.getCurrent?.() || '',
    bridgeSessionId: window.appBridge?.activeSessionId || '',
    sessions: chatStore.listSessions?.() || [],
    trace: window.__laraGhostTrace,
  };
})()
