(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  if (!tools?.executeTool) {
    return { ok: false, reason: 'agent_tool_registry_missing' };
  }
  const context = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const before = await tools.executeTool('config.list_profiles', { scope: 'chat' }, context);
  const switched = await tools.executeTool('config.switch_profile', {
    scope: 'chat',
    profileId: 'profile-1769099653885-3faa87',
  }, context);
  const after = await tools.executeTool('config.list_profiles', { scope: 'chat' }, context);
  const active = after?.result?.profiles?.find(profile => profile.active) || null;
  return {
    ok: switched?.result?.ok === true
      && after?.result?.activeProfileId === 'profile-1769099653885-3faa87'
      && active?.provider === 'deepseek'
      && active?.model === 'deepseek-v4-flash',
    before: before?.result?.profiles?.find(profile => profile.active) || null,
    switched: switched?.result || null,
    after: active,
    maid: {
      profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
  };
})()
