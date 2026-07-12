(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const before = JSON.parse(JSON.stringify(scriptRuntime.context || {}));
  await scriptRuntime.syncContext?.();
  await scriptRuntime.syncScripts?.();
  await new Promise(r => setTimeout(r, 3000));
  const after = JSON.parse(JSON.stringify(scriptRuntime.context || {}));
  // dispatch lifecycle like prior audit
  try { await scriptRuntime.dispatchEvent?.('app_ready', {}); } catch (e) { window.__ps_logs.push({ level: 'err', text: 'app_ready: ' + e.message }); }
  try { await scriptRuntime.dispatchEvent?.('chat_id_changed', { chatId: '脚本测试室' }); } catch (e) { window.__ps_logs.push({ level: 'err', text: 'chat_id_changed: ' + e.message }); }
  await new Promise(r => setTimeout(r, 6000));
  const inj = scriptRuntime.scriptPromptInjections;
  const injEntries = inj instanceof Map ? Array.from(inj.entries()).map(([k, v]) => ({
    k,
    inner: v instanceof Map ? Array.from(v.keys()) : (v && typeof v === 'object' ? Object.keys(v) : String(v)),
  })) : [];
  return {
    contextBefore: before,
    contextAfter: after,
    injSize: inj instanceof Map ? inj.size : -1,
    injEntries,
    logs: (window.__ps_logs || []).slice(-30),
  };
})()
