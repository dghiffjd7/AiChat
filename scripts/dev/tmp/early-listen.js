(() => {
  window.__dbgAll = window.__dbgAll || [];
  if (!window.__dbgListening) {
    window.addEventListener('app-debug-log', (e) => {
      const d = e.detail || {};
      window.__dbgAll.push(`${d.source}|${d.type}|${(d.message || '').slice(0, 350)}`);
      if (window.__dbgAll.length > 300) window.__dbgAll.shift();
    });
    window.__dbgListening = true;
  }
  return { listening: true, at: Date.now() };
})()
