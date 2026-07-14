(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const tm = (await import('/scripts/ui/theme-manager.js')).themeManager;
  const ts = (await import('/scripts/storage/theme-store.js')).themeStore;
  const rootVar = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const out = {};
  // classic-dark：token 应解析回精确原值
  tm.applyThemePreset({ preset: ts.getTheme('classic-dark') });
  await wait(200);
  out.dark = {
    tintNeutral: rootVar('--app-tint-neutral-rgb'),
    accentRgb: rootVar('--app-accent-rgb'),
    mutedRgb: rootVar('--app-text-muted-rgb'),
  };
  // 造一个用 token 的探测元素，验证计算色 = 原硬编码值
  const probe = document.createElement('div');
  probe.style.cssText = 'background: rgba(var(--app-tint-neutral-rgb), 0.06); border-color: rgba(var(--app-accent-rgb), 0.28);';
  document.body.appendChild(probe);
  out.dark.probeBg = getComputedStyle(probe).backgroundColor; // 期望 rgba(205,217,229,0.06)
  out.dark.probeBorder = getComputedStyle(probe).borderColor;  // 期望 rgba(121,192,255,0.28)
  // 紫色自定义：accent-rgb 应=紫、tint 默认继承 classic-dark
  const purple = { id:'__p__', name:'P', mode:'dark', tokens:{ surface:{ page:'#1a0f2e', panel:'#2f1d4d', topbar:'#241539' }, text:{ primary:'#f0e6ff', muted:'#b9a3d9' }, accent:{ primary:'#c084fc' } } };
  tm.applyThemePreset({ preset: purple });
  await wait(200);
  out.purple = {
    accentRgb: rootVar('--app-accent-rgb'),      // 期望 192, 132, 252（紫）
    mutedRgb: rootVar('--app-text-muted-rgb'),   // 期望 185, 163, 217（紫灰）
    tintNeutral: rootVar('--app-tint-neutral-rgb'), // 期望继承 classic-dark 205,217,229（未设）
    probeBorder: getComputedStyle(probe).borderColor, // 期望跟随紫 accent
  };
  document.body.removeChild(probe);
  tm.applyThemePreset({ preset: ts.getTheme('classic-light') });
  return out;
})()
