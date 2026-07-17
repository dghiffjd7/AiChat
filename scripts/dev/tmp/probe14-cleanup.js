(() => {
  const s = window.appBridge?.debugUiRegistry?.stores?.agentRunStore;
  if (!s?.state?.runs) return { error: 'no store' };
  const id = 'run:146cc435-52f3-45a4-9b72-316eee3863fe';
  const had = Boolean(s.state.runs[id]);
  delete s.state.runs[id];
  if (Array.isArray(s.state.events)) {
    s.state.events = s.state.events.filter(e => e.runId !== id);
  }
  s.flush?.();
  return { had, remains: Boolean(s.state.runs[id]) };
})()
