(() => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const rp = stores.rpSessionStore;
  const methods = rp ? Object.getOwnPropertyNames(Object.getPrototypeOf(rp)).slice(0, 20) : null;
  const actions = Object.keys(window.appBridge.debugUiRegistry.actions || {}).filter(k => /rp|mode/i.test(k));
  return { rpMethods: methods, actions, uiModeNow: window.appBridge.debugUiRegistry.stores?.uiMode };
})()
