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
  const dclRegs = [...raw.matchAll(/addEventListener\(\s*['"]DOMContentLoaded['"]/g)].length;
  // 出错行(interactionChoicePanel...)与地图初始化(setMapData/new MapRenderer)的相对位置
  const errAt = raw.indexOf("interactionChoicePanel.querySelector('.modal-close-btn')");
  const mapInitAt = raw.indexOf("new MapRenderer(document.getElementById('world-map-canvas'");
  // 它们各自属于哪个 DOMContentLoaded 注册（按注册位置粗判）
  const dclPositions = [...raw.matchAll(/addEventListener\(\s*['"]DOMContentLoaded['"]/g)].map(x => x.index);
  const owner = (pos) => dclPositions.filter(p => p < pos).length;
  return {
    dclListenerCount: dclRegs,
    errAt, mapInitAt,
    errAfterListenerN: owner(errAt),
    mapAfterListenerN: owner(mapInitAt),
    sameListener: owner(errAt) === owner(mapInitAt),
    mapBeforeErr: mapInitAt < errAt,
  };
})()
