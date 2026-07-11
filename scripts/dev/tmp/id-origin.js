(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  const bridge = window.appBridge;
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  const expanded = bridge.regex?.apply?.(content, bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false }) || content;
  const code = String(mod.splitFencedCodeBlocks(expanded).find(p => p.type === 'code')?.code || '');
  const probe = (id) => {
    const idx = code.indexOf('id="' + id + '"');
    if (idx < 0) return { id, inDoc: false };
    // 判断该位置是否在 <script> 内
    const before = code.slice(0, idx);
    const opens = (before.match(/<script\b/gi) || []).length;
    const closes = (before.match(/<\/script>/gi) || []).length;
    return { id, inDoc: true, insideScript: opens > closes };
  };
  return ['import-text-image-presets-btn', 'vector-auto-save-toggle', 'biography-search-input'].map(probe);
})()
