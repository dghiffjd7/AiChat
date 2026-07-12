(async () => {
  const bridge = window.appBridge;
  const actions = bridge.debugUiRegistry?.actions || {};
  const warns = [];
  const origWarn = console.warn.bind(console);
  console.warn = (...a) => {
    try { warns.push(a.map(x => x instanceof Error ? (x.message + '\n' + String(x.stack || '').slice(0, 600)) : (typeof x === 'string' ? x : JSON.stringify(x))).join(' ').slice(0, 900)); } catch {}
    return origWarn(...a);
  };
  const input = document.querySelector('#composer-input') || document.querySelector('textarea');
  if (input) { input.value = 'payload 复核草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  await actions.showPromptPreview({});
  await new Promise(r => setTimeout(r, 2000));
  console.warn = origWarn;
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
  try { actions.hidePromptPreviewModal?.(); } catch {}
  return { warns: warns.filter(w => /preview|prompt|failed|error/i.test(w)).slice(-5), allWarnCount: warns.length, lastWarns: warns.slice(-3) };
})()
