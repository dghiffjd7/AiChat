(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const ss = stores.scriptStore;
  let scripts = [];
  try {
    await ss?.load?.();
    const scopes = ss?.listScopes?.() || [];
    for (const scope of (Array.isArray(scopes) ? scopes : []).slice(0, 20)) {
      const items = ss?.getScripts?.(scope?.id || scope) || [];
      for (const item of (Array.isArray(items) ? items : [])) {
        scripts.push({
          scope: String(scope?.id || scope).slice(0, 30),
          name: String(item?.name || '').slice(0, 40),
          enabled: item?.enabled,
          size: String(item?.content || item?.code || '').length,
          hasIframe: /<iframe|srcdoc|getElementById|document\./i.test(String(item?.content || item?.code || '')),
          hasNet: /fetch\(|XMLHttpRequest|WebSocket/i.test(String(item?.content || item?.code || '')),
          hasStCmd: /triggerSlash|SillyTavern|TavernHelper|getvar|setvar/i.test(String(item?.content || item?.code || '')),
        });
      }
    }
  } catch (e) { scripts = String(e); }
  return { count: Array.isArray(scripts) ? scripts.length : scripts, scripts: Array.isArray(scripts) ? scripts.slice(0, 25) : [] };
})()
