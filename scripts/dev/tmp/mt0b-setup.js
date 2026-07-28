(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  window.__mtAllowLog = [];
  if (!window.__mtAllowTimer) {
    window.__mtAllowTimer = setInterval(() => {
      document.querySelectorAll('.app-confirm-modal').forEach((ov) => {
        if (ov.style.display === 'none' || !ov.isConnected) return;
        const btn = Array.from(ov.querySelectorAll('button')).find(b => b.textContent.trim() === '允许一次');
        if (btn) {
          window.__mtAllowLog.push({ at: Date.now(), title: (ov.querySelector('.app-confirm-title')?.textContent || '').slice(0, 60) });
          btn.click();
        }
      });
    }, 400);
  }
  const stats = stores.capabilityRetrievalStore.getStats();
  window.__mtBaseline = { at: Date.now(), snapshotCount: stats.snapshotCount };
  return {
    override: stores.maidSettingsStore.getBoundModelOverride(),
    baseline: stats.snapshotCount,
    ready: document.readyState,
  };
})()
