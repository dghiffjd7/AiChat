(async () => {
  // reload 后重装 observer 太晚——直接等渲染并在 error 前轮询抓 srcdoc
  window.__docGrab = window.__docGrab || [];
  for (let i = 0; i < 100; i++) {
    document.querySelectorAll('iframe').forEach(f => {
      const sd = f.srcdoc || '';
      if (sd.length > 100000 && /<script/i.test(sd) && !window.__docGrab.length) {
        window.__docGrab.push({ len: sd.length, doc: sd });
      }
    });
    if (window.__docGrab.length) break;
    await new Promise(r => setTimeout(r, 150));
  }
  if (!window.__docGrab.length) return { grabbed: false };
  const doc = window.__docGrab[0].doc;
  const lines = doc.split('\n');
  const target = lines[10543] || '';
  return {
    grabbed: true, len: doc.length, totalLines: lines.length,
    line10544: target.slice(0, 300),
    col89: target.slice(60, 140),
    prev: (lines[10542] || '').slice(0, 150),
    next: (lines[10544] || '').slice(0, 150),
  };
})()
