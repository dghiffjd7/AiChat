(async () => {
  // 精确重建 blob 内容：拿 script#8 原文 → normalizeExecutableScriptSource 等价处理 → 51155 行
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
  // 等价 normalize（与 iframe-host 相同逻辑，含新的 stripLineComment）
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const normalized = [];
  let previousNonEmpty = '';
  const riskyStartRe = /^[([`]/;
  const safePrevEndRe = /(?:[;{[(,:?=><!&|/^~]|(?:\+\+|--|[+\-*%]))\s*$/;
  const keywordPrevRe = /\b(?:return|throw|case|delete|typeof|void|new|in|instanceof|await|yield)\s*$/;
  const stripLineComment = (line) => { const i = String(line || '').indexOf('//'); return i >= 0 ? String(line || '').slice(0, i) : String(line || ''); };
  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (trimmed && riskyStartRe.test(trimmed) && previousNonEmpty) {
      const prev = stripLineComment(previousNonEmpty).replace(/\s+$/, '');
      if (prev && !safePrevEndRe.test(prev) && !keywordPrevRe.test(prev)) normalized.push(';');
    }
    normalized.push(line);
    if (trimmed) previousNonEmpty = line;
  });
  const out = normalized;
  return {
    totalLines: out.length,
    around: [51151, 51152, 51153, 51154, 51155, 51156].map(n => `${n}: ${String(out[n - 1] || '').trim().slice(0, 140)}`),
  };
})()
