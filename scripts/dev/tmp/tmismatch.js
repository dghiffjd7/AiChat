(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const tm = (await import('/scripts/ui/theme-manager.js')).themeManager;
  // 错配：浅色表面，作者却标 mode:dark（旧逻辑会让 body=dark 触发死色规则→混）
  const mismatch = { id:'__mm__', name:'Mismatch', mode:'dark',
    tokens:{ surface:{ page:'#f4f5f6', panel:'rgba(255,255,255,0.92)', card:'rgba(255,255,255,0.96)', input:'rgba(255,255,255,0.92)', topbar:'rgba(255,255,255,0.92)', subtle:'#f8fafc' },
             text:{ primary:'#0f172a', secondary:'#475569', muted:'#94a3b8' } } };
  tm.applyThemePreset({ preset: mismatch });
  await wait(150);
  const reg = window.appBridge.debugUiRegistry.panels;
  await (reg.configPanel||reg.generalSettingsPanel).show(); await wait(600);
  return { bodyThemeMode: document.body.dataset.themeMode, surfacePanel: getComputedStyle(document.documentElement).getPropertyValue('--app-surface-panel').trim() };
})()
