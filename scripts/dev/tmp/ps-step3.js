(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const keys = Object.keys(scriptRuntime || {});
  const state = {};
  keys.forEach(k => {
    const v = scriptRuntime[k];
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) state[k] = v;
    else if (v instanceof Map) state[k] = `Map(${v.size})`;
    else if (Array.isArray(v)) state[k] = `Array(${v.length})`;
    else if (typeof v === 'object') state[k] = `obj{${Object.keys(v).slice(0, 6).join(',')}}`;
    else state[k] = typeof v;
  });
  let injectionsRaw = null;
  for (const k of keys) {
    if (/inject/i.test(k)) {
      const v = scriptRuntime[k];
      injectionsRaw = { key: k, type: v instanceof Map ? `Map(${v.size})` : typeof v };
      if (v instanceof Map) injectionsRaw.entries = Array.from(v.keys()).slice(0, 10);
      else if (v && typeof v === 'object') injectionsRaw.entries = Object.keys(v).slice(0, 10);
    }
  }
  return { instanceState: state, injectionsRaw };
})()
