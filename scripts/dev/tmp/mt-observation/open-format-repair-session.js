(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const toolRegistry = registry.stores?.agentToolRegistry;
  if (!toolRegistry?.executeTool) return { ok: false, reason: 'agent_tool_registry_missing' };
  const context = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const opened = await toolRegistry.executeTool('session.open', {
    sessionId: '格式修复测试',
  }, context);
  const state = await toolRegistry.executeTool('app.get_current_state', {}, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  return {
    ok: opened?.status === 'succeeded' && state?.result?.sessionId === '格式修复测试',
    opened,
    state: state?.result || null,
  };
})()
