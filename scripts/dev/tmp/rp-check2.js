(async () => {
  await new Promise(r => setTimeout(r, 2500));
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  const sessions = stores.chatStore.listSessions?.() || Object.keys(stores.chatStore.getState?.()?.sessions || {});
  const rpSessions = (Array.isArray(sessions) ? sessions : []).filter(s => String(s.id || s).startsWith('rp:')).map(s => String(s.id || s));
  const uiModeEl = document.body.className;
  const greetBtns = [...document.querySelectorAll('button')].filter(b => /开场白|重置剧情/.test(b.textContent || '')).map(b => b.textContent.trim().slice(0, 12));
  return { sid, rpSessions: rpSessions.slice(0, 5), bodyClass: uiModeEl.slice(0, 80), greetBtns };
})()
