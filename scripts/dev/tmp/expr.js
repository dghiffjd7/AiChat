(() => {
  const reg = window.appBridge.debugUiRegistry;
  const display = reg.stores.maidConversationStore.getMemoryTableDisplayText();
  return {
    displayPreview: display.slice(0, 350),
    hasIndentation: /\n    /.test(display),
  };
})()
