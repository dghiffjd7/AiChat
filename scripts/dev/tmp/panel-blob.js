(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  const lines = code.split('\n');
  const blobLines = lines.map((l, i) => ({ n: i + 1, l })).filter(x => /new Blob|createObjectURL|new Worker/.test(x.l)).slice(0, 10);
  return {
    blobUsages: blobLines.map(x => ({ line: x.n, text: x.l.trim().slice(0, 160) })),
  };
})()
