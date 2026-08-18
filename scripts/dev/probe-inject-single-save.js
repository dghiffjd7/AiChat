(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel missing' };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const storeDepth = () => {
    const settings = registry.actions?.getAgentCenterSettings?.() || {};
    const { presetId } = panel.getInjectSyspromptResolved();
    return settings?.profiles?.[`sysprompt:${presetId}`]?.agents?.dialogue_agent?.prompts?.dialogue?.depth ?? null;
  };
  const openDialogueEditor = async () => {
    panel.openaiBlocksListEl?.querySelector('.pp-inject-block[data-inject="dialogue"] .pp-block-header')?.click();
    await wait(300);
  };

  await panel.show({ section: 'custom' });
  await wait(400);
  const chip = panel.injectBarEl?.querySelector('[data-inject-chip="dialogue"]');
  if (chip && !chip.classList.contains('is-on')) { chip.click(); await wait(250); }
  await openDialogueEditor();

  const innerSaveButtons = Array.from(panel.blockEditorEl?.querySelectorAll('button') || [])
    .filter(btn => btn.textContent.trim() === '保存').length;
  const depthInput = panel.blockEditorEl?.querySelector('input[type="number"]');
  const original = depthInput.value;

  depthInput.value = '9';
  depthInput.dispatchEvent(new Event('input', { bubbles: true }));
  depthInput.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(150);
  const dirtyAfterEdit = panel.injectEditorDirty === true;
  const unsavedCount = panel.countUnsavedChanges();

  document.querySelector('#preset-save')?.click();
  await wait(900);
  const afterGlobalSave = storeDepth();
  const dirtyAfterSave = panel.injectEditorDirty === true;

  // 取消回滚路径：再改一次不保存，点取消（自动确认）
  await openDialogueEditor();
  const depthInput2 = panel.blockEditorEl?.querySelector('input[type="number"]');
  depthInput2.value = '3';
  depthInput2.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(120);
  const dirtyBeforeCancel = panel.injectEditorDirty === true;
  const origConfirm = window.appConfirm;
  let cancelResult = null;
  try {
    // onCancel 用模块内 appConfirm，改走面板方法前 hook：直接调用 onCancel 并自动点确认按钮
    const confirmWatcher = setInterval(() => {
      const btn = Array.from(document.querySelectorAll('.app-confirm-modal button'))
        .find(b => /确定|放弃|确认/.test(b.textContent || ''));
      btn?.click();
    }, 120);
    cancelResult = await panel.onCancel();
    clearInterval(confirmWatcher);
  } finally {
    if (origConfirm) window.appConfirm = origConfirm;
  }
  await wait(300);
  const dirtyAfterCancel = panel.injectEditorDirty === true;
  const editorDepthAfterCancel = panel.blockEditorEl?.querySelector('input[type="number"]')?.value ?? null;
  const storeAfterCancel = storeDepth();

  // 还原到 original
  const depthInput3 = panel.blockEditorEl?.querySelector('input[type="number"]');
  if (depthInput3) {
    depthInput3.value = String(original);
    depthInput3.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#preset-save')?.click();
    await wait(700);
  }
  return {
    innerSaveButtons,
    original,
    dirtyAfterEdit,
    unsavedCount,
    afterGlobalSave,
    dirtyAfterSave,
    dirtyBeforeCancel,
    dirtyAfterCancel,
    editorDepthAfterCancel,
    storeAfterCancel,
    restoredStore: storeDepth(),
  };
})()
