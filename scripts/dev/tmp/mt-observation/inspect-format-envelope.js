(async () => {
  const store = window.appBridge?.getChatStore?.();
  if (!store) return { ok: false, reason: 'chat_store_unavailable' };
  const sessionIds = [...new Set([
    String(store.getCurrent?.() || '').trim(),
    ...(store.listSessions?.() || []).map(id => String(id || '').trim()),
  ].filter(Boolean))];
  const selectedIds = sessionIds.filter(id => id.includes('格式修复'));
  const inspectIds = selectedIds.length ? selectedIds : sessionIds.slice(0, 20);
  for (const sessionId of inspectIds) {
    await store.ensureRecentMessagesLoaded?.(sessionId);
  }
  return {
    ok: true,
    currentSessionId: String(store.getCurrent?.() || ''),
    matchingSessionIds: selectedIds,
    sessions: inspectIds.map((sessionId) => {
      const messages = store.getMessages?.(sessionId) || [];
      const envelope = store.getLastRawResponseEnvelope?.(sessionId) || null;
      return {
        sessionId,
        messageCount: messages.length,
        envelope: envelope ? {
          ...envelope,
          textLength: String(envelope.text || '').length,
          textPreview: String(envelope.text || '').slice(0, 800),
          text: undefined,
        } : null,
        messages: messages.slice(-10).map(message => {
          const rawOriginal = typeof message?.rawOriginal === 'string' ? message.rawOriginal : '';
          const content = typeof message?.content === 'string' ? message.content : '';
          return {
            id: String(message?.id || ''),
            role: String(message?.role || ''),
            timestamp: Number(message?.timestamp || 0) || 0,
            status: String(message?.status || ''),
            formatRepairTurn: message?.meta?.formatRepairTurn || null,
            rawOriginalLength: rawOriginal.length,
            rawOriginalPreview: rawOriginal.slice(0, 300),
            envelopeIncludesRawOriginal: Boolean(
              rawOriginal && typeof envelope?.text === 'string' && envelope.text.includes(rawOriginal)
            ),
            contentLength: content.length,
            contentPreview: content.slice(0, 300),
          };
        }),
      };
    }),
  };
})()
