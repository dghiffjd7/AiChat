(async () => {
  const runtime = window.appBridge?.scriptRuntime;
  // 触发生成前事件，让格式类脚本注册注入
  try { await runtime.dispatchEvent('generation_started', {}); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  const sid = runtime?.context?.sessionId || '';
  const blocks = runtime?.getScriptPromptInjections?.(sid) || [];
  const logs = (window.__scriptAuditLog || []).slice(-8);
  return {
    sessionId: sid,
    injectionCount: blocks.length,
    blocks: blocks.map(b => ({ role: b.role, position: b.position, depth: b.depth, size: b.content.length, head: b.content.slice(0, 60) })),
    recentLogs: logs.map(l => l.text.slice(0, 160)),
  };
})()
