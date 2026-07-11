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
  const declIdx = target.indexOf('const DEFAULT_WORLD_MAP_DATA');
  const seg = target.slice(declIdx, declIdx + 30000);
  return {
    hasMainRegions: seg.indexOf('main_regions'),
    fieldsNear: [...seg.matchAll(/^\s{2,6}(\w+):/gm)].slice(0, 12).map(x => x[1]),
    // MapRenderer 拿数据的 setter
    setMapData: (() => { const i = target.indexOf('setMapData'); return i >= 0 ? target.slice(i, i + 260).replace(/\n\s*/g, ' ') : '(none)'; })(),
  };
})()
