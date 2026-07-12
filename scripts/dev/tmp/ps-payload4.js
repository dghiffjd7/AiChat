(async () => {
  const bridge = window.appBridge;
  const actions = bridge.debugUiRegistry?.actions || {};
  const logs = [];
  const origLog = console.log.bind(console);
  console.log = (...a) => {
    try {
      const text = a.map(x => x instanceof Error ? (x.message + ' || ' + String(x.stack || '').split('\n').slice(0, 4).join(' | ')) : (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
      if (/preview|failed|WARN|ERROR/i.test(text)) logs.push(text.slice(0, 800));
    } catch {}
    return origLog(...a);
  };
  const input = document.querySelector('#composer-input') || document.querySelector('textarea');
  if (input) { input.value = 'payload 复核草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  await actions.showPromptPreview({});
  await new Promise(r => setTimeout(r, 2000));
  console.log = origLog;
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
  try { actions.hidePromptPreviewModal?.(); } catch {}
  return { logs: logs.slice(-6) };
})()
