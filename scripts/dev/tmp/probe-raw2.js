(() => {
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const raw = chatStore.getLastRawResponse?.('脚本测试室') || chatStore.getLastRawResponse?.() || '';
  return { size: String(raw).length, head: String(raw).slice(0, 600) };
})()
