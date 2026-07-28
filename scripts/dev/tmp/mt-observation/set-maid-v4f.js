(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.();
  if (!maid?.setBoundProfileId || !maid?.setBoundModelOverride || !Array.isArray(profiles)) {
    return { ok: false, reason: 'maid_model_binding_runtime_missing' };
  }
  const matches = profiles.filter(profile => (
    profile.name === 'Deepseek'
    && profile.provider === 'deepseek'
    && profile.model === 'deepseek-v4-flash'
  ));
  if (matches.length !== 1) {
    return { ok: false, reason: 'deepseek_v4f_profile_not_unique', matches };
  }
  const profile = matches[0];
  const before = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
    fallbackProfileId: maid.getFallbackProfileId?.() || '',
    subAgents: maid.listSubAgents?.() || [],
  };
  const chatBefore = await stores.agentToolRegistry?.executeTool?.('config.list_profiles', { scope: 'chat' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });

  await maid.setBoundProfileId(profile.id);
  await maid.setBoundModelOverride('');

  const after = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
    effectiveModel: profile.model,
    fallbackProfileId: maid.getFallbackProfileId?.() || '',
    subAgents: maid.listSubAgents?.() || [],
  };
  const chatAfter = await stores.agentToolRegistry?.executeTool?.('config.list_profiles', { scope: 'chat' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  return {
    ok: after.boundProfileId === profile.id
      && after.modelOverride === ''
      && chatAfter?.result?.activeProfileId === chatBefore?.result?.activeProfileId,
    profile,
    before,
    after,
    chatActiveBefore: chatBefore?.result?.activeProfileId || '',
    chatActiveAfter: chatAfter?.result?.activeProfileId || '',
  };
})()
