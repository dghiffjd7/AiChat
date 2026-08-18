(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel missing' };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  await panel.show({ section: 'custom' });
  await wait(400);
  const scopeSelect = panel.detailEditorEl?.querySelector('#preset-app-scope');
  if (!scopeSelect) return { error: 'scope select missing' };
  const originalScope = scopeSelect.value;

  const chipSnapshot = () => {
    const chips = Array.from(panel.injectBarEl?.querySelectorAll('.pp-inject-chip') || []);
    return {
      count: chips.length,
      locked: chips.filter(chip => chip.classList.contains('is-scope-locked')).length,
      onCount: chips.filter(chip => chip.classList.contains('is-on')).length,
    };
  };

  scopeSelect.value = 'creative';
  scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(200);
  const creativeState = chipSnapshot();
  const injectCardCountCreative = panel.openaiBlocksListEl?.querySelectorAll('.pp-inject-block').length ?? -1;
  panel.injectBarEl?.querySelector('.pp-inject-chip')?.click();
  await wait(150);
  const statusText = panel.element?.querySelector('.pp-status')?.textContent?.trim()
    || document.querySelector('#preset-panel .pp-status')?.textContent?.trim()
    || '';

  scopeSelect.value = 'all';
  scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(200);
  const allState = chipSnapshot();

  scopeSelect.value = originalScope;
  scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(150);

  // 位置卡内边距
  await panel.show({ section: 'sysprompt' });
  await wait(300);
  const card = Array.from(document.querySelectorAll('.pp-block'))
    .find(el => el.querySelector('.pp-block-title')?.textContent?.includes('文本协议聊天格式位置'));
  const cardPadding = card ? getComputedStyle(card).padding : null;

  return {
    originalScope,
    creativeState,
    injectCardCountCreative,
    clickHint: statusText.slice(0, 60),
    allState,
    cardPadding,
  };
})()
