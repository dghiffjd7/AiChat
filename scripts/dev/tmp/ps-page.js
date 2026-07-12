(() => {
  const pages = Array.from(document.querySelectorAll('.page, [data-page], .app-page, main > section')).slice(0, 12).map(p => ({
    id: p.id, cls: String(p.className).slice(0, 50),
    visible: !!(p.offsetParent || p.getClientRects().length),
  }));
  const visTop = Array.from(document.body.children).filter(el => el.offsetParent).slice(0, 10).map(el => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60) }));
  const chatPage = document.querySelector('#chat-page, .chat-page, #page-chat');
  return {
    pages,
    visTop,
    chatPage: chatPage ? { id: chatPage.id, visible: !!chatPage.offsetParent } : null,
    hash: location.hash,
  };
})()
