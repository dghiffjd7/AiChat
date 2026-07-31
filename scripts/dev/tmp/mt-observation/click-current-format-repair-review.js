(async () => {
  const visible = node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && rect.width > 0 && rect.height > 0;
  };
  const allAccept = Array.from(document.querySelectorAll('button')).find(candidate => (
    visible(candidate)
    && String(candidate.textContent || '').trim() === '全部接受'
  ));
  if (!allAccept) {
    return {
      ok: false,
      reason: 'format_patch_accept_all_button_not_found',
      buttons: Array.from(document.querySelectorAll('button'))
        .filter(visible)
        .map(item => String(item.textContent || '').trim())
        .filter(Boolean)
        .slice(-20),
    };
  }
  allAccept.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  const apply = Array.from(document.querySelectorAll('button')).find(candidate => (
    visible(candidate)
    && !candidate.disabled
    && /^应用已接受修改/.test(String(candidate.textContent || '').trim())
  ));
  if (!apply) {
    return {
      ok: false,
      reason: 'format_patch_apply_button_not_enabled',
      accepted: true,
    };
  }
  const text = String(apply.textContent || '').trim();
  apply.click();
  return { ok: true, accepted: true, clicked: text };
})()
