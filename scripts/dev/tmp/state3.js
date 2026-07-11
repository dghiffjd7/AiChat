(() => {
  const iframe = document.querySelector('iframe');
  const win = iframe.contentWindow;
  let ctxOk = null, ctxErr = '';
  try { const c = win.getContext?.(); ctxOk = !!c && typeof c === 'object'; } catch (e) { ctxErr = String(e?.message || e).slice(0, 120); }
  const btn = iframe.contentDocument.getElementById('start-new-life-btn');
  // 检查按钮 listener 痕迹：面板绑定方式（addEventListener 不可枚举）——改看初始化标志
  const bodyCls = iframe.contentDocument.body.className;
  return {
    iframeError: (iframe.dataset.iframeError || '').slice(0, 200),
    source: iframe.dataset.iframeSource,
    fallback: iframe.dataset.staticFallbackApplied,
    getContextOk: ctxOk, getContextErr: ctxErr,
    bodyClass: bodyCls,
    btnOnclick: btn ? String(btn.onclick).slice(0, 60) : null,
  };
})()
