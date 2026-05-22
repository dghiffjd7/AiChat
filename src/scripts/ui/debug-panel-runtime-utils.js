import {
  buildBridgeContractDiagnosticsMeta,
  buildAgentRunDiagnosticsText,
  buildAgentRunDiagnosticsView,
  buildAgentRunDiagnosticsViewMeta,
  buildCustomBundleDiagnosticsMeta,
  buildDebugTraceTimelineDiagnosticsMeta,
  buildDebugTextFilename,
  buildProviderToolExperimentDiagnosticsMeta,
  buildStorageMigrationDiagnosticsMeta,
  buildViewportKeyboardDiagnosticsMeta,
  collectErrorLogs,
  formatBridgeContractDiagnostics,
  formatCustomBundleDiagnostics,
  formatDebugTraceTimelineDiagnostics,
  formatErrorLogs,
  formatProviderToolExperimentDiagnostics,
  formatStorageMigrationDiagnostics,
  formatViewportKeyboardDiagnostics,
} from './debug-panel-utils.js';
import { buildStorageMigrationChecklist } from '../storage/storage-migration-contracts.js';
import { formatVisibleDebugLogsText } from './debug-panel-log-utils.js';

export const createDebugViewerTextBindings = ({
  metaEl = null,
  textEl = null,
} = {}) => ({
  hasViewer: () => Boolean(textEl),
  getText: () => String(textEl?.value || ''),
  setMeta: (value) => {
    if (metaEl) metaEl.textContent = value;
  },
  setText: (value) => {
    if (textEl) textEl.value = value;
  },
});

export const createDetachedTextareaCopyFallback = ({
  documentRef = globalThis.document,
  execCommand = (command) => documentRef?.execCommand?.(command),
} = {}) => async (text) => {
  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.setAttribute('readonly', 'true');
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = execCommand?.('copy');
  textarea.remove();
  return copied;
};

export const createSelectedTextareaCopyFallback = ({
  textEl = null,
  execCommand = (command) => globalThis.document?.execCommand?.(command),
} = {}) => async () => {
  textEl?.select?.();
  return execCommand?.('copy');
};

export const refreshCustomBundleDiagnosticsView = ({
  snapshot = null,
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const meta = buildCustomBundleDiagnosticsMeta(snapshot);
  const text = formatCustomBundleDiagnostics(snapshot);
  setMeta?.(meta);
  setText?.(text);
  return { meta, text };
};

export const handleCustomBundleDiagnosticsLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`资料包导入诊断加载失败\n\n${normalized}`);
  logWarn?.(`资料包导入诊断加载失败: ${normalized}`);
  return normalized;
};

export const refreshStorageMigrationDiagnosticsView = ({
  checklist = null,
  buildChecklist = buildStorageMigrationChecklist,
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const list = Array.isArray(checklist) ? checklist : buildChecklist?.() || [];
  const meta = buildStorageMigrationDiagnosticsMeta(list);
  const text = formatStorageMigrationDiagnostics(list);
  setMeta?.(meta);
  setText?.(text);
  return { meta, text, count: list.length };
};

export const handleStorageMigrationDiagnosticsLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`存储迁移检查表加载失败\n\n${normalized}`);
  logWarn?.(`存储迁移检查表加载失败: ${normalized}`);
  return normalized;
};

export const refreshBridgeContractDiagnosticsView = ({
  registry = null,
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const meta = buildBridgeContractDiagnosticsMeta(registry);
  const text = formatBridgeContractDiagnostics(registry);
  setMeta?.(meta);
  setText?.(text);
  return { meta, text };
};

export const handleBridgeContractDiagnosticsLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`Bridge contract 诊断加载失败\n\n${normalized}`);
  logWarn?.(`Bridge contract 诊断加载失败: ${normalized}`);
  return normalized;
};

export const refreshViewportKeyboardDiagnosticsView = ({
  snapshot = null,
  getSnapshot = null,
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const data = snapshot || (typeof getSnapshot === 'function' ? getSnapshot() : null);
  const meta = buildViewportKeyboardDiagnosticsMeta(data);
  const text = formatViewportKeyboardDiagnostics(data);
  setMeta?.(meta);
  setText?.(text);
  return { meta, text, snapshot: data };
};

export const handleViewportKeyboardDiagnosticsLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`键盘/视口诊断加载失败\n\n${normalized}`);
  logWarn?.(`键盘/视口诊断加载失败: ${normalized}`);
  return normalized;
};

export const refreshDebugTraceTimelineView = ({
  timeline = null,
  events = null,
  snapshotOptions = { limit: 200 },
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const list = Array.isArray(events)
    ? events
    : (typeof timeline?.snapshot === 'function' ? timeline.snapshot(snapshotOptions) : []);
  const meta = buildDebugTraceTimelineDiagnosticsMeta(list);
  const text = formatDebugTraceTimelineDiagnostics(list);
  setMeta?.(meta);
  setText?.(text);
  return { meta, text, count: list.length };
};

export const handleDebugTraceTimelineLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`事件时间线加载失败\n\n${normalized}`);
  logWarn?.(`事件时间线加载失败: ${normalized}`);
  return normalized;
};

