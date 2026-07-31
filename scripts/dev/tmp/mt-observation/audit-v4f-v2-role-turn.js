(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const chatStore = stores.chatStore;
  const sessionId = '艾琳·洛';
  const messages = chatStore?.getMessages?.(sessionId) || [];
  let markerIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (
      String(messages[index]?.role || '') === 'user'
      && String(messages[index]?.content || '').includes('艾琳，蓝焰灯塔今天有什么异常')
    ) {
      markerIndex = index;
      break;
    }
  }
  const tail = [];
  for (const message of messages.slice(Math.max(0, markerIndex))) {
    const rawOriginal = message?.role === 'assistant'
      ? await chatStore?.loadRawOriginal?.(message, sessionId)
      : '';
    tail.push({
      id: String(message?.id || ''),
      role: String(message?.role || ''),
      type: String(message?.type || ''),
      name: String(message?.name || ''),
      content: String(message?.content || '').slice(0, 600),
      rawOriginal: String(rawOriginal || '').slice(0, 1200),
      rawOriginalLength: String(rawOriginal || '').length,
      rawOriginalRef: message?.rawOriginalRef || null,
      formatRepairTurn: message?.meta?.formatRepairTurn || null,
    });
  }
  return {
    sessionId,
    currentSessionId: chatStore?.getCurrent?.() || '',
    markerIndex,
    totalMessageCount: messages.length,
    tail,
  };
})()
