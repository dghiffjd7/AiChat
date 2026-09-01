import { safeInvoke } from '../utils/tauri.js';
import { appChoice } from './app-confirm.js';

export const MICROPHONE_PERMISSION_HINT_KEY = 'chatapp_microphone_permission_denied_hint';

export const MICROPHONE_PERMISSION_COMMANDS = Object.freeze({
  prepareRetry: 'prepare_microphone_permission_retry',
  openSettings: 'open_microphone_permission_settings',
});

const readDeniedHint = storage => {
  try { return storage?.getItem?.(MICROPHONE_PERMISSION_HINT_KEY) === '1'; } catch { return false; }
};

const writeDeniedHint = (storage, denied) => {
  try {
    if (denied) storage?.setItem?.(MICROPHONE_PERMISSION_HINT_KEY, '1');
    else storage?.removeItem?.(MICROPHONE_PERMISSION_HINT_KEY);
  } catch {}
};

export const isMicrophonePermissionDenied = error => {
  const name = String(error?.name || '').trim().toLowerCase();
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || error || '').trim().toLowerCase();
  return name === 'notallowederror'
    || name === 'permissiondeniederror'
    || code === 'permission_denied'
    || /notallowed|permission denied|permission dismissed|permission.*denied/.test(message);
};

const makePermissionDeniedError = cause => {
  const error = new Error('麦克风权限未开启。再次点击语音可重新请求，或前往系统设置开启。');
  error.name = 'NotAllowedError';
  error.code = 'microphone_permission_denied';
  error.cause = cause;
  return error;
};

const makeCancelledError = () => {
  const error = new Error('Microphone permission recovery cancelled');
  error.name = 'AbortError';
  error.cancelled = true;
  return error;
};

const normalizeRecoveryAction = result => {
  const action = String(result?.action || result?.state || result || '').trim().toLowerCase();
  if (['retry', 'granted', 'prompt', 'ready'].includes(action)) return 'retry';
  if (['settings_required', 'blocked', 'permanently_denied'].includes(action)) return 'settings_required';
  if (['denied', 'cancelled', 'canceled'].includes(action)) return 'denied';
  return 'retry';
};

export const createMicrophonePermissionRecovery = ({
  choice = appChoice,
  invoke = safeInvoke,
  storage = globalThis.localStorage,
  origin = globalThis.location?.origin || '',
} = {}) => {
  const openSettings = async () => {
    try {
      await invoke(MICROPHONE_PERMISSION_COMMANDS.openSettings, {});
    } catch (cause) {
      const error = new Error('无法打开系统麦克风权限设置，请手动在系统设置中允许 OmniTavern 使用麦克风。');
      error.code = 'microphone_settings_open_failed';
      error.cause = cause;
      throw error;
    }
  };

  const promptForSettings = async () => {
    const action = await choice({
      title: '需要在系统设置中开启麦克风',
      message: '系统已不再显示麦克风权限询问。请打开应用权限设置，允许 OmniTavern 使用麦克风后再回来重试。',
      actions: [
        { id: 'settings', label: '打开系统设置', primary: true },
        { id: 'cancel', label: '稍后' },
      ],
      defaultActionId: 'settings',
    });
    if (action === 'settings') await openSettings();
    throw makeCancelledError();
  };

  const prepareRetry = async () => {
    const action = await choice({
      title: '语音功能需要麦克风权限',
      message: '上次没有取得麦克风权限。你可以重新请求权限，或前往系统设置手动开启。',
      actions: [
        { id: 'retry', label: '再次请求', primary: true },
        { id: 'settings', label: '打开系统设置' },
        { id: 'cancel', label: '稍后' },
      ],
      defaultActionId: 'retry',
    });
    if (action === 'settings') {
      await openSettings();
      throw makeCancelledError();
    }
    if (action !== 'retry') throw makeCancelledError();

    let recoveryAction = 'retry';
    try {
      const result = await invoke(MICROPHONE_PERMISSION_COMMANDS.prepareRetry, {
        origin: String(origin || '').trim(),
      });
      recoveryAction = normalizeRecoveryAction(result);
    } catch (error) {
      // Browser development and platforms without a native bridge can still
      // retry getUserMedia; their own permission UI remains authoritative.
      if (!/tauri invoke not available/i.test(String(error?.message || error || ''))) throw error;
      recoveryAction = 'retry';
    }
    if (recoveryAction === 'settings_required') await promptForSettings();
    if (recoveryAction === 'denied') throw makeCancelledError();
  };

  const acquire = async ({ mediaDevices, constraints } = {}) => {
    if (readDeniedHint(storage)) await prepareRetry();
    try {
      const stream = await mediaDevices?.getUserMedia?.(constraints);
      if (!stream) throw new Error('当前环境无法请求麦克风');
      writeDeniedHint(storage, false);
      return stream;
    } catch (error) {
      if (!isMicrophonePermissionDenied(error)) throw error;
      writeDeniedHint(storage, true);
      throw makePermissionDeniedError(error);
    }
  };

  return {
    acquire,
    hasDeniedHint: () => readDeniedHint(storage),
    clearDeniedHint: () => writeDeniedHint(storage, false),
  };
};

export const microphonePermissionRecovery = createMicrophonePermissionRecovery();
