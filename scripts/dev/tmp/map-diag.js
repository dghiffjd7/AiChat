(() => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  // 找地图相关容器
  const mapEls = [...doc.querySelectorAll('[id*="map"], [class*="map"]')].slice(0, 12).map(el => {
    const r = el.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    return {
      tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, visible: r.width > 0 && r.height > 0 && cs.display !== 'none',
      bg: (cs.backgroundImage || '').slice(0, 60),
    };
  });
  const canvases = [...doc.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, visible: c.getBoundingClientRect().width > 0 }));
  const imgs = [...doc.querySelectorAll('img')].slice(0, 8).map(i => ({ src: (i.src || '').slice(0, 80), complete: i.complete, natural: i.naturalWidth }));
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').slice(-4).map(e => ({ msg: (e.message || '').slice(0, 100), file: (e.file || '').slice(0, 80) }));
  return { mapEls, canvases, imgs, recentErrs: errs };
})()
