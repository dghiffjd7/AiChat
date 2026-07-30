(async () => {
  const bridge = window.appBridge;
  if (!bridge) return { error: 'appBridge unavailable' };
  const context = bridge.getRegexContext?.() || {};
  if (!String(context.worldIds || '').includes('凡人修仙传')) {
    return { error: 'Fanren world is not active', worldIds: context.worldIds || [] };
  }

  const transformStartedAt = performance.now();
  const stored = bridge.applyOutputStoredRegex?.('lucklyjkop') ?? 'lucklyjkop';
  const display = bridge.applyOutputDisplayRegex?.(stored) ?? stored;
  const transformMs = Math.round((performance.now() - transformStartedAt) * 100) / 100;

  const container = document.createElement('div');
  container.id = 'codex-fanren-regex-order-smoke';
  container.style.cssText = 'position:fixed;left:-100000px;top:-100000px;width:800px;height:600px;overflow:hidden;';
  document.body.appendChild(container);

  const { renderRichText, cleanupRichText } = await import('/scripts/ui/chat/rich-text-renderer.js');
  const renderStartedAt = performance.now();
  renderRichText(container, display, {
    messageId: 'codex-fanren-regex-order-smoke',
    sessionId: context.sessionId || '',
    debugTag: 'codex-fanren-regex-order-smoke',
    lazyMount: false,
    deferSandboxExecution: true,
    streaming: false,
  });
  const renderMs = Math.round((performance.now() - renderStartedAt) * 100) / 100;
  await new Promise(resolve => setTimeout(resolve, 120));

  const frames = Array.from(container.querySelectorAll('iframe')).map(iframe => ({
    srcdocLength: String(iframe.srcdoc || '').length,
    source: String(iframe.dataset?.iframeSource || ''),
    allowScripts: String(iframe.dataset?.iframeAllowScripts || ''),
    execution: String(iframe.closest('.chat-codeblock')?.dataset?.richRenderExecution || ''),
    deferred: String(iframe.closest('.chat-codeblock')?.dataset?.richRenderDeferred || ''),
  }));
  const blocks = Array.from(container.querySelectorAll('.chat-codeblock')).map(block => ({
    renderLevel: String(block.dataset?.richRenderLevel || ''),
    execution: String(block.dataset?.richRenderExecution || ''),
    deferred: String(block.dataset?.richRenderDeferred || ''),
    childTags: Array.from(block.children).map(child => child.tagName.toLowerCase()),
  }));
  const result = {
    worldIds: context.worldIds || [],
    activePreset: context.activePresets?.openai || '',
    storedLength: String(stored).length,
    displayLength: String(display).length,
    transformMs,
    renderMs,
    codeBlockCount: blocks.length,
    blocks,
    frameCount: frames.length,
    frames,
    rawTokenRemaining: String(display).includes('lucklyjkop'),
  };

  cleanupRichText(container);
  container.remove();
  return result;
})()
