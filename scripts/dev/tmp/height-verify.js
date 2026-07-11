(async () => {
  await new Promise(r => setTimeout(r, 8000));
  const iframe = document.querySelector('iframe');
  if (!iframe) return { err: 'no iframe' };
  const r = iframe.getBoundingClientRect();
  const doc = iframe.contentDocument;
  const rootVar = doc ? getComputedStyle(doc.documentElement).getPropertyValue('--viewport-height') : '';
  const bodyMinH = doc ? getComputedStyle(doc.body).minHeight : '';
  const splash = doc?.getElementById('splash-screen');
  return {
    iframeH: Math.round(r.height),
    hostViewportH: window.innerHeight,
    viewportVar: rootVar.trim(),
    bodyMinH,
    splashH: splash ? Math.round(splash.getBoundingClientRect().height) : null,
    splashVisible: splash ? getComputedStyle(splash).display !== 'none' : null,
  };
})()
