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

  await panel.show({ section: 'custom' });
  await wait(400);
  const chip = panel.injectBarEl?.querySelector('[data-inject-chip="dialogue"]');
  if (chip && !chip.classList.contains('is-on')) { chip.click(); await wait(250); }
  panel.openaiBlocksListEl?.querySelector('.pp-inject-block[data-inject="dialogue"] .pp-block-header')?.click();
  await wait(300);
  const depthInput = panel.blockEditorEl?.querySelector('input[type="number"]');
  if (!depthInput) return { error: 'editor missing' };
  const original = depthInput.value;
  depthInput.value = '8';
  depthInput.dispatchEvent(new Event('change', { bubbles: true }));

  // 关键差异：点右下角的全局「保存」，不点编辑器内的保存
  document.querySelector('#preset-save')?.click();
  await wait(900);
  const afterGlobalSave = storeDepth();

  // 切出再进
  panel.showDetailPage();
  await wait(250);
  panel.openaiBlocksListEl?.querySelector('.pp-inject-block[data-inject="dialogue"] .pp-block-header')?.click();
  await wait(300);
  const reopenDepth = panel.blockEditorEl?.querySelector('input[type="number"]')?.value ?? null;

  // 还原
  const restoreInput = panel.blockEditorEl?.querySelector('input[type="number"]');
  const innerSave = Array.from(panel.blockEditorEl?.querySelectorAll('button') || []).find(btn => btn.textContent.trim() === '保存');
  if (restoreInput && innerSave) {
    restoreInput.value = String(original);
    restoreInput.dispatchEvent(new Event('change', { bubbles: true }));
    innerSave.click();
    await wait(400);
  }
  return { original, afterGlobalSave, reopenDepth, restoredStore: storeDepth() };
})()
