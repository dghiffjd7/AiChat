(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const profile = profiles.find(item => (
    item?.id === 'profile-1782112231605-1c4f1f' &&
    item?.name === 'pioneer' &&
    item?.provider === 'custom'
  ));
  if (!profile || !maid?.setBoundProfileId || !maid?.setBoundModelOverride) {
    return { ok: false, reason: 'maid_model_binding_runtime_missing' };
  }

  const before = {
    profileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
  };
  await maid.setBoundProfileId(profile.id);
  await maid.setBoundModelOverride('gpt-5.6-sol');
  const chatProfiles = await stores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'chat' },
    {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    },
  );
  const after = {
    profileId: maid.getBoundProfileId?.() || '',
    profileName: profile.name,
    provider: profile.provider,
    modelOverride: maid.getBoundModelOverride?.() || '',
    effectiveModel: maid.getBoundModelOverride?.() || profile.model,
  };
  return {
    ok: after.profileId === profile.id && after.modelOverride === 'gpt-5.6-sol',
    before,
    after,
    chatActiveProfileId: chatProfiles?.result?.activeProfileId || '',
  };
})()
