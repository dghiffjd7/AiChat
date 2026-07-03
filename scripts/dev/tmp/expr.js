(async () => {
  const reg = window.appBridge.debugUiRegistry;
  const result = await reg.actions.runMaidAssistantPrompt({ input: '继续' });
  const registry = reg.stores.agentToolRegistry;
  const bound = await registry.executeTool('worldbook.list', { sessionId: '蒂法' }, {
    requestPermission: () => ({ decision: 'allow' }),
  });
  const tifaBooks = (bound?.result?.worldbooks || []).filter(w => /蒂法/.test(String(w?.name || w?.id || '')));
  return {
    ok: result.ok,
    tools: (result.steps || []).map(s => `${s.toolName}:${s.status}`),
    tifaWorldbookBound: tifaBooks.map(w => ({ id: w.id || w.name, bound: w.boundToSession ?? w.bound ?? w.enabled })),
    maidMessage: String(result.message || '').slice(0, 320),
  };
})()
