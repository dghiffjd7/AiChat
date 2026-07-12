(() => {
  const bridge = window.appBridge;
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  const before = window.__ps_gen?.msgCountBefore ?? 0;
  const gotAssistant = msgs.slice(before).some(m => m.role === 'assistant');
  const busy = Boolean(bridge.isGenerating?.() || window.__chatapp_generation_active);
  return gotAssistant && !busy;
})()
