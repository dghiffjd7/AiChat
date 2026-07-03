(async () => {
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const out = await registry.executeTool('app.read_resource', { resource: 'preset', scope: 'sysprompt' }, {
    requestPermission: () => ({ decision: 'allow' }),
  });
  const preset = out?.result?.presets?.sysprompt?.resolved?.preset || {};
  const reminderKeys = Object.keys(preset).filter(k => /_rules$/.test(k));
  const leaked = /sk-[A-Za-z0-9]{8,}|api[_-]?key/i.test(JSON.stringify(preset).slice(0, 5000)) &&
    /"(sk-[A-Za-z0-9]{8,})"/.test(JSON.stringify(preset));
  const pass = out?.result?.ok === true && reminderKeys.length > 0 && !leaked;
  return { pass, detail: { ok: out?.result?.ok, reminderKeyCount: reminderKeys.length, sample: reminderKeys.slice(0, 4) } };
})()
