(async () => {
  const bridge = window.appBridge;
  const scriptStore = bridge.getScriptStore?.();
  const bucket = scriptStore.state.preset?.['preset-openai-1782195413072-8a6ff1'];
  const out = [];
  (bucket?.scripts || []).forEach((s) => {
    const content = String(s.content || '');
    ['setExtensionPrompt', 'injectPrompts', 'uninjectPrompts'].forEach((api) => {
      let idx = 0;
      while ((idx = content.indexOf(api, idx)) !== -1) {
        out.push({
          script: String(s.name).slice(0, 24),
          api,
          at: idx,
          around: content.slice(Math.max(0, idx - 180), idx + 120).replace(/\s+/g, ' '),
        });
        idx += api.length;
        if (out.length > 20) break;
      }
    });
  });
  return out;
})()
