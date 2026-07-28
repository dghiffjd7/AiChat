(() => {
  const allowedTargets = new Set([
    '冻结观察会话-A-0728',
    '冻结观察会话-B-0728',
    '冻结观察会话-C-0728',
    '冻结观察会话-D-0728',
  ]);
  const cancelled = [];
  const seen = [];
  for (const overlay of document.querySelectorAll('.app-confirm-modal')) {
    const message = String(overlay.querySelector('.app-confirm-body')?.textContent || '').trim();
    seen.push({
      className: String(overlay.className || ''),
      text: String(overlay.innerText || overlay.textContent || '').replace(/\s+/g, ' ').trim(),
      message,
    });
    const match = message.match(/^確認删除：(.+?)？此操作会删除聊天室与好友记录（不可恢复）。$/);
    if (!match || !allowedTargets.has(match[1])) continue;
    const cancelButton = overlay.querySelector('.app-confirm-cancel');
    if (!cancelButton) continue;
    cancelButton.click();
    cancelled.push({ target: match[1], message });
  }
  return { ok: true, seen, cancelled };
})()
