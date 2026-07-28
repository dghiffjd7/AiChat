(() => {
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  const button = buttons.find(item => String(item.textContent || '').trim() === '允许一次');
  if (!button) {
    return {
      clicked: false,
      visibleButtons: buttons.map(item => String(item.textContent || '').trim()).filter(Boolean).slice(0, 30),
    };
  }
  const dialog = button.closest('[role="dialog"], .app-modal, .modal, .overlay') || button.parentElement;
  const title = String(
    dialog?.querySelector?.('h1, h2, h3, .app-confirm-title, .modal-title')?.textContent || '',
  ).trim();
  button.click();
  return {
    clicked: true,
    button: '允许一次',
    title: title.slice(0, 120),
  };
})()