export const refreshAgentRunDiagnosticsView = ({
  store = null,
  runs = null,
  events = null,
  providerToolExperimentDiagnostics = null,
  options = { limit: 80 },
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const opts = options && typeof options === 'object' ? options : {};
  const list = Array.isArray(runs)
    ? runs
    : (typeof store?.listRuns === 'function' ? store.listRuns({ limit: opts.limit || 80 }) : []);
  const eventList = Array.isArray(events)
    ? events
    : (typeof store?.listEvents === 'function' ? store.listEvents({ limit: opts.eventLimit || 500 }) : []);
  const view = buildAgentRunDiagnosticsView({
    runs: list,
    events: eventList,
    options: opts,
  });
  const agentMeta = buildAgentRunDiagnosticsViewMeta({
    runs: list,
    events: eventList,
    options: opts,
  });
  const agentText = buildAgentRunDiagnosticsText({
    runs: list,
    events: eventList,
    options: opts,
  });
  const providerMeta = providerToolExperimentDiagnostics
    ? buildProviderToolExperimentDiagnosticsMeta(providerToolExperimentDiagnostics)
    : '';
  const meta = providerMeta ? `${agentMeta} · ${providerMeta}` : agentMeta;
  const providerText = providerToolExperimentDiagnostics
    ? formatProviderToolExperimentDiagnostics(providerToolExperimentDiagnostics)
    : '';
  const text = providerText ? `${agentText}\n\n---\n\n${providerText}` : agentText;
  setMeta?.(meta);
  setText?.(text);
  return { meta, text, view };
};

export const handleAgentRunDiagnosticsLoadError = ({
  error = null,
  setMeta = () => {},
  setText = () => {},
  logWarn = () => {},
} = {}) => {
  const message = error?.message ? String(error.message) : String(error || '');
  const normalized = message || 'unknown error';
  setMeta?.(`加载失败: ${normalized}`);
  setText?.(`Agent run 诊断加载失败\n\n${normalized}`);
  logWarn?.(`Agent run 诊断加载失败: ${normalized}`);
  return normalized;
};

export const refreshErrorLogView = ({
  logs = [],
  setMeta = () => {},
  setText = () => {},
} = {}) => {
  const list = collectErrorLogs(logs);
  const text = formatErrorLogs(logs);
  setMeta?.(`共 ${list.length} 条`);
  setText?.(text);
  return { count: list.length, text };
};

export const copyDebugTextFlow = async ({
  text = '',
  writeText = async () => {},
  fallbackCopy = async () => false,
  onWarning = () => {},
  onSuccess = () => {},
  onError = () => {},
  emptyMessage = '暂无内容可复制',
  successMessage = '已复制',
  errorMessage = '复制失败',
} = {}) => {
  const content = String(text || '');
  if (!content) {
    onWarning?.(emptyMessage);
    return false;
  }
  try {
    await writeText?.(content);
    onSuccess?.(successMessage);
    return true;
  } catch {
    try {
      const copied = await fallbackCopy?.(content);
      if (copied === false) throw new Error('fallback copy failed');
      onSuccess?.(successMessage);
      return true;
    } catch {
      onError?.(errorMessage);
      return false;
    }
  }
};

export const copyVisibleDebugLogsFlow = async ({
  logs = [],
  writeText = async () => {},
  fallbackCopy = async () => false,
  onWarning = () => {},
  onSuccess = () => {},
  onError = () => {},
} = {}) => {
  const list = Array.isArray(logs) ? logs : [];
  const successMessage = `已复制 ${list.length} 条日志`;
  return await copyDebugTextFlow({
    text: formatVisibleDebugLogsText(list),
    writeText,
    fallbackCopy,
    onWarning,
    onSuccess,
    onError,
    emptyMessage: '暂无日志可复制',
    successMessage,
    errorMessage: '复制失败',
  });
};

export const exportDebugTextFlow = async ({
  text = '',
  filenamePrefix = 'debug',
  successLabel = 'TXT 已导出',
  emptyMessage = '暂无内容可导出',
  exportFailureToast = '导出失败',
  exportFailurePrefix = '导出失败: ',
  buildFilename = buildDebugTextFilename,
  exportTextFile = async () => false,
  onWarning = () => {},
  onLogWarn = () => {},
  onError = () => {},
} = {}) => {
  const content = String(text || '');
  if (!content.trim()) {
    onWarning?.(emptyMessage);
    return false;
  }
  try {
    const filename = buildFilename?.(filenamePrefix) || buildDebugTextFilename(filenamePrefix);
    await exportTextFile?.(content, filename, successLabel);
    return true;
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error || '');
    const normalized = message || 'unknown error';
    onLogWarn?.(`${exportFailurePrefix}${normalized}`);
    onError?.(exportFailureToast);
    return false;
  }
};
