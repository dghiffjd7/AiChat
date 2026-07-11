(async () => {
  window.__lag = []; let last = performance.now();
  if (window.__lagT) clearInterval(window.__lagT);
  window.__lagT = setInterval(() => { const n = performance.now(); window.__lag.push(Math.round(n - last - 100)); if (window.__lag.length > 600) window.__lag.shift(); last = n; }, 100);
  const t0 = Date.now();
  const btn = [...document.querySelectorAll('button')].find(b => /^开场白/.test((b.textContent || '').trim()));
  if (!btn) return { err: 'no greet button' };
  btn.click();
  await new Promise(r => setTimeout(r, 1500));
  // 开场白列表中选第一项
  const items = [...document.querySelectorAll('[class*="greeting"], [class*="greet"] li, .modal li, [role="dialog"] button, .sheet button')].filter(el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && (el.textContent || '').trim().length > 4;
  });
  const pick = items.find(el => !/新增|取消|关闭/.test(el.textContent || ''));
  if (pick) pick.click();
  await new Promise(r => setTimeout(r, 6000));
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  const msgs = stores.chatStore.getMessages(sid) || [];
  const contentNodes = document.querySelectorAll('.rp-floor *, [class*="message-content"] *').length;
  const styleTags = document.querySelectorAll('.rp-floor style, [class*="message"] style').length;
  return {
    clicked: pick ? pick.textContent.trim().slice(0, 40) : 'none',
    itemsSeen: items.length,
    sid, msgCount: msgs.length,
    firstHead: String(msgs[0]?.content || '').slice(0, 100),
    domContentNodes: contentNodes,
    inlineStyleTags: styleTags,
    lagMax: window.__lag.length ? Math.max(...window.__lag) : 0,
    elapsed: Date.now() - t0,
  };
})()
