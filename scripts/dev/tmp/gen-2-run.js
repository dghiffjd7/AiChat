(async () => {
  // 1. payload 捕获 hook
  const client = window.appBridge?.client;
  if (!client) return { err: 'no bridge client' };
  if (!window.__streamHooked) {
    const orig = client.streamChat.bind(client);
    client.streamChat = async function* (messages, options) {
      window.__lastReqMessages = messages;
      yield* orig(messages, options);
    };
    if (typeof client.chat === 'function') {
      const origChat = client.chat.bind(client);
      client.chat = async (messages, options) => { window.__lastReqMessages = messages; return origChat(messages, options); };
    }
    window.__streamHooked = true;
  }
  // 2. 切 5 脚本预设
  await window.appBridge.presets.setActive('openai', 'preset-openai-1782195413072-8a6ff1');
  await window.appBridge.scriptRuntime.syncScripts();
  await new Promise(r => setTimeout(r, 3000));
  // 3. 建测试会话并真实发送（走 registry 工具，带允许回调）
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const created = await registry.executeTool('session.create', { name: '脚本测试室', open: true }, allow);
  await new Promise(r => setTimeout(r, 1500));
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '你好，请简短回复一句', triggerReply: true }, allow);
  return {
    created: created?.result?.ok ?? created?.status,
    sent: sent?.result?.ok ?? sent?.status,
    sentSummary: sent?.summary,
  };
})()
