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
  const assigns = [...target.matchAll(/_mapData\s*=\s*([^;\n]{0,90})/g)].slice(0, 6).map(x => x[1]);
  // mapData 参数来源（new MapRenderer(...) 的实参）
  const ctors = [...target.matchAll(/new MapRenderer\s*\(([^)]{0,120})/g)].slice(0, 4).map(x => x[1].replace(/\n\s*/g, ' '));
  // getMapData / MAP_DATA 定义
  const mdDef = [...target.matchAll(/(?:const|let|var|function)\s+(getMapData|MAP_DATA|worldMapData|mapData)\b[^\n]{0,80}/g)].slice(0, 5).map(x => x[0].replace(/\n/g, ' '));
  return { assigns, ctors, mdDef };
})()
