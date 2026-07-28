(() => {
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const button = [...document.querySelectorAll('button')]
    .filter(visible)
    .find(item => (
      item.dataset?.maidGuideAction === 'skip' ||
      String(item.textContent || '').trim() === '跳过引导'
    ));
  if (!button) return { clicked: false };
  const dialog = button.closest('[role="dialog"]');
  const label = String(dialog?.getAttribute?.('aria-label') || '').trim();
  button.click();
  return {
    clicked: true,
    button: '跳过引导',
    dialog: label,
  };
})()
