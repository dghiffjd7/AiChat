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
  // 所有出现点
  const positions = [];
  let i = -1;
  while ((i = target.indexOf('import-text-image-presets-btn', i + 1)) !== -1 && positions.length < 6) positions.push(i);
  return positions.map(p => ({
    at: p,
    ctx: target.slice(Math.max(0, p - 150), p + 80).replace(/\n\s*/g, ' ').slice(0, 230),
  }));
})()
