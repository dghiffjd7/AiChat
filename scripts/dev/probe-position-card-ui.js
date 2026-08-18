(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  if (!panel) return { error: 'presetPanel missing' };
  await panel.show({ section: 'sysprompt' });
  await new Promise(resolve => setTimeout(resolve, 400));
  const card = Array.from(document.querySelectorAll('.pp-block'))
    .find(el => el.querySelector('.pp-block-title')?.textContent?.includes('文本协议聊天格式位置'));
  if (!card) return { error: 'placement card not found' };
  const selects = card.querySelectorAll('select.pp-input');
  const customButtons = card.querySelectorAll('.world-app-select-btn');
  const labels = Array.from(customButtons).map(btn => btn.querySelector('.pp-custom-select-label')?.textContent?.trim());
  const chatSelect = card.querySelector('#phone-format-chat-position');
  const chatDepth = card.querySelector('#phone-format-chat-depth');
  const depthHiddenBefore = chatDepth?.closest('div')?.parentElement?.hidden ?? chatDepth?.parentElement?.hidden;
  chatSelect.value = 'history_depth';
  chatSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  const depthVisibleAfter = !(chatDepth?.parentElement?.hidden);
  const buttonLabelAfter = card.querySelector('[data-select-id="phone-format-chat-position"] .pp-custom-select-label')?.textContent?.trim();
  chatSelect.value = 'history_before';
  chatSelect.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    selectCount: selects.length,
    customButtonCount: customButtons.length,
    initialLabels: labels,
    depthToggleWorks: depthVisibleAfter === true,
    buttonLabelAfter,
  };
})()
