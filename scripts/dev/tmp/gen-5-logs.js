(async () => {
  await new Promise(r => setTimeout(r, 2500));
  const logs = (window.__scriptAuditLog || []).slice(-15);
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  return {
    logs: logs.map(l => l.text.slice(0, 220)),
    msgCount: msgs.length,
    lastMsgs: msgs.slice(-3).map(m => ({ role: m.role, head: String(m.content).slice(0, 60) })),
  };
})()
