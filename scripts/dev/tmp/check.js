(() => {
  const reg = window.appBridge.debugUiRegistry;
  const run = reg.stores.agentRunStore.buildListView({ kind: 'maid_assistant', limit: 1 }).runs[0];
  const confirmVisible = Array.from(document.querySelectorAll('.app-confirm-btn')).some(el => el.offsetParent !== null);
  return { status: run?.status, steps: run?.stepCount, confirmVisible, agoSec: Math.round((Date.now() - (run?.updatedAt || 0)) / 1000) };
})()
