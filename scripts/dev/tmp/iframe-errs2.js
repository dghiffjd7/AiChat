(async () => {
  // reload 丢了 hook——改为直接在当前 iframe 内注入 error 探针并读现有痕迹
  await new Promise(r => setTimeout(r, 5000));
  const iframe = document.querySelector('iframe');
  const win = iframe?.contentWindow;
  const doc = iframe?.contentDocument;
  if (!win) return { err: 'no iframe' };
  // 内部脚本是否执行过：检查面板应有的全局对象
  const globals = ['gameState', 'GameManager', 'initGame', 'startNewLife', 'app', 'store'].map(k => `${k}:${typeof win[k]}`);
  const anyFn = Object.getOwnPropertyNames(win).filter(k => typeof win[k] === 'function' && !/^(webkit|on|set|clear|request|cancel|fetch|atob|btoa|alert|confirm|prompt|open|close|focus|blur|stop|print|postMessage|structuredClone|reportError|queueMicrotask|createImageBitmap|getComputedStyle|getSelection|matchMedia|moveBy|moveTo|resizeBy|resizeTo|scroll|find|toString)/.test(k)).slice(0, 20);
  const scripts = [...doc.querySelectorAll('script')].length;
  return { globals, customFns: anyFn, scriptTags: scripts };
})()
