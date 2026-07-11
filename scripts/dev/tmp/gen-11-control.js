(async () => {
  // 对照组：Default（无脚本）预设，同一会话发消息
  await window.appBridge.presets.setActive('openai', 'Default');
  await window.appBridge.scriptRuntime.syncScripts();
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '对照组测试：请简短回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 15000));
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  return {
    sent: sent?.result?.ok,
    assistantCount: msgs.filter(m => m.role === 'assistant').length,
    lastReplyHead: String(msgs.filter(m => m.role === 'assistant').at(-1)?.content || '').slice(0, 80),
  };
})()
