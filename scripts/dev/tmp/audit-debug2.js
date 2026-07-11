(() => {
  const ps = window.appBridge?.presets;
  const ctx = { sessionId: '雷姆', uiMode: 'chat' };
  return {
    openai: ps.getResolvedActiveId?.('openai', ctx),
    sysprompt: ps.getResolvedActiveId?.('sysprompt', ctx),
    activeIdRaw: ps.getActiveId?.('openai'),
    bindings: (() => { try { return JSON.stringify(ps.getBindings?.() || {}).slice(0, 400); } catch (e) { return String(e); } })(),
    sessionBinding: ps.getSessionBindingId?.('openai', '雷姆'),
    modeBinding: ps.getModeBindingId?.('openai', 'chat'),
  };
})()
