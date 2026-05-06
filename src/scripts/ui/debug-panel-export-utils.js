import { pickSavePath as pickNativeSavePath } from '../utils/save-dialog.js';
import { safeInvoke } from '../utils/tauri.js';

export const hasTauriRuntime = (globalRef = globalThis) => Boolean(
  globalRef?.__TAURI__ || globalRef?.__TAURI_INTERNALS__ || globalRef?.__TAURI_INVOKE__,
);

export const detectAndroidRuntime = (navigatorRef = globalThis.navigator) => {
  try {
    return /android/i.test(navigatorRef?.userAgent || '');
  } catch {
    return false;
  }
};

export const buildTextDataUrl = (
  value,
  {
    TextEncoderRef = globalThis.TextEncoder,
    encodeToBase64 = (binary) => btoa(binary),
  } = {},
) => {
  const bytes = new TextEncoderRef().encode(String(value || ''));
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:text/plain;charset=utf-8;base64,${encodeToBase64(binary)}`;
};

export const exportDebugTextFile = async ({
  text = '',
  filename = '',
  successLabel = 'TXT 已导出',
  globalRef = globalThis,
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
  BlobRef = globalThis.Blob,
  URLRef = globalThis.URL,
  pickSavePath = pickNativeSavePath,
  safeInvokeFn = safeInvoke,
  onSuccess = () => {},
} = {}) => {
  const content = String(text || '');
  if (!content.trim()) return false;

  if (!hasTauriRuntime(globalRef)) {
    const blob = new BlobRef([content], { type: 'text/plain;charset=utf-8' });
    const url = URLRef.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    URLRef.revokeObjectURL(url);
    onSuccess?.(`${successLabel}：${filename}`);
    return true;
  }

  const isAndroid = detectAndroidRuntime(navigatorRef);
  const dataUrl = buildTextDataUrl(content);
  let savedPath = '';
  if (!isAndroid) {
    const pick = await pickSavePath({
      defaultName: filename,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (pick.cancelled) return false;
    if (!pick.fallback && pick.path) {
      const resp = await safeInvokeFn('export_attachment', {
        dataUrl,
        fileName: filename,
        path: pick.path,
      });
      savedPath = String(resp?.path || pick.path || '').trim();
    }
  }

  if (!savedPath) {
    const resp = await safeInvokeFn('export_attachment', {
      dataUrl,
      fileName: filename,
    });
    savedPath = String(resp?.path || '').trim();
  }
  onSuccess?.(`${successLabel}：${savedPath || filename}`);
  return true;
};
