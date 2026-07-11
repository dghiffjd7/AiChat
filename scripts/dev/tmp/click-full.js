(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const btn = doc.getElementById('start-new-life-btn');
  if (!btn) return { err: 'no btn' };
  const before = {
    splashDisplay: win.getComputedStyle(doc.getElementById('splash-screen')).display,
    onclickAttr: typeof btn.onclick,
  };
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ev = type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
    btn.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
  }
  await new Promise(r2 => setTimeout(r2, 1200));
  const splash = doc.getElementById('splash-screen');
  return {
    before,
    afterSplashDisplay: splash ? win.getComputedStyle(splash).display : 'gone',
    domChanged: before.splashDisplay !== (splash ? win.getComputedStyle(splash).display : 'gone'),
    creatorVisible: (() => { const c = doc.getElementById('character-creator-overlay'); return c ? win.getComputedStyle(c).display : null; })(),
  };
})()
