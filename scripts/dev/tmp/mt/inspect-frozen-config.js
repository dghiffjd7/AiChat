(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const actions = registry.actions || {};
  const maid = stores.maidSettingsStore;
  const parseLocal = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      return {};
    }
  };
  const localProfiles = parseLocal('llm_profiles_v1');
  const localMaid = parseLocal('maid_settings_store_v1');
  const profiles = typeof actions.listAgentModelProfiles === 'function'
    ? await actions.listAgentModelProfiles()
    : [];
  const activeProfileId = String(localProfiles.activeProfileId || '');
  return {
    main: {
      activeProfileId,
      activeProfile: profiles.find(item => item.id === activeProfileId) || null,
    },
    maid: {
      boundProfileId: maid?.getBoundProfileId?.() || '',
      boundModelOverride: maid?.getBoundModelOverride?.() || '',
      fallbackProfileId: maid?.getFallbackProfileId?.() || '',
      subAgents: maid?.listSubAgents?.() || [],
      localBoundModelOverride: String(localMaid.boundModelOverride || ''),
      localUpdatedAt: Number(localMaid.updatedAt || 0),
    },
    routing: stores.maidCapabilityRoutingRuntime?.getConfig?.() || null,
    retrieval: (() => {
      const stats = stores.capabilityRetrievalStore?.getStats?.() || {};
      const aggregates = Array.isArray(stats.aggregates) ? stats.aggregates : [];
      const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
      return {
        snapshotCount: Number(stats.snapshotCount || 0),
        validSelectionCount: sum('validSelectionCount'),
        hitCount: sum('hitCount'),
      };
    })(),
  };
})()
