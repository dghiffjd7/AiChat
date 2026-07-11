(() => {
  const bridge = window.appBridge;
  const s = bridge.getRegexStore?.().getState?.();
  const set = Object.values(s?.local?.sets || {}).find(x => /凡人修仙/.test(x?.name || ''));
  const rule = (set?.rules || []).find(r => String(r.replaceString || '').length > 1000000);
  const rep = String(rule?.replaceString || '');
  const stores = bridge.debugUiRegistry.stores;
  const msgs = stores.chatStore.getMessages(stores.chatStore.getCurrent()) || [];
  const content = String((msgs.find(m => m.role === 'assistant') || msgs[0])?.content || '');
  return {
    replaceHead: rep.slice(0, 150),
    replaceHasFence: (rep.match(/```/g) || []).length,
    replaceHasScript: /<script/i.test(rep),
    contentFences: (content.match(/```/g) || []).length,
    contentLen: content.length,
    contentLucklyCount: (content.match(/lucklyjkop/g) || []).length,
    // 渲染层应用正则后的文本抽查
    appliedSample: (() => {
      try {
        const out = bridge.applyOutputDisplayRegex?.(content.slice(0, 3000)) ?? bridge.regex?.apply?.(content.slice(0, 3000), bridge.getRegexContext?.(), 2, { isMarkdown: true, isPrompt: false });
        return { len: String(out).length, replaced: !String(out).includes('lucklyjkop') };
      } catch (e) { return String(e).slice(0, 100); }
    })(),
  };
})()
