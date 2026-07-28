(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const toolRegistry = registry.stores?.agentToolRegistry;
  if (!toolRegistry?.executeTool) return { ok: false, reason: 'agent_tool_registry_missing' };
  const output = await toolRegistry.executeTool('session.list', {}, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  const result = output?.result || {};
  const names = (result.contacts || []).map(item => String(item.name || item.id || ''));
  const targets = [
    '冻结观察会话-A-0728',
    '冻结观察会话-B-0728',
    '冻结观察会话-C-0728',
    '冻结观察会话-D-0728',
  ];
  return {
    ok: true,
    count: Number(result.count || names.length),
    currentSessionId: result.currentSessionId || '',
    targets: targets.map(name => ({ name, exists: names.includes(name) })),
    names,
  };
})()
