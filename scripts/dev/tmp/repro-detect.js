(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const parts = mod.splitFencedCodeBlocks(expanded);
  const codePart = parts.find(p => p.type === 'code');
  const code = String(codePart?.code || '');
  return {
    expandedLen: expanded.length,
    partsCount: parts.length,
    partTypes: parts.map(p => p.type + ':' + (p.lang || '')).slice(0, 6),
    codeLen: code.length,
    hasViewportVar: /var\(\s*--viewport-height/i.test(code),
    hasBodyOpen: /<body[\s>]/i.test(code),
    hasBodyClose: /<\/body>/i.test(code),
  };
})()
