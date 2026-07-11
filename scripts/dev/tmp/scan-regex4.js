(async () => {
  const store = window.appBridge.getRegexStore?.();
  const state = store.getState?.() || {};
  return {
    stateKeys: Object.keys(state),
    stateShape: JSON.stringify(state).slice(0, 800),
  };
})()
