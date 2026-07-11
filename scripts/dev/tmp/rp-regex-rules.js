(() => {
  const store = window.appBridge.getRegexStore?.();
  const state = store.getState?.() || {};
  const fanren = Object.values(state?.local?.sets || {}).find(s => /凡人修仙/.test(s?.name || ''));
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  return {
    rules: (fanren?.rules || []).map(r => ({
      name: String(r.scriptName || '').slice(0, 40),
      find: String(r.findRegex || '').slice(0, 120),
      replaceLen: String(r.replaceString || '').length,
      disabled: r.disabled,
      placement: r.placement, markdownOnly: r.markdownOnly, promptOnly: r.promptOnly,
    })),
    sessionWorldIds: window.appBridge.currentWorldIds || window.appBridge.currentWorldId,
    sid,
  };
})()
