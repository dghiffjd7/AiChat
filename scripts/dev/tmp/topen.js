(async () => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  // 点右上角设置齿轮
  const gear = document.querySelector('#open-settings, [data-action="settings"], .topbar button:last-child') ||
    Array.from(document.querySelectorAll('button')).find(b=>/⚙|settings/i.test(b.textContent||b.getAttribute('aria-label')||''));
  const reg = window.appBridge.debugUiRegistry.panels;
  const p = reg.configPanel || reg.generalSettingsPanel;
  if (p?.show) { await p.show(); } else if (gear) { gear.click(); }
  await wait(700);
  return { opened: true, mode: document.body.dataset.themeMode };
})()
