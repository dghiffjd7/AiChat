(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const reg = window.appBridge.debugUiRegistry.panels;
  const keys = Object.keys(reg).filter(k=>/config|general|setting/i.test(k));
  const p = reg.configPanel || reg.generalSettingsPanel || reg[keys[0]];
  if (p?.show) await p.show(); else return { err:'no panel', keys };
  await wait(700);
  return { opened:true, bodyThemeMode: document.body.dataset.themeMode, keys };
})()
