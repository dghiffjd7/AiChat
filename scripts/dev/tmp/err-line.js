(async () => {
  // 重建 scriptDoc 太复杂——直接用消息内容重跑渲染管线的转换，定位第 10544 行
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const parts = mod.splitFencedCodeBlocks(expanded);
  const code = String(parts.find(p => p.type === 'code')?.code || '');
  // 面板原文的行 10544 附近（scriptDoc 有注入头，行号有偏移——取原文相邻范围找 vh 转换痕迹）
  const lines = code.split('\n');
  return {
    totalLines: lines.length,
    // 搜可疑转换产物：JS 里 calc(var(--viewport-height...（转换只该发生在 CSS/样式字符串，出现在非样式 JS 处即嫌疑）
    suspicious: lines.map((l, i) => ({ i: i + 1, l })).filter(x => /calc\(var\(--viewport-height/.test(x.l) && !/style|height|css/i.test(x.l.slice(0, 60))).slice(0, 5).map(x => ({ line: x.i, text: x.l.trim().slice(0, 140) })),
    around10500: lines.slice(10480, 10560).map((l, i) => ({ n: 10481 + i, hasVh: /vh\b/.test(l), hasVar: /--viewport-height/.test(l) })).filter(x => x.hasVh || x.hasVar).slice(0, 8),
  };
})()
