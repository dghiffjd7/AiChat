(() => {
  const ids = ['send-btn', 'send_but', 'send_textarea', 'composer-input'];
  const found = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    found[id] = el ? { tag: el.tagName, visible: !!(el.offsetParent || el.getClientRects().length), cls: String(el.className).slice(0, 40) } : null;
  });
  const candidates = Array.from(document.querySelectorAll('button')).filter(b => /发送|send/i.test(b.textContent + ' ' + b.className + ' ' + (b.id || '') + ' ' + (b.getAttribute('aria-label') || ''))).slice(0, 6).map(b => ({ id: b.id, cls: String(b.className).slice(0, 40), text: b.textContent.trim().slice(0, 10), visible: !!(b.offsetParent) }));
  return { found, candidates };
})()
