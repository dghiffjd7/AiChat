(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const chatStore = reg?.stores?.chatStore;
  const msgs = chatStore?.getMessages?.('雷姆') || [];
  const last = msgs.slice(-3).map(m => ({
    role: m.role, type: m.type,
    content: String(m.content || '').slice(0, 80),
    hasMedia: !!(m.meta?.generatedMedia || m.media || /\.(png|jpg|jpeg|webp)/i.test(String(m.content || ''))),
    mediaStatus: m.meta?.generatedMedia?.status,
  }));
  return { total: msgs.length, last };
})()
