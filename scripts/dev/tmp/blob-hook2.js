(async () => {
  window.__blobDocs = [];
  const orig = window.__blobOrigCreate || URL.createObjectURL.bind(URL);
  window.__blobOrigCreate = orig;
  URL.createObjectURL = (blob) => {
    const url = orig(blob);
    try {
      if (blob && blob.size > 50000) {
        blob.text().then(t => { window.__blobDocs.push({ size: blob.size, type: blob.type || '(none)', text: t }); if (window.__blobDocs.length > 3) window.__blobDocs.shift(); });
      }
    } catch {}
    return url;
  };
  const iframe = document.querySelector('iframe');
  window.postMessage({ type: 'chatapp:iframe-recover-dynamic', id: iframe.dataset.iframeId }, '*');
  await new Promise(r => setTimeout(r, 6000));
  const d = (window.__blobDocs || [])[0];
  if (!d) return { blobCount: 0, err: document.querySelector('iframe')?.dataset?.iframeError };
  const lines = d.text.split('\n');
  const t = lines[10543] || '';
  return {
    blobCount: window.__blobDocs.length, type: d.type, totalLines: lines.length,
    line10544: t.slice(0, 240),
    prev1: String(lines[10542] || '').slice(0, 120),
    next1: String(lines[10544] || '').slice(0, 120),
    err: document.querySelector('iframe')?.dataset?.iframeError,
  };
})()
