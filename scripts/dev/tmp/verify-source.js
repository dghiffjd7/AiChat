(() => {
  const p = window.appBridge.debugUiRegistry.stores.personaStore.getActive?.();
  return { name: p?.name, source: p?.source ? { worldbookId: p.source.worldbookId, worldbookEnabled: p.source.worldbookEnabled, regexSetId: p.source.regexSetId } : null };
})()
