(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel not in registry' };
  const store = window.appBridge.getPresetStore();
  await store.ready;
  const id = String(store.getActiveId('sysprompt') || '');
  const before = JSON.parse(JSON.stringify(store.getState().presets.sysprompt[id]));

  await panel.show({ section: 'sysprompt' });
  await new Promise(resolve => setTimeout(resolve, 400));
  const select = document.querySelector('#phone-format-chat-position');
  const depthInput = document.querySelector('#phone-format-chat-depth');
  if (!select) {
    const deepLink = await panel.show({ section: 'chatprompts' });
    return {
      error: 'position select not found on sysprompt page',
      pageView: panel.element?.dataset?.view || '',
      deepLink: String(deepLink || ''),
    };
  }
  select.value = 'history_depth';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  if (depthInput) {
    depthInput.value = '5';
    depthInput.dispatchEvent(new Event('input', { bubbles: true }));
    depthInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const saved = await panel.onSave();
  await new Promise(resolve => setTimeout(resolve, 300));
  const after = store.getState().presets.sysprompt[id];
  const persisted = [after.phone_format_chat_position, after.phone_format_chat_depth];

  // 深链检查：Agent Center 打开 chatprompts 分区会落到哪一页
  await panel.show({ section: 'chatprompts' });
  await new Promise(resolve => setTimeout(resolve, 200));
  const chatpromptsView = panel.element?.dataset?.view || '';
  const chatpromptsSectionId = String(panel.currentSectionId || '');

  // 还原
  await store.upsert('sysprompt', { id, name: before.name || id, data: before });
  panel.drafts?.clear?.();
  await panel.show({ section: 'sysprompt' });
  await new Promise(resolve => setTimeout(resolve, 200));
  const restored = store.getState().presets.sysprompt[id];
  return {
    presetId: id,
    saveReturned: saved,
    persisted,
    chatpromptsDeepLink: { view: chatpromptsView, sectionId: chatpromptsSectionId },
    restoredPosition: [restored.phone_format_chat_position, restored.phone_format_chat_depth],
  };
})()
