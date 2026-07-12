(async () => {
  const items = Array.from(document.querySelectorAll('#chat-page .chat-item, #chat-page li, #chat-page [data-session-id], .session-item, .chat-list-item'));
  const target = items.find(el => /脚本测试室/.test(el.textContent || ''));
  if (!target) return { error: 'room item not found', itemCount: items.length, sample: items.slice(0, 3).map(i => (i.textContent || '').trim().slice(0, 30)) };
  target.click();
  await new Promise(r => setTimeout(r, 1500));
  const input = document.querySelector('#composer-input');
  const btn = document.querySelector('#send-button');
  return {
    clicked: true,
    inputVisible: !!(input && input.offsetParent),
    btnVisible: !!(btn && btn.offsetParent),
  };
})()
