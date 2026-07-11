(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  // 4 元素回归检查
  const back = ['knowledge-search-api-url', 'import-text-image-presets-btn'].map(id => ({ id, present: !!doc.getElementById(id) }));
  // 走流程：开始新人生 → 最终确认 → 选择出生地
  const findByText = (text) => {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if ((n.textContent || '').trim() === text || (n.textContent || '').includes(text)) {
        const el = n.parentElement;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
    }
    return null;
  };
  const click = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const t = doc.elementFromPoint(cx, cy) || el;
    for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = ty.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      t.dispatchEvent(new Ev(ty, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
    }
  };
  const startBtn = doc.getElementById('start-new-life-btn');
  if (startBtn && win.getComputedStyle(doc.getElementById('splash-screen')).display !== 'none') { click(startBtn); await new Promise(r => setTimeout(r, 1200)); }
  const finalTab = findByText('最终确认');
  if (finalTab) { click(finalTab); await new Promise(r => setTimeout(r, 900)); }
  const birthBtn = findByText('选择出生地');
  if (birthBtn) { click(birthBtn); await new Promise(r => setTimeout(r, 2000)); }
  // 地图状态
  const canvas = doc.getElementById('world-map-canvas');
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').slice(-3).map(e => (e.message || '').slice(0, 90));
  return {
    back,
    finalTabFound: !!finalTab, birthBtnFound: !!birthBtn,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: Math.round(canvas.getBoundingClientRect().width) } : null,
    recentErrs: errs,
  };
})()
