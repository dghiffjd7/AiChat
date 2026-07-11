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
  // 找 MapRenderer 类定义里的 drawMap 方法体
  const clsIdx = target.indexOf('class MapRenderer');
  const seg = target.slice(clsIdx, clsIdx + 9000);
  const dmIdx = seg.indexOf('drawMap(');
  const body = seg.slice(dmIdx, dmIdx + 900).replace(/\n\s*/g, ' ⏎ ');
  // 地图数据变量来源
  const dataRefs = [...target.matchAll(/(\w+)\.regions\b|WORLD_MAP_DATA|mapData\b/g)].slice(0, 5).map(x => x[0]);
  const wmIdx = target.indexOf('WORLD_MAP_DATA');
  return {
    drawMapBody: body.slice(0, 500),
    dataRefs: [...new Set(dataRefs)],
    worldMapDataCtx: wmIdx >= 0 ? target.slice(wmIdx - 80, wmIdx + 160).replace(/\n\s*/g, ' ⏎ ') : '(none)',
  };
})()
