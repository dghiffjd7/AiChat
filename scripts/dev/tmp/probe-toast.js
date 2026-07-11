(async () => {
  window.__toastTrace = [];
  const t = window.toastr;
  if (t && !t.__probed) {
    for (const level of ['warning', 'error', 'info', 'success']) {
      const orig = t[level]?.bind(t);
      if (orig) t[level] = (...args) => { window.__toastTrace.push({ level, msg: String(args[0]).slice(0, 120) }); return orig(...args); };
    }
    t.__probed = true;
  }
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '探针二：请简短回复', triggerReply: true }, allow);
  await new Promise(r => setTimeout(r, 6000));
  return { sent: sent?.result?.ok, reason: sent?.result?.reason, toasts: window.__toastTrace };
})()
