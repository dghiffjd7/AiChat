(() => {
  const sel = window.appBridge?.debugUiRegistry?.stores?.maidSelectionMode;
  sel?.clear?.(); sel?.exit?.();
  if (window.__testClicker) clearInterval(window.__testClicker);
  return { cleaned: true, items: (sel?.getItems?.() || []).length, active: sel?.isActive?.() };
})()
