(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  // DOMParser 阶段验证
  const parsed = new DOMParser().parseFromString(code, 'text/html');
  const inParsed = ['knowledge-search-api-url', 'knowledge-search-api-key', 'knowledge-search-api-model', 'fetch-knowledge-search-models-btn']
    .map(id => ({ id, inParsed: !!parsed.getElementById(id) }));
  // 该段之前最近的 select 开闭统计（前 5000 字符窗口）
  const segStart = 2644600;
  const before = code.slice(Math.max(0, segStart - 8000), segStart);
  const opens = [...before.matchAll(/<select\b[^>]*>/gi)].length;
  const closes = [...before.matchAll(/<\/select>/gi)].length;
  const lastOpen = before.lastIndexOf('<select');
  const lastOpenCtx = lastOpen >= 0 ? before.slice(lastOpen, lastOpen + 140).replace(/\n\s*/g, ' ') : '(none)';
  return { inParsed, selectOpens: opens, selectCloses: closes, lastOpenCtx };
})()
