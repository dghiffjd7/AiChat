(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const scripts = doc ? doc.querySelectorAll('script').length : 0;
  const btn = doc?.getElementById('start-new-life-btn');
  if (!btn) return { scripts, err: 'no btn' };
  const before = win.getComputedStyle(doc.getElementById('splash-screen')).display;
  const r = btn.getBoundingClientRect();
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ev = type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
    btn.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 }));
  }
  await new Promise(r2 => setTimeout(r2, 1500));
  const splash = doc.getElementById('splash-screen');
  const after = splash ? win.getComputedStyle(splash).display : 'gone';
  return {
    scripts,
    splashBefore: before, splashAfter: after,
    panelReacted: before !== after,
    visibleNow: (doc.body.innerText || '').slice(0, 100).replace(/\n/g, ' '),
  };
})()
