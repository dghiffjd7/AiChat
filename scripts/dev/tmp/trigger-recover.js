(async () => {
  const iframe = document.querySelector('iframe');
  const id = iframe?.dataset?.iframeId;
  if (!id) return { err: 'no id' };
  window.postMessage({ type: 'chatapp:iframe-recover-dynamic', id }, '*');
  await new Promise(r => setTimeout(r, 5000));
  const docs = window.__blobDocs || [];
  const d = docs[docs.length - 1];
  if (!d) return { blobCount: 0, iframeErr: document.querySelector('iframe')?.dataset?.iframeError || '' };
  const lines = d.text.split('\n');
  const t = lines[10543] || '';
  return {
    blobCount: docs.length, totalLines: lines.length,
    line10544: t.slice(0, 240),
    col89: t.slice(70, 110),
    prev2: String(lines[10541] || '').slice(0, 100),
    prev1: String(lines[10542] || '').slice(0, 100),
    next1: String(lines[10544] || '').slice(0, 100),
    newErr: document.querySelector('iframe')?.dataset?.iframeError || '',
  };
})()
