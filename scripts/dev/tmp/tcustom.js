(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mod = await import('/scripts/ui/theme-manager.js');
  const tm = mod.themeManager;
  const custom = {
    id:'__probe_purple__', name:'Probe Purple', mode:'dark',
    tokens:{
      surface:{ page:'#1a0f2e', pageAlt:'#160c26', card:'#2a1a44', panel:'#2f1d4d', topbar:'#241539', input:'#241539', overlay:'rgba(20,10,40,0.6)', subtle:'#241a3a', hover:'#3a2560' },
      text:{ primary:'#f0e6ff', secondary:'#c9b8e8', muted:'#9a86c4', inverse:'#1a0f2e', quote:'#c9b8e8', link:'#d8b4fe' },
      accent:{ primary:'#c084fc', strong:'#a855f7', soft:'#7c3aed' },
      border:{ subtle:'#3a2560', default:'#4a2f78', strong:'#5b3a92' }
    }
  };
  tm.applyThemePreset({ preset: custom, mode:'dark' });
  await wait(200);
  const reg = window.appBridge.debugUiRegistry.panels;
  await (reg.configPanel||reg.generalSettingsPanel).show(); await wait(700);
  const cs=getComputedStyle(document.documentElement);
  return { themeMode: document.body.dataset.themeMode, panelToken: cs.getPropertyValue('--app-surface-panel').trim() };
})()
