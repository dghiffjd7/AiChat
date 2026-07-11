(async () => {
  // 触发楼层重渲染：切出再切回会话（或调用刷新）
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  window.__lag = []; let last = performance.now();
  if (window.__lagT) clearInterval(window.__lagT);
  window.__lagT = setInterval(() => { const n = performance.now(); window.__lag.push(Math.round(n - last - 100)); if (window.__lag.length > 600) window.__lag.shift(); last = n; }, 100);
  const t0 = Date.now();
  // 尝试用消息重渲染 action
  const ui = window.appBridge.chatUi || null;
  location.hash = ''; // no-op
  // 简单粗暴：reload 保持 RP 模式（uiMode 已持久化 rp）
  localStorage.setItem('__rp_rerender_mark', String(Date.now()));
  location.reload();
  return { reloading: true };
})()
