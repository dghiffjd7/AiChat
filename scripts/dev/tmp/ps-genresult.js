(async () => {
  const bridge = window.appBridge;
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const sid = '脚本测试室';
  const msgs = chatStore.getMessages(sid) || [];
  const gen = window.__ps_gen || {};
  const rpcSummary = {};
  (gen.rpc || []).forEach(r => { rpcSummary[r.m] = (rpcSummary[r.m] || 0) + 1; });
  const lastRaw = chatStore.getLastRawResponse?.(sid);
  const newMsgs = msgs.slice(gen.msgCountBefore || 0).map(m => ({
    role: m.role,
    type: m.type || 'text',
    len: String(m.content || '').length,
    head: String(m.content || '').slice(0, 120),
    hasBubble: String(m.content || '').includes('@bubble:'),
  }));
  return {
    msgCountNow: msgs.length,
    newMsgs,
    toasts: gen.toasts,
    rpcSummary,
    promptRpcs: (gen.rpc || []).filter(r => /prompt/i.test(r.m)).map(r => r.m + ' ' + r.b.slice(0, 80)),
    lastRawLen: String(lastRaw || '').length,
    lastRawHead: String(lastRaw || '').slice(0, 300),
  };
})()
