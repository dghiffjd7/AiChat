(async () => {
  const modal = document.getElementById('code-viewer-modal');
  const button = Array.from(modal?.querySelectorAll?.('button') || []).find(candidate => (
    String(candidate.textContent || '').trim() === '取消'
  ));
  if (!button) return { ok: false, reason: 'format_patch_cancel_button_not_found' };
  button.click();
  return { ok: true };
})()
