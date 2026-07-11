(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  const re2 = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = []; let m;
  while ((m = re2.exec(code))) blocks.push(m[1]);
  const raw = blocks.find(b => b.includes('SYSTEM_PROMPT_PREFIX')) || '';
  // map-list 容器填充代码
  const refs = [];
  let i = -1;
  while ((i = raw.indexOf('map-list', i + 1)) !== -1 && refs.length < 8) {
    refs.push({ at: i, ctx: raw.slice(Math.max(0, i - 130), i + 90).replace(/\n\s*/g, ' ').slice(0, 200) });
  }
  return refs;
})()
