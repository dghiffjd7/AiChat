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
  // drawMap 方法定义（带方法体开头到第一个 forEach）
  const defs = [...target.matchAll(/drawMap\s*\(\s*\)\s*\{/g)].map(x => x.index);
  const out = defs.slice(0, 2).map(idx => {
    const seg = target.slice(idx, idx + 1600);
    const fe = seg.indexOf('.forEach');
    return { at: idx, head: seg.slice(0, 120).replace(/\n\s*/g, ' '), feCtx: fe >= 0 ? seg.slice(Math.max(0, fe - 180), fe + 50).replace(/\n\s*/g, ' ') : '(no forEach in first 1600)' };
  });
  return out;
})()
