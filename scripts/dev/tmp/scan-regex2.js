(async () => {
  const store = window.appBridge.getRegexStore?.() || window.appBridge.getRegexStore;
  if (!store) return { err: 'no store', keys: Object.keys(window.appBridge).filter(k => /regex/i.test(k)) };
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter(m => /get|list/i.test(m));
  let items = store.getAll?.() || store.listScripts?.() || store.getScripts?.() || [];
  if (!Array.isArray(items)) items = [];
  return {
    methods,
    total: items.length,
    sample: items.slice(0, 3).map(r => Object.keys(r).slice(0, 10)),
    htmlRenderers: items.map(r => ({
      name: String(r.scriptName || r.name || '').slice(0, 40),
      enabled: r.disabled !== true && r.enabled !== false,
      htmlOut: /<div|<style|<img|<details|class=/i.test(String(r.replaceString || r.replace || '')),
      size: String(r.replaceString || r.replace || '').length,
      scope: String(r.scope || r.placement || ''),
    })).filter(r => r.htmlOut).slice(0, 15),
  };
})()
