(async () => {
  window.__dbgEvents = [];
  window.addEventListener('app-debug-log', (e) => {
    const d = e.detail || {};
    if (/error|fallback|recover|blob/i.test(d.message || '')) window.__dbgEvents.push(`${d.type}|${(d.message || '').slice(0, 400)}`);
  });
  const iframe = document.querySelector('iframe');
  const id = iframe.dataset.iframeId;
  window.postMessage({ type: 'chatapp:iframe-recover-dynamic', id }, '*');
  // 同步轮询抓 dynamicDoc srcdoc 副本
  let doc = '';
  for (let i = 0; i < 200; i++) {
    const sd = document.querySelector('iframe')?.srcdoc || '';
    if (sd.length > 1000000) { doc = sd; break; }
    await new Promise(r => setTimeout(r, 20));
  }
  window.__grabbedDynamicDoc = doc;
  await new Promise(r => setTimeout(r, 6000));
  const errLine = (() => {
    const m = (document.querySelector('iframe')?.dataset?.iframeError || '').match(/line=(\d+)/);
    return m ? Number(m[1]) : 0;
  })();
  const events = window.__dbgEvents.slice(-8);
  let lineText = '';
  if (doc && errLine) {
    const lines = doc.split('\n');
    lineText = [lines[errLine - 2], lines[errLine - 1], lines[errLine]].map(x => String(x || '').slice(0, 200)).join('\n');
  }
  return {
    grabbedLen: doc.length,
    iframeError: (document.querySelector('iframe')?.dataset?.iframeError || '').slice(0, 200),
    errLine,
    lineContext: lineText,
    debugEvents: events,
  };
})()
