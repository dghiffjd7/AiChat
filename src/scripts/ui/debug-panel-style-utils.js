export const DEBUG_PANEL_BUTTON_STYLE = `
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.8);
  color: #00ff00;
  border: 1px solid #00ff00;
  border-radius: 4px;
  font-size: 10px;
  font-family: monospace;
  cursor: pointer;
`;

export const buildDebugPanelButtonStyle = ({
  extra = '',
} = {}) => `${DEBUG_PANEL_BUTTON_STYLE}${extra ? `\n${extra}` : ''}`;

export const DEBUG_PANEL_STYLES = {
  panel: `
    position: fixed;
    bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    left: 0;
    right: 0;
    max-height: 250px;
    background: rgba(0, 0, 0, 0.95);
    color: #00ff00;
    font-family: monospace;
    font-size: 10px;
    padding: 8px;
    z-index: 30000;
    display: none;
    border-top: 2px solid #00ff00;
    box-sizing: border-box;
    flex-direction: column;
  `,
  controls: `
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px dashed #00ff00;
  `,
  filterWrap: `
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  `,
  filterInput: `
    width: 120px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    border: 1px solid #00ff00;
    border-radius: 4px;
    font-size: 10px;
    font-family: monospace;
    outline: none;
  `,
  logContainer: `
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  `,
  toggleButton: `
    position: fixed;
    bottom: calc(70px + env(safe-area-inset-bottom, 0px));
    right: 10px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    border: 1px solid #00ff00;
    border-radius: 4px;
    font-size: 10px;
    z-index: 30001;
    font-family: monospace;
    font-weight: bold;
  `,
};

export const DEBUG_VIEWER_STYLES = {
  overlay: `
    display:none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.38);
    z-index: 22050;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
    box-sizing: border-box;
  `,
  panel: `
    width: 100%;
    height: 100%;
    background: var(--app-surface-card);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `,
  header: 'display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);',
  title: 'font-weight:900;',
  meta: 'margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  actionButton: 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;',
  content: 'flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;',
  textarea: `
    width:100%;
    height:100%;
    min-height: 100%;
    resize:none;
    border:1px solid rgba(0,0,0,0.10);
    border-radius:12px;
    padding:12px;
    font-size:12px;
    line-height:1.4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    white-space: pre;
    box-sizing:border-box;
    outline:none;
  `,
};
