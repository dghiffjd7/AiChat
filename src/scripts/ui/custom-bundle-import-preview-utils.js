import {
  normalizeCustomBundleCompactedSummary,
  normalizeCustomBundleSummaryList,
} from './custom-bundle-conversation-utils.js';

const ensureArray = value => (Array.isArray(value) ? value : []);

export const buildCustomBundleImportPreview = (packageData = {}) => {
  const roles = ensureArray(packageData?.manifest?.roles);
  const roomRecords = Array.from(packageData?.roomMap?.values?.() || []);
  const chatCount = roomRecords.filter(room => room?.manifest?.uiMode === 'chat').length;
  const rpCount = roomRecords.filter(room => room?.manifest?.uiMode === 'rp').length;
  const archiveCount = roomRecords.reduce((sum, room) => sum + ensureArray(room?.archives).length, 0);
  const options = packageData?.manifest?.options || {};
  const fallbackMomentScopes = ensureArray(packageData?.roles).filter((role) => {
    const payload = role?.momentsPayload || null;
    return Boolean(
      ensureArray(payload?.moments).length
      || normalizeCustomBundleSummaryList(payload?.summaries || []).length
      || normalizeCustomBundleCompactedSummary(payload?.compactedSummary || null),
    );
  }).length;
  const fallbackMomentEntries = ensureArray(packageData?.roles).reduce((sum, role) => (
    sum + ensureArray(role?.momentsPayload?.moments).length
  ), 0);
  const fallbackMomentSummaries = ensureArray(packageData?.roles).reduce((sum, role) => (
    sum + normalizeCustomBundleSummaryList(role?.momentsPayload?.summaries || []).length
  ), 0);
  const fallbackMomentCompacted = ensureArray(packageData?.roles).reduce((sum, role) => (
    sum + (normalizeCustomBundleCompactedSummary(role?.momentsPayload?.compactedSummary || null) ? 1 : 0)
  ), 0);
  return {
    roles: roles.length,
    chats: chatCount,
    creative: rpCount,
    archives: archiveCount,
    moments: Number(packageData?.manifest?.summary?.momentEntries || 0) || fallbackMomentEntries,
    momentScopes: Number(packageData?.manifest?.summary?.moments || 0) || fallbackMomentScopes,
    momentSummaries: Number(packageData?.manifest?.summary?.momentSummaries || 0) || fallbackMomentSummaries,
    momentCompacted: Number(packageData?.manifest?.summary?.momentCompacted || 0) || fallbackMomentCompacted,
    includeConversationContent: options.includeConversationContent === true,
    includeMemoryData: options.includeMemoryData === true,
    includeVariableState: options.includeVariableState === true,
    hideServiceAddresses: options.hideServiceAddresses === true,
  };
};

export const buildCustomBundleImportConfirmLines = ({
  preview = {},
  fileName = '',
} = {}) => {
  const lines = [
    `文件：${String(fileName || '自定义资料包').trim() || '自定义资料包'}`,
    `角色 ${preview.roles} 个`,
    `聊天室 ${preview.chats} 个`,
    `创意写作 ${preview.creative} 个`,
    `历史存档 ${preview.archives} 个`,
    preview.includeConversationContent ? '包含聊天正文 / 创作正文' : '不含聊天正文 / 创作正文',
    preview.includeMemoryData ? '包含记忆表格已填数据' : '不含记忆表格已填数据',
    preview.includeVariableState ? '包含变量快照' : '不含变量快照',
    preview.hideServiceAddresses ? '已隐藏服务地址' : '保留服务地址',
  ];
  if (preview.moments || preview.momentSummaries || preview.momentCompacted) {
    lines.splice(4, 0, `动态 ${preview.moments} 条`);
    lines.splice(5, 0, `动态摘要 ${preview.momentSummaries} 条${preview.momentCompacted ? ' · 含大总结' : ''}`);
  }
  return lines;
};
