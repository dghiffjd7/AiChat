(async () => {
  const mod = await import('/scripts/storage/regex-store.js').catch(() => null);
  const bridgeRegex = window.appBridge?.regexStore || window.appBridge?.regex;
  let items = [];
  if (bridgeRegex?.getAll) items = bridgeRegex.getAll();
  else if (mod) {
    const store = mod.regexStore || mod.default;
    await store?.load?.();
    items = store?.getAll?.() || store?.listScripts?.() || [];
  }
  const list = (Array.isArray(items) ? items : []).map(r => ({
    name: String(r.scriptName || r.name || '').slice(0, 40),
    scope: r.scope || r.scopeId || (r.personaId ? 'persona:' + String(r.personaId).slice(0, 20) : 'global'),
    enabled: r.enabled !== false && r.disabled !== true,
    htmlOut: /<div|<style|<img|<details|class=/i.test(String(r.replaceString || r.replace || '')),
    size: String(r.replaceString || r.replace || '').length,
  }));
  return { total: list.length, htmlRenderers: list.filter(r => r.htmlOut).slice(0, 20), rpContacts: (window.appBridge.debugUiRegistry.stores.contactsStore?.listContacts?.() || []).map(c => c.id).filter(id => String(id).startsWith('rp:')) };
})()
