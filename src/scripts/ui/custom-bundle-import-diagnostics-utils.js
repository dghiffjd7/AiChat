const cloneJson = (value, fallback = null) => {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
};

const ensureArray = value => (Array.isArray(value) ? value : []);

const normalizeText = (value, fallback = '') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const roundDuration = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
};

const normalizeProgress = (value) => (
  Math.max(0, Math.min(100, Number(value || 0) || 0))
);

const normalizeTimestamp = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
};

export const buildCustomBundleImportDiagnostics = ({
  fileName = '',
  preview = {},
  sharedMode = false,
  startedAt = Date.now(),
} = {}) => ({
  kind: 'custom-bundle-import',
  fileName: String(fileName || '').trim(),
  phase: 'running',
  startedAt,
  durationMs: 0,
  preview,
  sharedMode: sharedMode === true,
  roles: [],
  scopes: [],
  notes: [],
  importedTargetsCount: 0,
  error: '',
  phases: {},
});

export const buildCustomBundleRoleImportDiagnostics = ({
  importedPersona = {},
  roleManifest = {},
  targetScopeId = '',
  chatScopeId = '',
} = {}) => ({
  personaId: String(importedPersona?.id || '').trim(),
  personaName: String(importedPersona?.name || roleManifest?.name || '角色').trim() || '角色',
  scopeId: targetScopeId,
  chatScopeId,
  moments: null,
  chats: [],
  creativeWriting: null,
});

export const buildCustomBundleImportResultPayload = ({
  importedTargets = [],
} = {}) => {
  const targets = ensureArray(importedTargets);
  return {
    importedTargets: targets,
    firstTarget: targets[0] || null,
  };
};

export const buildCustomBundleImportCompletionPatch = ({
  importedTargets = [],
  firstTarget = null,
  durationMs = 0,
  finishedAt = Date.now(),
} = {}) => ({
  phase: 'done',
  importedTargetsCount: ensureArray(importedTargets).length,
  durationMs: roundDuration(durationMs),
  finishedAt,
  firstTarget: cloneJson(firstTarget || null, null),
});

export const buildCustomBundleImportDoneProgressDetail = ({
  importedTargets = [],
  fileName = '',
} = {}) => ({
  phase: 'done',
  progress: 100,
  status: `导入完成：${ensureArray(importedTargets).length} 个会话`,
  fileName,
  done: true,
});

export const getCustomBundleImportErrorMessage = (error) => (
  String(error?.message || error || '导入失败')
);

export const buildCustomBundleImportFailedProgressDetail = ({
  error = null,
  fileName = '',
} = {}) => {
  const errorMessage = getCustomBundleImportErrorMessage(error);
  return {
    phase: 'failed',
    progress: 100,
    status: `导入失败：${errorMessage}`,
    fileName,
    done: true,
    error: errorMessage,
  };
};

export const buildCustomBundleImportFailureDiagnostics = ({
  fileName = '',
  error = null,
  startedAt = Date.now(),
  finishedAt = Date.now(),
  durationMs = 0,
} = {}) => ({
  kind: 'custom-bundle-import',
  fileName: String(fileName || '').trim(),
  phase: 'failed',
  startedAt,
  finishedAt,
  durationMs: roundDuration(durationMs),
  preview: {},
  roles: [],
  scopes: [],
  importedTargetsCount: 0,
  error: getCustomBundleImportErrorMessage(error),
});

export const buildCustomBundleImportFileSelectedDebugLog = ({
  fileName = '',
} = {}) => ({
  source: 'custom-bundle',
  message: `import file selected ${String(fileName || '').trim() || 'unknown'}`,
});

export const buildCustomBundleImportReadFileProgressDetail = ({
  fileName = '',
} = {}) => ({
  phase: 'read-file',
  progress: 4,
  status: '正在读取资料包文件...',
  fileName,
});

export const buildCustomBundleImportReadZipProgressDetail = ({
  fileName = '',
  reusedPrefetchedEntries = false,
} = {}) => ({
  phase: 'read-zip',
  progress: 10,
  status: reusedPrefetchedEntries === true ? '已复用预读取资料包索引' : '正在解析资料包索引...',
  fileName,
});

