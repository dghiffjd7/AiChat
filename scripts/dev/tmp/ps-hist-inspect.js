(async () => {
  const bridge = window.appBridge;
  const scriptStore = bridge.getScriptStore?.();
  const bucket = scriptStore.state.preset?.['preset-openai-1781089014708-991f72'];
  const s = (bucket?.scripts || []).find(x => /历史重排/.test(x.name));
  if (!s) return { error: 'not found' };
  const content = String(s.content || '');
  const apis = ['getChatMessages', 'setChatMessages', 'getLastMessageId', 'eventOn', 'tavern_events', 'SillyTavern', 'TavernHelper', 'fetch(', 'XMLHttpRequest', 'document.', 'getElementById', 'querySelector', 'appendChild', 'replaceScriptButtons', 'eventOnButton', 'toastr', 'injectPrompts', 'setExtensionPrompt', 'triggerSlash', 'generate'];
  const found = {};
  apis.forEach(a => { const c = content.split(a).length - 1; if (c) found[a] = c; });
  return {
    name: s.name, size: content.length, enabled: s.enabled, authorized: s.authorized,
    apiUsage: found,
    head: content.slice(0, 400).replace(/\s+/g, ' '),
  };
})()
