(async () => {
  await new Promise(r => setTimeout(r, 3000));
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  const worldIds = await window.appBridge.getWorldIdsForSession?.(sid);
  const iframes = document.querySelectorAll('iframe').length;
  const blocks = [...document.querySelectorAll('.chat-codeblock')];
  const jsBlocks = blocks.filter(b => !b.querySelector('iframe') && /const |localStorage|function/.test(b.innerText || '')).length;
  const bigIframe = [...document.querySelectorAll('iframe')].find(f => (f.srcdoc || '').length > 1000000);
  return {
    sid, worldIds,
    iframes, codeblocks: blocks.length, rawJsBlocks: jsBlocks,
    bigIframeSrcdoc: bigIframe ? bigIframe.srcdoc.length : 0,
    visibleText: (document.querySelector('.rp-floor, [class*="message-content"]')?.innerText || '').slice(0, 150),
  };
})()
