(() => {
  if (window.__testClicker) clearInterval(window.__testClicker);
  window.__testClickerLog = [];
  const visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  window.__testClicker = setInterval(() => {
    try {
      const btns = [...document.querySelectorAll('button')].filter(visible);
      const confirm = btns.find(b => /允许一次|允许点击|应用修复/.test(b.textContent || ''));
      if (confirm) { confirm.click(); window.__testClickerLog.push(['confirm', confirm.textContent.trim()]); return; }
      const target = [...document.querySelectorAll('.maid-guide-step-target')].find(visible);
      if (target) { target.click(); window.__testClickerLog.push(['guide-target']); return; }
      const cont = btns.find(b => b.matches('[data-maid-guide-action="continue"]'));
      if (cont) { cont.click(); window.__testClickerLog.push(['guide-continue']); }
    } catch (e) {}
  }, 800);
  const maid = window.appBridge?.debugUiRegistry?.stores?.maidSettingsStore;
  return { clicker: true, boundProfile: maid?.getBoundProfileId?.() };
})()
