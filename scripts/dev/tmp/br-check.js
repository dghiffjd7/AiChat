(async () => {
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const idx = expanded.indexOf('新增生平');
  return {
    storedHasBrLiteral: content.includes('<br>'),
    expandedCtx: idx >= 0 ? JSON.stringify(expanded.slice(idx - 60, idx + 120)) : '(not found)',
    // 该行在正则展开产物（replaceString 2.7MB）里的原样
  };
})()
