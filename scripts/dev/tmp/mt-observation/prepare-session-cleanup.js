(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const actions = registry.actions || {};
  const sessionPanel = registry.panels?.sessionPanel;
  if (!sessionPanel?.show || !actions.getAgentTool) {
    return { ok: false, reason: 'session_cleanup_runtime_missing' };
  }

  for (let index = 0; index < 8; index += 1) {
    if (actions.closeTopAppLayer?.() !== true) break;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  await sessionPanel.show();
  await new Promise(resolve => setTimeout(resolve, 600));

  const toolRegistry = registry.stores?.agentToolRegistry;
  const inspectOutput = await toolRegistry?.executeTool?.('app.ui.inspect', { panel: 'session' }, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  const summary = inspectOutput?.result || null;
  const panelSummary = summary?.panels?.find?.(item => item.id === 'session') || null;
  const isVisible = (node) => {
    if (!node || !node.isConnected || node.hidden === true || node.classList?.contains?.('hidden')) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  };
  const buttons = [...sessionPanel.panel.querySelectorAll('button, [role="button"]')]
    .filter(isVisible)
    .map((node) => {
      const row = node.closest('.session-row');
      return {
        label: String(node.innerText || node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
        rowName: String(row?.querySelector?.('.sticker-bind-name')?.innerText || '').replace(/\s+/g, ' ').trim(),
      };
    })
    .filter(item => item.label)
    .map((item, index) => ({
      ...item,
      index,
      ref: panelSummary?.buttons?.[index]?.ref || '',
    }));

  const targets = [
    '冻结观察会话-A-0728',
    '冻结观察会话-B-0728',
    '冻结观察会话-C-0728',
    '冻结观察会话-D-0728',
  ];
  return {
    ok: true,
    sessionId: registry.stores?.chatStore?.getCurrent?.() || '',
    panelText: panelSummary?.text || '',
    targets: targets.map(name => ({
      name,
      matches: buttons.filter(item => item.rowName.replace(/当前$/, '').trim() === name && item.label === '删除'),
    })),
  };
})()
