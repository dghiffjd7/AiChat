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
  // MapRenderer.drawMap 里 forEach 的对象是谁
  const drawIdx = target.indexOf('drawMap');
  const seg = target.slice(drawIdx, drawIdx + 2500);
  const feIdx = seg.indexOf('.forEach');
  return {
    drawMapCtx: seg.slice(Math.max(0, feIdx - 260), feIdx + 60).replace(/\n\s*/g, ' ⏎ '),
  };
})()
