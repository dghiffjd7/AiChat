import { appSettings } from '../storage/app-settings.js';

const shouldRecord = (force = false) => {
  if (force) return true;
  try {
    return appSettings.get().debugExecutionLogs === true;
  } catch {
    return false;
  }
};

export const emitDebugLog = ({ message, type = 'info', source = '', force = false } = {}) => {
  if (typeof window === 'undefined') return;
  if (!shouldRecord(force)) return;
  const detail = {
    message: String(message || ''),
    type: String(type || 'info'),
    source: String(source || ''),
    at: Date.now(),
  };
  window.dispatchEvent(new CustomEvent('app-debug-log', { detail }));
};
