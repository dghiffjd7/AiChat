(async () => {
  const cancelled = window.appBridge.cancelCurrentGeneration?.('test-unlock');
  // 手动跑一次 prompt.before_build 看 worker dispatch 是否超时
  const runtime = window.appBridge.scriptRuntime;
  const t0 = Date.now();
  let hookResult = null, hookErr = null;
  try {
    hookResult = await runtime.dispatchEvent('prompt.before_build', { input: 'test', context: { session: { id: '脚本测试室' } }, sessionId: '脚本测试室' });
  } catch (e) { hookErr = String(e?.message || e); }
  return {
    cancelled,
    hookMs: Date.now() - t0,
    hookOk: !!hookResult && !hookErr,
    hookErr,
    workerAlive: !!runtime.worker,
  };
})()
