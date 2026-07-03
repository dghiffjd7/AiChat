const STYLE_ID = 'maid-settings-panel-style';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const injectStyle = (documentRef) => {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement?.('style');
  if (!style) return;
  style.id = STYLE_ID;
  style.textContent = `
.maid-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 26120;
  display: none;
  align-items: center;
  justify-content: center;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.34);
}
.maid-settings-overlay.is-open {
  display: flex;
}
.maid-settings-panel {
  width: min(780px, 100%);
  height: min(680px, calc(var(--app-visual-height, 100dvh) - 24px));
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.28));
  border-radius: 16px;
  background: var(--app-surface-card, #fff);
  color: var(--app-text-primary, #111827);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
}
.maid-settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.22));
  background: color-mix(in srgb, var(--app-surface-card, #fff) 90%, var(--app-surface-subtle, #f8fafc));
}
.maid-settings-mark {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.09);
  color: #2563eb;
}
.maid-settings-title {
  font-weight: 800;
  font-size: 15px;
  line-height: 1.2;
}
.maid-settings-icon {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.maid-settings-close,
.maid-settings-action {
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.35));
  border-radius: 8px;
  background: var(--app-surface-card, #fff);
  color: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 90ms ease;
}
.maid-settings-close {
  width: 32px;
  height: 32px;
  box-sizing: border-box;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.maid-settings-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  overflow-x: auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.22));
  background: var(--app-surface-card, #fff);
}
.maid-settings-tab {
  min-height: 34px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text-secondary, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  touch-action: manipulation;
}
.maid-settings-tab.is-active {
  color: var(--app-text-primary, #111827);
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
}
.maid-settings-tab .maid-settings-icon {
  width: 15px;
  height: 15px;
}
.maid-settings-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.maid-settings-section {
  height: 100%;
  display: none;
  padding: 14px;
  box-sizing: border-box;
}
.maid-settings-section.is-active {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.maid-settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.maid-settings-list-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.24));
  border-radius: 10px;
  background: var(--app-surface-subtle, #f8fafc);
  font-size: 13px;
  line-height: 1.45;
}
.maid-settings-item-main {
  flex: 1;
  min-width: 0;
}
.maid-settings-item-title {
  font-weight: 700;
  word-break: break-word;
}
.maid-settings-item-meta {
  color: var(--app-text-secondary, #6b7280);
  font-size: 12px;
  word-break: break-word;
}
.maid-settings-status-chip {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(148, 163, 184, 0.16);
}
.maid-settings-status-chip.is-succeeded {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}
.maid-settings-status-chip.is-failed {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.12);
}
.maid-settings-status-chip.is-interrupted {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}
.maid-settings-prompt-tabs {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.26));
  border-radius: 10px;
  background: var(--app-surface-subtle, #f8fafc);
  align-self: flex-start;
}
.maid-settings-prompt-tab {
  min-height: 28px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, transform 90ms ease;
  touch-action: manipulation;
}
.maid-settings-prompt-tab.is-active {
  color: var(--app-text-primary, #111827);
  border-color: rgba(37, 99, 235, 0.20);
  background: var(--app-surface-card, #fff);
}
.maid-settings-prompt-pane {
  min-height: 0;
  display: none;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
}
.maid-settings-prompt-pane.is-active {
  display: flex;
}
.maid-settings-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--app-text-secondary, #475569);
}
.maid-settings-field {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
}
.maid-settings-split {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 10px;
  flex: 1 1 auto;
}
.maid-settings-textarea {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  resize: none;
  box-sizing: border-box;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.35));
  border-radius: 9px;
  padding: 10px 11px;
  background: var(--app-surface-card, #fff);
  color: var(--app-text-primary, #111827);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  outline: none;
}
.maid-settings-textarea[readonly] {
  background: color-mix(in srgb, var(--app-surface-card, #fff) 88%, var(--app-surface-subtle, #f8fafc));
  color: var(--app-text-secondary, #475569);
}
.maid-settings-textarea:focus {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}
.maid-settings-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}
.maid-settings-action {
  min-height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  touch-action: manipulation;
}
.maid-settings-tab > *,
.maid-settings-prompt-tab > *,
.maid-settings-action > *,
.maid-settings-close > *,
.maid-settings-icon {
  pointer-events: none;
}
.maid-settings-action.is-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.maid-settings-close:hover,
.maid-settings-action:hover,
.maid-settings-tab:hover,
.maid-settings-prompt-tab:hover {
  border-color: rgba(37, 99, 235, 0.28);
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-settings-action.is-primary:hover {
  background: #1d4ed8;
}
.maid-settings-close:active,
.maid-settings-action:active,
.maid-settings-tab:active,
.maid-settings-prompt-tab:active {
  transform: translateY(1px);
}
.maid-settings-status {
  margin-left: auto;
  color: var(--app-text-secondary, #475569);
  font-size: 12px;
}
.maid-settings-empty {
  color: var(--app-text-muted, #64748b);
  font-size: 13px;
  line-height: 1.5;
}
.maid-settings-api-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.26));
  border-radius: 9px;
  background: var(--app-surface-subtle, #f8fafc);
}
@media (max-width: 640px) {
  .maid-settings-panel {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 12px;
  }
  .maid-settings-tabs {
    grid-template-columns: repeat(2, max-content);
  }
  .maid-settings-tab {
    padding: 0 9px;
  }
  .maid-settings-prompt-tabs {
    width: 100%;
    overflow-x: auto;
  }
  .maid-settings-prompt-tab {
    flex: 1 0 auto;
  }
  .maid-settings-split {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .maid-settings-close,
  .maid-settings-action,
  .maid-settings-tab,
  .maid-settings-prompt-tab {
    transition: none;
  }
}
`;
  documentRef.head.appendChild(style);
};

