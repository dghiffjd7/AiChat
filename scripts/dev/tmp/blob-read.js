(async () => {
  await new Promise(r => setTimeout(r, 6000));
  const docs = window.__blobDocs || [];
  if (!docs.length) return { count: 0 };
  const d = docs[docs.length - 1];
  const lines = d.text.split('\n');
  const t = lines[10543] || '';
  return {
    count: docs.length, size: d.size, type: d.type, totalLines: lines.length,
    line10544: t.slice(0, 260),
    around: [lines[10541], lines[10542], t, lines[10544]].map(x => String(x || '').slice(0, 120)),
    errIframe: document.querySelector('iframe')?.dataset?.iframeError || '',
  };
})()
