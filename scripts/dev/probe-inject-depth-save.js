(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel missing' };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const readEditorState = () => {
    const host = panel.blockEditorEl;
    const selects = Array.from(host?.querySelectorAll('select.pp-input') || []);
    const depth = host?.querySelector('input[type="number"]') || null;
    return {
      selectCount: selects.length,
      position: selects[0]?.value ?? null,
      depth: depth?.value ?? null,
    };
  };

  await panel.show({ section: 'custom' });
  await wait(400);
  panel.openInjectBlockEditor('dialogue');
  await wait(300);
  const before = readEditorState();

  const host = panel.blockEditorEl;
  const depthInput = host.querySelector('input[type="number"]');
  const saveBtn = Array.from(host.querySelectorAll('button')).find(btn => btn.textContent.trim() === '保存');
  if (!depthInput || !saveBtn) return { error: 'editor controls missing', before };
  const originalDepth = depthInput.value;
  depthInput.value = '7';
  depthInput.dispatchEvent(new Event('input', { bubbles: true }));
  depthInput.dispatchEvent(new Event('change', { bubbles: true }));
  saveBtn.click();
  await wait(700);

  // 重开编辑器读回
  panel.openInjectBlockEditor('dialogue');
  await wait(300);
  const afterReopen = readEditorState();

  // 存储侧读回：agent-center settings 与 overlay 后的 sysp
  const settings = registry.actions?.getAgentCenterSettings?.() || {};
  const resolvedInfo = panel.getInjectSyspromptResolved();
  const profile = settings?.profiles?.[`sysprompt:${resolvedInfo.presetId}`] || null;
  const promptCfg = profile?.agents?.dialogue_agent?.prompts?.dialogue || null;

  // 还原
  const depthInput2 = panel.blockEditorEl.querySelector('input[type="number"]');
  const saveBtn2 = Array.from(panel.blockEditorEl.querySelectorAll('button')).find(btn => btn.textContent.trim() === '保存');
  if (depthInput2 && saveBtn2) {
    depthInput2.value = String(originalDepth);
    depthInput2.dispatchEvent(new Event('change', { bubbles: true }));
    saveBtn2.click();
  }
  await wait(500);

  return {
    presetId: resolvedInfo.presetId,
    before,
    afterReopen,
    storedPromptDepth: promptCfg ? promptCfg.depth : null,
    overlayDepth: resolvedInfo.sysp?.dialogue_depth ?? null,
  };
})()
