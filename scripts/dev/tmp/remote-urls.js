(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  // 所有 http(s) URL（去重、排除 CDN script 已知项、字体）
  const urls = [...new Set([...code.matchAll(/https?:\/\/[^\s"'`<>)\\]+/g)].map(x => x[0]))]
    .filter(u => !/fonts\.googleapis|fonts\.gstatic|w3\.org|jsdelivr|unpkg|github\.com|greasyfork/.test(u));
  // fetch( 调用附近的 URL（更聚焦）
  const fetchUrls = [...code.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)].map(x => x[1]).filter(u => /^http/.test(u));
  return { totalUrls: urls.length, urls: urls.slice(0, 20), fetchUrls: [...new Set(fetchUrls)].slice(0, 10) };
})()
