(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  // 激活凡人修仙传角色卡
  await stores.personaStore.setActive?.('persona_1783693120316_l99qc');
  await new Promise(r => setTimeout(r, 800));
  // 性能观测：主线程心跳
  window.__lag = [];
  let last = performance.now();
  if (window.__lagT) clearInterval(window.__lagT);
  window.__lagT = setInterval(() => { const n = performance.now(); window.__lag.push(Math.round(n - last - 100)); if (window.__lag.length > 400) window.__lag.shift(); last = n; }, 100);
  // 点模式切换进 RP
  const btn = document.getElementById('mode-switch');
  if (!btn) return { err: 'no mode-switch button' };
  btn.click();
  await new Promise(r => setTimeout(r, 5000));
  const chatStore = stores.chatStore;
  const sid = chatStore.getCurrent();
  const msgs = chatStore.getMessages(sid) || [];
  const bubbles = document.querySelectorAll('.message-bubble, [class*="message"]');
  const htmlRendered = [...document.querySelectorAll('.message-list [class], #chat-messages [class]')].length;
  return {
    activePersona: stores.personaStore.getActive?.()?.name,
    sessionId: sid,
    msgCount: msgs.length,
    firstMsgHead: String(msgs[0]?.content || '').slice(0, 120),
    domNodes: htmlRendered,
    lagMax: window.__lag.length ? Math.max(...window.__lag) : 0,
  };
})()
