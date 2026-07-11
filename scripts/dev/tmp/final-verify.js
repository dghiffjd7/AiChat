(async () => {
  // toast + console 探针
  window.__toastTrace = [];
  const t = window.toastr;
  for (const level of ['warning', 'error', 'info', 'success']) {
    const orig = t[level]?.bind(t);
    if (orig) t[level] = (...args) => { window.__toastTrace.push({ level, msg: String(args[0]).slice(0, 80) }); return orig(...args); };
  }
  window.__errLog = [];
  for (const level of ['warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      window.__errLog.push(args.map(a => a instanceof Error ? `ERR<${a.message}>` : (typeof a === 'string' ? a : '')).join(' ').slice(0, 200));
      if (window.__errLog.length > 100) window.__errLog.shift();
      orig(...args);
    };
  }
  // 切 5 脚本预设（冷启动场景：reload 后首次）
  await window.appBridge.presets.setActive('openai', 'preset-openai-1782195413072-8a6ff1');
  await window.appBridge.scriptRuntime.syncScripts();
  await new Promise(r => setTimeout(r, 4000));
  // 发真实消息
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '三件套验证：请简短回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 25000));
  const chatStore = window.appBridge.debugUiRegistry.stores.chatStore;
  const msgs = chatStore.getMessages('脚本测试室') || [];
  return {
    sent: sent?.result?.ok, reason: sent?.result?.reason,
    assistantDelta: msgs.filter(m => m.role === 'assistant').length,
    toasts: window.__toastTrace,
    scriptErrs: window.__errLog.filter(l => /script|脚本|failed/i.test(l)).slice(-8),
  };
})()
