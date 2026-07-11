(async () => {
  // S1 审计脚手架：hook logger 捕获脚本相关日志 + 读取现状
  const appSettingsMod = await import('/scripts/storage/app-settings.js');
  const appSettings = appSettingsMod.appSettings || appSettingsMod.default;
  const settings = appSettings?.get?.() || {};
  // hook console（logger 最终走 console）
  if (!window.__scriptAuditLog) {
    window.__scriptAuditLog = [];
    for (const level of ['log', 'warn', 'error', 'info']) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        try {
          const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
          if (/worker-console|script|脚本|Script|toastr|MVU/i.test(text)) {
            window.__scriptAuditLog.push({ level, text: text.slice(0, 400), at: Date.now() });
            if (window.__scriptAuditLog.length > 500) window.__scriptAuditLog.shift();
          }
        } catch {}
        original(...args);
      };
    }
    window.addEventListener('error', (e) => {
      window.__scriptAuditLog.push({ level: 'window-error', text: String(e?.message || '').slice(0, 300), at: Date.now() });
    });
  }
  // preset store 与激活状态
  const presetStore = window.appBridge?.presets || window.appBridge?.presetStore;
  return {
    scriptEnabled: settings.scriptEnabled,
    scriptAllowReadMessages: settings.scriptAllowReadMessages,
    scriptAllowModifyVariables: settings.scriptAllowModifyVariables,
    scriptAllowNetwork: settings.scriptAllowNetwork,
    presetStoreFound: !!presetStore,
    presetMethods: presetStore ? Object.getOwnPropertyNames(Object.getPrototypeOf(presetStore)).filter(m => /active|list|get/i.test(m)).slice(0, 10) : null,
    hookInstalled: true,
  };
})()
