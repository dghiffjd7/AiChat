(async () => {
  // 升级 hook：Error 对象保留 message/stack
  window.__scriptAuditLog = [];
  for (const level of ['warn', 'error']) {
    const original = console[level].__origFor ? console[level] : console[level].bind(console);
    const patched = (...args) => {
      try {
        const text = args.map(a => {
          if (a instanceof Error) return `ERR<${a.message}>`;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        if (/script|脚本|failed|prompt\./i.test(text)) {
          window.__scriptAuditLog.push({ level, text: text.slice(0, 400), at: Date.now() });
        }
      } catch {}
      original(...args);
    };
    patched.__origFor = true;
    console[level] = patched;
  }
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const allow = { requestPermission: () => ({ decision: 'allow' }), confirmSafety: () => true };
  const sent = await registry.executeTool('chat.send_message', { target: '脚本测试室', content: '再回复一次，简短即可', triggerReply: true }, allow);
  return { sent: sent?.result?.ok ?? sent?.status };
})()
