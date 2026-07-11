(async () => {
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const idx = expanded.indexOf('--viewport-height');
  const idx2 = expanded.indexOf('viewport-height', idx + 1);
  const vhCount = (expanded.match(/\d+vh\b/g) || []).length;
  const minHs = (expanded.match(/min-height\s*:\s*[^;}]{0,60}/gi) || []).slice(0, 6);
  return {
    viewportHeightAt: idx,
    ctx: idx >= 0 ? expanded.slice(Math.max(0, idx - 80), idx + 60).replace(/\n/g, '\\n') : '(none)',
    vhUnitCount: vhCount,
    minHeightSamples: minHs,
  };
})()
