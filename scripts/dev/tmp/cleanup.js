(async () => {
  if (window.__testClicker) clearInterval(window.__testClicker);
  if (window.__abortWatch) clearInterval(window.__abortWatch);
  if (window.__uiLagProbe) clearInterval(window.__uiLagProbe);
  const maid = window.appBridge?.debugUiRegistry?.stores?.maidSettingsStore;
  await maid?.setBoundProfileId?.('profile-1782112231605-1c4f1f');
  return { restored: maid?.getBoundProfileId?.(), fallback: maid?.getFallbackProfileId?.() };
})()
