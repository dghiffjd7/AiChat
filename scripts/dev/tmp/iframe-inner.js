(() => {
  const iframe = document.querySelector('iframe');
  const doc = iframe?.contentDocument;
  if (!doc) return { err: 'no contentDocument' };
  const body = doc.body;
  const rootVar = getComputedStyle(doc.documentElement).getPropertyValue('--viewport-height');
  // 找声明 min-height calc 的元素
  const candidates = [...doc.querySelectorAll('body > *')].slice(0, 6).map(el => ({
    tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 30),
    h: Math.round(el.getBoundingClientRect().height),
    minH: getComputedStyle(el).minHeight,
    pos: getComputedStyle(el).position,
  }));
  return {
    viewportVar: rootVar || '(unset)',
    bodyScrollH: body.scrollHeight,
    bodyMinH: getComputedStyle(body).minHeight,
    bodyH: Math.round(body.getBoundingClientRect().height),
    docScrollH: doc.documentElement.scrollHeight,
    children: candidates,
  };
})()
