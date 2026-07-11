(async () => {
  window.__allErrLog = [];
  for (const level of ['warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        window.__allErrLog.push({
          level,
          text: args.map(a => a instanceof Error ? `ERR<${a.message}>` : (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a).slice(0, 150); } catch { return String(a); } })())).join(' ').slice(0, 350),
          at: Date.now(),
        });
        if (window.__allErrLog.length > 300) window.__allErrLog.shift();
      } catch {}
      orig(...args);
    };
  }
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '测试三：请回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 12000));
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  return {
    sent: sent?.result?.ok ?? sent?.status,
    assistantCount: msgs.filter(m => m.role === 'assistant').length,
    errs: window.__allErrLog.slice(-18).map(l => l.text),
  };
})()
