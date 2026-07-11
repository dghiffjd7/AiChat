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
  const def = raw.match(/(?:const|let|var)\s+interactionChoicePanel\s*=\s*([^\n;]{0,110})/);
  const doc = document.querySelector('iframe').contentDocument;
  const idm = def ? String(def[1]).match(/getElementById\(\s*['"]([^'"]+)['"]/) : null;
  const el = idm ? doc.getElementById(idm[1]) : null;
  return {
    def: def ? def[1].slice(0, 100) : '(none)',
    id: idm ? idm[1] : null,
    inDom: !!el,
    isPhantom: el ? el.dataset?.chatappPhantom === '1' : null,
    hasCloseBtn: el ? !!el.querySelector?.('.modal-close-btn') : null,
    childCount: el ? el.children.length : null,
    // 原文该元素静态 HTML 里有没有 modal-close-btn
    staticCtx: (() => {
      if (!idm) return '';
      const i = code.indexOf('id="' + idm[1] + '"');
      return i >= 0 ? code.slice(i, i + 400).replace(/\n\s*/g, ' ').slice(0, 280) : '(no static html)';
    })(),
  };
})()
