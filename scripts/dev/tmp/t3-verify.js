(() => {
  const r = window.__testRunDone?.result;
  const steps = (r?.steps || []).map(s => ({
    tool: s.toolName, status: s.status,
    out: JSON.stringify(s.output || {}).slice(0, 400),
  }));
  const reg = window.appBridge?.debugUiRegistry;
  const ws = reg?.stores?.worldStore || reg?.stores?.worldbookStore;
  let entries = null;
  try {
    const books = ws?.listWorldbooks?.() || ws?.list?.() || [];
    const alice = (Array.isArray(books) ? books : []).find(b => /爱丽丝/.test(b?.name || ''));
    entries = alice ? (alice.entries || []).map(e => ({ title: e.title || e.comment, len: (e.content || '').length })) : { books: (Array.isArray(books) ? books : []).map(b => b?.name).slice(0, 10) };
  } catch (e) { entries = String(e); }
  return { steps, entries, clicks: (window.__testClickerLog || []).slice(-4) };
})()
