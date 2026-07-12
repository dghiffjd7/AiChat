(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  // instrument both directions
  if (!window.__ps_wire) {
    window.__ps_wire = [];
    const origHandle = scriptRuntime.handleWorkerMessage.bind(scriptRuntime);
    scriptRuntime.handleWorkerMessage = (ev) => {
      try {
        const d = ev?.data || {};
        window.__ps_wire.push({ dir: 'recv', type: d.type, keys: Object.keys(d).slice(0, 8), t: Date.now() });
        if (window.__ps_wire.length > 300) window.__ps_wire.shift();
      } catch {}
      return origHandle(ev);
    };
    if (scriptRuntime.worker) {
      const origPost = scriptRuntime.worker.postMessage.bind(scriptRuntime.worker);
      scriptRuntime.worker.postMessage = (msg) => {
        try {
          window.__ps_wire.push({ dir: 'send', type: msg?.type, scripts: Array.isArray(msg?.scripts) ? msg.scripts.length : undefined, t: Date.now() });
        } catch {}
        return origPost(msg);
      };
      // also attach a parallel listener to see raw traffic even if handleWorkerMessage is bypassed
      scriptRuntime.worker.addEventListener('message', (ev) => {
        try {
          const d = ev?.data || {};
          window.__ps_wire.push({ dir: 'raw', type: d.type, t: Date.now() });
          if (window.__ps_wire.length > 300) window.__ps_wire.shift();
        } catch {}
      });
    }
  }
  await scriptRuntime.syncScripts();
  await new Promise(r => setTimeout(r, 6000));
  return {
    wire: window.__ps_wire.slice(-60),
    listenerEvents: scriptRuntime.listenerEvents instanceof Set ? Array.from(scriptRuntime.listenerEvents)
      : (scriptRuntime.listenerEvents instanceof Map ? Array.from(scriptRuntime.listenerEvents.keys()) : Object.keys(scriptRuntime.listenerEvents || {})),
    injSize: scriptRuntime.scriptPromptInjections?.size,
  };
})()
