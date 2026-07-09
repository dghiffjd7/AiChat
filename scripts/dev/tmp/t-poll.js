// 轮询女仆任务状态：返回最新 run 的状态、步骤摘要、探针、点击器日志、UI 卡顿
(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const stores = reg?.stores || {};
  const runStore = stores.agentRunStore;
  const runs = runStore?.listRuns?.() || runStore?.getRuns?.() || [];
  const list = Array.isArray(runs) ? runs : (runs?.runs || []);
  const latest = list.filter(r => (r?.createdAt || 0) >= (window.__testRunStartedAt || 0) - 5000)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || list[0];
  const steps = (latest?.steps || []).map(s => ({
    tool: s?.tool || s?.name,
    status: s?.status,
    err: s?.error ? String(s.error).slice(0, 120) : undefined,
    out: s?.output ? JSON.stringify(s.output).slice(0, 160) : undefined,
  }));
  const lag = window.__uiLagSamples || [];
  return {
    done: window.__testRunDone,
    elapsedMs: Date.now() - (window.__testRunStartedAt || Date.now()),
    run: latest ? { id: latest.id, status: latest.status, title: (latest.title || '').slice(0, 60), stepCount: steps.length } : null,
    steps: steps.slice(-8),
    loopProbe: (window.__maidLoopProbe || []).slice ? (window.__maidLoopProbe || []).slice(-4) : window.__maidLoopProbe,
    modelProbe: window.__maidModelProbe,
    clicks: (window.__testClickerLog || []).slice(-6),
    uiLagMax: lag.length ? Math.max(...lag) : null,
  };
})()
