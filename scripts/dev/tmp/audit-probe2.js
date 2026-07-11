(() => {
  const ps = window.appBridge?.presets || window.appBridge?.presetStore;
  const all = Object.getOwnPropertyNames(Object.getPrototypeOf(ps));
  const active = ps.getResolvedActive?.('openai') || ps.getActive?.('openai');
  const runtime = window.appBridge?.scriptRuntime || null;
  return {
    setters: all.filter(m => /set|activate|bind/i.test(m)),
    activeId: ps.getResolvedActiveId?.('openai') || ps.getActiveId?.('openai'),
    activeName: active?.name,
    runtimeFound: !!runtime,
    workerAlive: !!runtime?.worker,
    runtimeMethods: runtime ? Object.getOwnPropertyNames(Object.getPrototypeOf(runtime)).filter(m => /sync|dispatch|worker/i.test(m)) : null,
  };
})()
