(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const inj = scriptRuntime.scriptPromptInjections;
  const injDetail = inj instanceof Map ? Array.from(inj.entries()).map(([k, v]) => ({
    scope: String(k),
    keys: v instanceof Map ? Array.from(v.keys()) : (v && typeof v === 'object' ? Object.keys(v) : String(v).slice(0, 40)),
  })) : null;
  const sidInj = (scriptRuntime.getScriptPromptInjections?.('脚本测试室') || []).map(b => ({
    key: b.key || '',
    position: b.position || '',
    len: String(b.content || b.text || '').length,
  }));
  return {
    injSize: inj instanceof Map ? inj.size : -1,
    injDetail,
    sidInjCount: sidInj.length,
    sidInj,
    logs: (window.__ps_logs || []).slice(-30).map(l => `${l.level}: ${l.text.slice(0, 160)}`),
  };
})()
