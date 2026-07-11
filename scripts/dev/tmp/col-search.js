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
  const raw = blocks.find(b => b.includes('SYSTEM_PROMPT_PREFIX')) || '';
  const lines = raw.split('\n');
  // col 65 → .addEventListener 的 '.' 或 'a' 在 64 附近；且行内有取元素调用
  const hits = lines.map((l, i) => ({ n: i + 1, l }))
    .filter(x => {
      const idx = x.l.indexOf('.addEventListener');
      if (idx < 0) return false;
      const reading = idx + 1; // 'addEventListener' 起点
      return Math.abs(reading - 64) <= 3 && /getElementById|querySelector|getElementsBy/.test(x.l);
    })
    .slice(0, 8)
    .map(x => ({ line: x.n, text: x.l.trim().slice(0, 150) }));
  return hits;
})()
