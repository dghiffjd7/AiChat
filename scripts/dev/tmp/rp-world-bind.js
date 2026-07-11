(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const persona = stores.personaStore.getActive?.();
  const bridge = window.appBridge;
  const sid = stores.chatStore.getCurrent();
  const worldList = (await bridge.listWorlds?.()) || [];
  return {
    personaId: persona?.id, personaName: persona?.name,
    personaWorldId: persona?.worldId || persona?.world || persona?.worldIds || null,
    personaKeys: Object.keys(persona || {}).filter(k => /world/i.test(k)),
    bridgeWorldFns: Object.keys(bridge).filter(k => /world/i.test(k)).slice(0, 10),
    worldNames: (Array.isArray(worldList) ? worldList : []).map(w => String(w?.name || w).slice(0, 24)).slice(0, 12),
    currentWorldIdsForSession: await (bridge.getWorldIdsForSession?.(sid) ?? null),
  };
})()
