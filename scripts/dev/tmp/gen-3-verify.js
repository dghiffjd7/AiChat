(async () => {
  await new Promise(r => setTimeout(r, 3000));
  const messages = window.__lastReqMessages || [];
  const allText = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n---\n');
  const runtime = window.appBridge.scriptRuntime;
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  const logs = (window.__scriptAuditLog || []).slice(-12);
  return {
    payloadCaptured: messages.length,
    hasInjectedFormatRule: allText.includes('[对话渲染格式规范]') || allText.includes('对话渲染格式规范'),
    injectPosition: (() => { const i = messages.findIndex(m => String(m.content).includes('对话渲染格式规范')); return i >= 0 ? `${i}/${messages.length} role=${messages[i].role}` : 'not-found'; })(),
    replyReceived: msgs.filter(m => m.role === 'assistant').length,
    lastReplyHead: String(msgs.filter(m => m.role === 'assistant').at(-1)?.content || '').slice(0, 120),
    scriptLogs: logs.map(l => l.text.slice(0, 140)),
  };
})()
