(async () => {
  const sel = window.appBridge?.debugUiRegistry?.stores?.maidSelectionMode;
  if (!sel) return { err: 'no maidSelectionMode' };
  sel.clear?.();
  sel.enter?.();
  await new Promise(r => setTimeout(r, 300));
  const fire = (type, x, y, target) => {
    const el = target || document.elementFromPoint(x, y) || document.body;
    for (const Ctor of [PointerEvent, MouseEvent]) {
      try {
        el.dispatchEvent(new Ctor(type.startsWith('pointer') ? type : type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
        }));
        break;
      } catch (e) { /* try next */ }
    }
  };
  // 找覆盖层（选区模式激活后通常有 overlay 接管指针）
  const overlay = document.querySelector('.maid-selection-overlay, [class*="selection-overlay"], [class*="maid-select"]');
  const t = overlay || document.body;
  const seq = [['pointerdown', 60, 200], ['pointermove', 150, 280], ['pointermove', 260, 360], ['pointerup', 260, 360]];
  for (const [type, x, y] of seq) {
    fire(type, x, y, overlay ? t : null);
    await new Promise(r => setTimeout(r, 120));
  }
  await new Promise(r => setTimeout(r, 400));
  const items = sel.getItems?.() || [];
  return {
    overlayFound: !!overlay, overlayCls: overlay?.className?.slice?.(0, 60),
    active: sel.isActive?.(),
    itemCount: items.length,
    items: items.map(i => ({ regionId: i.regionId, rect: i.viewportRect || i.rect, text: String(i.semanticSummary || i.text || '').slice(0, 60) })),
  };
})()
