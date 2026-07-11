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
  while ((m = re.exec(code))) blocks.push({ body: m[1], attrs: code.slice(Math.max(0, m.index), m.index + 80) });
  const hits = blocks.map((b, i) => ({
    block: i,
    attrs: b.attrs.slice(0, 60),
    lines: b.body.split('\n').length,
    definesTarget: b.body.includes('import-text-image-presets-btn'),
    definesAsHtml: /id="import-text-image-presets-btn"/.test(b.body),
    listensTarget: /getElementById\(\s*['"]import-text-image-presets-btn/.test(b.body),
  }));
  return hits;
})()
