(() => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const r = iframe.getBoundingClientRect();
  const rootVar = getComputedStyle(doc.documentElement).getPropertyValue('--viewport-height').trim();
  const bodyMinH = getComputedStyle(doc.body).minHeight;
  // 找超出 iframe 高度的可见 fixed 元素（被裁切者）
  const clipped = [...doc.querySelectorAll('body > *')].filter(el => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return false;
    const er = el.getBoundingClientRect();
    return er.height > 0 && er.bottom > win.innerHeight + 4;
  }).slice(0, 5).map(el => ({ id: el.id, h: Math.round(el.getBoundingClientRect().height), bottom: Math.round(el.getBoundingClientRect().bottom) }));
  return {
    iframeCssH: Math.round(r.height),
    innerViewportH: win.innerHeight,
    injectedVar: rootVar,
    bodyMinH,
    hostWindowH: window.innerHeight,
    clippedElements: clipped,
  };
})()
