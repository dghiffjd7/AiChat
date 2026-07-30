(() => {
  const current = window.appBridge?.chatStore?.getCurrent?.() || window.chatStore?.getCurrent?.() || '(unknown)';
  return JSON.stringify({ alive: true, current, at: Date.now() });
})()
