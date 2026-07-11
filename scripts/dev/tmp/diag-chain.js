(() => {
  const bridge = window.appBridge;
  const sid = bridge.debugUiRegistry.stores.chatStore.getCurrent();
  const bindings = bridge.getRoleWorldBindings?.(sid) || [];
  const roleIds = bridge.getRoleWorldIds?.(sid) || [];
  const resolved = bridge.getResolvedWorldState?.(sid) || {};
  return {
    sid,
    bindings: bindings.map(b => ({ personaId: String(b.personaId).slice(0, 26), worldId: b.worldId, enabled: b.enabled, isActive: b.isActive })),
    roleIds,
    resolvedWorldIds: resolved.worldIds,
    regexFanrenEnabled: (() => {
      const s = bridge.getRegexStore?.().getState?.();
      const set = Object.values(s?.local?.sets || {}).find(x => /凡人修仙/.test(x?.name || ''));
      return set?.enabled;
    })(),
  };
})()
