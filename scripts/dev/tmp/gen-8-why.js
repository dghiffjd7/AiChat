(async () => {
  // sent:false 且零错误——查 chat.send_message 返回的完整结果
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const out = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '测试四', triggerReply: true }, allow);
  return { full: JSON.stringify(out).slice(0, 600) };
})()
