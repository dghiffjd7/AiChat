(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const findByText = (text) => {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if ((n.textContent || '').includes(text)) {
        const el = n.parentElement;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
    }
    return null;
  };
  const click = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const target = doc.elementFromPoint(cx, cy) || el;
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = t.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      target.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
    }
  };
  const diff = findByText('爽文男主');
  if (diff) click(diff);
  await new Promise(r => setTimeout(r, 900));
  const tab = findByText('属性与出身');
  if (tab) click(tab);
  await new Promise(r => setTimeout(r, 1200));
  // 观察 creator overlay 的当前状态
  const creator = doc.getElementById('character-creator-overlay');
  const creatorText = creator ? (creator.innerText || '').slice(0, 250).replace(/\n+/g, ' | ') : '';
  return { diffFound: !!diff, tabFound: !!tab, creatorText };
})()
