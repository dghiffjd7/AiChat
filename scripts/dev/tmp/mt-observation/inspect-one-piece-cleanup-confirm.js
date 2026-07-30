(() => {
  const visible = node => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  return {
    taskState: window.__obsTaskState || null,
    permissionLog: window.__obsPermissionLog || [],
    dialogs: [...document.querySelectorAll('[role="dialog"], .app-confirm-modal, .app-confirm-dialog, .modal, .overlay')]
      .filter(visible)
      .map(item => ({
        className: String(item.className || ''),
        text: String(item.textContent || '').trim().slice(0, 1000),
        buttons: [...item.querySelectorAll('button')].filter(visible).map(button => ({
          className: String(button.className || ''),
          text: String(button.textContent || '').trim(),
        })),
      })),
  };
})()
