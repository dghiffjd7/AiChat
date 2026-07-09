(() => {
  const panel = document.querySelector('.agent-center-panel, [data-panel="agent-center"], #agent-center-panel');
  const root = panel || document;
  const chips = [...root.querySelectorAll('button, .chip, .filter-item')].filter(el => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && r.width > 0 && /失败|全部|进行中|成功|已取消|等待/.test(el.textContent || '');
  }).map(el => ({ text: el.textContent.trim().slice(0, 24), cls: el.className.slice(0, 70), active: /active|selected|is-on|checked/.test(el.className) || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' }));
  const reg = window.appBridge?.debugUiRegistry;
  const runs = reg?.stores?.agentRunStore?.listRuns?.() || [];
  const arr = Array.isArray(runs) ? runs : runs?.runs || [];
  const failed = arr.filter(r => r.status === 'failed').length;
  return { chips: chips.slice(0, 14), storeCounts: { total: arr.length, failed, cancelled: arr.filter(r => r.status === 'cancelled').length } };
})()
