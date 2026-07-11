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
  // DEFAULT_WORLD_MAP_DATA 定义在哪（脚本内 or 外部加载）
  const defIdx = target.indexOf('DEFAULT_WORLD_MAP_DATA');
  const defCtx = defIdx >= 0 ? target.slice(defIdx - 60, defIdx + 200).replace(/\n\s*/g, ' ') : '(none)';
  const defCount = (target.match(/DEFAULT_WORLD_MAP_DATA/g) || []).length;
  const declMatch = target.match(/(?:const|let|var)\s+DEFAULT_WORLD_MAP_DATA\s*=\s*([^\n]{0,120})/);
  // 真机现值
  const win = document.querySelector('iframe').contentWindow;
  return {
    defCount,
    decl: declMatch ? declMatch[1] : '(no decl found)',
    defCtx: defCtx.slice(0, 220),
    liveValue: (() => { try { return typeof win.DEFAULT_WORLD_MAP_DATA; } catch { return 'err'; } })(),
  };
})()
