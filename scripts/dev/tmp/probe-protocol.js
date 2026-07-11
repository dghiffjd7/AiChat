(() => {
  const ps = window.appBridge.presets;
  const state = ps.getState();
  const summarize = (id) => {
    const p = state?.presets?.openai?.[id];
    if (!p) return null;
    const prompts = Array.isArray(p.prompts) ? p.prompts : [];
    const text = JSON.stringify(prompts);
    return {
      id, name: p.name, promptCount: prompts.length,
      hasDialogueTag: /dialogue|对话标签|<D>|\[D\]|消息协议|私聊格式/i.test(text),
      promptNames: prompts.slice(0, 12).map(x => String(x?.name || '').slice(0, 24)),
    };
  };
  return {
    default: summarize('Default'),
    tavern: summarize('preset-openai-1782195413072-8a6ff1'),
  };
})()
