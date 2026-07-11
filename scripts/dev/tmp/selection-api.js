(() => {
  const sel = window.appBridge?.debugUiRegistry?.stores?.maidSelectionMode;
  if (!sel) return { err: 'no maidSelectionMode' };
  return { keys: Object.keys(sel), items: (sel.getItems?.() || []).length };
})()
