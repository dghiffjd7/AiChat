(() => {
  const iframes = [...document.querySelectorAll('iframe')];
  const blocks = [...document.querySelectorAll('.chat-codeblock')];
  const blockInfo = blocks.slice(0, 3).map(b => ({
    level: b.dataset.richRenderLevel, exec: b.dataset.richRenderExecution,
    hasIframe: !!b.querySelector('iframe'),
    hasPre: !!b.querySelector('pre'),
    childTags: [...b.children].map(c => c.tagName + (c.className ? '.' + String(c.className).slice(0, 25) : '')),
    textHead: (b.innerText || '').slice(0, 80),
  }));
  return {
    iframeCount: iframes.length,
    iframeInfo: iframes.slice(0, 2).map(f => ({ id: f.dataset.iframeId, h: f.getBoundingClientRect().height, allowScripts: f.dataset.iframeAllowScripts, srcdocLen: (f.srcdoc || '').length })),
    codeblocks: blocks.length,
    blockInfo,
  };
})()
