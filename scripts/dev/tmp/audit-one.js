(async () => {
  const presetId = window.__auditPresetId;
  if (!presetId) return { err: 'set window.__auditPresetId first' };
  const ps = window.appBridge?.presets;
  const runtime = window.appBridge?.scriptRuntime;
  const logStart = (window.__scriptAuditLog || []).length;
  const t0 = Date.now();
  try { await ps.setActive('openai', presetId); } catch (e) { return { err: 'setActive: ' + e.message }; }
  try { await runtime.syncScripts(); } catch (e) {
    window.__scriptAuditLog.push({ level: 'sync-error', text: String(e?.message || e).slice(0, 300), at: Date.now() });
  }
  await new Promise(r => setTimeout(r, 4000));
  const uiRoot = document.querySelector('#script-ui-root, .script-ui-root, [data-script-ui]');
  const logs = (window.__scriptAuditLog || []).slice(logStart);
  return {
    presetId,
    workerAlive: !!runtime.worker,
    elapsedMs: Date.now() - t0,
    listenerCount: runtime.listeners ? Object.keys(runtime.listeners).length : (runtime.listenerCounts ? Object.keys(runtime.listenerCounts).length : null),
    uiRootFound: !!uiRoot,
    uiRootChildren: uiRoot ? uiRoot.children.length : 0,
    uiRootHtmlSample: uiRoot ? uiRoot.innerHTML.slice(0, 150) : '',
    newLogs: logs.slice(0, 25),
  };
})()
