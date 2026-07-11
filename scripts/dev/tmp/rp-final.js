(async () => {
  await new Promise(r => setTimeout(r, 4000));
  window.__lag = []; let last = performance.now();
  setInterval(() => { const n = performance.now(); window.__lag.push(Math.round(n - last - 100)); if (window.__lag.length > 300) window.__lag.shift(); last = n; }, 100);
  await new Promise(r => setTimeout(r, 6000));
  const blocks = [...document.querySelectorAll('.chat-codeblock')];
  const iframes = [...document.querySelectorAll('iframe')];
  const big = iframes.map(f => (f.srcdoc || '').length).sort((a, b) => b - a);
  const rawJs = blocks.filter(b => !b.querySelector('iframe') && /const |localStorage|function\s*\(/.test(b.innerText || ''));
  return {
    sid: window.appBridge.debugUiRegistry.stores.chatStore.getCurrent(),
    codeblocks: blocks.length,
    iframes: iframes.length,
    topSrcdocSizes: big.slice(0, 3),
    rawJsBlocks: rawJs.length,
    rawJsSample: rawJs.length ? (rawJs[0].innerText || '').slice(0, 80) : '',
    lagMax: window.__lag.length ? Math.max(...window.__lag) : 0,
  };
})()
