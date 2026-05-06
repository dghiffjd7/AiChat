import {
  buildSessionHeaderStyle,
  buildSessionOverlayStyle,
  buildSessionPanelStyle,
  SESSION_PANEL_STYLES,
} from './session-panel-style-utils.js';

const BODY_STYLE = 'padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;';

export const createSessionPanelShell = ({
  documentRef = globalThis.document,
  overlayId = '',
  panelId = '',
  titleId = '',
  subtitleId = '',
  closeId = '',
  title = '',
  subtitle = '',
  headerBackground = 'var(--app-surface-subtle)',
  overlayOpacity = 0.45,
  overlayZIndex = 20000,
  panelZIndex = 21000,
  inset = 10,
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
  if (titleId) titleEl.id = titleId;
  titleEl.style.cssText = 'font-weight:800; color:var(--app-text-primary);';
  titleEl.textContent = title;

  const subtitleEl = documentRef.createElement('div');
  if (subtitleId) subtitleEl.id = subtitleId;
  subtitleEl.style.cssText = 'color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
  subtitleEl.textContent = subtitle;

  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(subtitleEl);

  const closeButton = documentRef.createElement('button');
  if (closeId) closeButton.id = closeId;
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.style.cssText = SESSION_PANEL_STYLES.closeButton;

  const body = documentRef.createElement('div');
  body.style.cssText = BODY_STYLE;

  header.appendChild(titleWrap);
  header.appendChild(closeButton);
  panel.appendChild(header);
  panel.appendChild(body);

  return {
    overlay,
    panel,
    header,
    titleWrap,
    titleEl,
    subtitleEl,
    closeButton,
    body,
  };
};
