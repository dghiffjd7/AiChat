export const SESSION_PANEL_STYLES = {
  closeButton: 'border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);',
  footer: 'padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle); display:flex; gap:10px;',
  primaryActionButton: 'flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:800;',
  secondaryActionButton: 'flex:1; padding:10px 14px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;',
};

export const buildSessionOverlayStyle = ({
  opacity = 0.45,
  zIndex = 20000,
} = {}) => `display:none; position:fixed; inset:0; background:rgba(0,0,0,${opacity}); z-index:${zIndex};`;

export const buildSessionPanelStyle = ({
  inset = 10,
  zIndex = 21000,
  radius = 14,
} = {}) => {
  const insetPx = Number.isFinite(Number(inset)) ? Number(inset) : 10;
  const verticalGap = insetPx * 2;
  return `
    display:none; position:fixed;
    top: calc(${insetPx}px + env(safe-area-inset-top, 0px));
    left: calc(${insetPx}px + env(safe-area-inset-left, 0px));
    right: calc(${insetPx}px + env(safe-area-inset-right, 0px));
    height: calc(100vh - ${verticalGap}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    height: calc(100dvh - ${verticalGap}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    background:var(--app-surface-card); border-radius:${radius}px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
    z-index:${zIndex};
    overflow:hidden;
    display:flex; flex-direction:column;
  `;
};

export const buildSessionHeaderStyle = ({
  background = 'var(--app-surface-subtle)',
} = {}) => `padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:${background}; display:flex; align-items:center; justify-content:space-between; gap:10px;`;
