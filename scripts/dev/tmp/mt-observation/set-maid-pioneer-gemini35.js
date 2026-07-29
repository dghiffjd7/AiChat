(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.();
  if (!maid?.setBoundProfileId || !maid?.setBoundModelOverride || !Array.isArray(profiles)) {
    return { ok: false, reason: 'maid_model_binding_runtime_missing' };
  }
  const matches = profiles.filter(profile => (
    profile.name === 'pioneer'
    && profile.provider === 'custom'
    && profile.model === 'claude-opus-4-6'
  ));
  if (matches.length !== 1) {
    return { ok: false, reason: 'pioneer_profile_not_unique', matches };
  }
  const profile = matches[0];
  const requestedModel = 'gemini-3.5-flash';
  const before = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
    fallbackProfileId: maid.getFallbackProfileId?.() || '',
  };
  const chatBefore = await stores.agentToolRegistry?.executeTool?.('config.list_profiles', { scope: 'chat' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });

  await maid.setBoundProfileId(profile.id);
  await maid.setBoundModelOverride(requestedModel);

  const after = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
    effectiveModel: maid.getBoundModelOverride?.() || profile.model,
    fallbackProfileId: maid.getFallbackProfileId?.() || '',
  };
  const chatAfter = await stores.agentToolRegistry?.executeTool?.('config.list_profiles', { scope: 'chat' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  return {
    ok: after.boundProfileId === profile.id
      && after.modelOverride === requestedModel
      && chatAfter?.result?.activeProfileId === chatBefore?.result?.activeProfileId,
    profile,
    requestedModel,
    before,
    after,
    chatActiveBefore: chatBefore?.result?.activeProfileId || '',
    chatActiveAfter: chatAfter?.result?.activeProfileId || '',
  };
})()
