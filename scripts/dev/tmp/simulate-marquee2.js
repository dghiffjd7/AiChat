(async () => {
  const sel = window.appBridge?.debugUiRegistry?.stores?.maidSelectionMode;
  sel.clear?.();
  if (!sel.isActive?.()) sel.enter?.();
  await new Promise(r => setTimeout(r, 250));
  const fire = (type, x, y) => {
    document.body.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
  };
  fire('pointerdown', 40, 150);
  await new Promise(r => setTimeout(r, 60));
  for (const [x, y] of [[120, 220], [200, 300], [280, 380]]) {
    fire('pointermove', x, y);
    await new Promise(r => setTimeout(r, 60));
  }
  fire('pointerup', 280, 380);
  await new Promise(r => setTimeout(r, 400));
  const items = sel.getItems?.() || [];
  return {
    itemCount: items.length,
    items: items.map(i => ({ regionId: i.regionId, rect: i.viewportRect, text: String(i.semanticSummary || '').slice(0, 80) })),
  };
})()
