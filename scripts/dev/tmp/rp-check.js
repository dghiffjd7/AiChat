(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  const msgs = stores.chatStore.getMessages(sid) || [];
  // 检查重前端渲染：RP 楼层里的 HTML 结构
  const rpFloor = document.querySelector('.rp-floor, [class*="rp-"], .rp-message');
  const iframes = document.querySelectorAll('iframe').length;
  const richNodes = document.querySelectorAll('.rp-floor *, .message-content *').length;
  return {
    sessionId: sid,
    persona: stores.personaStore.getActive?.()?.name,
    msgCount: msgs.length,
    firstHead: String(msgs[0]?.content || '').slice(0, 150),
    hasRpDom: !!rpFloor,
    iframes,
    richNodes,
  };
})()
