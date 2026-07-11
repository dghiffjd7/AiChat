(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const storeKeys = Object.keys(stores);
  const probe = {};
  for (const name of ['presetStore', 'regexStore', 'scriptStore', 'worldStore', 'settingsStore']) {
    const s = stores[name];
    probe[name] = s ? Object.keys(s).filter(k => typeof s[k] === 'function').slice(0, 12) : null;
  }
  return { storeKeys, probe };
})()
