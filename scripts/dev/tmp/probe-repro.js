(async () => {
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '探针复现：请简短回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 20000));
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  return {
    sent: sent?.result?.ok, reason: sent?.result?.reason,
    assistantAfter: msgs.filter(m => m.role === 'assistant').length,
    restarts: window.__restartTrace,
    dispatches: (window.__dispatchTrace || []).map(d => `${d.event || d.type} ${d.status} ${d.ms ?? '...'}ms${d.err ? ' <' + d.err + '>' : ''}`),
  };
})()
