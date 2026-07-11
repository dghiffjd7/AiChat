(async () => {
  window.__docGrab = [];
  const mo = new MutationObserver(() => {
    document.querySelectorAll('iframe').forEach(f => {
      const len = (f.srcdoc || '').length;
      if (len > 100000 && /<script/i.test(f.srcdoc)) {
        if (!window.__docGrab.some(d => d.len === len)) window.__docGrab.push({ len, doc: f.srcdoc, at: Date.now() });
      }
    });
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['srcdoc'] });
  window.__docMo = mo;
  // 触发重渲染：切出切回会话
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  location.reload();
  return true;
})()
