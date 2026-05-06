export const openCompactedRawFlow = ({
  sessionId = '',
  getCompactedSummaryRaw = () => '',
  ensureModal = () => {},
  setRawValue = () => {},
  showModal = () => {},
  focusTextarea = () => {},
  toastr = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const raw = String(getCompactedSummaryRaw?.(sid) || '').trim();
  if (!raw) {
    toastr?.info?.('暂无本次大总结的原始回复（旧数据可能未记录）');
    return false;
  }
  ensureModal?.();
  setRawValue?.(raw);
  showModal?.();
  setTimeout(() => {
    try { focusTextarea?.(); } catch {}
  }, 0);
  return true;
};

export const openCompactedSummaryEditFlow = ({
  sessionId = '',
  getCompactedSummary = () => null,
  getCompactedSummaryRaw = () => '',
  ensureModal = () => {},
  setOnSave = () => {},
  setTextareaValue = () => {},
  showModal = () => {},
  focusTextarea = () => {},
  setCompactedSummary = () => {},
  renderCompactedSummary = () => {},
  closeModal = () => {},
  dispatchUpdated = () => {},
  toastr = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const compactedSummary = getCompactedSummary?.(sid);
  const text = String(compactedSummary?.text || '').trim();
  if (!text) {
    toastr?.info?.('暂无大总结可编辑');
    return false;
  }
  ensureModal?.();
  setOnSave?.((next) => {
    const normalized = String(next || '').trim();
    if (!normalized) {
      toastr?.error?.('内容不能为空');
      return;
    }
    const raw = String(getCompactedSummaryRaw?.(sid) || '');
    try { setCompactedSummary?.(normalized, sid, { raw }); } catch {}
    try { dispatchUpdated?.(sid); } catch {}
    renderCompactedSummary?.();
    try { closeModal?.(); } catch {}
    toastr?.success?.('已更新大总结');
  });
  setTextareaValue?.(text);
  showModal?.();
  setTimeout(() => {
    try { focusTextarea?.(); } catch {}
  }, 0);
  return true;
};

export const runDeleteSelectedSummariesFlow = async ({
  sessionId = '',
  selectedKeys = [],
  confirm = async () => false,
  buildSelectedSummaryEntries = () => [],
  deleteSummaryItems = () => {},
  setSummaryBatchMode = () => {},
  renderSummaries = () => {},
  toastr = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const keys = Array.isArray(selectedKeys) ? selectedKeys : [];
  if (!keys.length) {
    toastr?.info?.('未选择任何摘要');
    return false;
  }
  const ok = await confirm?.({
    title: '删除摘要',
    message: `确定要删除所选摘要（${keys.length}条）吗？`,
    danger: true,
  });
  if (!ok) return false;
  const items = buildSelectedSummaryEntries?.(keys) || [];
  try { deleteSummaryItems?.(items, sid); } catch {}
  setSummaryBatchMode?.(false);
  renderSummaries?.();
  return true;
};

export const runEditSelectedSummariesFlow = ({
  sessionId = '',
  selectedKeys = [],
  buildSelectedSummaryEntries = () => [],
  openSummaryEditModal = () => {},
  parseEditedSummaryLines = () => [],
  updateSummaryItems = () => {},
  closeSummaryEditModal = () => {},
  setSummaryBatchMode = () => {},
  renderSummaries = () => {},
  toastr = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const keys = Array.isArray(selectedKeys) ? selectedKeys : [];
  if (!keys.length) {
    toastr?.info?.('未选择任何摘要');
    return false;
  }
  const entries = buildSelectedSummaryEntries?.(keys) || [];
  const initial = entries.map((entry) => `- ${entry.text}`).join('\n');
  openSummaryEditModal?.(initial, (nextRaw) => {
    const lines = parseEditedSummaryLines?.(nextRaw) || [];
    if (lines.length !== entries.length) {
      toastr?.error?.(`行数不匹配：需要 ${entries.length} 行，实际 ${lines.length} 行`);
      return;
    }
    const updates = entries.map((entry, index) => ({
      at: entry.at,
      fromText: entry.text,
      toText: lines[index],
    }));
    try { updateSummaryItems?.(updates, sid); } catch {}
    closeSummaryEditModal?.();
    setSummaryBatchMode?.(false);
    renderSummaries?.();
  });
  return true;
};

export const runCompactedSummaryGenerationFlow = async ({
  sessionId = '',
  summaryCompacting = false,
  setSummaryCompacting = () => {},
  resolveRequestSummaryCompaction = () => null,
  waitForRetry = () => new Promise((resolve) => setTimeout(resolve, 50)),
  renderSummaries = () => {},
  renderCompactedSummary = () => {},
  logger = null,
  toastr = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid || summaryCompacting) return false;
  let fn = resolveRequestSummaryCompaction?.();
  if (typeof fn !== 'function') {
    await waitForRetry?.();
    fn = resolveRequestSummaryCompaction?.();
  }
  if (typeof fn !== 'function') {
    toastr?.error?.('大总结生成器尚未初始化，请稍后再试');
    return false;
  }
  setSummaryCompacting?.(true);
  try {
    toastr?.info?.('正在生成大总结…');
    const ok = await fn(sid, { force: true });
    if (!ok) {
      toastr?.error?.('大总结解析失败：未输出 <summary>…</summary> 或内容格式不符合要求，请重试');
    }
    renderSummaries?.();
    renderCompactedSummary?.();
    return Boolean(ok);
  } catch (err) {
    logger?.warn?.('手动生成大总结失败', err);
    toastr?.error?.('生成失败');
    return false;
  } finally {
    setSummaryCompacting?.(false);
  }
};
