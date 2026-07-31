(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const store = registry.stores?.chatStore;
  const messages = store?.getMessages?.('罗罗诺亚·索隆') || [];
  const prompt = '索隆，船上如果突然遇到袭击，我应该先学会怎么保护自己？';
  const envelope = store?.getLastRawResponseEnvelope?.('罗罗诺亚·索隆') || {};
  const rawText = String(envelope?.text || '');
  const tagMatches = Array.from(rawText.matchAll(/<\/?([A-Za-z_][\w~-]*)\b[^>]*>/g))
    .map(match => match[0])
    .slice(0, 80);
  const contentIndex = rawText.indexOf('<content>');
  const phoneIndex = rawText.indexOf('MiPhone_start');
  return {
    currentSessionId: store?.getCurrent?.() || '',
    messageCount: messages.length,
    promptCount: messages.filter(message => String(message?.content || '') === prompt).length,
    assistantCount: messages.filter(message => message?.role === 'assistant').length,
    recentMessages: messages.slice(-12).map(message => ({
      id: String(message?.id || ''),
      role: String(message?.role || message?.type || ''),
      content: String(message?.content || message?.text || '').slice(0, 1200),
      formatRepairTurn: message?.meta?.formatRepairTurn || null,
      usage: message?.meta?.usage || null,
    })),
    raw: {
      length: rawText.length,
      head: rawText.slice(0, 1200),
      tail: rawText.slice(-1200),
      tagMatches,
      contentIndex,
      contentExcerpt: contentIndex >= 0
        ? rawText.slice(contentIndex, contentIndex + 1600)
        : '',
      phoneIndex,
      turnId: String(envelope?.turnId || ''),
      sourceMessageIds: envelope?.sourceMessageIds || [],
    },
    activeGeneration: {
      isGenerating: Boolean(window.appBridge?.isGenerating),
      provider: window.appBridge?.lastRequest?.provider || '',
      model: window.appBridge?.lastRequest?.model || '',
      stream: Boolean(window.appBridge?.lastRequest?.stream),
      messageCount: Array.isArray(window.appBridge?.lastRequest?.messages)
        ? window.appBridge.lastRequest.messages.length
        : 0,
    },
  };
})()
