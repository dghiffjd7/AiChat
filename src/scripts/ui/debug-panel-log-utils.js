export const getVisibleDebugLogs = ({
  logs = [],
  filterText = '',
} = {}) => {
  let list = Array.isArray(logs) ? logs : [];
  const term = String(filterText || '').trim().toLowerCase();
  if (term) {
    list = list.filter((log) => String(log?.message || '').toLowerCase().includes(term));
  }
  return list;
};

export const appendDebugLog = ({
  logs = [],
  seenMessages = new Set(),
  message = '',
  type = 'info',
  maxLogs = 30,
  timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }),
} = {}) => {
  const normalizedMessage = String(message || '');
  const normalizedType = String(type || 'info');
  const prefix = normalizedType === 'error' ? '❌' : normalizedType === 'warn' ? '⚠️' : '✓';
  const color = normalizedType === 'error' ? '#ff0000' : normalizedType === 'warn' ? '#ffaa00' : '#00ff00';
  const key = `${normalizedType}|${normalizedMessage}`;
  if (seenMessages.has(key)) {
    return { logs, seenMessages, appended: false };
  }
  seenMessages.add(key);
  logs.push({ timestamp, message: normalizedMessage, color, prefix, key, type: normalizedType });
  if (logs.length > maxLogs) {
    const removed = logs.shift();
    if (removed?.key) seenMessages.delete(removed.key);
  }
  return { logs, seenMessages, appended: true };
};

export const renderDebugLogHtml = (logs = []) => (
  Array.isArray(logs) ? logs : []
).map((log) =>
  `<div style="color: ${log.color}; margin-bottom: 2px;">${log.prefix} [${log.timestamp}] ${log.message}</div>`
).join('');

export const formatVisibleDebugLogsText = (logs = []) => (
  Array.isArray(logs) ? logs : []
).map((log) => `${log.prefix} [${log.timestamp}] ${log.message}`).join('\n');
