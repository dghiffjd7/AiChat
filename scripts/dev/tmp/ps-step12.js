(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  if (!window.__ps_rpc) {
    window.__ps_rpc = [];
    const origRpc = scriptRuntime.processRpc?.bind(scriptRuntime) || scriptRuntime.handleRpc?.bind(scriptRuntime);
    const target = scriptRuntime.processRpc ? 'processRpc' : 'handleRpc';
    const orig = scriptRuntime[target].bind(scriptRuntime);
    scriptRuntime[target] = async (payload, ...rest) => {
      try {
        const method = payload?.method || payload?.type || '';
        let brief = '';
        try { brief = JSON.stringify(payload?.params ?? payload?.args ?? '').slice(0, 220); } catch {}
        window.__ps_rpc.push({ method: String(method), brief, t: Date.now() });
        if (window.__ps_rpc.length > 500) window.__ps_rpc.shift();
      } catch {}
      return orig(payload, ...rest);
    };
  }
  await scriptRuntime.restartWorker?.();
  await new Promise(r => setTimeout(r, 12000));
  const inj = scriptRuntime.scriptPromptInjections;
  return {
    rpcCount: window.__ps_rpc.length,
    rpcMethods: window.__ps_rpc.map(r => r.method).reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {}),
    logs: window.__ps_rpc.filter(r => r.method === 'log').map(r => r.brief.slice(0, 200)).slice(-25),
    injSize: inj?.size,
  };
})()
