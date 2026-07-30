(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.configPanel || null;
  const manager = panel?.imageConfigManager || null;
  const paramsStore = panel?.imageGenerationParamsPanel?.store || null;
  await paramsStore?.ready;
  const config = manager?.load ? await manager.load() : null;
  const profiles = manager?.getProfiles?.() || [];
  const activeProfile = profiles.find(item => item.id === manager?.getActiveProfileId?.()) || null;
  const sanitize = value => {
    const source = value && typeof value === 'object' ? value : {};
    const out = {};
    [
      'id',
      'name',
      'provider',
      'model',
      'baseUrl',
      'endpoint',
      'width',
      'height',
      'size',
      'sampler',
      'steps',
      'scale',
      'cfgScale',
      'negativePrompt',
      'promptPostProcessing',
    ].forEach(key => {
      if (source[key] !== undefined) out[key] = source[key];
    });
    return out;
  };
  return {
    ok: true,
    managerAvailable: Boolean(manager),
    activeProfileId: manager?.getActiveProfileId?.() || '',
    activeProfile: sanitize(activeProfile),
    runtimeConfig: sanitize(config),
    profileCount: profiles.length,
    paramsPreset: paramsStore?.getActive?.() || null,
  };
})()
