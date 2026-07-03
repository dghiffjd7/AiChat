(async () => {
  const result = await window.appBridge.debugUiRegistry.actions.runMaidAssistantPrompt({
    input: '帮我看看当前会话用了哪些资源',
  });
  const toolCount = (result.steps || []).length;
  const pass = result.ok === true && toolCount > 0 && String(result.message || '').length > 20;
  return {
    pass,
    detail: { ok: result.ok, responseType: result.responseType, toolCount, messagePreview: String(result.message || '').slice(0, 80) },
  };
})()
