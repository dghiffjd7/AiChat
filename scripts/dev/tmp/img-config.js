(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const stores = reg?.stores || {};
  const keys = Object.keys(stores).filter(k => /media|image/i.test(k));
  const actions = Object.keys(reg?.actions || {}).filter(k => /image|media/i.test(k));
  return { storeKeys: keys, actionKeys: actions };
})()
