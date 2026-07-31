(async () => {
  const visible = node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && rect.width > 0 && rect.height > 0;
  };
  const buttons = Array.from(document.querySelectorAll('button'))
    .filter(visible)
    .map(button => ({
      text: String(button.textContent || '').trim(),
      disabled: Boolean(button.disabled),
      ariaDisabled: button.getAttribute('aria-disabled'),
      className: String(button.className || ''),
      pointerEvents: getComputedStyle(button).pointerEvents,
    }))
    .filter(item => /接受|应用|取消|确认|允许/.test(item.text));
  const dialogs = Array.from(document.querySelectorAll(
    '[role="dialog"], .modal, .dialog, [class*="format-patch"], [class*="diff"]',
  ))
    .filter(visible)
    .map(dialog => ({
      tag: dialog.tagName,
      className: String(dialog.className || ''),
      text: String(dialog.textContent || '').trim().slice(0, 5000),
    }))
    .slice(-10);
  const applyButton = Array.from(document.querySelectorAll('button')).find(button => (
    /^应用已接受修改/.test(String(button.textContent || '').trim())
  ));
  const ancestors = [];
  let current = applyButton?.parentElement || null;
  while (current && ancestors.length < 6) {
    ancestors.push({
      tag: current.tagName,
      id: String(current.id || ''),
      className: String(current.className || ''),
      text: String(current.textContent || '').trim().slice(0, 5000),
    });
    current = current.parentElement;
  }
  return { buttons, dialogs, ancestors };
})()
