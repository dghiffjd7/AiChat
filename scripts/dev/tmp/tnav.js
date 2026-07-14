(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const tm = (await import('/scripts/ui/theme-manager.js')).themeManager;
  const nav = () => document.querySelector('.bottom-nav');
  const bg = () => nav() ? getComputedStyle(nav()).backgroundColor : 'no-nav';
  const dot = () => { const d=document.querySelector('.world-block-dot.active'); return d?getComputedStyle(d).backgroundColor:'n/a'; };
  const out = {};
  // classic-dark：应保持原值 rgba(26,30,36,0.96)
  tm.applyThemePreset({ preset: (await import('/scripts/storage/theme-store.js')).themeStore.getTheme('classic-dark') });
  await wait(200); out.classicDark_navBg = bg();
  // 紫色自定义（topbar=#241539）：.bottom-nav 应变紫
  const purple = { id:'__p__', name:'P', mode:'dark', tokens:{ surface:{ page:'#1a0f2e', card:'#2a1a44', panel:'#2f1d4d', topbar:'#241539', input:'#241539', subtle:'#241a3a' }, text:{ primary:'#f0e6ff' }, accent:{ primary:'#c084fc' } } };
  tm.applyThemePreset({ preset: purple });
  await wait(200); out.purple_navBg = bg(); out.purple_topbarToken = getComputedStyle(document.documentElement).getPropertyValue('--app-surface-topbar').trim();
  // 还原
  tm.applyThemePreset({ preset: (await import('/scripts/storage/theme-store.js')).themeStore.getTheme('classic-light') });
  return out;
})()
