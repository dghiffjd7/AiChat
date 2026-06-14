import {
  buildConversationExportFilename,
  exportConversationTextFile,
  formatConversationExport,
} from './chat/conversation-export-utils.js';

const EXPORT_ACTIONS = [
  { id: 'md-body', label: '正文 Markdown', primary: true },
  { id: 'md-full', label: '完整 Markdown' },
  { id: 'txt-body', label: '正文 TXT' },
  { id: 'txt-full', label: '完整 TXT' },
];

const parseExportAction = (actionId = '') => {
  const raw = String(actionId || '').trim();
  if (!raw) return null;
  const [format, mode] = raw.split('-');
  if (!['md', 'txt'].includes(format) || !['body', 'full'].includes(mode)) return null;
  return { format, mode };
};

const cloneMessages = messages => (
  Array.isArray(messages)
    ? messages.map(message => (message && typeof message === 'object' ? { ...message } : message)).filter(Boolean)
    : []
);

export const loadConversationExportMessages = async ({
  chatStore = null,
  sessionId = '',
  archiveId = '',
  current = false,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!chatStore || !sid) return [];
  const aid = current
    ? String(chatStore.getCurrentArchiveId?.(sid) || '').trim()
    : String(archiveId || '').trim();
  let messages = [];
  if (typeof chatStore.exportThreadMessages === 'function') {
    messages = await chatStore.exportThreadMessages(sid, aid);
  }
  if (current && (!Array.isArray(messages) || !messages.length)) {
    messages = chatStore.getMessages?.(sid) || [];
  }
  const out = cloneMessages(messages);
  if (typeof chatStore.prefetchRawOriginalsForMessages === 'function') {
    try {
      await chatStore.prefetchRawOriginalsForMessages(out, sid, { limit: out.length });
    } catch {}
  }
  return out;
};

export const runSessionConversationExportFlow = async ({
  chatStore = null,
  sessionId = '',
  archive = null,
  current = false,
  title = '',
  sourceLabel = '',
  appChoiceFn = null,
  exportTextFile = exportConversationTextFile,
  now = () => new Date(),
  toastSuccess = null,
  toastWarning = null,
  toastError = null,
  logger = console,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!chatStore || !sid) return false;
  const archiveId = String(archive?.id || '').trim();
  const displayTitle = String(title || (current ? '当前聊天' : archive?.name) || sid || '聊天记录').trim();
  const actionId = await appChoiceFn?.({
    title: '导出聊天记录',
    message: current
      ? '选择当前聊天的导出格式。正文导出只包含聊天室显示正文；完整导出会尽量包含处理前原文和请求推理。'
      : `选择存档「${archive?.name || '未命名存档'}」的导出格式。`,
    actions: EXPORT_ACTIONS,
    defaultActionId: 'md-body',
  });
  const parsed = parseExportAction(actionId);
  if (!parsed) return false;

  try {
    const messages = await loadConversationExportMessages({ chatStore, sessionId: sid, archiveId, current });
    if (!messages.length) {
      toastWarning?.('没有可导出的聊天记录');
      return false;
    }
    const exportedAt = now();
    const text = formatConversationExport({
      messages,
      title: displayTitle,
      sourceLabel: sourceLabel || (current ? '当前聊天' : `存档：${archive?.name || archiveId || '未命名存档'}`),
      mode: parsed.mode,
      format: parsed.format,
      exportedAt,
    });
    const filename = buildConversationExportFilename({
      title: displayTitle,
      mode: parsed.mode,
      format: parsed.format,
      now: exportedAt,
    });
    const saved = await exportTextFile({
      text,
      filename,
      format: parsed.format,
      onSuccess: message => toastSuccess?.(message),
    });
    return saved === true;
  } catch (err) {
    logger?.warn?.('export conversation failed', err);
    toastError?.('导出失败，请检查控制台');
    return false;
  }
};
