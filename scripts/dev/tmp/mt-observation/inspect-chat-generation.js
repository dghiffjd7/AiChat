(async () => {
  const bridge = window.appBridge || {};
  const registry = bridge.debugUiRegistry || {};
  const chatStore = registry.stores?.chatStore;
  const sessionId = chatStore?.getCurrent?.() || '';
  const messages = chatStore?.getMessages?.(sessionId) || [];
  const visibleText = Array.from(document.querySelectorAll(
    '[role="alert"], .toast, .toast-message, .notification, .error-message',
  ))
    .filter(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    })
    .map(node => String(node.textContent || '').trim())
    .filter(Boolean)
    .slice(-12);
  return {
    at: Date.now(),
    sessionId,
    bridge: {
      isGenerating: Boolean(bridge.isGenerating),
      activeGenerationToken: Number(bridge.activeGenerationToken || 0),
      hasAbortController: Boolean(bridge.abortController),
      abortSignal: bridge.abortController?.signal
        ? {
            aborted: bridge.abortController.signal.aborted,
            reason: String(bridge.abortController.signal.reason || ''),
          }
        : null,
    },
    registryKeys: {
      stores: Object.keys(registry.stores || {}).sort(),
      panels: Object.keys(registry.panels || {}).sort(),
      generationActions: Object.keys(registry.actions || {})
        .filter(key => /send|generat|stream|abort|cancel/i.test(key))
        .sort(),
    },
    visibleText,
    messageCount: messages.length,
    recentMessages: messages.slice(-4).map(message => ({
      id: String(message?.id || ''),
      role: String(message?.role || message?.type || ''),
      status: String(message?.status || ''),
      content: String(message?.content || message?.text || '').slice(0, 1000),
      meta: message?.meta || null,
    })),
  };
})()
