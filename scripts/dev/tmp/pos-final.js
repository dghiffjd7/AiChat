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
  const errAt = raw.indexOf("interactionChoicePanel.querySelector('.modal-close-btn')");
  const mapCtorAt = raw.indexOf("new MapRenderer(document.getElementById('world-map-canvas'");
  const mapCtorAt2 = raw.indexOf('world-map-canvas');
  const dclPositions = [...raw.matchAll(/addEventListener\(\s*['"]DOMContentLoaded['"]/g)].map(x => x.index);
  const owner = pos => dclPositions.filter(p => p < pos).length;
  // MapRenderer 实例化所有位置
  const ctors = [...raw.matchAll(/new MapRenderer\s*\(/g)].map(x => ({ at: x.index, listener: owner(x.index), afterErr: x.index > errAt }));
  return { errAt, errListener: owner(errAt), ctors };
})()
