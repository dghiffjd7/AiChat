(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  window.__ps_rpc2 = [];
  const orig = scriptRuntime.processRpc.bind(scriptRuntime);
  scriptRuntime.processRpc = async (method, params) => {
    try {
      let brief = '';
      try { brief = JSON.stringify(params ?? '').slice(0, 260); } catch {}
      window.__ps_rpc2.push({ method: String(method || ''), brief, t: Date.now() });
      if (window.__ps_rpc2.length > 800) window.__ps_rpc2.shift();
    } catch {}
    return orig(method, params);
  };
  await scriptRuntime.restartWorker?.();
  await new Promise(r => setTimeout(r, 15000));
  const inj = scriptRuntime.scriptPromptInjections;
  const methods = {};
  window.__ps_rpc2.forEach(r => { methods[r.method] = (methods[r.method] || 0) + 1; });
  return {
    rpcCount: window.__ps_rpc2.length,
    methods,
    logs: window.__ps_rpc2.filter(r => r.method === 'log').map(r => r.brief.slice(0, 240)).slice(-30),
    promptRpcs: window.__ps_rpc2.filter(r => /prompt/i.test(r.method)).map(r => ({ m: r.method, b: r.brief.slice(0, 150) })),
    injSize: inj?.size,
  };
})()
