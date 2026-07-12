(async () => {
  const bridge = window.appBridge;
  const actions = bridge.debugUiRegistry?.actions || {};
  const toasts = [];
  const t = window.toastr || {};
  ['warning', 'error', 'info'].forEach((k) => {
    const orig = t[k]?.bind(t);
    if (orig) t[k] = (msg, ...rest) => { toasts.push(`${k}: ${msg}`); return orig(msg, ...rest); };
  });
  // put draft text into composer so handleSend has content
  const input = document.querySelector('#send_textarea, textarea#chat-input, .chat-input textarea, textarea');
  let inputInfo = 'none';
  if (input) {
    input.value = '（payload 复核草稿，不会发送）';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    inputInfo = input.id || input.className || 'found';
  }
  const ret = await actions.showPromptPreview({});
  await new Promise(r => setTimeout(r, 2500));
  const req = bridge.lastRequest || {};
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const injectedIdx = messages.findIndex(m => String(m.content || '').includes('[对话渲染格式规范]'));
  try { actions.hidePromptPreviewModal?.(); } catch {}
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
  return {
    ret,
    toasts,
    inputInfo,
    previewOnly: req.previewOnly,
    source: req.source,
    messageCount: messages.length,
    injectedIdx,
    around: injectedIdx >= 0 ? messages.slice(Math.max(0, injectedIdx - 1), injectedIdx + 2).map(m => ({ role: m.role, head: String(m.content || '').slice(0, 70) })) : [],
    roleSeq: messages.map(m => m.role).join(',').slice(0, 200),
  };
})()
