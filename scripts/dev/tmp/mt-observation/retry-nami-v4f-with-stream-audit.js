(async () => {
  const bridge = window.appBridge;
  const store = bridge?.debugUiRegistry?.stores?.chatStore;
  const proto = bridge?.client ? Object.getPrototypeOf(bridge.client) : null;
  const originalStreamChat = proto?.streamChat;
  if (!bridge?.triggerAssistantFromSlash || typeof originalStreamChat !== 'function') {
    return { ok: false, reason: 'retry_runtime_missing' };
  }
  const beforeMessages = store?.getMessages?.('娜美') || [];
  const audit = {
    chunkCount: 0,
    contentChunkCount: 0,
    contentLength: 0,
    reasoningChunkCount: 0,
    reasoningLength: 0,
    otherChunkCount: 0,
    contentHead: '',
    contentTail: '',
    finishError: '',
  };
  proto.streamChat = async function* (...args) {
    const stream = originalStreamChat.apply(this, args);
    for await (const chunk of stream) {
      audit.chunkCount += 1;
      if (typeof chunk === 'string') {
        audit.contentChunkCount += 1;
        audit.contentLength += chunk.length;
        audit.contentHead = (audit.contentHead + chunk).slice(0, 1000);
        audit.contentTail = (audit.contentTail + chunk).slice(-1000);
      } else if (String(chunk?.kind || chunk?.type || '').toLowerCase().includes('reason')) {
        const text = String(chunk?.text || chunk?.content || chunk?.reasoning_content || '');
        audit.reasoningChunkCount += 1;
        audit.reasoningLength += text.length;
      } else {
        audit.otherChunkCount += 1;
      }
      yield chunk;
    }
  };

  let triggerResult = null;
  try {
    triggerResult = await bridge.triggerAssistantFromSlash();
  } catch (error) {
    audit.finishError = String(error?.message || error || '');
  } finally {
    proto.streamChat = originalStreamChat;
  }

  const afterMessages = store?.getMessages?.('娜美') || [];
  const added = afterMessages.slice(beforeMessages.length).map(message => ({
    id: String(message?.id || ''),
    role: String(message?.role || message?.type || ''),
    status: String(message?.status || ''),
    content: String(message?.content || message?.text || '').slice(0, 1200),
    usage: message?.meta?.usage || null,
  }));
  const raw = String(store?.getLastRawResponse?.('娜美') || '');
  return {
    ok: !audit.finishError && audit.contentLength > 0 && added.some(message => message.role === 'assistant'),
    triggerResult,
    beforeCount: beforeMessages.length,
    afterCount: afterMessages.length,
    added,
    rawLength: raw.length,
    rawHead: raw.slice(0, 1200),
    rawTail: raw.slice(-1200),
    audit,
    request: {
      provider: bridge.lastRequest?.provider || '',
      model: bridge.lastRequest?.model || '',
      stream: Boolean(bridge.lastRequest?.stream),
      messageCount: Array.isArray(bridge.lastRequest?.messages)
        ? bridge.lastRequest.messages.length
        : 0,
    },
  };
})()
