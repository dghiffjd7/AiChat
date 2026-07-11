(() => {
  // 看开场白点击后页面出现了什么浮层
  const overlays = [...document.querySelectorAll('div')].filter(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (cs.position === 'fixed' || cs.position === 'absolute') && r.width > 100 && r.height > 80 && cs.display !== 'none' && el.textContent.trim().length > 10;
  }).slice(-3).map(el => ({ cls: el.className.slice(0, 60), text: el.textContent.trim().slice(0, 120) }));
  return { overlays };
})()
