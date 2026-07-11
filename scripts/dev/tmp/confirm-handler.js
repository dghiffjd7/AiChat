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
  // 确认按钮 id（HTML 里）
  const btnHtml = code.slice(code.indexOf('确认并选择出生地') - 400, code.indexOf('确认并选择出生地') + 50);
  const idm = btnHtml.match(/id="([^"]*)"[^>]*>\s*<i[^>]*>\s*<\/i>\s*确认并选择出生地/);
  const btnId = idm ? idm[1] : (btnHtml.match(/id="([^"]+)"/g) || []).slice(-1)[0];
  // 该 id 的绑定代码
  const bindIdx = raw.indexOf(String(btnId).replace(/id="|"/g, ''));
  const seg = bindIdx >= 0 ? raw.slice(bindIdx, bindIdx + 1200).replace(/\n\s{2,}/g, '\n ').slice(0, 1100) : '(not found)';
  return { btnId, handlerSeg: seg };
})()
