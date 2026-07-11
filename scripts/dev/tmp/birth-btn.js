(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  // 找“选择出生地”按钮的静态 HTML/或生成处
  const positions = [];
  let i = -1;
  while ((i = code.indexOf('选择出生地', i + 1)) !== -1 && positions.length < 6) {
    positions.push({ at: i, ctx: code.slice(Math.max(0, i - 160), i + 60).replace(/\n\s*/g, ' ').slice(0, 220) });
  }
  return positions;
})()
