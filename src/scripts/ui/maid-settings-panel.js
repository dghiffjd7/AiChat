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
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.maid-settings-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  overflow-x: auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.22));
  background: var(--app-surface-card, #fff);
}
.maid-settings-tab {
  min-height: 34px;
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
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
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
    grid-template-columns: repeat(3, max-content);
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
  request: iconSvg('<path d="M5 5h14v14H5z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h7"/>'),
  response: iconSvg('<path d="M4 6h16v10H7l-3 3Z"/><path d="M8 10h8"/><path d="M8 14h5"/>'),
});

const setIconButtonContent = (button, icon = '', label = '') => {
  if (!button) return;
  button.innerHTML = `${icon}${label ? `<span>${label}</span>` : ''}`;
};

export const createMaidSettingsPanel = ({
  documentRef = globalThis?.document || null,
  settingsStore = null,
  onOpenApiConfig = null,
  getAppKnowledgeText = () => '',
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
  let lastAppContextTextarea = null;
  let lastPromptTextarea = null;
  let lastResponseTextarea = null;
  let statusEl = null;
  let isOpen = false;

  const setStatus = (message = '') => {
    if (!statusEl) return;
    statusEl.textContent = trim(message);
  };

  const getLastPromptText = () => trim(settingsStore?.getLastRequestPrompt?.(), '尚未记录任何女仆本次提示词。');
  const getLastAppContextText = () => trim(settingsStore?.getLastAppContext?.(), '尚未记录任何本次检索。');
  const getLastResponseText = () => trim(settingsStore?.getLastFullResponse?.(), '尚未记录任何女仆完整回复。');
  const getAppKnowledge = () => trim(getAppKnowledgeText?.(), '暂无 APP 知识。');

  const refresh = () => {
    if (promptTextarea) promptTextarea.value = settingsStore?.getMaidPrompt?.() || settingsStore?.getPersonaPrompt?.() || '';
    if (appKnowledgeTextarea) appKnowledgeTextarea.value = getAppKnowledge();
    if (lastAppContextTextarea) lastAppContextTextarea.value = getLastAppContextText();
    if (lastPromptTextarea) lastPromptTextarea.value = getLastPromptText();
    if (lastResponseTextarea) lastResponseTextarea.value = getLastResponseText();
  };

  const switchPromptTab = (tab = 'persona') => {
    const next = ['persona', 'appKnowledge', 'lastPrompt'].includes(tab) ? tab : 'persona';
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
    const promptSubtab = tab === 'appKnowledge' || tab === 'lastPrompt' || tab === 'persona'
      ? tab
      : '';
    const next = promptSubtab ? 'prompt' : (['api', 'prompt', 'lastResponse'].includes(tab) ? tab : 'api');
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
      ['lastResponse', '本次完整回复', ICONS.response],
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
      ['lastPrompt', '本次提示词'],
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
    promptPanes.set('persona', personaPane);
    promptPanes.set('appKnowledge', appKnowledgePane);
    promptPanes.set('lastPrompt', lastPromptPane);
    promptSection.append(promptSubtabs, personaPane, appKnowledgePane, lastPromptPane);

    const lastResponseSection = documentRef.createElement?.('section');
    lastResponseSection.className = 'maid-settings-section';
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
    lastResponseSection.append(lastResponseField, lastResponseFooter);

    [
      ['api', apiSection],
      ['prompt', promptSection],
      ['lastResponse', lastResponseSection],
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
      lastAppContextTextarea,
      lastPromptTextarea,
      lastResponseTextarea,
      statusEl,
      tabButtons,
      sections,
      promptTabButtons,
      promptPanes,
    }),
  };
};
