(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => {
    const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return cs.display !== 'none' && r.width > 0 && /继续/.test(b.textContent || '');
  });
  return btns.map(b => ({
    text: b.textContent.trim().slice(0, 20),
    guideAttr: b.getAttribute('data-maid-guide-action'),
    cls: b.className.slice(0, 60),
    parentCls: b.parentElement?.className?.slice?.(0, 60),
  }));
})()