export const buildCustomBundleImportPreviewProgressDetail = ({
  fileName = '',
} = {}) => ({
  phase: 'preview',
  progress: 14,
  status: '资料包识别完成，等待确认导入...',
  fileName,
});

export const buildCustomBundleImportCancelledProgressDetail = ({
  fileName = '',
} = {}) => ({
  phase: 'cancelled',
  progress: 0,
  status: '已取消导入',
  fileName,
  done: true,
});

export const shouldPromptCustomBundleImportSwitch = (target = null) => (
  Boolean(target?.personaId || target?.sessionId)
);

export const buildCustomBundleImportSwitchConfirmOptions = ({
  importedTargets = [],
} = {}) => ({
  title: '导入完成',
  message: `已导入 ${Number(importedTargets?.length || 0) || 0} 个会话。是否切换到第一个导入结果？`,
  confirmText: '切换',
  cancelText: '稍后',
});

export const cloneCustomBundleImportDiagnosticsSnapshot = (snapshot) => (
  snapshot && typeof snapshot === 'object' ? cloneJson(snapshot, null) : null
);

export const buildCustomBundleImportDiagnosticsState = ({
  currentState = null,
  snapshot = null,
  historyLimit = 6,
} = {}) => {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const limit = Math.max(0, Number(historyLimit || 0) || 0);
  const history = Array.isArray(currentState?.history) ? currentState.history.slice() : [];
  history.unshift(snapshot);
  return {
    lastImport: snapshot,
    history: history.slice(0, limit),
  };
};

export const buildCustomBundleImportDebugLogPayload = (snapshot = null) => {
  const payload = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const phase = String(payload?.phase || '').trim() || 'done';
  const durationMs = roundDuration(payload?.durationMs);
  const roomCount = Number(payload?.preview?.chats || 0) || 0;
  const archiveCount = Number(payload?.preview?.archives || 0) || 0;
  const error = String(payload?.error || '');
  return {
    source: 'custom-bundle',
    type: error ? 'error' : 'info',
    message: `import ${phase} rooms=${roomCount} archives=${archiveCount} duration=${durationMs}ms${error ? ` error=${error}` : ''}`,
  };
};

export const buildCustomBundleImportProgressPayload = ({
  detail = {},
  at = Date.now(),
} = {}) => ({
  kind: 'custom-bundle-import',
  phase: normalizeText(detail?.phase, 'working'),
  progress: normalizeProgress(detail?.progress),
  status: normalizeText(detail?.status, ''),
  fileName: normalizeText(detail?.fileName, ''),
  done: detail?.done === true,
  error: normalizeText(detail?.error, ''),
  at,
});

const getCustomBundleImportTraceStatus = (payload = {}) => {
  const phase = normalizeText(payload?.phase, 'working');
  if (payload?.error || phase === 'failed') return 'error';
  if (phase === 'cancelled') return 'cancelled';
  if (payload?.done === true || phase === 'done') return 'success';
  return 'progress';
};

export const buildCustomBundleImportProgressTraceEvent = (payload = {}) => {
  const phase = normalizeText(payload?.phase, 'working');
  const progress = normalizeProgress(payload?.progress);
  const fileName = normalizeText(payload?.fileName, '');
  const error = normalizeText(payload?.error, '');
  const details = {
    progress,
    done: payload?.done === true,
  };
  if (fileName) details.fileName = fileName;
  if (error) details.error = error;
  const event = {
    category: 'import-export',
    phase: `custom-bundle.import.${phase}`,
    sessionId: '',
    source: 'custom-bundle-import',
    status: getCustomBundleImportTraceStatus(payload),
    summary: `自定义资料包导入：${phase} ${progress}%`,
    details,
  };
  const startedAt = normalizeTimestamp(payload?.at);
  if (startedAt !== undefined) event.startedAt = startedAt;
  return event;
};
