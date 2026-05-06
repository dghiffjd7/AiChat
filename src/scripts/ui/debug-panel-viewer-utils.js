import { DEBUG_VIEWER_STYLES } from './debug-panel-style-utils.js';

export const createDebugViewerModal = ({
  overlayId = '',
  panelId = '',
  title = '',
  documentRef = globalThis.document,
  includeCopyButton = false,
  onClose = () => {},
  onRefresh = () => {},
  onExport = () => {},
  onCopy = async () => {},
} = {}) => {
  const overlay = documentRef.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = DEBUG_VIEWER_STYLES.overlay;

  const panel = documentRef.createElement('div');
  panel.id = panelId;
  panel.style.cssText = DEBUG_VIEWER_STYLES.panel;
  panel.addEventListener('click', (event) => event.stopPropagation());

  const header = documentRef.createElement('div');
  header.style.cssText = DEBUG_VIEWER_STYLES.header;

  const titleEl = documentRef.createElement('div');
  titleEl.style.cssText = DEBUG_VIEWER_STYLES.title;
  titleEl.textContent = title;

  const meta = documentRef.createElement('div');
  meta.style.cssText = DEBUG_VIEWER_STYLES.meta;

  const refreshButton = documentRef.createElement('button');
  refreshButton.type = 'button';
  refreshButton.textContent = '刷新';
  refreshButton.style.cssText = DEBUG_VIEWER_STYLES.actionButton;
  refreshButton.onclick = onRefresh;

  const exportButton = documentRef.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = '导出';
  exportButton.style.cssText = DEBUG_VIEWER_STYLES.actionButton;
  exportButton.onclick = onExport;

  header.appendChild(titleEl);
  header.appendChild(meta);
  header.appendChild(refreshButton);
  header.appendChild(exportButton);

  let copyButton = null;
  if (includeCopyButton) {
    copyButton = documentRef.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = '复制';
    copyButton.style.cssText = DEBUG_VIEWER_STYLES.actionButton;
    copyButton.onclick = onCopy;
    header.appendChild(copyButton);
  }

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '关闭';
  closeButton.style.cssText = DEBUG_VIEWER_STYLES.actionButton;
  closeButton.onclick = onClose;
  header.appendChild(closeButton);

  const content = documentRef.createElement('div');
  content.style.cssText = DEBUG_VIEWER_STYLES.content;

  const textarea = documentRef.createElement('textarea');
  textarea.readOnly = true;
  textarea.style.cssText = DEBUG_VIEWER_STYLES.textarea;
  content.appendChild(textarea);

  panel.appendChild(header);
  panel.appendChild(content);
  overlay.appendChild(panel);
  overlay.addEventListener('click', onClose);
  documentRef.body.appendChild(overlay);

  return {
    overlay,
    panel,
    meta,
    textarea,
    refreshButton,
    exportButton,
    copyButton,
    closeButton,
  };
};

export const bindDebugViewerRefs = ({
  target = null,
  prefix = '',
  viewer = null,
} = {}) => {
  if (!target || !prefix || !viewer) return viewer;
  target[`${prefix}Overlay`] = viewer.overlay ?? null;
  target[`${prefix}Panel`] = viewer.panel ?? null;
  target[`${prefix}Meta`] = viewer.meta ?? null;
  target[`${prefix}Text`] = viewer.textarea ?? null;
  target[`${prefix}Refresh`] = viewer.refreshButton ?? null;
  target[`${prefix}Export`] = viewer.exportButton ?? null;
  target[`${prefix}Copy`] = viewer.copyButton ?? null;
  return viewer;
};

export const setDebugViewerVisibility = ({
  overlay = null,
  visible = false,
} = {}) => {
  if (!overlay?.style) return false;
  overlay.style.display = visible ? 'block' : 'none';
  return true;
};

export const showDebugViewer = async ({
  overlay = null,
  onShow = async () => {},
} = {}) => {
  setDebugViewerVisibility({ overlay, visible: true });
  return await onShow?.();
};