const createButton = (documentRef, className, text) => {
  const button = documentRef.createElement?.('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
};

const createTextarea = (documentRef, { readOnly = false } = {}) => {
  const textarea = documentRef.createElement?.('textarea');
  textarea.className = 'maid-settings-textarea';
  textarea.spellcheck = false;
  if (readOnly) textarea.readOnly = true;
  return textarea;
};

const iconSvg = body => `
  <svg class="maid-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const ICONS = Object.freeze({
  maid: iconSvg('<path d="M12 5v3"/><path d="M8 8h8"/><path d="M7 12a5 5 0 0 1 10 0v3.5A2.5 2.5 0 0 1 14.5 18h-5A2.5 2.5 0 0 1 7 15.5Z"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 18v2"/><path d="M14 18v2"/>'),
  close: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  api: iconSvg('<path d="M7 7h10v10H7z"/><path d="M3 10h4"/><path d="M3 14h4"/><path d="M17 10h4"/><path d="M17 14h4"/><path d="M10 3v4"/><path d="M14 3v4"/><path d="M10 17v4"/><path d="M14 17v4"/>'),
  prompt: iconSvg('<path d="M5 5h14"/><path d="M5 9h10"/><path d="M5 15h14"/><path d="M5 19h9"/>'),
  knowledge: iconSvg('<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4Z"/><path d="M9 8h6"/><path d="M9 12h5"/>'),
  history: iconSvg('<path d="M4 12a8 8 0 1 0 3-6.25"/><path d="M4 4v5h5"/><path d="M12 8v5l3 2"/>'),
  table: iconSvg('<path d="M4 5h16v14H4z"/><path d="M4 10h16"/><path d="M4 15h16"/><path d="M10 5v14"/>'),
  request: iconSvg('<path d="M5 5h14v14H5z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h7"/>'),
  response: iconSvg('<path d="M4 6h16v10H7l-3 3Z"/><path d="M8 10h8"/><path d="M8 14h5"/>'),
  activity: iconSvg('<path d="M4 12h4l2-6 4 12 2-6h4"/>'),
  shield: iconSvg('<path d="M12 3 5 6v5c0 4.4 3 8.1 7 9 4-.9 7-4.6 7-9V6Z"/><path d="m9.5 12 2 2 3.5-3.5"/>'),
});

const clearChildren = (el) => {
  if (!el) return;
  if (typeof el.replaceChildren === 'function') {
    el.replaceChildren();
    return;
  }
  if (Array.isArray(el.children)) {
    el.children.length = 0;
    return;
  }
  while (el.firstChild) el.removeChild(el.firstChild);
};

const formatRunTime = (timestamp = 0) => {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
};

const describeMaidRunStatus = (run = {}) => {
  if (run?.status === 'succeeded') return { key: 'succeeded', label: '成功' };
  if (run?.metadata?.maidStatus === 'interrupted') return { key: 'interrupted', label: '中断' };
  return { key: 'failed', label: '失败' };
};

const setIconButtonContent = (button, icon = '', label = '') => {
  if (!button) return;
  button.innerHTML = `${icon}${label ? `<span>${label}</span>` : ''}`;
};

export const createMaidSettingsPanel = ({
  documentRef = globalThis?.document || null,
  settingsStore = null,
  onOpenApiConfig = null,
  getAppKnowledgeText = () => '',
  getHistoryContextText = () => '',
  getMemoryTableText = () => '',
  listRuns = null,
  allowRulesStore = null,
  onResumeRun = null,
  copyText = text => globalThis?.navigator?.clipboard?.writeText?.(text),
  logger = console,
} = {}) => {
  let overlay = null;
  let panel = null;
  let activeTab = 'api';
  let activePromptTab = 'persona';
  const tabButtons = new Map();
  const sections = new Map();
  const promptTabButtons = new Map();
  const promptPanes = new Map();
  let promptTextarea = null;
  let appKnowledgeTextarea = null;
  let historyContextTextarea = null;
  let memoryTableTextarea = null;
  let lastAppContextTextarea = null;
  let lastPromptTextarea = null;
  let lastResponseTextarea = null;
  let statusEl = null;
  let runListEl = null;
  let ruleListEl = null;
  let isOpen = false;

  const setStatus = (message = '') => {
    if (!statusEl) return;
    statusEl.textContent = trim(message);
  };

  const getLastPromptText = () => trim(settingsStore?.getLastRequestPrompt?.(), '尚未记录任何女仆本次提示词。');
  const getLastAppContextText = () => trim(settingsStore?.getLastAppContext?.(), '尚未记录任何本次检索。');
  const getLastResponseText = () => trim(settingsStore?.getLastFullResponse?.(), '尚未记录任何女仆完整回复。');
  const getAppKnowledge = () => trim(getAppKnowledgeText?.(), '暂无 APP 知识。');
  const getHistoryContext = () => trim(getHistoryContextText?.(), '尚未记录女仆历史上下文。');
  const getMemoryTable = () => trim(getMemoryTableText?.(), '尚未生成女仆记忆表格。');

  const appendEmptyItem = (container, message = '') => {
    const empty = documentRef.createElement?.('div');
    empty.className = 'maid-settings-empty';
    empty.textContent = message;
    container.appendChild(empty);
  };

  const renderRuns = () => {
    if (!runListEl) return;
    clearChildren(runListEl);
    let runs = [];
    try {
      runs = typeof listRuns === 'function' ? (listRuns({ limit: 20 }) || []) : [];
    } catch (error) {
      logger?.warn?.('maid settings list runs failed', error);
    }
    if (!runs.length) {
      appendEmptyItem(runListEl, '还没有女仆任务记录。');
      return;
    }
    runs.forEach((run) => {
      const item = documentRef.createElement?.('div');
      item.className = 'maid-settings-list-item';
      const chip = documentRef.createElement?.('span');
      const status = describeMaidRunStatus(run);
      chip.className = `maid-settings-status-chip is-${status.key}`;
      chip.textContent = status.label;
      const main = documentRef.createElement?.('div');
      main.className = 'maid-settings-item-main';
      const title = documentRef.createElement?.('div');
      title.className = 'maid-settings-item-title';
      title.textContent = trim(run?.metadata?.goal || run?.title, '（无目标记录）');
      const meta = documentRef.createElement?.('div');
      meta.className = 'maid-settings-item-meta';
      meta.textContent = [
        trim(run?.summary),
        run?.metadata?.failureCode ? `分类: ${run.metadata.failureCode}` : '',
        run?.metadata?.stepCount ? `${run.metadata.stepCount} 步` : '',
        run?.metadata?.continuable ? '可继续' : '',
        formatRunTime(run?.updatedAt),
      ].filter(Boolean).join(' · ');
      main.append(title, meta);
      item.append(chip, main);
      if (run?.metadata?.continuable && typeof onResumeRun === 'function') {
        const resumeBtn = createButton(documentRef, 'maid-settings-action is-primary', '继续');
        resumeBtn.addEventListener?.('click', () => {
          hide();
          void onResumeRun({ ...run });
        });
        item.appendChild(resumeBtn);
      }
      runListEl.appendChild(item);
    });
  };

  const renderRules = () => {
    if (!ruleListEl) return;
    clearChildren(ruleListEl);
    let rules = [];
    try {
      rules = allowRulesStore?.list?.() || [];
    } catch (error) {
      logger?.warn?.('maid settings list allow rules failed', error);
    }
    if (!rules.length) {
      appendEmptyItem(ruleListEl, '没有已保存的“始终允许”规则。危险操作每次都会重新确认。');
      return;
    }
    rules.forEach((rule) => {
      const item = documentRef.createElement?.('div');
      item.className = 'maid-settings-list-item';
      const main = documentRef.createElement?.('div');
      main.className = 'maid-settings-item-main';
      const title = documentRef.createElement?.('div');
      title.className = 'maid-settings-item-title';
      title.textContent = trim(rule?.title || rule?.toolName, rule?.key || '');
      const meta = documentRef.createElement?.('div');
      meta.className = 'maid-settings-item-meta';
      meta.textContent = [
        trim(rule?.toolName),
        trim(rule?.operationType),
        trim(rule?.riskLevel),
        formatRunTime(rule?.updatedAt),
      ].filter(Boolean).join(' · ');
      main.append(title, meta);
      const revokeBtn = createButton(documentRef, 'maid-settings-action', '撤销');
      revokeBtn.addEventListener?.('click', () => {
        const removed = allowRulesStore?.revoke?.(rule?.key);
        setStatus(removed ? '已撤销该规则' : '撤销失败');
        renderRules();
      });
      item.append(main, revokeBtn);
      ruleListEl.appendChild(item);
    });
  };

  const refresh = () => {
    if (promptTextarea) promptTextarea.value = settingsStore?.getMaidPrompt?.() || settingsStore?.getPersonaPrompt?.() || '';
    if (appKnowledgeTextarea) appKnowledgeTextarea.value = getAppKnowledge();
    if (historyContextTextarea) historyContextTextarea.value = getHistoryContext();
    if (memoryTableTextarea) memoryTableTextarea.value = getMemoryTable();
    if (lastAppContextTextarea) lastAppContextTextarea.value = getLastAppContextText();
    if (lastPromptTextarea) lastPromptTextarea.value = getLastPromptText();
    if (lastResponseTextarea) lastResponseTextarea.value = getLastResponseText();
    renderRuns();
    renderRules();
  };

  const switchPromptTab = (tab = 'persona') => {
    const next = ['persona', 'appKnowledge', 'historyContext', 'memoryTable', 'lastPrompt', 'lastResponse'].includes(tab) ? tab : 'persona';
    activePromptTab = next;
    promptTabButtons.forEach((button, key) => {
      button.classList.toggle('is-active', key === activePromptTab);
    });
    promptPanes.forEach((pane, key) => {
      pane.classList.toggle('is-active', key === activePromptTab);
    });
    refresh();
    setStatus('');
  };

  const switchTab = (tab = 'api') => {
    const promptSubtab = tab === 'appKnowledge' || tab === 'historyContext' || tab === 'memoryTable' || tab === 'lastPrompt' || tab === 'lastResponse' || tab === 'persona'
      ? tab
      : '';
    const next = promptSubtab ? 'prompt' : (['api', 'prompt', 'activity', 'safety'].includes(tab) ? tab : 'api');
    activeTab = next;
    tabButtons.forEach((button, key) => {
      button.classList.toggle('is-active', key === activeTab);
    });
    sections.forEach((section, key) => {
      section.classList.toggle('is-active', key === activeTab);
    });
    if (activeTab === 'prompt') switchPromptTab(promptSubtab || activePromptTab || 'persona');
    refresh();
    setStatus('');
  };

  const copyCurrentText = async (kind = '') => {
    const text = kind === 'lastResponse'
      ? lastResponseTextarea?.value
      : kind === 'lastPrompt'
        ? lastPromptTextarea?.value
        : kind === 'historyContext'
          ? historyContextTextarea?.value
          : kind === 'memoryTable'
            ? memoryTableTextarea?.value
        : promptTextarea?.value;
    if (!trim(text)) return false;
    try {
      await copyText?.(text);
      setStatus('已复制');
      return true;
    } catch (error) {
      logger?.warn?.('maid settings copy failed', error);
      setStatus('复制失败');
      return false;
    }
  };

  const savePrompt = async () => {
    try {
      if (typeof settingsStore?.setMaidPrompt === 'function') {
        await settingsStore.setMaidPrompt(promptTextarea?.value || '');
      } else {
        await settingsStore?.setPersonaPrompt?.(promptTextarea?.value || '');
      }
      setStatus('提示词已保存');
      refresh();
      return true;
    } catch (error) {
      logger?.warn?.('maid prompt save failed', error);
      setStatus('保存失败');
      return false;
    }
  };

  const ensure = () => {
    if (overlay || !documentRef?.body) return overlay;
    injectStyle(documentRef);

    overlay = documentRef.createElement?.('div');
    overlay.className = 'maid-settings-overlay';
    overlay.addEventListener?.('click', () => hide());

    panel = documentRef.createElement?.('div');
    panel.className = 'maid-settings-panel';
    panel.addEventListener?.('click', event => event.stopPropagation?.());

    const header = documentRef.createElement?.('div');
    header.className = 'maid-settings-header';
    const mark = documentRef.createElement?.('div');
    mark.className = 'maid-settings-mark';
    mark.innerHTML = ICONS.maid;
    const title = documentRef.createElement?.('div');
    title.className = 'maid-settings-title';
    title.textContent = '女仆设定';
    const closeBtn = createButton(documentRef, 'maid-settings-close', '×');
    closeBtn.innerHTML = ICONS.close;
    closeBtn.setAttribute?.('aria-label', '关闭女仆设定');
    closeBtn.addEventListener?.('click', () => hide());
    header.append(mark, title, closeBtn);

    const tabs = documentRef.createElement?.('div');
    tabs.className = 'maid-settings-tabs';
    [
      ['api', 'API', ICONS.api],
      ['prompt', '提示词', ICONS.prompt],
      ['activity', '活动', ICONS.activity],
      ['safety', '权限', ICONS.shield],
    ].forEach(([key, label, icon]) => {
      const button = createButton(documentRef, 'maid-settings-tab', label);
      setIconButtonContent(button, icon, label);
      button.addEventListener?.('click', () => switchTab(key));
      tabButtons.set(key, button);
      tabs.appendChild(button);
    });

    const body = documentRef.createElement?.('div');
    body.className = 'maid-settings-body';

    const apiSection = documentRef.createElement?.('section');
    apiSection.className = 'maid-settings-section';
    const apiRow = documentRef.createElement?.('div');
    apiRow.className = 'maid-settings-api-row';
    const apiText = documentRef.createElement?.('div');
    apiText.className = 'maid-settings-empty';
    apiText.textContent = 'API 配置由 APP 统一管理。';
    const apiButton = createButton(documentRef, 'maid-settings-action is-primary', '打开 API 设定');
    apiButton.addEventListener?.('click', () => {
      hide();
      void onOpenApiConfig?.({ source: 'maid_settings' });
    });
    apiRow.append(apiText, apiButton);
    apiSection.append(apiRow);

    const promptSection = documentRef.createElement?.('section');
    promptSection.className = 'maid-settings-section';
    const promptSubtabs = documentRef.createElement?.('div');
    promptSubtabs.className = 'maid-settings-prompt-tabs';
    [
      ['persona', '人格'],
      ['appKnowledge', 'APP知识'],
      ['historyContext', '历史上下文'],
      ['memoryTable', '记忆表格'],
      ['lastPrompt', '本次提示词'],
      ['lastResponse', '本次完整回复'],
    ].forEach(([key, label]) => {
      const button = createButton(documentRef, 'maid-settings-prompt-tab', label);
      button.addEventListener?.('click', () => switchPromptTab(key));
      promptTabButtons.set(key, button);
      promptSubtabs.appendChild(button);
    });
    const personaPane = documentRef.createElement?.('div');
    personaPane.className = 'maid-settings-prompt-pane';
    const promptField = documentRef.createElement?.('div');
    promptField.className = 'maid-settings-field';
    const promptLabel = documentRef.createElement?.('div');
    promptLabel.className = 'maid-settings-label';
    promptLabel.textContent = '提示词';
    promptTextarea = createTextarea(documentRef);
    promptTextarea.placeholder = '女仆基础提示词';
    const promptFooter = documentRef.createElement?.('div');
    promptFooter.className = 'maid-settings-footer';
    const saveBtn = createButton(documentRef, 'maid-settings-action is-primary', '保存');
    saveBtn.addEventListener?.('click', () => void savePrompt());
    const copyPromptBtn = createButton(documentRef, 'maid-settings-action', '复制');
    copyPromptBtn.addEventListener?.('click', () => void copyCurrentText('prompt'));
    statusEl = documentRef.createElement?.('div');
    statusEl.className = 'maid-settings-status';
    promptFooter.append(saveBtn, copyPromptBtn, statusEl);
    promptField.append(promptLabel, promptTextarea);
    personaPane.append(promptField, promptFooter);

    const appKnowledgePane = documentRef.createElement?.('div');
    appKnowledgePane.className = 'maid-settings-prompt-pane';
    const appKnowledgeSplit = documentRef.createElement?.('div');
    appKnowledgeSplit.className = 'maid-settings-split';
    const appKnowledgeField = documentRef.createElement?.('div');
    appKnowledgeField.className = 'maid-settings-field';
    const appKnowledgeLabel = documentRef.createElement?.('div');
    appKnowledgeLabel.className = 'maid-settings-label';
    appKnowledgeLabel.textContent = 'APP知识';
    appKnowledgeTextarea = createTextarea(documentRef, { readOnly: true });
    appKnowledgeField.append(appKnowledgeLabel, appKnowledgeTextarea);
    const lastContextField = documentRef.createElement?.('div');
    lastContextField.className = 'maid-settings-field';
    const lastContextLabel = documentRef.createElement?.('div');
    lastContextLabel.className = 'maid-settings-label';
    lastContextLabel.textContent = '本次检索';
    lastAppContextTextarea = createTextarea(documentRef, { readOnly: true });
    lastContextField.append(lastContextLabel, lastAppContextTextarea);
    appKnowledgeSplit.append(appKnowledgeField, lastContextField);
    appKnowledgePane.append(appKnowledgeSplit);

    const historyContextPane = documentRef.createElement?.('div');
    historyContextPane.className = 'maid-settings-prompt-pane';
    const historyContextField = documentRef.createElement?.('div');
    historyContextField.className = 'maid-settings-field';
    const historyContextLabel = documentRef.createElement?.('div');
    historyContextLabel.className = 'maid-settings-label';
    historyContextLabel.textContent = '历史上下文';
    historyContextTextarea = createTextarea(documentRef, { readOnly: true });
    const historyContextFooter = documentRef.createElement?.('div');
    historyContextFooter.className = 'maid-settings-footer';
    const copyHistoryContextBtn = createButton(documentRef, 'maid-settings-action', '复制');
    copyHistoryContextBtn.addEventListener?.('click', () => void copyCurrentText('historyContext'));
    historyContextFooter.appendChild(copyHistoryContextBtn);
    historyContextField.append(historyContextLabel, historyContextTextarea);
    historyContextPane.append(historyContextField, historyContextFooter);

    const memoryTablePane = documentRef.createElement?.('div');
    memoryTablePane.className = 'maid-settings-prompt-pane';
    const memoryTableField = documentRef.createElement?.('div');
    memoryTableField.className = 'maid-settings-field';
    const memoryTableLabel = documentRef.createElement?.('div');
    memoryTableLabel.className = 'maid-settings-label';
    memoryTableLabel.textContent = '记忆表格';
    memoryTableTextarea = createTextarea(documentRef, { readOnly: true });
    const memoryTableFooter = documentRef.createElement?.('div');
    memoryTableFooter.className = 'maid-settings-footer';
    const copyMemoryTableBtn = createButton(documentRef, 'maid-settings-action', '复制');
    copyMemoryTableBtn.addEventListener?.('click', () => void copyCurrentText('memoryTable'));
    memoryTableFooter.appendChild(copyMemoryTableBtn);
    memoryTableField.append(memoryTableLabel, memoryTableTextarea);
    memoryTablePane.append(memoryTableField, memoryTableFooter);

    const lastPromptPane = documentRef.createElement?.('div');
    lastPromptPane.className = 'maid-settings-prompt-pane';
    const lastPromptField = documentRef.createElement?.('div');
    lastPromptField.className = 'maid-settings-field';
    const lastPromptLabel = documentRef.createElement?.('div');
    lastPromptLabel.className = 'maid-settings-label';
    lastPromptLabel.textContent = '本次提示词';
    lastPromptTextarea = createTextarea(documentRef, { readOnly: true });
    const lastPromptFooter = documentRef.createElement?.('div');
    lastPromptFooter.className = 'maid-settings-footer';
    const copyLastPromptBtn = createButton(documentRef, 'maid-settings-action', '复制');
    copyLastPromptBtn.addEventListener?.('click', () => void copyCurrentText('lastPrompt'));
    lastPromptFooter.appendChild(copyLastPromptBtn);
    lastPromptField.append(lastPromptLabel, lastPromptTextarea);
    lastPromptPane.append(lastPromptField, lastPromptFooter);

    const lastResponsePane = documentRef.createElement?.('div');
    lastResponsePane.className = 'maid-settings-prompt-pane';
    const lastResponseField = documentRef.createElement?.('div');
    lastResponseField.className = 'maid-settings-field';
    const lastResponseLabel = documentRef.createElement?.('div');
    lastResponseLabel.className = 'maid-settings-label';
    lastResponseLabel.textContent = '本次完整回复';
    lastResponseTextarea = createTextarea(documentRef, { readOnly: true });
    const lastResponseFooter = documentRef.createElement?.('div');
    lastResponseFooter.className = 'maid-settings-footer';
    const copyLastResponseBtn = createButton(documentRef, 'maid-settings-action', '复制');
    copyLastResponseBtn.addEventListener?.('click', () => void copyCurrentText('lastResponse'));
    lastResponseFooter.appendChild(copyLastResponseBtn);
    lastResponseField.append(lastResponseLabel, lastResponseTextarea);
    lastResponsePane.append(lastResponseField, lastResponseFooter);
    promptPanes.set('persona', personaPane);
    promptPanes.set('appKnowledge', appKnowledgePane);
    promptPanes.set('historyContext', historyContextPane);
    promptPanes.set('memoryTable', memoryTablePane);
    promptPanes.set('lastPrompt', lastPromptPane);
    promptPanes.set('lastResponse', lastResponsePane);
    promptSection.append(
      promptSubtabs,
      personaPane,
      appKnowledgePane,
      historyContextPane,
      memoryTablePane,
      lastPromptPane,
      lastResponsePane,
    );

    const activitySection = documentRef.createElement?.('section');
    activitySection.className = 'maid-settings-section';
    const activityLabel = documentRef.createElement?.('div');
    activityLabel.className = 'maid-settings-label';
    activityLabel.textContent = '最近女仆任务';
    runListEl = documentRef.createElement?.('div');
    runListEl.className = 'maid-settings-list';
    activitySection.append(activityLabel, runListEl);

    const safetySection = documentRef.createElement?.('section');
    safetySection.className = 'maid-settings-section';
    const safetyLabel = documentRef.createElement?.('div');
    safetyLabel.className = 'maid-settings-label';
    safetyLabel.textContent = '始终允许规则';
    ruleListEl = documentRef.createElement?.('div');
    ruleListEl.className = 'maid-settings-list';
    safetySection.append(safetyLabel, ruleListEl);

    [
      ['api', apiSection],
      ['prompt', promptSection],
      ['activity', activitySection],
      ['safety', safetySection],
    ].forEach(([key, section]) => {
      sections.set(key, section);
      body.appendChild(section);
    });

    panel.append(header, tabs, body);
    overlay.appendChild(panel);
    documentRef.body.appendChild(overlay);
    return overlay;
  };

  const show = ({ tab = 'api' } = {}) => {
    const el = ensure();
    if (!el) return false;
    isOpen = true;
    refresh();
    switchTab(tab);
    el.classList.add('is-open');
    return true;
  };

  const hide = () => {
    isOpen = false;
    overlay?.classList.remove('is-open');
    setStatus('');
    return true;
  };

  return {
    show,
    hide,
    refresh,
    switchTab,
    isOpen: () => isOpen,
    getElements: () => ({
      overlay,
      panel,
      promptTextarea,
      appKnowledgeTextarea,
      historyContextTextarea,
      memoryTableTextarea,
      lastAppContextTextarea,
      lastPromptTextarea,
      lastResponseTextarea,
      statusEl,
      runListEl,
      ruleListEl,
      tabButtons,
      sections,
      promptTabButtons,
      promptPanes,
    }),
  };
};
