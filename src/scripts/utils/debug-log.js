import { appSettings } from '../storage/app-settings.js';
import { safeInvoke } from './tauri.js';

const shouldRecord = (force = false) => {
  if (force) return true;
  try {
    return appSettings.get().debugExecutionLogs === true;
  } catch {
    return false;
  }
};

const shouldMirrorToNative = () => {
  try {
    return appSettings.get().debugExecutionLogs === true;
  } catch {
    return false;
  }
};

const NATIVE_LOG_LIMIT = 400;
const NATIVE_TEXT_LIMIT = 1500;
let nativeLogCount = 0;
let nativeLimitNotified = false;

const compactText = (value, maxLen = NATIVE_TEXT_LIMIT) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
};

const mirrorToNative = (detail) => {
  if (typeof window === 'undefined') return;
  if (!shouldMirrorToNative()) return;
  if (nativeLogCount >= NATIVE_LOG_LIMIT) {
    if (nativeLimitNotified) return;
    nativeLimitNotified = true;
  }
  nativeLogCount += 1;
  const source = String(detail?.source || '').trim() || 'app';
  const level = String(detail?.type || 'info').trim() || 'info';
  const message = compactText(detail?.message || '');
  const tag = compactText('DEBUG:' + source, 48);
  const overflow = nativeLogCount > NATIVE_LOG_LIMIT;
  const finalMessage = overflow ? 'native-debug-log-limit-reached' : message;
  const data = overflow
    ? { at: Number(detail?.at || Date.now()), droppedAfter: NATIVE_LOG_LIMIT }
    : { at: Number(detail?.at || Date.now()), source };
  safeInvoke('log_js', { tag, level, message: finalMessage, data }).catch(() => {});
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
  mirrorToNative(detail);
};
