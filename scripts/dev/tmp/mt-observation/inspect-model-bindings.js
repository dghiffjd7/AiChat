(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.();
  const configOutput = await stores.agentToolRegistry?.executeTool?.('config.list_profiles', { scope: 'chat' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  return {
    ok: true,
    maid: {
      boundProfileId: maid?.getBoundProfileId?.() || '',
      modelOverride: maid?.getBoundModelOverride?.() || '',
      fallbackProfileId: maid?.getFallbackProfileId?.() || '',
      subAgents: maid?.listSubAgents?.() || [],
    },
    profiles: profiles || [],
    chatProfiles: configOutput?.result || null,
  };
})()
