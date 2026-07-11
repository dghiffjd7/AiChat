(async () => {
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sid = window.appBridge.debugUiRegistry.stores.chatStore.getCurrent();
  const bind = await registry.executeTool('worldbook.bind_session', { worldbookId: "《凡人修仙传V10.91》", sessionId: sid }, allow);
  await new Promise(r => setTimeout(r, 1500));
  const worldIds = await window.appBridge.getWorldIdsForSession?.(sid);
  return { bind: bind?.result?.ok ?? bind?.status, bindSummary: bind?.summary, worldIds };
})()
