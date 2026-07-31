(async () => {
  const store = window.appBridge?.debugUiRegistry?.stores?.chatStore;
  const raw = String(store?.getLastRawResponse?.('娜美') || '');
  const envelope = store?.getLastRawResponseEnvelope?.('娜美') || null;
  return {
    length: raw.length,
    head: raw.slice(0, 4000),
    tail: raw.slice(-4000),
    envelope: envelope
      ? {
          ...envelope,
          text: undefined,
          sourceMessages: Array.isArray(envelope.sourceMessages)
            ? envelope.sourceMessages
            : [],
        }
      : null,
  };
})()
