(() => {
  const win = document.querySelector('iframe').contentWindow;
  const doc = document.querySelector('iframe').contentDocument;
  const own = Object.getOwnPropertyNames(win);
  const custom = own.filter(k => !/^(webkit|__)/.test(k) && typeof win[k] === 'function').filter(k => {
    try { return !String(win[k]).includes('[native code]'); } catch { return false; }
  }).slice(0, 15);
  const inlineScripts = [...doc.querySelectorAll('script:not([src])')];
  return {
    customFunctions: custom,
    inlineCount: inlineScripts.length,
    inlineSizes: inlineScripts.map(s => (s.textContent || '').length),
    srcScripts: [...doc.querySelectorAll('script[src]')].map(s => s.src.slice(0, 70)),
  };
})()
