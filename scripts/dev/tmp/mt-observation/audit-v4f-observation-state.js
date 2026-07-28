(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  if (!toolRegistry?.executeTool) return { ok: false, reason: 'agent_tool_registry_missing' };
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const execute = async (name, args = {}) => (await toolRegistry.executeTool(name, args, readContext))?.result || null;
  const [
    sessions,
    appState,
    chatProfiles,
    users,
    personas,
    worldbook,
    formatChat,
  ] = await Promise.all([
    execute('session.list', { limit: 100 }),
    execute('app.get_current_state'),
    execute('config.list_profiles', { scope: 'chat' }),
    execute('app.read_resource', { resource: 'user' }),
    execute('app.read_resource', { resource: 'persona' }),
    execute('worldbook.read', {
      name: '冻结观察写入-0728',
      includeContent: true,
      maxEntries: 50,
      maxContentLength: 2000,
    }),
    execute('app.read_resource', {
      resource: 'chat',
      sessionName: '格式修复测试',
      limit: 3,
      maxTextLength: 3000,
    }),
  ]);
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const maid = stores.maidSettingsStore;
  const maidProfileId = maid?.getBoundProfileId?.() || '';
  const maidProfile = profiles.find(item => item.id === maidProfileId) || null;
  return {
    ok: true,
    sessions,
    appState,
    chatProfiles,
    users,
    personas,
    worldbook,
    formatChat,
    maid: {
      boundProfileId: maidProfileId,
      modelOverride: maid?.getBoundModelOverride?.() || '',
      effectiveModel: maid?.getBoundModelOverride?.() || maidProfile?.model || '',
      fallbackProfileId: maid?.getFallbackProfileId?.() || '',
      subAgents: maid?.listSubAgents?.() || [],
    },
  };
})()
