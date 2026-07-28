(async () => {
  const actions = window.appBridge.debugUiRegistry.actions;
  const prompt = window.__mtPrompt;
  if (!prompt) return { ok: false, reason: 'no __mtPrompt' };
  window.__mtDone = null;
  window.__mtStartedAt = Date.now();
  window.__mtRun = Promise.resolve(actions.runMaidAssistantPrompt({ input: prompt }))
    .then(r => { window.__mtDone = { ok: true, result: r }; })
    .catch(e => { window.__mtDone = { ok: false, error: String(e && e.message || e).slice(0, 300) }; });
  return { started: true, prompt: prompt.slice(0, 60) };
})()
