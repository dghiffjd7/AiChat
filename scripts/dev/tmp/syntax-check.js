(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  // 复刻 processAllVhUnits（从源码逻辑）
  const viewportHeight = window.innerHeight;
  const convertVhValue = (value) => String(value || '').replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
    const numValue = parseFloat(num);
    if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
    return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
  });
  let processed = code;
  processed = processed.replace(/((?:document\.body\.style\.|\.style\.)(?:height|minHeight|maxHeight)\s*=\s*['"`])([^'"`]*?)(['"`])/g,
    (match, prefix, value, suffix) => String(value || '').includes('vh') ? prefix + convertVhValue(value) + suffix : match);
  processed = processed.replace(/(setProperty\s*\(\s*['"](?:height|min-height|max-height)['"]\s*,\s*['"`])([^'"`]*?vh[^'"`]*?)(['"`])/g,
    (m2, p, v, sfx) => p + convertVhValue(v) + sfx);
  // 还有 CSS 内的转换等——先只查 script 块
  const scriptBlocks = [];
  const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(processed))) scriptBlocks.push(m[1]);
  const results = [];
  scriptBlocks.forEach((src, i) => {
    try { new Function(src); } catch (e) {
      // 二分定位行
      const lines = src.split('\n');
      results.push({ block: i, lines: lines.length, err: String(e.message).slice(0, 120) });
    }
  });
  // 对照：未转换的原文有没有同样错误
  const rawBlocks = [];
  while ((m = re.exec(code))) rawBlocks.push(m[1]);
  re.lastIndex = 0;
  const rawErrs = [];
  rawBlocks.forEach((src, i) => { try { new Function(src); } catch (e) { rawErrs.push({ block: i, err: String(e.message).slice(0, 120) }); } });
  return { scriptBlockCount: scriptBlocks.length, convertedErrors: results, rawErrors: rawErrs };
})()
