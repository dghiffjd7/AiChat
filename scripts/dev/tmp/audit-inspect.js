(async () => {
  const runtime = window.appBridge?.scriptRuntime;
  const root = document.getElementById('chatapp-script-virtual-ui-root');
  const shadow = root?.shadowRoot;
  // 触发常见事件让脚本干活：app ready / chat changed / message received
  const events = ['app_ready', 'chat_id_changed', 'message_received', 'generation_ended'];
  const results = {};
  for (const ev of events) {
    try { results[ev] = JSON.stringify(await runtime.dispatchEvent(ev, { test: true })).slice(0, 80); }
    catch (e) { results[ev] = 'ERR: ' + String(e?.message || e).slice(0, 100); }
  }
  await new Promise(r => setTimeout(r, 2500));
  const logs = (window.__scriptAuditLog || []).slice(-15);
  return {
    workerAlive: !!runtime.worker,
    uiRootExists: !!root,
    shadowChildren: shadow ? shadow.children.length : null,
    shadowSample: shadow ? String(shadow.innerHTML || '').slice(0, 200) : '',
    dispatchResults: results,
    recentLogs: logs,
  };
})()
