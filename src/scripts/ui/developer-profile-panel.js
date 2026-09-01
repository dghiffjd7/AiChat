import { safeInvoke } from '../utils/tauri.js';

const ALLOWED_DEVELOPER_EXTERNAL_URLS = new Set([
  'https://ko-fi.com/illusion7',
  'https://github.com/dghiffjd7/OmniTavern',
]);

const hasTauriInvoke = () => Boolean(
  globalThis?.__TAURI__?.core?.invoke
  || globalThis?.__TAURI__?.invoke
  || globalThis?.__TAURI_INVOKE__
  || globalThis?.__TAURI_INTERNALS__?.invoke
);

export const openDeveloperExternalUrl = async (
  url,
  { invoke = safeInvoke, windowRef = globalThis.window } = {},
) => {
  const normalizedUrl = String(url || '').trim();
  if (!ALLOWED_DEVELOPER_EXTERNAL_URLS.has(normalizedUrl)) return false;

  try {
    await invoke('open_external_url', { url: normalizedUrl });
    return true;
  } catch (error) {
    if (!hasTauriInvoke() && typeof windowRef?.open === 'function') {
      return windowRef.open(normalizedUrl, '_blank', 'noopener,noreferrer') !== null;
    }
    console.warn('[developer-profile] failed to open external URL', error);
    windowRef?.toastr?.error?.('无法打开链接，请稍后再试');
    return false;
  }
};

export const bindDeveloperProfilePanel = ({
  documentRef = globalThis.document,
  openExternalUrl = openDeveloperExternalUrl,
} = {}) => {
  const overlay = documentRef?.getElementById?.('developer-profile-overlay');
  const closeButton = documentRef?.querySelector?.('#developer-profile-overlay [data-developer-profile-close]');
  const triggers = Array.from(documentRef?.querySelectorAll?.('[data-open-developer-profile]') || []);
  const externalLinks = Array.from(documentRef?.querySelectorAll?.('[data-developer-external-url]') || []);
  let returnFocus = null;

  const isOpen = () => Boolean(overlay && !overlay.hidden);

  const open = (trigger = null) => {
    if (!overlay) return false;
    returnFocus = trigger || documentRef?.activeElement || null;
    overlay.hidden = false;
    overlay.classList?.add?.('is-open');
    documentRef?.body?.classList?.add?.('developer-profile-open');
    closeButton?.focus?.();
    return true;
  };

  const close = () => {
    if (!overlay) return false;
    overlay.classList?.remove?.('is-open');
    overlay.hidden = true;
    documentRef?.body?.classList?.remove?.('developer-profile-open');
    returnFocus?.focus?.();
    returnFocus = null;
    return true;
  };

  triggers.forEach((trigger) => {
    trigger?.addEventListener?.('click', (event) => {
      event?.preventDefault?.();
      open(event?.currentTarget || trigger);
    });
  });
  externalLinks.forEach((link) => {
    link?.addEventListener?.('click', (event) => {
      event?.preventDefault?.();
      Promise.resolve(openExternalUrl(link.href)).catch((error) => {
        console.warn('[developer-profile] external URL handler failed', error);
      });
    });
  });
  closeButton?.addEventListener?.('click', close);
  overlay?.addEventListener?.('click', (event) => {
    if (event?.target === overlay) close();
  });
  documentRef?.addEventListener?.('keydown', (event) => {
    if (event?.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen };
};

if (typeof document !== 'undefined') {
  bindDeveloperProfilePanel({ documentRef: document });
}
