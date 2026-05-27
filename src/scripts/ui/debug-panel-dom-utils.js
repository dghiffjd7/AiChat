import {
  buildDebugPanelButtonStyle,
  DEBUG_PANEL_STYLES,
} from './debug-panel-style-utils.js';

const createDebugButton = ({
  documentRef,
  text = '',
  title = '',
  style = '',
  onClick = () => {},
} = {}) => {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (title) button.title = title;
  button.style.cssText = style || buildDebugPanelButtonStyle();
  button.onclick = onClick;
  return button;
};

export const createDebugPanelDom = ({
  documentRef = globalThis.document,
  onShowCustomBundle = () => {},
  onShowStorageMigration = () => {},
  onShowBridgeContracts = () => {},
  onShowViewportKeyboard = () => {},
  onShowAndroidBack = () => {},
  onShowTraceTimeline = () => {},
  onShowAgentRuns = () => {},
  onShowErrorLogs = () => {},
  onClearLogs = () => {},
  onCopyLogs = () => {},
  onFilterChange = () => {},
  onClearFilter = () => {},
  onToggle = () => {},
} = {}) => {
  const panel = documentRef.createElement('div');
  panel.id = 'debug-panel';
  panel.style.cssText = DEBUG_PANEL_STYLES.panel;

  const controls = documentRef.createElement('div');
  controls.style.cssText = DEBUG_PANEL_STYLES.controls;

  const customBundleInspectBtn = createDebugButton({
    documentRef,
    text: '资料包',
    onClick: onShowCustomBundle,
  });
  controls.appendChild(customBundleInspectBtn);

  const storageMigrationInspectBtn = createDebugButton({
    documentRef,
    text: '迁移',
    onClick: onShowStorageMigration,
  });
  controls.appendChild(storageMigrationInspectBtn);

  const bridgeContractInspectBtn = createDebugButton({
    documentRef,
    text: 'Bridge',
    onClick: onShowBridgeContracts,
  });
  controls.appendChild(bridgeContractInspectBtn);

  const viewportKeyboardInspectBtn = createDebugButton({
    documentRef,
    text: '键盘',
    title: '键盘/视口诊断',
    onClick: onShowViewportKeyboard,
  });
  controls.appendChild(viewportKeyboardInspectBtn);

  const androidBackInspectBtn = createDebugButton({
    documentRef,
    text: '返回',
    title: '安卓返回诊断',
    onClick: onShowAndroidBack,
  });
  controls.appendChild(androidBackInspectBtn);

  const traceTimelineInspectBtn = createDebugButton({
    documentRef,
    text: '时间线',
    onClick: onShowTraceTimeline,
  });
  controls.appendChild(traceTimelineInspectBtn);

  const agentRunsInspectBtn = createDebugButton({
    documentRef,
    text: 'Agent',
    onClick: onShowAgentRuns,
  });
  controls.appendChild(agentRunsInspectBtn);

  const errorLogBtn = createDebugButton({
    documentRef,
    text: '错误日志',
    onClick: onShowErrorLogs,
  });
  controls.appendChild(errorLogBtn);

  const filterWrap = documentRef.createElement('div');
  filterWrap.style.cssText = DEBUG_PANEL_STYLES.filterWrap;

  const filterInput = documentRef.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = '筛选日志...';
  filterInput.style.cssText = DEBUG_PANEL_STYLES.filterInput;
  filterInput.addEventListener('input', (event) => {
    onFilterChange?.(String(event?.target?.value || ''), { filterInput, event });
  });

  const clearLogBtn = createDebugButton({
    documentRef,
    text: '∅',
    title: '清空日志',
    style: buildDebugPanelButtonStyle({ extra: 'opacity: 0.9;' }),
    onClick: () => onClearLogs?.({ filterInput }),
  });
  filterWrap.appendChild(clearLogBtn);

  const copyLogBtn = createDebugButton({
    documentRef,
    text: '⧉',
    title: '复制当前日志',
    style: buildDebugPanelButtonStyle({ extra: 'opacity: 0.9;' }),
    onClick: onCopyLogs,
  });
  filterWrap.appendChild(copyLogBtn);

  filterWrap.appendChild(filterInput);

  const filterClearBtn = createDebugButton({
    documentRef,
    text: '×',
    style: buildDebugPanelButtonStyle({ extra: 'opacity: 0.8;' }),
    onClick: () => onClearFilter?.({ filterInput }),
  });
  filterWrap.appendChild(filterClearBtn);
  controls.appendChild(filterWrap);

  const logContainer = documentRef.createElement('div');
  logContainer.style.cssText = DEBUG_PANEL_STYLES.logContainer;

  panel.appendChild(controls);
  panel.appendChild(logContainer);
  documentRef.body.appendChild(panel);

  const toggleBtn = createDebugButton({
    documentRef,
    text: '诊断',
    style: DEBUG_PANEL_STYLES.toggleButton,
    onClick: onToggle,
  });
  toggleBtn.id = 'debug-toggle';
  documentRef.body.appendChild(toggleBtn);

  return {
    panel,
    controls,
    customBundleInspectBtn,
    storageMigrationInspectBtn,
    bridgeContractInspectBtn,
    viewportKeyboardInspectBtn,
    androidBackInspectBtn,
    traceTimelineInspectBtn,
    agentRunsInspectBtn,
    errorLogBtn,
    filterWrap,
    clearLogBtn,
    copyLogBtn,
    filterInput,
    filterClearBtn,
    logContainer,
    toggleBtn,
  };
};
