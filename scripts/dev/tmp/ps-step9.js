(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const sid = '脚本测试室';
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const msgs = chatStore?.getMessages?.(sid) || [];
  const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant') || null;
  const results = {};
  try { results.chatChanged = await scriptRuntime.dispatchEvent('chat.changed', { sessionId: sid, chatId: sid }); } catch (e) { results.chatChanged = 'ERR ' + e.message; }
  await new Promise(r => setTimeout(r, 2500));
  if (lastAssistant) {
    try {
      results.afterReceive = await scriptRuntime.dispatchEvent('message.after_receive', {
        sessionId: sid,
        message: { id: lastAssistant.id, role: 'assistant', content: String(lastAssistant.content || '').slice(0, 500) },
      });
    } catch (e) { results.afterReceive = 'ERR ' + e.message; }
  }
  await new Promise(r => setTimeout(r, 4000));
  const inj = scriptRuntime.scriptPromptInjections;
  const detail = [];
  if (inj instanceof Map) {
    inj.forEach((v, k) => {
      const inner = v instanceof Map ? Array.from(v.entries()) : Object.entries(v || {});
      inner.forEach(([key, block]) => detail.push({
        session: String(k),
        key: String(key).slice(0, 50),
        position: block?.position || '',
        len: String(block?.content || block?.text || '').length,
      }));
    });
  }
  const wire = (window.__ps_wire || []).slice(-15).map(w => `${w.dir}:${w.type}`);
  return { dispatched: Object.keys(results), injSize: inj?.size, detail, recentWire: wire, msgCount: msgs.length };
})()
