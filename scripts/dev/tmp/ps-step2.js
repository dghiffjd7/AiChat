(async () => {
  const bridge = window.appBridge;
  const presetStore = bridge.getPresetStore?.();
  const scriptRuntime = bridge.getScriptRuntime?.();
  await presetStore.ready;
  // hook console logs for worker/script channels (persist across this audit)
  if (!window.__ps_logs) {
    window.__ps_logs = [];
    const origWarn = console.warn.bind(console);
    const origLog = console.log.bind(console);
    const capture = (level, args) => {
      try {
        const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (/worker|script|注入|inject|prompt|禁用|拒绝|denied/i.test(text)) {
          window.__ps_logs.push({ t: Date.now(), level, text: text.slice(0, 300) });
          if (window.__ps_logs.length > 400) window.__ps_logs.shift();
        }
      } catch {}
    };
    console.warn = (...a) => { capture('warn', a); origWarn(...a); };
    console.log = (...a) => { capture('log', a); origLog(...a); };
  }
  await presetStore.setActive('openai', 'preset-openai-1782195413072-8a6ff1');
  await scriptRuntime.syncScripts?.();
  await new Promise(r => setTimeout(r, 8000));
  const sid = '脚本测试室';
  const injections = scriptRuntime.getScriptPromptInjections?.(sid) || [];
  return {
    activeNow: presetStore.getActiveId('openai'),
    injectionCount: injections.length,
    injections: injections.map(b => ({
      key: b.key || b.id || '',
      position: b.position || b.role || '',
      len: String(b.content || b.text || '').length,
      head: String(b.content || b.text || '').slice(0, 80),
    })),
    recentLogs: window.__ps_logs.slice(-25),
  };
})()
