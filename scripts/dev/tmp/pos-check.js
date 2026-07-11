(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  // 用真实 script 块范围判定
  const re = /<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/gi;
  const ranges = [];
  let m;
  while ((m = re.exec(code))) ranges.push([m.index, m.index + m[0].length]);
  const idIdx = code.indexOf('id="import-text-image-presets-btn"');
  const inScript = idIdx >= 0 && ranges.some(([a, b]) => idIdx >= a && idIdx < b);
  return {
    idHtmlAt: idIdx,
    inScriptBlock: inScript,
    ctx: idIdx >= 0 ? code.slice(idIdx - 120, idIdx + 60).replace(/\n\s*/g, ' ').slice(0, 200) : '(html form not found)',
    // iframe DOM 里它的父容器在吗
    parentInDom: (() => {
      const doc = document.querySelector('iframe').contentDocument;
      // 从 HTML 上下文找父 id 再查 DOM
      return null;
    })(),
  };
})()
