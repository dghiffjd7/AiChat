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
  const raw = blocks.find(b => b.includes('SYSTEM_PROMPT_PREFIX')) || '';
  const defMatch = raw.match(/(?:const|let|var)\s+stackedHandContainer\s*=\s*([^\n;]{0,100})/);
  const doc = document.querySelector('iframe').contentDocument;
  const idMatch = defMatch ? String(defMatch[1]).match(/getElementById\(\s*['"]([^'"]+)['"]/) : null;
  const elId = idMatch ? idMatch[1] : null;
  return {
    def: defMatch ? defMatch[1].slice(0, 90) : '(not found)',
    elId,
    inDom: elId ? !!doc.getElementById(elId) : null,
    // 这个 id 的静态 HTML 在原文吗
    staticAt: elId ? code.indexOf('id="' + elId + '"') : -1,
  };
})()
