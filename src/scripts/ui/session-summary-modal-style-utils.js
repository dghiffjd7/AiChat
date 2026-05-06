export const SESSION_SUMMARY_MODAL_STYLES = {
  overlay: 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;',
  panel: `
    display:none; position:fixed;
    left: calc(12px + env(safe-area-inset-left, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
    z-index:23000;
    overflow:hidden;
    display:flex; flex-direction:column;
  `,
  header: 'padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;',
  title: 'font-weight:900; color:var(--app-text-primary);',
  closeButton: 'border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);',
  body: 'padding:12px 14px; flex:1; min-height:0; overflow:auto;',
  helper: 'font-size:12px; color:var(--app-text-muted); margin-bottom:8px;',
  footer: 'padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle); display:flex; gap:10px;',
  secondaryButton: 'flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;',
  primaryButton: 'flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;',
};

export const buildSessionSummaryTextareaStyle = ({
  minHeight = '200px',
  readOnly = false,
} = {}) => `width:100%; min-height:${minHeight}; resize:vertical; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;${readOnly ? ' white-space:pre-wrap;' : ''}`;
