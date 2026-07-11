(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  const re = /<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/gi;
  const ranges = []; let m;
  while ((m = re.exec(code))) ranges.push([m.index, m.index + m[0].length]);
  const inScript = idx => ranges.some(([a, b]) => idx >= a && idx < b);
  const doc = document.querySelector('iframe').contentDocument;
  const ids = [...code.matchAll(/id="([^"]+)"/g)].filter(x => !inScript(x.index)).map(x => ({ id: x[1], at: x.index }));
  const missing = ids.filter(x => !doc.getElementById(x.id));
  return missing.map(x => ({
    id: x.id, at: x.at,
    ctx: code.slice(Math.max(0, x.at - 100), x.at + 50).replace(/\n\s*/g, ' ').slice(0, 150),
  }));
})()
