import {
  buildSessionHeaderStyle,
  buildSessionOverlayStyle,
  buildSessionPanelStyle,
  SESSION_PANEL_STYLES,
} from './session-panel-style-utils.js';

const BODY_STYLE = 'padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;';
const SEARCH_INPUT_STYLE = 'width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px; box-sizing:border-box;';
const LIST_STYLE = 'margin-top:10px; display:flex; flex-direction:column; gap:8px;';
const SECTION_TITLE_STYLE = 'font-weight:800; color:var(--app-text-primary); margin-bottom:8px;';

export const createSessionContactPickerModal = ({
  documentRef = globalThis.document,
  overlayId = '',
  panelId = '',
  title = '',
  subtitle = '',
  closeId = '',
  cancelId = '',
  confirmId = '',
  searchId = '',
  listId = '',
  confirmLabel = '确认',
  cancelLabel = '取消',
  searchPlaceholder = '搜索联系人...',
  sectionTitle = '',
  topContent = null,
  headerBackground = 'linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08))',
  overlayOpacity = 0.45,
  overlayZIndex = 22000,
  panelZIndex = 23000,
  inset = 18,
  radius = 14,
} = {}) => {
  const overlay = documentRef.createElement('div');
  if (overlayId) overlay.id = overlayId;
  overlay.className = 'app-themed-overlay';
  overlay.style.cssText = buildSessionOverlayStyle({ opacity: overlayOpacity, zIndex: overlayZIndex });

  const panel = documentRef.createElement('div');
  if (panelId) panel.id = panelId;
  panel.className = 'app-themed-panel';
  panel.style.cssText = buildSessionPanelStyle({ inset, zIndex: panelZIndex, radius });
  panel.addEventListener('click', (event) => event.stopPropagation());

  const header = documentRef.createElement('div');
  header.style.cssText = buildSessionHeaderStyle({ background: headerBackground });

  const titleWrap = documentRef.createElement('div');
  titleWrap.style.minWidth = '0';

  const titleEl = documentRef.createElement('div');
  titleEl.style.cssText = 'font-weight:900; color:var(--app-text-primary);';
  titleEl.textContent = title;

  const subtitleEl = documentRef.createElement('div');
  subtitleEl.style.cssText = 'color:var(--app-text-muted); font-size:12px;';
  subtitleEl.textContent = subtitle;

  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(subtitleEl);

  const closeButton = documentRef.createElement('button');
  if (closeId) closeButton.id = closeId;
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.style.cssText = SESSION_PANEL_STYLES.closeButton;

  header.appendChild(titleWrap);
  header.appendChild(closeButton);

  const body = documentRef.createElement('div');
  body.style.cssText = BODY_STYLE;

  if (topContent) body.appendChild(topContent);

  if (sectionTitle) {
    const sectionTitleEl = documentRef.createElement('div');
    sectionTitleEl.style.cssText = SECTION_TITLE_STYLE;
    sectionTitleEl.textContent = sectionTitle;
    body.appendChild(sectionTitleEl);
  }

  const searchInput = documentRef.createElement('input');
  if (searchId) searchInput.id = searchId;
  searchInput.placeholder = searchPlaceholder;
  searchInput.style.cssText = SEARCH_INPUT_STYLE;

  const list = documentRef.createElement('div');
  if (listId) list.id = listId;
  list.style.cssText = LIST_STYLE;

  body.appendChild(searchInput);
  body.appendChild(list);

  const footer = documentRef.createElement('div');
  footer.style.cssText = SESSION_PANEL_STYLES.footer;

  const cancelButton = documentRef.createElement('button');
  if (cancelId) cancelButton.id = cancelId;
  cancelButton.type = 'button';
  cancelButton.textContent = cancelLabel;
  cancelButton.style.cssText = SESSION_PANEL_STYLES.secondaryActionButton;

  const confirmButton = documentRef.createElement('button');
  if (confirmId) confirmButton.id = confirmId;
  confirmButton.type = 'button';
  confirmButton.textContent = confirmLabel;
  confirmButton.style.cssText = SESSION_PANEL_STYLES.primaryActionButton;

  footer.appendChild(cancelButton);
  footer.appendChild(confirmButton);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  return {
    overlay,
    panel,
    header,
    titleWrap,
    titleEl,
    subtitleEl,
    closeButton,
    body,
    searchInput,
    list,
    footer,
    cancelButton,
    confirmButton,
  };
};
