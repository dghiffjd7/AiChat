(async () => {
  const bridge = window.appBridge;
  const actions = bridge.debugUiRegistry?.actions || {};
  await actions.showPromptPreview({});
  await new Promise(r => setTimeout(r, 3000));
  const req = bridge.lastRequest || {};
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const marker = '@bubble:';
  const hits = messages.map((m, i) => ({
    i,
    role: m.role,
    len: String(m.content || '').length,
    hasFormatBlock: String(m.content || '').includes('[对话渲染格式规范]'),
    hasBubbleMarker: String(m.content || '').includes(marker),
  })).filter(m => m.hasFormatBlock || m.hasBubbleMarker);
  const injectedIdx = messages.findIndex(m => String(m.content || '').includes('[对话渲染格式规范]'));
  try { actions.hidePromptPreviewModal?.(); } catch {}
  return {
    previewOnly: req.previewOnly,
    source: req.source,
    messageCount: messages.length,
    roleSeq: messages.map(m => m.role).join(','),
    injectionHits: hits,
    injectedIdx,
    tail3: messages.slice(-3).map((m, j) => ({
      role: m.role,
      head: String(m.content || '').slice(0, 60),
    })),
  };
})()
