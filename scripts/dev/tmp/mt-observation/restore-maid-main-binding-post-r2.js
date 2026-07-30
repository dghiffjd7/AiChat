(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const maid = stores.maidSettingsStore;
  const profileId = 'profile-1782112231605-1c4f1f';
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const profile = profiles.find(item => item.id === profileId) || null;
  if (!maid?.setBoundProfileId || !maid?.setBoundModelOverride || !profile) {
    return { ok: false, reason: 'maid_model_binding_runtime_missing', profile };
  }
  const before = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
  };
  await maid.setBoundProfileId(profileId);
  await maid.setBoundModelOverride('');
  const after = {
    boundProfileId: maid.getBoundProfileId?.() || '',
    modelOverride: maid.getBoundModelOverride?.() || '',
    effectiveModel: profile.model,
    fallbackProfileId: maid.getFallbackProfileId?.() || '',
    subAgents: maid.listSubAgents?.() || [],
  };
  return {
    ok: after.boundProfileId === profileId && after.modelOverride === '',
    profile,
    before,
    after,
  };
})()
