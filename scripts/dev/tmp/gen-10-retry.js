(async () => {
  window.__allErrLog = window.__allErrLog || [];
  const mark = window.__allErrLog.length;
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '测试五：请简短回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 15000));
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  const payload = (window.__lastReqMessages || []);
  const allText = payload.map(m => typeof m.content === 'string' ? m.content : '').join('\n');
  return {
    sent: sent?.result?.ok,
    reason: sent?.result?.reason,
    assistantCount: msgs.filter(m => m.role === 'assistant').length,
    lastReplyHead: String(msgs.filter(m => m.role === 'assistant').at(-1)?.content || '').slice(0, 100),
    payloadCount: payload.length,
    hasInjectedRule: allText.includes('对话渲染格式规范'),
    errs: window.__allErrLog.slice(mark).map(l => l.text.slice(0, 200)),
  };
})()
