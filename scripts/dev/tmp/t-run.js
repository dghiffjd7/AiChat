// 启动一次女仆任务（不等待完成），把 promise 挂到 window.__testRun
(async () => {
  const reg = window.appBridge?.debugUiRegistry;
  const actions = reg?.actions || {};
  const prompt = window.__nextTestPrompt;
  if (!prompt) return { ok: false, reason: 'no __nextTestPrompt set' };
  if (!actions.runMaidAssistantPrompt) return { ok: false, reason: 'no runMaidAssistantPrompt', actions: Object.keys(actions) };
  window.__testRunDone = null;
  window.__testRunStartedAt = Date.now();
  window.__testRun = Promise.resolve(actions.runMaidAssistantPrompt({ input: prompt }))
    .then(r => { window.__testRunDone = { ok: true, result: r }; })
    .catch(e => { window.__testRunDone = { ok: false, error: String(e && e.message || e) }; });
  return { ok: true, started: true, prompt };
})()
