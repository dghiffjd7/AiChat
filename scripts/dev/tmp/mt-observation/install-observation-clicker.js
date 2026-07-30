(() => {
  if (window.__obsPermissionTimer) clearInterval(window.__obsPermissionTimer);
  if (!Array.isArray(window.__obsPermissionLog)) window.__obsPermissionLog = [];
  window.__obsClickedButtons = new WeakSet();
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  window.__obsPermissionTimer = setInterval(() => {
    try {
      const state = window.__obsTaskState || {};
      if (state.pending !== true) return;
      const buttons = [...document.querySelectorAll('button')]
        .filter(item => visible(item) && !window.__obsClickedButtons.has(item));
      let button = null;
      if (state.autoConfirm === true) {
        button = buttons.find(item => String(item.textContent || '').trim() === '允许一次') || null;
      }
      const structuredDeleteTaskIds = new Set([
        'memory-system-v4f-b-0730-009',
        'memory-system-v4f-b-0730-010',
        'memory-system-v4f-b-0730-011',
        'memory-system-g35-b-0730-009',
        'memory-system-g35-b-0730-010',
        'memory-system-g35-b-0730-011',
      ]);
      if (!button && structuredDeleteTaskIds.has(String(state.taskId || ''))) {
        button = buttons.find(item => String(item.textContent || '').trim() === '确认删除') || null;
      }
      if (!button && state.allowSubAgent === true) {
        button = buttons.find(item => String(item.textContent || '').trim() === '允许') || null;
      }
      if (!button && state.autoDeny === true) {
        button = buttons.find(item => ['取消', '拒绝', '不允许', '用主模型', '新建副本'].includes(
          String(item.textContent || '').trim(),
        )) || null;
      }
      if (button) {
        const dialog = button.closest('[role="dialog"], .app-confirm-dialog, .app-modal, .modal, .overlay')
          || button.parentElement;
        const title = String(
          dialog?.querySelector?.('h1, h2, h3, .app-confirm-title, .modal-title')?.textContent || '',
        ).trim();
        window.__obsClickedButtons.add(button);
        window.__obsPermissionLog.push({
          at: Date.now(),
          taskId: state.taskId || '',
          kind: 'confirmation',
          title: title.slice(0, 120),
          button: String(button.textContent || '').trim(),
        });
        button.click();
      }
      if (state.followGuide !== true) {
        const skipGuideButton = buttons.find(item => (
          item.matches('[data-maid-guide-action="skip"]') ||
          String(item.textContent || '').trim() === '跳过引导'
        )) || null;
        if (skipGuideButton) {
          window.__obsClickedButtons.add(skipGuideButton);
          window.__obsPermissionLog.push({
            at: Date.now(),
            taskId: state.taskId || '',
            kind: 'guide_skip',
            title: '女仆首次功能引导',
            button: String(skipGuideButton.textContent || '').trim(),
          });
          skipGuideButton.click();
        }
      }
    } catch (error) {
      window.__obsPermissionLog.push({
        at: Date.now(),
        taskId: window.__obsTaskState?.taskId || '',
        kind: 'clicker_error',
        title: String(error?.message || error).slice(0, 160),
      });
    }
  }, 300);
  return {
    installed: true,
    taskId: window.__obsTaskState?.taskId || '',
    autoConfirm: window.__obsTaskState?.autoConfirm === true,
    autoDeny: window.__obsTaskState?.autoDeny === true,
    allowSubAgent: window.__obsTaskState?.allowSubAgent === true,
  };
})()
