(async () => {
  // 找 bridge blob：新建一个探测——直接 import renderer 拿不到内部函数；
  // 改从现有 iframe 的 script src 找 blob url 并 fetch
  const iframe = document.querySelector('iframe');
  const doc = iframe?.contentDocument;
  const srcs = doc ? [...doc.querySelectorAll('script[src]')].map(s => s.src) : [];
  let bridgeText = '';
  for (const s of srcs) {
    if (s.startsWith('blob:')) {
      try { bridgeText = await (await fetch(s)).text(); break; } catch {}
    }
  }
  if (!bridgeText) return { srcs, note: 'no blob script in current (static) iframe' };
  const lines = bridgeText.split('\n');
  return { totalLines: lines.length, line10544: (lines[10543] || '').slice(0, 200) };
})()
