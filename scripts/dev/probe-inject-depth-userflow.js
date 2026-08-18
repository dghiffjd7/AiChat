(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel missing' };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const steps = [];
  const storeDepth = () => {
    const settings = registry.actions?.getAgentCenterSettings?.() || {};
    const { presetId } = panel.getInjectSyspromptResolved();
    return {
      presetId,
      stored: settings?.profiles?.[`sysprompt:${presetId}`]?.agents?.dialogue_agent?.prompts?.dialogue?.depth ?? null,
      overlay: panel.getInjectSyspromptResolved().sysp?.dialogue_depth ?? null,
    };
  };
  const editorDepth = () => panel.blockEditorEl?.querySelector('input[type="number"]')?.value ?? null;
  const statusText = () => (panel.statusEl?.textContent || panel.element?.querySelector('.pp-status')?.textContent || '').trim();

  // 1. 进入预设 → 自定义
  await panel.show({ section: 'custom' });
  await wait(400);
  steps.push({ step: 'open-custom', ...storeDepth() });

  // 2. 点「私聊」chip（若未点亮）
  const chip = panel.injectBarEl?.querySelector('[data-inject-chip="dialogue"]');
  if (!chip) return { error: 'dialogue chip missing', steps };
  if (!chip.classList.contains('is-on')) {
    chip.click();
    await wait(250);
  }
  steps.push({ step: 'chip-on', chipOn: panel.injectBarEl?.querySelector('[data-inject-chip="dialogue"]')?.classList?.contains('is-on') === true });

  // 3. 点私聊注入卡进入编辑器
  const card = panel.openaiBlocksListEl?.querySelector('.pp-inject-block[data-inject="dialogue"] .pp-block-header');
  if (!card) return { error: 'dialogue inject card missing', steps };
  card.click();
  await wait(300);
  steps.push({ step: 'editor-open', editorDepth: editorDepth(), ...storeDepth() });
  const originalDepth = editorDepth();

  // 4. 改深度 → 保存
  const depthInput = panel.blockEditorEl.querySelector('input[type="number"]');
  depthInput.value = '6';
  depthInput.dispatchEvent(new Event('input', { bubbles: true }));
  depthInput.dispatchEvent(new Event('change', { bubbles: true }));
  const saveBtn = Array.from(panel.blockEditorEl.querySelectorAll('button')).find(btn => btn.textContent.trim() === '保存');
  saveBtn.click();
  await wait(700);
  steps.push({ step: 'after-save', status: statusText(), editorDepth: editorDepth(), ...storeDepth() });

  // 5. 切出（回二级页）
  panel.showDetailPage();
  await wait(250);
  steps.push({ step: 'back-to-detail', page: panel.currentPage, ...storeDepth() });

  // 6. 再点进私聊卡
  const card2 = panel.openaiBlocksListEl?.querySelector('.pp-inject-block[data-inject="dialogue"] .pp-block-header');
  if (!card2) return { error: 'dialogue card missing after back', steps };
  card2.click();
  await wait(300);
  steps.push({ step: 'reopen-editor', editorDepth: editorDepth(), ...storeDepth() });

  // 还原
  const depthInput2 = panel.blockEditorEl.querySelector('input[type="number"]');
  const saveBtn2 = Array.from(panel.blockEditorEl.querySelectorAll('button')).find(btn => btn.textContent.trim() === '保存');
  if (depthInput2 && saveBtn2 && originalDepth !== null) {
    depthInput2.value = String(originalDepth);
    depthInput2.dispatchEvent(new Event('change', { bubbles: true }));
    saveBtn2.click();
    await wait(400);
  }
  return { steps, restoredTo: originalDepth };
})()
