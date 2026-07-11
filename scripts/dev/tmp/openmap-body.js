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
  const i = raw.indexOf('async function openMapManagement');
  return { body: raw.slice(i, i + 1600).replace(/\n\s{4,}/g, '\n ').slice(0, 1500) };
})()
