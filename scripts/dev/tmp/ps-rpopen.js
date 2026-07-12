(async () => {
  const bridge = window.appBridge;
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const items = Array.from(document.querySelectorAll('#chat-page .chat-item, #chat-page li, .session-item, .chat-list-item'));
  const target = items.find(el => /女仆能力测试/.test(el.textContent || ''));
  if (!target) return { error: 'rp item not found', names: items.slice(0, 12).map(i => (i.textContent || '').trim().slice(0, 20)) };
  target.click();
  await new Promise(r => setTimeout(r, 2000));
  const sid = String(chatStore.getCurrent() || '');
  const input = document.querySelector('#composer-input');
  const btn = document.querySelector('#send-button');
  return {
    currentSession: sid,
    isRp: sid.startsWith('rp:'),
    inputVisible: !!(input && input.offsetParent),
    btnVisible: !!(btn && btn.offsetParent),
    msgCount: (chatStore.getMessages(sid) || []).length,
  };
})()
