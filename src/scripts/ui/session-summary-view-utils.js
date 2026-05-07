import { normalizeSummaryItems, renderCompactedSummary, renderSummaryList } from './session-summary-utils.js';

export const renderSessionSummariesSection = ({
  container = null,
  sessionId = '',
  chatStore = null,
  batchMode = false,
  selectedKeys = new Set(),
  onSelectionChange = () => {},
  copyText = async () => {},
  copySuccessText = '已复制摘要',
  normalRowStyle = '',
} = {}) => {
  if (!container || !chatStore || !sessionId) return false;
  const items = normalizeSummaryItems(chatStore.getSummaries(sessionId) || []);
  renderSummaryList({
    container,
    items,
    batchMode,
    selectedKeys,
    onToggleSelected: (key) => {
      const next = new Set(selectedKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange(next, key);
    },
    onCopyText: async (text) => {
      await copyText(text);
      window.toastr?.success?.(copySuccessText);
    },
    normalRowStyle,
  });
  return true;
};

export const renderSessionCompactedSummarySection = ({
  container = null,
  sessionId = '',
  chatStore = null,
  copyText = async () => {},
  copySuccessText = '已复制大总结',
} = {}) => {
  if (!container || !chatStore || !sessionId) return false;
  renderCompactedSummary({
    container,
    compactedSummary: chatStore.getCompactedSummary?.(sessionId),
    onCopyText: async (text) => {
      await copyText(text);
      window.toastr?.success?.(copySuccessText);
    },
  });
  return true;
};
