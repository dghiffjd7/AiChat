(() => {
  const iframe = document.querySelector('iframe');
  const r = iframe.getBoundingClientRect();
  const cs = getComputedStyle(iframe);
  // 宿主侧：iframe 中心点命中的元素（是否被覆盖层挡住）
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const chain = [];
  let el = hit;
  while (el && chain.length < 6) { chain.push(el.tagName + (el.className ? '.' + String(el.className).slice(0, 30) : '')); el = el.parentElement; }
  // iframe 内部：按钮与 splash 状态
  const doc = iframe.contentDocument;
  const btns = doc ? [...doc.querySelectorAll('button, .menu-button, [onclick]')].slice(0, 6).map(b => ({
    text: (b.textContent || '').trim().slice(0, 12),
    pe: doc.defaultView.getComputedStyle(b).pointerEvents,
    z: doc.defaultView.getComputedStyle(b).zIndex,
  })) : null;
  return {
    iframePointerEvents: cs.pointerEvents,
    sandbox: iframe.getAttribute('sandbox'),
    hitAtCenter: chain,
    hitIsIframe: hit === iframe,
    parentPE: getComputedStyle(iframe.parentElement).pointerEvents,
    innerButtons: btns,
  };
})()
