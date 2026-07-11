(() => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const btn = [...doc.querySelectorAll('button')].find(b => /开始新人生/.test(b.textContent || ''));
  if (!btn) return { err: 'btn not found' };
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = doc.elementFromPoint(cx, cy);
  const chain = [];
  let el = hit;
  while (el && chain.length < 8) {
    const cs = win.getComputedStyle(el);
    chain.push(`${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).slice(0, 24) : ''} z=${cs.zIndex} pe=${cs.pointerEvents}`);
    el = el.parentElement;
  }
  // 模拟点击并观察
  let clickFired = false;
  btn.addEventListener('click', () => { clickFired = true; }, { once: true });
  (hit || btn).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
  return {
    btnRect: { x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width) },
    hitIsBtn: hit === btn || btn.contains(hit),
    hitChain: chain,
    clickReachedBtn: clickFired,
  };
})()
