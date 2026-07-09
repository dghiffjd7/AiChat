// T0: 测试前置 —— 切绑 Deepseek 测试档 + 安装测试点击器 v2 + 环境体检
(async () => {
  const reg = window.appBridge?.debugUiRegistry;
  if (!reg) return { ok: false, reason: 'no debugUiRegistry' };
  const stores = reg.stores || {};
  const maid = stores.maidSettingsStore;
  if (!maid) return { ok: false, reason: 'no maidSettingsStore' };

  const DEEPSEEK = 'profile-1769099653885-3faa87';
  const prevProfile = maid.getBoundProfileId?.();
  await maid.setBoundProfileId?.(DEEPSEEK);

  // 测试点击器 v2：模拟用户点击确认弹窗 / 跟随首次引导
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
      // ① 确认弹窗（允许一次 / 允许点击 / 应用修复）
      const btns = [...document.querySelectorAll('button')].filter(visible);
      const confirm = btns.find(b => /允许一次|允许点击|应用修复/.test(b.textContent || ''));
      if (confirm) { confirm.click(); window.__testClickerLog.push(['confirm', confirm.textContent.trim(), Date.now()]); return; }
      // ② 首次引导：点高亮目标（模拟用户跟随教学）
      const target = [...document.querySelectorAll('.maid-guide-step-target')].find(visible);
      if (target) { target.click(); window.__testClickerLog.push(['guide-target', (target.textContent || target.className).slice(0, 40), Date.now()]); return; }
      // ③ 引导 continue / 帮我点
      const cont = btns.find(b => b.matches('[data-maid-guide-action="continue"]') || /帮我点/.test(b.textContent || ''));
      if (cont) { cont.click(); window.__testClickerLog.push(['guide-continue', cont.textContent.trim(), Date.now()]); }
    } catch (e) { window.__testClickerLog.push(['error', String(e), Date.now()]); }
  }, 800);

  // UI 响应性探针：主线程若被阻塞，interval 间隔会拉大
  window.__uiLagSamples = [];
  if (window.__uiLagProbe) clearInterval(window.__uiLagProbe);
  let last = performance.now();
  window.__uiLagProbe = setInterval(() => {
    const now = performance.now();
    window.__uiLagSamples.push(Math.round(now - last - 500));
    if (window.__uiLagSamples.length > 200) window.__uiLagSamples.shift();
    last = now;
  }, 500);

  // 环境体检
  const cards = stores.personaStore?.listPersonas?.() || stores.personaStore?.getAll?.() || [];
  const cardNames = (Array.isArray(cards) ? cards : []).map(c => c?.name).filter(Boolean);
  return {
    ok: true,
    prevProfile,
    nowProfile: maid.getBoundProfileId?.(),
    fallbackProfile: maid.getFallbackProfileId?.(),
    subAgents: (maid.listSubAgents?.() || []).map(s => ({ name: s.name, skills: s.skills, enabled: s.enabled })),
    testCardExists: cardNames.some(n => /女仆能力测试/.test(n)),
    cardCount: cardNames.length,
    clickerInstalled: true,
  };
})()
