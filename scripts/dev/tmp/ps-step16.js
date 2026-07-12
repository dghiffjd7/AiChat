(async () => {
  const bridge = window.appBridge;
  const scriptStore = bridge.getScriptStore?.();
  const bucket = scriptStore.state.preset?.['preset-openai-1782195413072-8a6ff1'];
  const s = (bucket?.scripts || []).find(x => /对话渲染/.test(x.name));
  const content = String(s?.content || '');
  const importRe = /(^|[^\w$])import\s*(?:['"]|\{|\*|[\w$]+\s+from)/mg;
  const exportRe = /(^|[^\w$])export\s+/mg;
  const hits = [];
  let m;
  while ((m = importRe.exec(content)) && hits.length < 8) {
    hits.push({ re: 'import', at: m.index, around: content.slice(Math.max(0, m.index - 80), m.index + 100).replace(/\s+/g, ' ') });
  }
  while ((m = exportRe.exec(content)) && hits.length < 16) {
    hits.push({ re: 'export', at: m.index, around: content.slice(Math.max(0, m.index - 80), m.index + 100).replace(/\s+/g, ' ') });
  }
  return hits;
})()
