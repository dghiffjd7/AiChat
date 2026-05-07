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

export const buildSessionSectionStyle = ({
  marginTop = 16,
  paddingTop = 14,
} = {}) => `margin-top:${marginTop}px; border-top:1px solid rgba(0,0,0,0.06); padding-top:${paddingTop}px;`;

export const buildSessionWideActionButtonStyle = ({
  accent = false,
  marginBottom = 0,
} = {}) => `
  width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px;
  background:var(--app-surface-card); color:${accent ? '#019aff' : 'var(--app-text-primary)'};
  font-weight:700; margin-bottom:${marginBottom}px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:6px;
`;

export const buildSessionBlockButtonStyle = ({
  fontWeight = 800,
  padding = '10px 12px',
  radius = 12,
} = {}) => `
  width:100%; padding:${padding}; border:1px solid var(--app-border-default); border-radius:${radius}px;
  background:var(--app-surface-card); color:var(--app-text-primary); font-weight:${fontWeight}; cursor:pointer;
`;

export const buildSessionTextActionButtonStyle = ({
  danger = false,
  padding = '6px 10px',
} = {}) => `
  padding:${padding}; border:1px solid var(--app-border-default); border-radius:10px;
  background:var(--app-surface-card); cursor:pointer;
  color:${danger ? '#ef4444' : 'var(--app-text-primary)'};
`;

export const buildSessionIconButtonStyle = ({
  danger = false,
  width = 32,
  height = 28,
  fontSize = 16,
} = {}) => `
  width:${width}px; height:${height}px; border:1px solid ${danger ? '#fecaca' : 'var(--app-border-default)'};
  border-radius:10px; background:var(--app-surface-card); cursor:pointer;
  color:${danger ? '#b91c1c' : 'var(--app-text-primary)'}; font-size:${fontSize}px; line-height:1;
`;

export const buildSessionCoverImageStyle = () => 'width:100%; height:100%; object-fit:cover; display:block;';

export const buildSessionFlexRowStyle = ({
  display = 'flex',
  gap = 10,
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  margin = '',
} = {}) => `
  display:${display}; align-items:${align}; justify-content:${justify}; gap:${gap}px;
  ${wrap ? 'flex-wrap:wrap;' : ''}
  ${margin ? `margin:${margin};` : ''}
`;

export const buildSessionColumnStackStyle = ({
  display = 'flex',
  gap = 8,
  margin = '',
} = {}) => `
  display:${display}; flex-direction:column; gap:${gap}px;
  ${margin ? `margin:${margin};` : ''}
`;

export const buildSessionListContainerStyle = ({
  maxHeight = 160,
  radius = 8,
  background = 'var(--app-surface-card)',
} = {}) => `
  max-height:${maxHeight}px; overflow-y:auto; border:1px solid var(--app-border-subtle);
  border-radius:${radius}px; background:${background}; padding:0;
`;

export const buildSessionUtilityButtonStyle = ({
  padding = '10px 12px',
  fontSize = 14,
  whiteSpace = '',
} = {}) => `
  padding:${padding}; border:1px solid var(--app-border-default); border-radius:10px;
  background:var(--app-surface-card); cursor:pointer; font-size:${fontSize}px;
  ${whiteSpace ? `white-space:${whiteSpace};` : ''}
`;

export const buildSessionAvatarButtonStyle = ({
  size = 72,
  radius = 18,
} = {}) => `
  width:${size}px; height:${size}px; border-radius:${radius}px; border:1px solid var(--app-border-default);
  background:var(--app-surface-card); padding:0; overflow:hidden; cursor:pointer;
`;

export const buildSessionFieldLabelStyle = ({
  weight = 700,
  marginBottom = 6,
} = {}) => `font-weight:${weight}; color:var(--app-text-primary); margin-bottom:${marginBottom}px;`;

export const buildSessionTextInputStyle = ({
  fontSize = 14,
} = {}) => `width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:${fontSize}px;`;

export const buildSessionCompactInputStyle = ({
  width = 88,
  padding = '4px 6px',
  fontSize = 12,
  radius = 8,
  textAlign = 'right',
} = {}) => `
  width:${width}px; padding:${padding}; border:1px solid var(--app-border-default);
  border-radius:${radius}px; font-size:${fontSize}px; text-align:${textAlign};
`;

export const buildSessionHelperTextStyle = ({
  marginTop = 0,
  marginBottom = 0,
  color = 'var(--app-text-muted)',
} = {}) => `color:${color}; font-size:12px;${marginTop ? ` margin-top:${marginTop}px;` : ''}${marginBottom ? ` margin-bottom:${marginBottom}px;` : ''}`;

export const buildSessionCheckboxLabelStyle = ({
  justify = 'flex-start',
  gap = 8,
  margin = '',
  fontSize = 14,
  color = 'var(--app-text-primary)',
} = {}) => `
  display:flex; align-items:center; justify-content:${justify}; gap:${gap}px; cursor:pointer;
  font-size:${fontSize}px; color:${color};
  ${margin ? `margin:${margin};` : ''}
`;

export const buildSessionCheckboxInputStyle = ({
  size = 18,
} = {}) => `width:${size}px; height:${size}px;`;

export const buildSessionSurfaceBoxStyle = ({
  display = 'block',
  margin = '',
  padding = 10,
  radius = 12,
  borderStyle = 'solid',
  borderColor = 'var(--app-border-default)',
  background = 'var(--app-surface-card)',
} = {}) => `
  display:${display};
  ${margin ? `margin:${margin};` : ''}
  padding:${padding}px; border:1px ${borderStyle} ${borderColor};
  border-radius:${radius}px; background:${background};
`;

export const buildSessionFooterStyle = ({
  safeAreaBottom = false,
  alignItems = 'stretch',
} = {}) => `
  padding:14px 16px${safeAreaBottom ? ' calc(14px + env(safe-area-inset-bottom, 0px))' : ''};
  border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle);
  display:flex; gap:10px; align-items:${alignItems};
`;

export const buildSessionSummaryRowStyle = ({
  clickable = false,
} = {}) => `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);${clickable ? ' cursor:pointer;' : ''}`;
