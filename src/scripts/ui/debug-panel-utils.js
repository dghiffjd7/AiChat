export const formatCustomBundleDiagnostics = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return '暂无自定义资料包导入诊断';
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return String(snapshot || '');
  }
};

export const buildCustomBundleDiagnosticsMeta = (snapshot) => {
  const lastImport = snapshot?.lastImport || null;
  const historyCount = Array.isArray(snapshot?.history) ? snapshot.history.length : 0;
  const fileName = String(lastImport?.fileName || '').trim() || '未命名';
  const phase = String(lastImport?.phase || '').trim() || 'none';
  const durationMs = Number(lastImport?.durationMs || 0) || 0;
  return `phase=${phase} · duration=${durationMs}ms · history=${historyCount} · file=${fileName}`;
};

export const collectErrorLogs = (logs = []) => (
  Array.isArray(logs) ? logs : []
).filter((log) => log?.type === 'error' || log?.type === 'warn');

export const formatErrorLogs = (logs = []) => {
  const list = collectErrorLogs(logs);
  if (!list.length) return '暂无错误日志';
  return list.map((log) => `${log.prefix}[${log.timestamp}] ${log.message}`).join('\n');
};

export const buildDebugTextFilename = (prefix, date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(prefix || 'debug').trim() || 'debug'}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.txt`;
};
