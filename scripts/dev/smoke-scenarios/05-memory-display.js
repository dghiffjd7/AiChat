(async () => {
  const store = window.appBridge.debugUiRegistry.stores.maidConversationStore;
  const display = String(store.getMemoryTableDisplayText?.() || '');
  const compact = String(store.getMemoryTableText?.() || '');
  const empty = display.includes('尚未生成');
  const pass = empty || (/\n {4}/.test(display) && compact.startsWith('- '));
  return { pass, detail: { empty, displayPreview: display.slice(0, 80), compactPreview: compact.slice(0, 60) } };
})()
