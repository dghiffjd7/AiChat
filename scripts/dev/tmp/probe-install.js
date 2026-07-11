(async () => {
  const runtime = window.appBridge.scriptRuntime;
  window.__dispatchTrace = [];
  window.__restartTrace = [];
  if (!runtime.__probed) {
    const origCall = runtime.callWorker.bind(runtime);
    runtime.callWorker = (type, payload, timeoutMs) => {
      const rec = { type, event: payload?.event || '', t0: Date.now(), status: 'pending' };
      window.__dispatchTrace.push(rec);
      if (window.__dispatchTrace.length > 200) window.__dispatchTrace.shift();
      return origCall(type, payload, timeoutMs).then(
        (r) => { rec.status = 'ok'; rec.ms = Date.now() - rec.t0; return r; },
        (e) => { rec.status = 'reject'; rec.ms = Date.now() - rec.t0; rec.err = String(e?.message || e).slice(0, 80); throw e; },
      );
    };
    const origRestart = runtime.restartWorker.bind(runtime);
    runtime.restartWorker = (reason) => {
      window.__restartTrace.push({ reason: String(reason || ''), at: Date.now(), pendingCount: runtime.pending.size });
      return origRestart(reason);
    };
    runtime.__probed = true;
  }
  // 切 5 脚本预设
  await window.appBridge.presets.setActive('openai', 'preset-openai-1782195413072-8a6ff1');
  await runtime.syncScripts();
  await new Promise(r => setTimeout(r, 3000));
  return { probed: true, preset: window.appBridge.presets.getActiveId('openai') };
})()
