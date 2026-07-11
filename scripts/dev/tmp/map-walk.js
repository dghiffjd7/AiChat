(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const click = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const t = doc.elementFromPoint(cx, cy) || el;
    for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = ty.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      t.dispatchEvent(new Ev(ty, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
    }
  };
  // 选默认地图 radio
  const radio = doc.querySelector('#map-list-container input[name="defaultMapSelection"]');
  if (radio) { radio.checked = true; radio.dispatchEvent(new win.Event('change', { bubbles: true })); }
  // 点「确认并选择出生地」
  const confirmBtn = [...doc.querySelectorAll('button')].find(b => /确认并选择出生地/.test(b.textContent || ''));
  if (confirmBtn) click(confirmBtn);
  await new Promise(r => setTimeout(r, 2500));
  const canvas = doc.getElementById('world-map-canvas');
  const mapOverlay = doc.getElementById('world-map-overlay');
  const errsNow = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').slice(-2).map(e => ({ m: (e.message || '').slice(0, 90), ex: (e.excerpt || '').slice(0, 120) }));
  return {
    radioFound: !!radio, confirmFound: !!confirmBtn,
    mapOverlayVisible: mapOverlay ? win.getComputedStyle(mapOverlay).display : 'n/a',
    canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
    errsNow,
  };
})()
