(async () => {
  const store = window.appBridge.getRegexStore?.();
  const state = store.getState?.() || {};
  const globalList = store.getGlobal?.() || [];
  const localSets = store.listLocalSets?.() || [];
  const summarize = (r) => ({
    name: String(r.scriptName || r.name || '').slice(0, 40),
    enabled: r.disabled !== true,
    htmlOut: /<div|<style|<img|<details|class=/i.test(String(r.replaceString || r.replace || '')),
    size: String(r.replaceString || r.replace || '').length,
  });
  const locals = {};
  for (const set of (Array.isArray(localSets) ? localSets : []).slice(0, 20)) {
    const id = String(set?.id || set || '');
    const items = store.getLocalSet?.(id) || set?.scripts || [];
    if (Array.isArray(items) && items.length) locals[id.slice(0, 34)] = items.map(summarize);
  }
  return { stateKeys: Object.keys(state), globalCount: (globalList || []).length, global: (globalList || []).map(summarize).slice(0, 10), locals };
})()
