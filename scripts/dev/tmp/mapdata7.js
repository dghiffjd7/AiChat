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
  const decls = [...target.matchAll(/(?:const|let|var)\s+WORLD_MAP_DATA\s*=?[^\n]{0,100}|WORLD_MAP_DATA\s*=\s*[^\n=][^\n]{0,100}/g)].slice(0, 8).map(x => x[0].replace(/\n/g, ' ').slice(0, 130));
  const win = document.querySelector('iframe').contentWindow;
  let live = 'n/a';
  try { live = win.eval('typeof WORLD_MAP_DATA !== "undefined" ? JSON.stringify(Object.keys(WORLD_MAP_DATA || {})) : "undeclared-or-tdz"'); } catch (e) { live = 'ERR:' + String(e?.message || e).slice(0, 80); }
  return { decls, liveKeys: live };
})()
