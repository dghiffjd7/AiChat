(() => {
  if (window.__obsPermissionTimer) clearInterval(window.__obsPermissionTimer);
  if (window.__mtAllowTimer) clearInterval(window.__mtAllowTimer);
  if (window.__testClicker) clearInterval(window.__testClicker);
  window.__obsPermissionTimer = null;
  window.__mtAllowTimer = null;
  window.__testClicker = null;
  window.__obsTaskState = null;
  return { cleared: true };
})()
