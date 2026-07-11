(async () => {
  window.__ifErrs = [];
  for (const level of ['warn', 'error', 'log', 'info', 'debug']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        const text = args.map(a => a instanceof Error ? 'ERR<' + a.message + '>' : (typeof a === 'string' ? a : '')).join(' ');
        if (/iframe|\[rich\]/i.test(text)) { window.__ifErrs.push(text.slice(0, 300)); if (window.__ifErrs.length > 80) window.__ifErrs.shift(); }
      } catch {}
      orig(...args);
    };
  }
  // 也直接挂 iframe 内部 error 捕获（reload 前先挂宿主，reload 后 iframe 重建时内部 onerror 由桥上报）
  location.reload();
  return true;
})()
