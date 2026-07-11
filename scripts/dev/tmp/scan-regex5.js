(async () => {
  const store = window.appBridge.getRegexStore?.();
  const state = store.getState?.() || {};
  const sets = state?.local?.sets || {};
  const out = {};
  for (const [id, set] of Object.entries(sets)) {
    const rules = Array.isArray(set?.rules) ? set.rules : [];
    const htmlRules = rules.filter(r => /<div|<style|<img|<details|class=|<table/i.test(String(r.replaceString || r.replace || '')));
    out[set.name || id.slice(0, 20)] = {
      bind: set?.bind?.worldId || set?.bind?.type || '',
      enabled: set.enabled,
      ruleCount: rules.length,
      htmlRuleCount: htmlRules.length,
      biggestHtml: Math.max(0, ...htmlRules.map(r => String(r.replaceString || '').length)),
    };
  }
  return out;
})()
