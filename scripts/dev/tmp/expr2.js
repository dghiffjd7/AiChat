(() => ({
  result: window.__pResult,
  probe: window.__maidLoopProbe,
  page: document.body.dataset.activePage || 'unknown',
  chatVisible: Boolean(document.querySelector('.QQ_chat_page:not(.hidden)')),
  bubbleExists: Boolean(document.querySelector('.maid-guide-step-bubble')),
}))()
