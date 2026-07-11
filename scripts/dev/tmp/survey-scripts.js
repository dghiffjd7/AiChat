(async () => {
  const reg = window.appBridge?.debugUiRegistry;
  const stores = reg?.stores || {};
  const out = { presets: [], personas: [], regex: [], settings: {} };
  // 预设中的脚本
  try {
    const presetStore = stores.presetStore;
    const presets = presetStore?.listPresets?.() || presetStore?.getAll?.() || [];
    for (const p of (Array.isArray(presets) ? presets : []).slice(0, 30)) {
      const raw = JSON.stringify(p);
      const hasScript = /<script|scriptContent|"script"|jsCode|iframe/i.test(raw);
      out.presets.push({ name: p?.name, size: raw.length, hasScript });
    }
  } catch (e) { out.presets = String(e); }
  // 角色卡（含内嵌正则/脚本）
  try {
    const personaStore = stores.personaStore;
    const cards = personaStore?.listPersonas?.() || personaStore?.getAll?.() || [];
    for (const c of (Array.isArray(cards) ? cards : []).slice(0, 30)) {
      const raw = JSON.stringify(c);
      out.personas.push({
        name: c?.name, size: raw.length,
        hasScriptTag: /<script/i.test(raw),
        hasIframe: /<iframe|srcdoc/i.test(raw),
        hasStScript: /\/(setvar|getvar|echo|trigger|gen |genraw)/i.test(raw),
        hasMvu: /_\.(set|get)\(|mvu/i.test(raw),
      });
    }
  } catch (e) { out.personas = String(e); }
  // 正则脚本
  try {
    const regexStore = stores.regexStore;
    const list = regexStore?.listScripts?.() || regexStore?.getAll?.() || [];
    out.regex = (Array.isArray(list) ? list : []).slice(0, 40).map(r => ({ name: r?.scriptName || r?.name, hasJs: /<script|jsCode/i.test(JSON.stringify(r)) }));
  } catch (e) { out.regex = String(e); }
  // 脚本权限设置现值
  try {
    const settingsStore = stores.settingsStore || stores.appSettingsStore;
    const s = settingsStore?.get?.() || settingsStore?.getSettings?.() || {};
    out.settings = {
      scriptAllowReadMessages: s.scriptAllowReadMessages,
      scriptAllowModifyVariables: s.scriptAllowModifyVariables,
      scriptAllowNetwork: s.scriptAllowNetwork,
      keys: Object.keys(s).filter(k => /script/i.test(k)),
    };
  } catch (e) { out.settings = String(e); }
  return out;
})()
