(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const click = (el) => {
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = t.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8, button: 0 }));
    }
  };
  // 1. 选「爽文男主」难度
  const diff = [...doc.querySelectorAll('div,button,label')].find(el => /爽文男主/.test(el.textContent || '') && el.textContent.length < 60);
  if (diff) click(diff);
  await new Promise(r => setTimeout(r, 800));
  // 2. 切「属性与出身」页签
  const tab = [...doc.querySelectorAll('button,div[class*="tab"],[role="tab"]')].find(el => (el.textContent || '').trim() === '属性与出身');
  if (tab) click(tab);
  await new Promise(r => setTimeout(r, 1200));
  const visible = (doc.body.innerText || '').slice(0, 300).replace(/\n+/g, ' | ');
  return { diffClicked: !!diff, tabClicked: !!tab, visibleNow: visible };
})()
