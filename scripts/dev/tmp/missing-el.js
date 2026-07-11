(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = []; let m;
  while ((m = re.exec(code))) blocks.push(m[1]);
  const target = blocks.find(b => b.includes('SYSTEM_PROMPT_PREFIX')) || '';
  // 收集 getElementById('x').addEventListener 模式的 id
  const ids = [...target.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)\s*[.\n]?\s*addEventListener/g)].map(x => x[1]);
  const uniqueIds = [...new Set(ids)];
  const doc = document.querySelector('iframe').contentDocument;
  const missing = uniqueIds.filter(id => !doc.getElementById(id));
  return { totalListenerIds: uniqueIds.length, missing: missing.slice(0, 15) };
})()
