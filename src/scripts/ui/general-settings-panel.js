import { appSettings } from '../storage/app-settings.js';
import { ConfigManager } from '../storage/config.js';
import { safeInvoke } from '../utils/tauri.js';
import { appConfirm } from './app-confirm.js';

const GENERAL_SETTINGS_ICONS = Object.freeze({
  reply: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 8L4 12l5 4"></path>
      <path d="M4 12h8c4.4 0 8 3.6 8 8"></path>
    </svg>
  `.trim(),
  expand: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2"></rect>
      <path d="M8 9H6v6h2"></path>
      <path d="M16 9h2v6h-2"></path>
    </svg>
  `.trim(),
  history: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16"></path>
      <path d="M4 12h10"></path>
      <path d="M4 18h7"></path>
      <path d="M17 15v4"></path>
      <path d="M15 17h4"></path>
    </svg>
  `.trim(),
  bug: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8a4 4 0 0 1 8 0"></path>
      <path d="M8 10h8v4a4 4 0 0 1-8 0z"></path>
      <path d="M6 13H4"></path>
      <path d="M20 13h-2"></path>
      <path d="M7 7L5.5 5.5"></path>
      <path d="M17 7l1.5-1.5"></path>
      <path d="M8 17l-2 2"></path>
      <path d="M16 17l2 2"></path>
    </svg>
  `.trim(),
  log: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="6" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
      <circle cx="5" cy="18" r="1"></circle>
      <path d="M9 6h10"></path>
      <path d="M9 12h10"></path>
      <path d="M9 18h10"></path>
    </svg>
  `.trim(),
  code: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8l-4 4 4 4"></path>
      <path d="M16 8l4 4-4 4"></path>
      <path d="M13 5l-2 14"></path>
    </svg>
  `.trim(),
  link: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"></path>
      <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"></path>
    </svg>
  `.trim(),
  clock: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="M12 8v4l3 2"></path>
    </svg>
  `.trim(),
  brain: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6a3 3 0 0 1 6 0 3 3 0 0 1 3 3c1.1.4 2 1.5 2 2.9 0 1.8-1.4 3.1-3.2 3.1H7.2C5.4 15 4 13.7 4 11.9c0-1.4.9-2.5 2-2.9A3 3 0 0 1 9 6z"></path>
      <path d="M10 10v5"></path>
      <path d="M14 10v5"></path>
      <path d="M10 12h4"></path>
    </svg>
  `.trim(),
  notes: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2"></rect>
      <path d="M8 8h8"></path>
      <path d="M8 12h8"></path>
      <path d="M8 16h5"></path>
    </svg>
  `.trim(),
  table: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2"></rect>
      <path d="M4 10h16"></path>
      <path d="M9 5v14"></path>
      <path d="M15 5v14"></path>
    </svg>
  `.trim(),
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5C6 5 6 7 6 8.5S5 12 3.5 12C5 12 6 14 6 15.5S6 19 8 19"></path>
      <path d="M16 5c2 0 2 2 2 3.5S19 12 20.5 12C19 12 18 14 18 15.5S18 19 16 19"></path>
    </svg>
  `.trim(),
  script: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h8l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
      <path d="M15 5v4h4"></path>
      <path d="M9 12h6"></path>
      <path d="M9 16h4"></path>
    </svg>
  `.trim(),
  sliders: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14"></path>
      <path d="M9 12h10"></path>
      <path d="M5 18h14"></path>
      <circle cx="8" cy="6" r="2"></circle>
      <circle cx="14" cy="12" r="2"></circle>
      <circle cx="11" cy="18" r="2"></circle>
    </svg>
  `.trim(),
});

export class GeneralSettingsPanel {
  constructor(actions = {}) {
    this.element = null;
    this.overlayElement = null;
    this.modalElement = null;
    this.debugToggle = null;
    this.debugLogToggle = null;
    this.typingDotsToggle = null;
    this.richIframeScriptsToggle = null;
    this.creativeHistoryInput = null;
    this.creativeWideToggle = null;
    this.personaBindToggle = null;
    this.promptTimeToggle = null;
    this.memoryEnabledToggle = null;
    this.memoryModeSummary = null;
    this.memoryModeTable = null;
    this.memoryAutoToggle = null;
    this.memoryAutoModeInline = null;
    this.memoryAutoModeSeparate = null;
    this.memoryAutoOptions = null;
    this.memoryUpdateApiChat = null;
    this.memoryUpdateApiProfile = null;
    this.memoryUpdateProfileSelect = null;
    this.memoryUpdateApiBlock = null;
    this.memoryUpdateContextInput = null;
    this.memoryBudgetBlock = null;
    this.memoryInjectPositionSelect = null;
    this.memoryInjectDepthWrap = null;
    this.memoryInjectDepthInput = null;
    this.memoryBridgeBlock = null;
    this.memoryBridgeRpToChatToggle = null;
    this.memoryBridgeRpToChatLimitInput = null;
    this.memoryBridgeChatToRpToggle = null;
    this.memoryBridgeChatToRpLimitInput = null;
    this.memoryAutoConfirmToggle = null;
    this.memoryAutoStepToggle = null;
    this.templateEnabledToggle = null;
    this.templateBeforeToggle = null;
    this.templateAfterToggle = null;
    this.templateErrorToggle = null;
    this.templateOptionsWrap = null;
    this.templateAdvancedToggle = null;
    this.templateAdvancedWrap = null;
    this.scriptAdvancedToggle = null;
    this.scriptAdvancedWrap = null;
    this.scriptEnabledToggle = null;
    this.scriptAllowVarsToggle = null;
    this.scriptAllowMessagesToggle = null;
    this.scriptAllowNetworkToggle = null;
    this.scriptOptionsWrap = null;
    this.uiAdvancedToggle = null;
    this.uiAdvancedWrap = null;
    this.memoryAdvancedToggle = null;
    this.memoryAdvancedWrap = null;
    this.cleanWallpapersBtn = null;
    this.cleanWallpapersStatus = null;
    this.bundleExportBtn = null;
    this.bundleImportBtn = null;
    this.bundleStatus = null;
    this.bundleImportInput = null;
    this.openSessionBtn = null;
    this.openMemoryTemplatesBtn = null;
    this.externalActions = {
      openSession: null,
      openMemoryTemplates: null,
    };
    this.configManager = new ConfigManager();
    this.setExternalActions(actions);
  }

  setExternalActions(actions = {}) {
    this.externalActions.openSession =
      typeof actions.openSession === 'function' ? actions.openSession : null;
    this.externalActions.openMemoryTemplates =
      typeof actions.openMemoryTemplates === 'function' ? actions.openMemoryTemplates : null;
    this.updateShortcutButtons();
  }

  show() {
    if (!this.element) {
      this.createUI();
    }
    const settings = appSettings.get();
    if (this.debugToggle) {
      this.debugToggle.checked = Boolean(settings.showDebugToggle);
    }
    if (this.debugLogToggle) {
      this.debugLogToggle.checked = settings.debugExecutionLogs === true;
    }
    if (this.typingDotsToggle) {
      this.typingDotsToggle.checked = settings.typingDotsEnabled !== false;
    }
    if (this.richIframeScriptsToggle) {
      this.richIframeScriptsToggle.checked = Boolean(settings.allowRichIframeScripts);
    }
    if (this.creativeHistoryInput) {
      const n = Number(settings.creativeHistoryMax);
      this.creativeHistoryInput.value = String(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 3);
    }
    if (this.creativeWideToggle) {
      this.creativeWideToggle.checked = Boolean(settings.creativeWideBubble);
    }
    if (this.personaBindToggle) {
      this.personaBindToggle.checked = settings.personaBindContacts !== false;
    }
    if (this.promptTimeToggle) {
      this.promptTimeToggle.checked = settings.promptCurrentTimeEnabled === true;
    }
    const memoryEnabled = settings.memoryEnabled !== false;
    const memoryMode = String(settings.memoryStorageMode || 'table').toLowerCase();
    if (this.memoryEnabledToggle) {
      this.memoryEnabledToggle.checked = memoryEnabled;
    }
    if (this.memoryModeSummary) {
      this.memoryModeSummary.checked = memoryMode !== 'table';
    }
    if (this.memoryModeTable) {
      this.memoryModeTable.checked = memoryMode === 'table';
    }
    if (this.memoryAutoToggle) {
      this.memoryAutoToggle.checked = Boolean(settings.memoryAutoExtract);
    }
    const memoryAutoMode = String(settings.memoryAutoExtractMode || 'inline').toLowerCase();
    if (this.memoryAutoModeInline) {
      this.memoryAutoModeInline.checked = memoryAutoMode !== 'separate';
    }
    if (this.memoryAutoModeSeparate) {
      this.memoryAutoModeSeparate.checked = memoryAutoMode === 'separate';
    }
    const memoryApiMode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
    if (this.memoryUpdateApiChat) {
      this.memoryUpdateApiChat.checked = memoryApiMode !== 'profile';
    }
    if (this.memoryUpdateApiProfile) {
      this.memoryUpdateApiProfile.checked = memoryApiMode === 'profile';
    }
    if (this.memoryUpdateProfileSelect) {
      this.memoryUpdateProfileSelect.value = String(settings.memoryUpdateProfileId || '');
    }
    if (this.memoryUpdateContextInput) {
      const raw = Math.trunc(Number(settings.memoryUpdateContextRounds ?? settings.memoryUpdateContextCount));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 6;
      this.memoryUpdateContextInput.value = String(safe);
    }
    if (this.memoryAutoConfirmToggle) {
      this.memoryAutoConfirmToggle.checked = settings.memoryAutoConfirm === true;
    }
    if (this.memoryAutoStepToggle) {
      this.memoryAutoStepToggle.checked = settings.memoryAutoStepByStep === true;
    }
    if (this.memoryInjectPositionSelect) {
      const raw = String(settings.memoryInjectPosition || 'template').toLowerCase();
      const allowed = new Set(['template', 'after_persona', 'system_end', 'before_chat', 'history_depth', 'system_end+before_chat']);
      this.memoryInjectPositionSelect.value = allowed.has(raw) ? raw : 'template';
    }
    if (this.memoryInjectDepthInput) {
      const raw = Math.trunc(Number(settings.memoryInjectDepth));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 4;
      this.memoryInjectDepthInput.value = String(safe);
    }
    if (this.memoryBridgeRpToChatToggle) {
      this.memoryBridgeRpToChatToggle.checked = settings.memoryBridgeRpToChatEnabled !== false;
    }
    if (this.memoryBridgeRpToChatLimitInput) {
      const raw = Math.trunc(Number(settings.memoryBridgeRpToChatLimit));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 5;
      this.memoryBridgeRpToChatLimitInput.value = String(safe);
    }
    if (this.memoryBridgeChatToRpToggle) {
      this.memoryBridgeChatToRpToggle.checked = settings.memoryBridgeChatToRpEnabled !== false;
    }
    if (this.memoryBridgeChatToRpLimitInput) {
      const raw = Math.trunc(Number(settings.memoryBridgeChatToRpLimit));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 5;
      this.memoryBridgeChatToRpLimitInput.value = String(safe);
    }
    if (this.templateEnabledToggle) {
      this.templateEnabledToggle.checked = settings.templateEnabled !== false;
    }
    if (this.templateBeforeToggle) {
      this.templateBeforeToggle.checked = settings.templateExecuteBeforeGenerate !== false;
    }
    if (this.templateAfterToggle) {
      this.templateAfterToggle.checked = settings.templateExecuteAfterRender !== false;
    }
    if (this.templateErrorToggle) {
      this.templateErrorToggle.checked = settings.templateShowErrorToast !== false;
    }
    if (this.scriptEnabledToggle) {
      this.scriptEnabledToggle.checked = settings.scriptEnabled === true;
    }
    if (this.scriptAllowVarsToggle) {
      this.scriptAllowVarsToggle.checked = settings.scriptAllowModifyVariables !== false;
    }
    if (this.scriptAllowMessagesToggle) {
      this.scriptAllowMessagesToggle.checked = settings.scriptAllowReadMessages !== false;
    }
    if (this.scriptAllowNetworkToggle) {
      this.scriptAllowNetworkToggle.checked = settings.scriptAllowNetwork === true;
    }
    this.syncAdvancedFoldVisibility();
    this.updateTemplateScriptVisibility();
    this.updateShortcutButtons();
    this.refreshMemoryUpdateProfiles().catch(() => {});
    this.updateMemoryAutoVisibility();
    this.updateSelectableCards();
    this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    this.element.style.display = 'block';
    this.overlayElement.style.display = 'block';
  }

  hide() {
    if (this.element) this.element.style.display = 'none';
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  applyTypingDotsSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      delete document.body.dataset.typingDots;
    } else {
      document.body.dataset.typingDots = 'off';
    }
  }

  applyCreativeWideSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      document.body.dataset.creativeWide = 'on';
    } else {
      delete document.body.dataset.creativeWide;
    }
  }

  updateMemoryAutoVisibility() {
    const settings = appSettings.get();
    const memoryEnabled = settings.memoryEnabled !== false;
    const memoryMode = memoryEnabled ? String(settings.memoryStorageMode || 'table').toLowerCase() : 'off';
    const showMemoryTable = memoryEnabled && memoryMode === 'table';
    const enabled = settings.memoryAutoExtract === true;
    const mode = String(settings.memoryAutoExtractMode || 'inline').toLowerCase();
    const showAuto = showMemoryTable && Boolean(enabled);
    if (this.memoryModeSummary) this.memoryModeSummary.disabled = !memoryEnabled;
    if (this.memoryModeTable) this.memoryModeTable.disabled = !memoryEnabled;
    if (this.memoryAutoToggle) this.memoryAutoToggle.disabled = !showMemoryTable;
    if (this.memoryAutoOptions) {
      this.memoryAutoOptions.style.display = showAuto ? 'block' : 'none';
    }
    const showApi = showAuto && mode === 'separate';
    if (this.memoryUpdateApiBlock) {
      this.memoryUpdateApiBlock.style.display = showApi ? 'block' : 'none';
    }
    if (this.memoryUpdateContextInput) {
      this.memoryUpdateContextInput.disabled = !showApi;
    }
    const apiMode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
    if (this.memoryUpdateProfileSelect) {
      this.memoryUpdateProfileSelect.disabled = !showApi || apiMode !== 'profile';
    }
    if (this.memoryBudgetBlock) {
      this.memoryBudgetBlock.style.display = showMemoryTable ? 'block' : 'none';
    }
    if (this.memoryInjectPositionSelect) {
      this.memoryInjectPositionSelect.disabled = !showMemoryTable;
    }
    const position = String(settings.memoryInjectPosition || 'template').toLowerCase();
    const showDepth = showMemoryTable && position === 'history_depth';
    if (this.memoryInjectDepthWrap) {
      this.memoryInjectDepthWrap.style.display = showDepth ? 'block' : 'none';
    }
    if (this.memoryInjectDepthInput) {
      this.memoryInjectDepthInput.disabled = !showDepth;
    }
    if (this.memoryBridgeBlock) {
      this.memoryBridgeBlock.style.display = showMemoryTable ? 'block' : 'none';
    }
    if (this.memoryBridgeRpToChatToggle) {
      this.memoryBridgeRpToChatToggle.disabled = !showMemoryTable;
    }
    if (this.memoryBridgeRpToChatLimitInput) {
      this.memoryBridgeRpToChatLimitInput.disabled = !showMemoryTable || this.memoryBridgeRpToChatToggle?.checked === false;
    }
    if (this.memoryBridgeChatToRpToggle) {
      this.memoryBridgeChatToRpToggle.disabled = !showMemoryTable;
    }
    if (this.memoryBridgeChatToRpLimitInput) {
      this.memoryBridgeChatToRpLimitInput.disabled = !showMemoryTable || this.memoryBridgeChatToRpToggle?.checked === false;
    }
    this.updateSelectableCards();
  }

  updateTemplateScriptVisibility() {
    const templateAdvancedOpen = this.isFoldExpanded(this.templateAdvancedToggle);
    const templateEnabled = Boolean(this.templateEnabledToggle?.checked);
    if (this.templateOptionsWrap) {
      this.templateOptionsWrap.style.display = templateEnabled && templateAdvancedOpen ? 'flex' : 'none';
    }
    if (this.templateBeforeToggle) this.templateBeforeToggle.disabled = !templateEnabled || !templateAdvancedOpen;
    if (this.templateAfterToggle) this.templateAfterToggle.disabled = !templateEnabled || !templateAdvancedOpen;
    if (this.templateErrorToggle) this.templateErrorToggle.disabled = !templateEnabled || !templateAdvancedOpen;

    const scriptAdvancedOpen = this.isFoldExpanded(this.scriptAdvancedToggle);
    const scriptEnabled = Boolean(this.scriptEnabledToggle?.checked);
    if (this.scriptOptionsWrap) {
      this.scriptOptionsWrap.style.display = scriptEnabled && scriptAdvancedOpen ? 'flex' : 'none';
    }
    if (this.scriptAllowVarsToggle) this.scriptAllowVarsToggle.disabled = !scriptEnabled || !scriptAdvancedOpen;
    if (this.scriptAllowMessagesToggle) this.scriptAllowMessagesToggle.disabled = !scriptEnabled || !scriptAdvancedOpen;
    if (this.scriptAllowNetworkToggle) this.scriptAllowNetworkToggle.disabled = !scriptEnabled || !scriptAdvancedOpen;
    this.updateSelectableCards();
  }

  updateShortcutButtons() {
    if (this.openSessionBtn) {
      this.openSessionBtn.disabled = typeof this.externalActions.openSession !== 'function';
    }
    if (this.openMemoryTemplatesBtn) {
      this.openMemoryTemplatesBtn.disabled = typeof this.externalActions.openMemoryTemplates !== 'function';
    }
  }

  isFoldExpanded(toggle) {
    return String(toggle?.dataset?.expanded || '0') === '1';
  }

  syncAdvancedFoldVisibility() {
    const applyFold = (toggle, wrap) => {
      const expanded = this.isFoldExpanded(toggle);
      if (toggle) {
        toggle.dataset.expanded = expanded ? '1' : '0';
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle.setAttribute('aria-label', expanded ? '收起子项' : '展开子项');
      }
      if (wrap) {
        wrap.style.display = expanded ? 'block' : 'none';
      }
    };
    applyFold(this.uiAdvancedToggle, this.uiAdvancedWrap);
    applyFold(this.memoryAdvancedToggle, this.memoryAdvancedWrap);
    applyFold(this.templateAdvancedToggle, this.templateAdvancedWrap);
    applyFold(this.scriptAdvancedToggle, this.scriptAdvancedWrap);
  }

  scrollFoldSectionIntoView(toggle, wrap) {
    const container = this.modalElement || this.element?.querySelector('.general-settings-modal');
    if (!(container instanceof HTMLElement)) return;
    const anchor = (wrap?.firstElementChild instanceof HTMLElement
      ? wrap.firstElementChild
      : (wrap instanceof HTMLElement ? wrap : toggle));
    if (!(anchor instanceof HTMLElement)) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const rawTop = container.scrollTop + (anchorRect.top - containerRect.top) - 12;
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const nextTop = Math.max(0, Math.min(maxTop, Math.round(rawTop)));
        container.scrollTo({ top: nextTop, behavior: 'smooth' });
      });
    });
  }

  toggleAdvancedSection(toggle, wrap, afterToggle = null) {
    if (!toggle) return;
    const nextExpanded = !this.isFoldExpanded(toggle);
    toggle.dataset.expanded = nextExpanded ? '1' : '0';
    this.syncAdvancedFoldVisibility();
    if (typeof afterToggle === 'function') afterToggle(nextExpanded);
    if (nextExpanded) this.scrollFoldSectionIntoView(toggle, wrap);
  }

  initSelectableCards() {
    if (!this.element) return;
    const labels = this.element.querySelectorAll('.general-settings-toggle-row');
    labels.forEach((label) => {
      if (!label.querySelector('input[type="checkbox"], input[type="radio"]')) return;
      if (label.closest('.general-settings-fold-content') && !label.classList.contains('general-settings-toggle-subrow')) {
        label.classList.add('general-settings-toggle-subrow');
      }
    });
    this.updateSelectableCards();
  }

  updateSelectableCards() {
    if (!this.element) return;
    const inputs = this.element.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    inputs.forEach((input) => {
      const label = input.closest('label');
      if (!label || !label.classList.contains('general-settings-toggle-row')) return;
      const checked = Boolean(input.checked);
      const disabled = Boolean(input.disabled);
      label.classList.toggle('is-on', checked);
      label.classList.toggle('is-off', !checked);
      label.classList.toggle('is-disabled', disabled);
      if (label.querySelector('.general-settings-risk')) {
        label.classList.toggle('has-risk', checked);
      }
    });
  }

  handleCardPointerDown(label, event) {
    if (!label || label.classList.contains('is-disabled') || label.classList.contains('general-settings-toggle-subrow')) return;
    label.classList.remove('is-bounce');
    label.classList.add('is-pressing');
    this.spawnCardRipple(label, event);
  }

  handleCardPointerUp(label) {
    if (!label || label.classList.contains('general-settings-toggle-subrow')) return;
    label.classList.remove('is-pressing');
    label.classList.remove('is-bounce');
    // Restart animation so rapid taps still produce a clear elastic response.
    void label.offsetWidth;
    label.classList.add('is-bounce');
    if (label.__cardBounceTimer) clearTimeout(label.__cardBounceTimer);
    label.__cardBounceTimer = setTimeout(() => {
      label.classList.remove('is-bounce');
      label.__cardBounceTimer = null;
    }, 240);
  }

  spawnCardRipple(label, event) {
    if (!label) return;
    const rect = label.getBoundingClientRect();
    const x = Number.isFinite(event?.clientX) ? (event.clientX - rect.left) : (rect.width / 2);
    const y = Number.isFinite(event?.clientY) ? (event.clientY - rect.top) : (rect.height / 2);
    const size = Math.max(rect.width, rect.height) * 2.1;
    const ripple = document.createElement('span');
    ripple.className = 'general-settings-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    label.appendChild(ripple);
  }

  async refreshMemoryUpdateProfiles() {
    if (!this.memoryUpdateProfileSelect) return;
    try {
      await this.configManager.load();
      const profiles = this.configManager.getProfiles();
      const activeId = this.configManager.getActiveProfileId();
      const current = appSettings.get().memoryUpdateProfileId || activeId || '';
      this.memoryUpdateProfileSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = profiles.length ? '选择 API 配置…' : '暂无配置';
      this.memoryUpdateProfileSelect.appendChild(placeholder);
      profiles.forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name || profile.id;
        if (profile.id === current) option.selected = true;
        this.memoryUpdateProfileSelect.appendChild(option);
      });
    } catch {}
  }

  ensureStyles() {
    if (document.getElementById('general-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'general-settings-style';
    style.textContent = `
      #general-settings-overlay {
        background: rgba(15, 23, 42, 0.42) !important;
        backdrop-filter: blur(2px);
      }
      #general-settings-panel {
        width: min(94vw, 460px);
      }
      #general-settings-panel .general-settings-modal {
        padding: 16px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.22);
        max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px);
        overflow-y: auto;
      }
      #general-settings-panel .general-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      #general-settings-panel .general-settings-title {
        margin: 0;
        color: #0f172a;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.2px;
      }
      #general-settings-panel .general-settings-close {
        width: 30px;
        height: 30px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        color: #0f172a;
        font-size: 18px;
        cursor: pointer;
      }
      #general-settings-panel .general-settings-subtitle {
        color: #64748b;
        font-size: 12px;
        margin-bottom: 12px;
      }
      #general-settings-panel .general-settings-card {
        margin: 8px 0 12px;
        padding: 14px;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
      }
      #general-settings-panel .general-settings-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      #general-settings-panel .general-settings-card-title {
        font-size: 13px;
        color: #334155;
        font-weight: 700;
        margin-bottom: 0;
      }
      #general-settings-panel .general-settings-card-note {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }
      #general-settings-panel .general-settings-subcard {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #f8fafc;
      }
      #general-settings-panel .general-settings-subcard + .general-settings-subcard {
        margin-top: 10px;
      }
      #general-settings-panel .general-settings-subcard-title {
        font-size: 12px;
        line-height: 1.4;
        color: #475569;
        font-weight: 700;
      }
      #general-settings-panel .general-settings-subcard-note {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }
      #general-settings-panel .general-settings-setting-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #general-settings-panel .general-settings-setting-list-sub {
        gap: 8px;
      }
      #general-settings-panel .general-settings-risk {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 2px;
        min-height: 20px;
        padding: 0 8px;
        font-size: 10px;
        line-height: 20px;
        border-radius: 999px;
        border: none;
        color: #ffffff;
        background: #ef4444;
        font-weight: 800;
        letter-spacing: 0.2px;
        vertical-align: middle;
      }
      #general-settings-panel #general-template-options,
      #general-settings-panel #general-script-options,
      #general-settings-panel #general-memory-auto-options,
      #general-settings-panel #general-memory-budget-block {
        margin-top: 10px !important;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      #general-settings-panel .general-settings-fold-btn {
        min-width: auto;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid #dbe3ee;
        border-radius: 999px;
        background: #f8fafc;
        color: #64748b;
        padding: 0 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        transition:
          background 180ms ease,
          border-color 180ms ease,
          color 180ms ease,
          transform 160ms ease;
      }
      #general-settings-panel .general-settings-fold-btn:hover {
        background: #eff6ff;
        border-color: #bfdbfe;
        color: #2563eb;
      }
      #general-settings-panel .general-settings-fold-btn:active {
        transform: scale(0.92);
      }
      #general-settings-panel .general-settings-fold-btn:focus-visible {
        outline: 2px solid rgba(14, 165, 233, 0.28);
        outline-offset: 1px;
      }
      #general-settings-panel .general-settings-fold-btn[data-expanded='1'] {
        color: #2563eb;
        background: #eff6ff;
        border-color: #bfdbfe;
      }
      #general-settings-panel .general-settings-fold-btn-label {
        white-space: nowrap;
      }
      #general-settings-panel .general-settings-fold-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
        transition: transform 250ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }
      #general-settings-panel .general-settings-fold-btn[data-expanded='1'] svg {
        transform: rotate(180deg);
      }
      #general-settings-panel .general-settings-inline-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      #general-settings-panel .general-settings-inline-row > label {
        flex: 1 1 auto;
      }
      #general-settings-panel .general-settings-inline-row .general-settings-fold-btn {
        flex: 0 0 auto;
      }
      #general-settings-panel .general-settings-fold-content {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed #e2e8f0;
      }
      #general-settings-panel .general-settings-toggle-row {
        position: relative;
        user-select: none;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 12px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        transition:
          background 300ms ease-in-out,
          border-color 300ms ease-in-out,
          box-shadow 300ms ease-in-out;
      }
      #general-settings-panel .general-settings-toggle-row:hover {
        border-color: #cbd5e1;
      }
      #general-settings-panel .general-settings-toggle-row.is-on {
        background: #f8fbff;
        border-color: #cfe1ff;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.06);
      }
      #general-settings-panel .general-settings-toggle-row.is-off {
        background: #ffffff;
        border-color: #e2e8f0;
      }
      #general-settings-panel .general-settings-toggle-row.is-on.has-risk {
        background: #fff7f7;
        border-color: #fecaca;
        box-shadow: 0 8px 18px rgba(239, 68, 68, 0.08);
      }
      #general-settings-panel .general-settings-toggle-row.is-disabled {
        opacity: 0.56;
        cursor: not-allowed;
      }
      #general-settings-panel .general-settings-toggle-row.general-settings-toggle-subrow {
        border-radius: 12px;
        padding: 10px 12px;
      }
      #general-settings-panel .general-settings-row-main {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      #general-settings-panel .general-settings-row-icon {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: #f1f5f9;
        color: #64748b;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 36px;
        transition:
          background 220ms ease,
          color 220ms ease;
      }
      #general-settings-panel .general-settings-row-icon svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      #general-settings-panel .general-settings-toggle-row.is-on .general-settings-row-icon {
        background: #e0ecff;
        color: #2563eb;
      }
      #general-settings-panel .general-settings-toggle-row.has-risk.is-on .general-settings-row-icon {
        background: #fee2e2;
        color: #dc2626;
      }
      #general-settings-panel .general-settings-row-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #general-settings-panel .general-settings-row-title {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        color: #0f172a;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.35;
      }
      #general-settings-panel .general-settings-row-desc {
        color: #64748b;
        font-size: 12px;
        line-height: 1.45;
      }
      #general-settings-panel .general-settings-control {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #general-settings-panel .general-settings-switch {
        position: relative;
        width: 44px;
        height: 26px;
        border-radius: 999px;
        background: #cbd5e1;
        transition: background 200ms ease;
      }
      #general-settings-panel .general-settings-switch::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.22);
        transition: transform 180ms ease;
      }
      #general-settings-panel .general-settings-toggle-row.is-on .general-settings-switch {
        background: #2563eb;
      }
      #general-settings-panel .general-settings-toggle-row.is-on .general-settings-switch::after {
        transform: translateX(18px);
      }
      #general-settings-panel .general-settings-radio {
        position: relative;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: 2px solid #cbd5e1;
        background: #ffffff;
        box-sizing: border-box;
      }
      #general-settings-panel .general-settings-radio::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #2563eb;
        transform: translate(-50%, -50%) scale(0);
        transition: transform 160ms ease;
      }
      #general-settings-panel .general-settings-toggle-row.is-on .general-settings-radio {
        border-color: #60a5fa;
        background: #eff6ff;
      }
      #general-settings-panel .general-settings-toggle-row.is-on .general-settings-radio::after {
        transform: translate(-50%, -50%) scale(1);
      }
      #general-settings-panel .general-settings-input-row {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 12px;
        background: #ffffff;
      }
      #general-settings-panel .general-settings-input-control {
        flex: 0 0 auto;
        width: 100%;
        min-width: 0;
      }
      #general-settings-panel .general-settings-input-control-row {
        width: 100%;
      }
      #general-settings-panel .general-settings-number-input,
      #general-settings-panel .general-settings-select {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #dbe3ee;
        border-radius: 10px;
        font-size: 13px;
        background: #ffffff;
        color: #0f172a;
      }
      #general-settings-panel .general-settings-inline-hint {
        margin-top: 8px;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }
      #general-settings-panel .general-settings-field-block {
        margin-top: 10px;
      }
      #general-settings-panel .general-settings-field-label {
        display: block;
        margin-bottom: 6px;
        color: #0f172a;
        font-size: 12px;
        font-weight: 700;
      }
      #general-settings-panel .general-settings-field-help {
        display: block;
        margin-top: 6px;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }
      #general-settings-panel .general-settings-toggle-row input[type='checkbox'],
      #general-settings-panel .general-settings-toggle-row input[type='radio'] {
        position: absolute;
        width: 0;
        height: 0;
        margin: 0;
        opacity: 0;
        pointer-events: none;
      }
      #general-settings-panel input[type='number'],
      #general-settings-panel select {
        border-color: #dbe3ee !important;
        background: #fff;
      }
      #general-settings-panel .general-settings-shortcut-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #general-settings-panel .general-settings-shortcut-btn {
        border: 1px solid #dbe3ee !important;
        border-radius: 10px !important;
        background: #fff !important;
        color: #0f172a !important;
        font-weight: 700;
        padding: 8px 10px !important;
        cursor: pointer;
        text-align: center;
      }
      #general-settings-panel .general-settings-shortcut-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      #general-settings-panel button[id^='general-bundle-'],
      #general-settings-panel #general-clean-wallpapers {
        border: 1px solid #dbe3ee !important;
        border-radius: 10px !important;
        background: #fff !important;
        color: #0f172a !important;
        font-weight: 600;
        padding: 7px 12px !important;
      }
      #general-settings-panel #general-clean-wallpapers {
        border-color: #fecaca !important;
        background: #fff5f5 !important;
        color: #b91c1c !important;
      }
      #general-settings-panel #general-settings-done {
        border-color: #0ea5e9 !important;
        background: #0ea5e9 !important;
        color: #fff !important;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  getSettingIcon(name = 'sliders') {
    return GENERAL_SETTINGS_ICONS[name] || GENERAL_SETTINGS_ICONS.sliders;
  }

  renderFoldButton(id, label = '高级选项') {
    return `
      <button type="button" id="${id}" class="general-settings-fold-btn" data-expanded="0" aria-expanded="false">
        <span class="general-settings-fold-btn-label">${label}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    `.trim();
  }

  renderSettingRow({
    id,
    title,
    description = '',
    icon = 'sliders',
    type = 'checkbox',
    name = '',
    value = '',
    nested = false,
    risk = false,
    extraClass = '',
  } = {}) {
    const inputAttrs = type === 'radio'
      ? `type="radio" id="${id}" name="${name}" value="${value}"`
      : `type="checkbox" id="${id}"`;
    const classes = [
      'general-settings-toggle-row',
      nested ? 'general-settings-toggle-subrow' : '',
      extraClass,
    ].filter(Boolean).join(' ');
    const control = type === 'radio'
      ? '<span class="general-settings-control general-settings-radio" aria-hidden="true"></span>'
      : '<span class="general-settings-control general-settings-switch" aria-hidden="true"></span>';
    return `
      <label class="${classes}">
        <input ${inputAttrs}>
        <span class="general-settings-row-main">
          <span class="general-settings-row-icon" aria-hidden="true">${this.getSettingIcon(icon)}</span>
          <span class="general-settings-row-copy">
            <span class="general-settings-row-title">${title}${risk ? '<span class="general-settings-risk">高风险</span>' : ''}</span>
            ${description ? `<span class="general-settings-row-desc">${description}</span>` : ''}
          </span>
        </span>
        ${control}
      </label>
    `.trim();
  }

  renderInputRow({ title, description = '', icon = 'sliders', control = '' } = {}) {
    return `
      <div class="general-settings-input-row">
        <div class="general-settings-row-main">
          <span class="general-settings-row-icon" aria-hidden="true">${this.getSettingIcon(icon)}</span>
          <span class="general-settings-row-copy">
            <span class="general-settings-row-title">${title}</span>
            ${description ? `<span class="general-settings-row-desc">${description}</span>` : ''}
          </span>
        </div>
        <div class="general-settings-input-control-row">
          <div class="general-settings-input-control">${control}</div>
        </div>
      </div>
    `.trim();
  }

  createUI() {
    this.ensureStyles();
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'general-settings-overlay';
    this.overlayElement.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 20000;
    `;
    this.overlayElement.onclick = () => this.hide();

    this.element = document.createElement('div');
    this.element.id = 'general-settings-panel';
    this.element.innerHTML = `
      <div class="general-settings-modal" style="width: 92vw; max-width: 420px;">
        <div class="general-settings-header">
          <h2 class="general-settings-title">通用设定</h2>
          <button id="general-settings-close" class="general-settings-close">×</button>
        </div>
        <div class="general-settings-subtitle">视觉与体验相关设定。</div>

        <div class="general-settings-card">
          <div class="general-settings-card-head">
            <div>
              <div class="general-settings-card-title">界面与调试</div>
              <div class="general-settings-card-note">显示、动画与调试辅助选项。</div>
            </div>
            ${this.renderFoldButton('general-ui-advanced-toggle', '调试选项')}
          </div>

          <div class="general-settings-setting-list">
            ${this.renderSettingRow({
              id: 'general-typing-dots',
              title: '回复动画',
              description: '控制回复时跳动小点动画的显示。',
              icon: 'reply',
            })}
            ${this.renderSettingRow({
              id: 'general-creative-wide',
              title: '创意写作气泡加宽',
              description: '让创意写作内容使用更舒展的宽气泡版式。',
              icon: 'expand',
            })}
            ${this.renderInputRow({
              title: '创意写作注入条数',
              description: '控制 chat_history 中保留的创意写作回复数量。',
              icon: 'history',
              control: '<input type="number" id="general-creative-history" min="0" step="1" class="general-settings-number-input">',
            })}
          </div>

          <div id="general-ui-advanced" class="general-settings-fold-content" style="display:none;">
            <div class="general-settings-subcard">
              <div class="general-settings-subcard-title">调试与实验功能</div>
              <div class="general-settings-subcard-note">只在需要排查问题或验证特殊渲染路径时开启。</div>
              <div class="general-settings-setting-list general-settings-setting-list-sub">
                ${this.renderSettingRow({
                  id: 'general-debug-toggle',
                  title: '显示 Debug 按钮',
                  description: '在界面中显示调试入口，便于快速查看运行状态。',
                  icon: 'bug',
                  nested: true,
                })}
                ${this.renderSettingRow({
                  id: 'general-debug-logs',
                  title: '记录执行日志',
                  description: '保留更多执行日志，方便定位异常链路。',
                  icon: 'log',
                  nested: true,
                })}
                ${this.renderSettingRow({
                  id: 'general-rich-iframe-scripts',
                  title: '富文本 iframe 执行脚本',
                  description: '允许 iframe 执行脚本并放宽安全限制，仅在信任来源时启用。',
                  icon: 'code',
                  nested: true,
                  risk: true,
                })}
              </div>
            </div>
          </div>
        </div>

        <div class="general-settings-card">
          <div class="general-settings-card-head">
            <div>
              <div class="general-settings-card-title">记忆与角色</div>
              <div class="general-settings-card-note">角色绑定、时间上下文与记忆系统。</div>
            </div>
            ${this.renderFoldButton('general-memory-advanced-toggle', '更多设置')}
          </div>

          <div class="general-settings-setting-list">
            ${this.renderSettingRow({
              id: 'general-persona-bind',
              title: '角色卡绑定联系人 / 聊天记录',
              description: '让不同角色卡保留各自的联系人与聊天上下文。',
              icon: 'link',
            })}
            ${this.renderSettingRow({
              id: 'general-prompt-time',
              title: '发送当前时间给 AI',
              description: '将当前真实时间作为上下文发送给模型。',
              icon: 'clock',
            })}
            ${this.renderSettingRow({
              id: 'general-memory-enabled',
              title: '启用记忆系统',
              description: '关闭后不会发送摘要提示词，也不会读写记忆表格。',
              icon: 'brain',
            })}
          </div>

          <div class="general-settings-subcard">
            <div class="general-settings-subcard-title">记忆存储方式</div>
            <div class="general-settings-subcard-note">选择当前角色/会话默认使用的记忆结构。</div>
            <div class="general-settings-setting-list general-settings-setting-list-sub">
              ${this.renderSettingRow({
                id: 'general-memory-mode-summary',
                type: 'radio',
                name: 'general-memory-mode',
                value: 'summary',
                title: '摘要模式',
                description: '使用摘要文本积累长期记忆。',
                icon: 'notes',
                nested: true,
              })}
              ${this.renderSettingRow({
                id: 'general-memory-mode-table',
                type: 'radio',
                name: 'general-memory-mode',
                value: 'table',
                title: '记忆表格模式',
                description: '使用结构化表格保存角色、事件与状态。',
                icon: 'table',
                nested: true,
              })}
            </div>
          </div>

          <div id="general-memory-advanced" class="general-settings-fold-content" style="display:none;">
            <div style="margin-bottom: 10px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-memory-auto" style="width: 18px; height: 18px;">
                <span style="font-weight: 700;">AI 自动写入记忆表格</span>
              </label>
            </div>

            <div id="general-memory-auto-options" style="margin-left: 26px; margin-top: 6px; display: none;">
            <div style="font-size:12px; color:#64748b; margin-bottom:8px;">写表方式</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
              <input type="radio" name="general-memory-auto-mode" id="general-memory-auto-inline" value="inline">
              <span>随聊天回复一起（同一请求）</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="general-memory-auto-mode" id="general-memory-auto-separate" value="separate">
              <span>聊天后独立请求</span>
            </label>
            <div style="margin-top: 8px; display:flex; flex-direction: column; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-memory-auto-confirm" style="width: 16px; height: 16px;">
                <span>写表前确认</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-memory-auto-step" style="width: 16px; height: 16px;">
                <span>逐条执行（每条指令确认）</span>
              </label>
              <small style="color:#94a3b8;">逐条执行会依次弹窗确认每条指令</small>
            </div>

            <div id="general-memory-update-api" style="margin-top: 10px; padding: 8px; border: 1px dashed #e2e8f0; border-radius: 10px; display: none;">
              <div style="font-size:12px; color:#64748b; margin-bottom:8px;">记忆更新 API</div>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
                <input type="radio" name="general-memory-update-api" id="general-memory-update-chat" value="chat">
                <span>使用聊天配置</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
                <input type="radio" name="general-memory-update-api" id="general-memory-update-profile" value="profile">
                <span>选择 API 配置</span>
              </label>
              <select id="general-memory-update-profile-select" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; margin-top:4px;"></select>
              <small style="color:#94a3b8; display:block; margin-top:6px;">可在 API 配置中新增多个配置</small>
              <div id="general-memory-update-context" style="margin-top: 10px;">
                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#0f172a;">
                  <span>记忆更新上下文轮数</span>
                  <input type="number" id="general-memory-update-context-rounds" min="0" step="1"
                         style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
                </label>
                <small style="color:#94a3b8; display:block; margin-top:4px;">默认 6 轮（用户+助手），0 表示不发送历史</small>
              </div>
            </div>
            </div>

            <div id="general-memory-budget-block" style="margin-left: 26px; margin-top: 10px; padding: 8px; border: 1px dashed #e2e8f0; border-radius: 10px; display: none;">
            <div style="font-size:12px; color:#64748b; margin-bottom:8px;">记忆注入设置</div>

            <div style="margin-top: 10px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">记忆注入位置</div>
              <select id="general-memory-inject-position" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                <option value="template">跟随模板</option>
                <option value="after_persona">角色设定后</option>
                <option value="system_end">系统提示末尾</option>
                <option value="before_chat">对话前</option>
                <option value="history_depth">深度注入（插入到聊天记录）</option>
                <option value="system_end+before_chat">双重注入（系统末尾 + 对话前）</option>
              </select>
              <small style="color:#94a3b8; display:block; margin-top:4px;">可覆盖模板注入位置</small>
            </div>

	            <div id="general-memory-inject-depth-wrap" style="margin-top: 10px; display:none;">
	              <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#0f172a;">
	                <span>深度注入位置</span>
	                <input type="number" id="general-memory-inject-depth" min="0" step="1"
	                       style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
	              </label>
	              <small style="color:#94a3b8; display:block; margin-top:4px;">距聊天末尾 N 条插入，0 表示追加到末尾</small>
	            </div>
	          </div>

              <div id="general-memory-bridge-block" style="margin-left: 26px; margin-top: 10px; padding: 8px; border: 1px dashed #e2e8f0; border-radius: 10px; display: none;">
                <div style="font-size:12px; color:#64748b; margin-bottom:8px;">聊天 / RP 桥接默认规则</div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                  <div style="padding:8px; border:1px solid #e2e8f0; border-radius:10px; background:#fff;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; font-weight:700; color:#0f172a;">
                      <span>RP 大纲 -> 聊天模式</span>
                      <input type="checkbox" id="general-memory-bridge-rp-to-chat" style="width:16px; height:16px;">
                    </label>
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; color:#475569; margin-top:8px;">
                      <span>默认注入条数（0=全部）</span>
                      <input type="number" id="general-memory-bridge-rp-to-chat-limit" min="0" step="1"
                             style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
                    </label>
                  </div>
                  <div style="padding:8px; border:1px solid #e2e8f0; border-radius:10px; background:#fff;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; font-weight:700; color:#0f172a;">
                      <span>聊天大纲 -> RP 模式</span>
                      <input type="checkbox" id="general-memory-bridge-chat-to-rp" style="width:16px; height:16px;">
                    </label>
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; color:#475569; margin-top:8px;">
                      <span>默认注入条数（0=全部）</span>
                      <input type="number" id="general-memory-bridge-chat-to-rp-limit" min="0" step="1"
                             style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
                    </label>
                  </div>
                </div>
                <small style="color:#94a3b8; display:block; margin-top:6px;">当前默认只桥接双方“总体大纲”，不桥接原始消息。</small>
              </div>
	          </div>
	        </div>

        <div class="general-settings-card">
          <div class="general-settings-card-head">
            <div>
              <div class="general-settings-card-title">模板与脚本</div>
              <div class="general-settings-card-note">角色卡模板、脚本与扩展行为。</div>
            </div>
          </div>

          <div class="general-settings-subcard">
            <div class="general-settings-card-head" style="margin-bottom: 10px;">
              <div>
                <div class="general-settings-subcard-title">模板处理</div>
                <div class="general-settings-card-note" style="margin-top: 4px;">控制模板在生成前与渲染后的执行。</div>
              </div>
              ${this.renderFoldButton('general-template-advanced-toggle', '模板选项')}
            </div>
            <div class="general-settings-setting-list">
              ${this.renderSettingRow({
                id: 'general-template-enabled',
                title: '启用模板处理',
                description: '统一控制模板执行链路。',
                icon: 'template',
              })}
            </div>
          <div id="general-template-advanced" class="general-settings-fold-content" style="display:none; margin-bottom: 10px;">
            <div id="general-template-options" style="margin-left: 26px; display:none; flex-direction:column; gap:8px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-template-before" style="width: 16px; height: 16px;">
                <span>生成前执行（Prompt）</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-template-after" style="width: 16px; height: 16px;">
                <span>渲染后执行（显示）</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-template-error" style="width: 16px; height: 16px;">
                <span>显示模板错误提示</span>
              </label>
            </div>
          </div>
          </div>

          <div class="general-settings-subcard">
            <div class="general-settings-card-head" style="margin-bottom: 10px;">
              <div>
                <div class="general-settings-subcard-title">角色卡脚本</div>
                <div class="general-settings-card-note" style="margin-top: 4px;">控制角色卡脚本可用性与权限边界。</div>
              </div>
              ${this.renderFoldButton('general-script-advanced-toggle', '脚本选项')}
            </div>
            <div class="general-settings-setting-list">
              ${this.renderSettingRow({
                id: 'general-script-enabled',
                title: '启用角色卡脚本',
                description: '允许角色卡脚本参与运行时行为。',
                icon: 'script',
              })}
            </div>
          <div id="general-script-advanced" class="general-settings-fold-content" style="display:none;">
            <div id="general-script-options" style="margin-left: 26px; display:none; flex-direction:column; gap:8px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-script-allow-vars" style="width: 16px; height: 16px;">
                <span>允许脚本修改变量</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-script-allow-messages" style="width: 16px; height: 16px;">
                <span>允许脚本读取聊天记录</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-script-allow-network" style="width: 16px; height: 16px;">
                <span>允许脚本访问网络<span class="general-settings-risk">高风险</span></span>
              </label>
            </div>
          </div>
          </div>
        </div>

        <div class="general-settings-card">
          <div class="general-settings-shortcut-grid">
            <button id="general-open-session" class="general-settings-shortcut-btn">💬 会话</button>
            <button id="general-open-memory-templates" class="general-settings-shortcut-btn">🧠 记忆表格</button>
          </div>
        </div>

        <div class="general-settings-card">
          <div class="general-settings-card-title">资料迁移</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
            <button id="general-bundle-export"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              一键打包
            </button>
            <button id="general-bundle-import"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              导入资料包
            </button>
            <span id="general-bundle-status" style="font-size: 12px; color:#64748b;">
              打包聊天与资源（不含 API 配置）
            </span>
          </div>
          <small style="color:#94a3b8; display:block; margin-top:6px;">导入会覆盖当前资料。</small>
          <input type="file" id="general-bundle-file" accept=".zip,application/zip" style="display:none;">
        </div>

        <div class="general-settings-card">
          <div class="general-settings-card-title">存储清理</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
            <button id="general-clean-wallpapers"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              清理壁纸残留
            </button>
            <span id="general-clean-wallpapers-status" style="font-size: 12px; color:#64748b;">
              清理未引用旧文件
            </span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="general-settings-done" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0;
                                                   background: #f8fafc; cursor: pointer; font-size: 14px; color: #475569;">
            完成
          </button>
        </div>
      </div>
    `;
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 21000;
    `;
    this.element.onclick = (e) => e.stopPropagation();
    this.modalElement = this.element.querySelector('.general-settings-modal');

    this.debugToggle = this.element.querySelector('#general-debug-toggle');
    this.debugLogToggle = this.element.querySelector('#general-debug-logs');
    this.typingDotsToggle = this.element.querySelector('#general-typing-dots');
    this.richIframeScriptsToggle = this.element.querySelector('#general-rich-iframe-scripts');
    this.creativeHistoryInput = this.element.querySelector('#general-creative-history');
    this.creativeWideToggle = this.element.querySelector('#general-creative-wide');
    this.uiAdvancedToggle = this.element.querySelector('#general-ui-advanced-toggle');
    this.uiAdvancedWrap = this.element.querySelector('#general-ui-advanced');
    this.personaBindToggle = this.element.querySelector('#general-persona-bind');
    this.promptTimeToggle = this.element.querySelector('#general-prompt-time');
    this.memoryEnabledToggle = this.element.querySelector('#general-memory-enabled');
    this.memoryModeSummary = this.element.querySelector('#general-memory-mode-summary');
    this.memoryModeTable = this.element.querySelector('#general-memory-mode-table');
    this.memoryAdvancedToggle = this.element.querySelector('#general-memory-advanced-toggle');
    this.memoryAdvancedWrap = this.element.querySelector('#general-memory-advanced');
    this.memoryAutoToggle = this.element.querySelector('#general-memory-auto');
    this.memoryAutoModeInline = this.element.querySelector('#general-memory-auto-inline');
    this.memoryAutoModeSeparate = this.element.querySelector('#general-memory-auto-separate');
    this.memoryAutoOptions = this.element.querySelector('#general-memory-auto-options');
    this.memoryUpdateApiChat = this.element.querySelector('#general-memory-update-chat');
    this.memoryUpdateApiProfile = this.element.querySelector('#general-memory-update-profile');
    this.memoryUpdateProfileSelect = this.element.querySelector('#general-memory-update-profile-select');
    this.memoryUpdateApiBlock = this.element.querySelector('#general-memory-update-api');
    this.memoryUpdateContextInput = this.element.querySelector('#general-memory-update-context-rounds');
    this.memoryBudgetBlock = this.element.querySelector('#general-memory-budget-block');
    this.memoryInjectPositionSelect = this.element.querySelector('#general-memory-inject-position');
    this.memoryInjectDepthWrap = this.element.querySelector('#general-memory-inject-depth-wrap');
    this.memoryInjectDepthInput = this.element.querySelector('#general-memory-inject-depth');
    this.memoryBridgeBlock = this.element.querySelector('#general-memory-bridge-block');
    this.memoryBridgeRpToChatToggle = this.element.querySelector('#general-memory-bridge-rp-to-chat');
    this.memoryBridgeRpToChatLimitInput = this.element.querySelector('#general-memory-bridge-rp-to-chat-limit');
    this.memoryBridgeChatToRpToggle = this.element.querySelector('#general-memory-bridge-chat-to-rp');
    this.memoryBridgeChatToRpLimitInput = this.element.querySelector('#general-memory-bridge-chat-to-rp-limit');
    this.memoryAutoConfirmToggle = this.element.querySelector('#general-memory-auto-confirm');
    this.memoryAutoStepToggle = this.element.querySelector('#general-memory-auto-step');
    this.templateEnabledToggle = this.element.querySelector('#general-template-enabled');
    this.templateBeforeToggle = this.element.querySelector('#general-template-before');
    this.templateAfterToggle = this.element.querySelector('#general-template-after');
    this.templateErrorToggle = this.element.querySelector('#general-template-error');
    this.templateOptionsWrap = this.element.querySelector('#general-template-options');
    this.templateAdvancedToggle = this.element.querySelector('#general-template-advanced-toggle');
    this.templateAdvancedWrap = this.element.querySelector('#general-template-advanced');
    this.scriptAdvancedToggle = this.element.querySelector('#general-script-advanced-toggle');
    this.scriptAdvancedWrap = this.element.querySelector('#general-script-advanced');
    this.scriptEnabledToggle = this.element.querySelector('#general-script-enabled');
    this.scriptAllowVarsToggle = this.element.querySelector('#general-script-allow-vars');
    this.scriptAllowMessagesToggle = this.element.querySelector('#general-script-allow-messages');
    this.scriptAllowNetworkToggle = this.element.querySelector('#general-script-allow-network');
    this.scriptOptionsWrap = this.element.querySelector('#general-script-options');
    this.openSessionBtn = this.element.querySelector('#general-open-session');
    this.openMemoryTemplatesBtn = this.element.querySelector('#general-open-memory-templates');
    this.cleanWallpapersBtn = this.element.querySelector('#general-clean-wallpapers');
    this.cleanWallpapersStatus = this.element.querySelector('#general-clean-wallpapers-status');
    this.bundleExportBtn = this.element.querySelector('#general-bundle-export');
    this.bundleImportBtn = this.element.querySelector('#general-bundle-import');
    this.bundleStatus = this.element.querySelector('#general-bundle-status');
    this.bundleImportInput = this.element.querySelector('#general-bundle-file');

    this.initSelectableCards();
    this.updateShortcutButtons();
    this.openSessionBtn?.addEventListener('click', () => {
      const fn = this.externalActions.openSession;
      if (typeof fn !== 'function') return;
      this.hide();
      fn();
    });
    this.openMemoryTemplatesBtn?.addEventListener('click', () => {
      const fn = this.externalActions.openMemoryTemplates;
      if (typeof fn !== 'function') return;
      this.hide();
      fn();
    });
    this.element.addEventListener('change', (e) => {
      const target = e?.target;
      if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
        this.updateSelectableCards();
      }
    });

    this.debugToggle?.addEventListener('change', async (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ showDebugToggle: enabled });
      try {
        const { getDebugPanel } = await import('./debug-panel.js');
        const panel = getDebugPanel();
        panel.setEnabled(Boolean(settings.showDebugToggle));
      } catch {}
    });
    this.debugLogToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ debugExecutionLogs: enabled });
    });
    this.typingDotsToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ typingDotsEnabled: enabled });
      this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    });
    this.richIframeScriptsToggle?.addEventListener('change', async (e) => {
      const target = e?.target;
      const enabled = Boolean(target?.checked);
      if (enabled) {
        const ok = await appConfirm({
          title: '安全提示',
          message:
            '启用后，富文本 iframe 将执行其中的脚本并放宽安全限制，脚本可能访问同源数据、加载外部资源，导致敏感信息泄露或设置被篡改。仅在信任来源时启用。确定继续吗？',
        });
        if (!ok) {
          if (target) target.checked = false;
          return;
        }
      }
      appSettings.update({ allowRichIframeScripts: enabled });
    });
    this.creativeWideToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ creativeWideBubble: enabled });
      this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    });
    this.creativeHistoryInput?.addEventListener('input', (e) => {
      const raw = e?.target?.value;
      const n = Math.trunc(Number(raw));
      const safe = Number.isFinite(n) ? Math.max(0, n) : 3;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ creativeHistoryMax: safe });
    });
    this.uiAdvancedToggle?.addEventListener('click', () => {
      this.toggleAdvancedSection(this.uiAdvancedToggle, this.uiAdvancedWrap);
    });
    this.memoryAdvancedToggle?.addEventListener('click', () => {
      this.toggleAdvancedSection(this.memoryAdvancedToggle, this.memoryAdvancedWrap);
    });
    this.templateAdvancedToggle?.addEventListener('click', () => {
      this.toggleAdvancedSection(this.templateAdvancedToggle, this.templateAdvancedWrap, () => {
        this.updateTemplateScriptVisibility();
      });
    });
    this.scriptAdvancedToggle?.addEventListener('click', () => {
      this.toggleAdvancedSection(this.scriptAdvancedToggle, this.scriptAdvancedWrap, () => {
        this.updateTemplateScriptVisibility();
      });
    });

    this.templateEnabledToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ templateEnabled: enabled });
      this.updateTemplateScriptVisibility();
    });
    this.templateBeforeToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ templateExecuteBeforeGenerate: enabled });
    });
    this.templateAfterToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ templateExecuteAfterRender: enabled });
    });
    this.templateErrorToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ templateShowErrorToast: enabled });
    });
    this.scriptEnabledToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ scriptEnabled: enabled });
      this.updateTemplateScriptVisibility();
    });
    this.scriptAllowVarsToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ scriptAllowModifyVariables: enabled });
    });
    this.scriptAllowMessagesToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ scriptAllowReadMessages: enabled });
    });
    this.scriptAllowNetworkToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ scriptAllowNetwork: enabled });
    });

    this.personaBindToggle?.addEventListener('change', async (e) => {
      const target = e?.target;
      const enabled = Boolean(target?.checked);
      if (!enabled) {
        const ok = await appConfirm({
          title: '关闭绑定',
          message:
            '关闭后，所有角色卡将共享同一份联系人/聊天记录（共享区）。已绑定的数据不会丢失，但需切回绑定模式才能查看各自内容。确定继续吗？',
        });
        if (!ok) {
          if (target) target.checked = true;
          return;
        }
      }
      appSettings.update({ personaBindContacts: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'personaBindContacts', value: enabled } }));
    });

    this.promptTimeToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ promptCurrentTimeEnabled: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'promptCurrentTimeEnabled', value: enabled } }));
    });

    const applyMemoryMode = (mode) => {
      const next = mode === 'table' ? 'table' : 'summary';
      appSettings.update({ memoryEnabled: true, memoryStorageMode: next });
      window.dispatchEvent(new CustomEvent('memory-storage-mode-changed', { detail: { mode: next } }));
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryEnabled', value: true } }));
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryStorageMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryEnabledToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryEnabled: enabled });
      const nextMode = enabled ? (this.memoryModeTable?.checked ? 'table' : 'summary') : 'off';
      window.dispatchEvent(new CustomEvent('memory-storage-mode-changed', { detail: { mode: nextMode } }));
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryEnabled', value: enabled } }));
      this.updateMemoryAutoVisibility();
    });
    this.memoryModeSummary?.addEventListener('change', (e) => {
      const checked = Boolean(e?.target?.checked);
      if (!checked) return;
      applyMemoryMode('summary');
    });
    this.memoryAutoToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoExtract: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoExtract', value: enabled } }));
      this.updateMemoryAutoVisibility();
    });
    const applyAutoMode = (mode) => {
      const next = mode === 'separate' ? 'separate' : 'inline';
      appSettings.update({ memoryAutoExtractMode: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoExtractMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryAutoModeInline?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyAutoMode('inline');
    });
    this.memoryAutoModeSeparate?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyAutoMode('separate');
    });
    const applyMemoryApiMode = (mode) => {
      const next = mode === 'profile' ? 'profile' : 'chat';
      appSettings.update({ memoryUpdateApiMode: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateApiMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryUpdateApiChat?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyMemoryApiMode('chat');
    });
    this.memoryUpdateApiProfile?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyMemoryApiMode('profile');
    });
    this.memoryUpdateProfileSelect?.addEventListener('change', (e) => {
      const value = String(e?.target?.value || '').trim();
      appSettings.update({ memoryUpdateProfileId: value });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateProfileId', value } }));
    });
    this.memoryUpdateContextInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 6;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryUpdateContextRounds: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateContextRounds', value: safe } }));
    });
    this.memoryAutoConfirmToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoConfirm: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoConfirm', value: enabled } }));
    });
    this.memoryAutoStepToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoStepByStep: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoStepByStep', value: enabled } }));
    });

    const setBundleStatus = (text) => {
      if (this.bundleStatus) this.bundleStatus.textContent = text;
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });

    const buildBundleFileName = () => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      return `chatapp_backup_${ts}.zip`;
    };

    const pickBundleExportPath = async () => {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const fileName = buildBundleFileName();
        const result = await save({
          defaultPath: fileName,
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        });
        if (!result) return { path: '', cancelled: true, fallback: false };
        return { path: result, cancelled: false, fallback: false };
      } catch (err) {
        console.warn('bundle export: save dialog unavailable', err);
        return { path: '', cancelled: false, fallback: true };
      }
    };

    this.bundleExportBtn?.addEventListener('click', async () => {
      if (this.bundleExportBtn) this.bundleExportBtn.disabled = true;
      setBundleStatus('正在打包...');
      try {
        await safeInvoke('save_kv', { name: 'app_settings_v1', data: appSettings.get() });
        const bridge = window?.appBridge;
        await bridge?.chatStore?.flush?.();
        await bridge?.momentsStore?.flush?.();
      } catch {}
      try {
        const pick = await pickBundleExportPath();
        if (pick.cancelled) {
          setBundleStatus('已取消导出');
          return;
        }
        const result = pick.fallback
          ? await safeInvoke('export_data_bundle', {})
          : await safeInvoke('export_data_bundle', { path: pick.path });
        const path = String(result?.path || '').trim();
        const bytes = Number(result?.bytes || 0);
        const size = bytes ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : '';
        setBundleStatus(path ? `已导出：${path}${size ? `（${size}）` : ''}` : '导出完成');
        window.toastr?.success?.('资料包导出完成');
      } catch (err) {
        const message = String(err?.message || err || '导出失败').trim();
        setBundleStatus(`导出失败: ${message}`);
        window.toastr?.error?.('资料包导出失败');
      } finally {
        if (this.bundleExportBtn) this.bundleExportBtn.disabled = false;
      }
    });

    this.bundleImportBtn?.addEventListener('click', async () => {
      const confirmed = await appConfirm({
        title: '导入资料包',
        message:
          '导入会覆盖当前所有资料（不包含 API 配置），且无法撤销。\n请确认资料包来源可信，避免泄露隐私。\n确定继续吗？',
        danger: true,
      });
      if (!confirmed) return;
      if (this.bundleImportInput) this.bundleImportInput.value = '';
      this.bundleImportInput?.click();
    });

    this.bundleImportInput?.addEventListener('change', async () => {
      const file = this.bundleImportInput?.files?.[0];
      if (!file) return;
      if (this.bundleImportBtn) this.bundleImportBtn.disabled = true;
      setBundleStatus('正在导入...');
      try {
        const mode = 'replace';
        const filePath = typeof file.path === 'string' ? file.path : '';
        let result = null;
        if (filePath) {
          result = await safeInvoke('import_data_bundle', { path: filePath, mode });
        } else {
          const dataUrl = await readFileAsDataUrl(file);
          result = await safeInvoke('import_data_bundle_bytes', { data: dataUrl, mode });
        }
        try {
          const prefs = await safeInvoke('load_kv', { name: 'app_settings_v1' });
          if (prefs && typeof prefs === 'object' && !prefs._tooLarge) {
            appSettings.update(prefs);
          }
        } catch {}
        const skipped = Number(result?.skipped || 0);
        const suffix = skipped ? `（跳过 ${skipped} 项）` : '';
        setBundleStatus(`导入完成${suffix}，请重启应用以加载新资料`);
        window.toastr?.success?.(`资料包导入完成${suffix}`);
        const restart = await appConfirm({
          title: '重启应用',
          message: '资料导入完成，是否立即重启应用？',
          confirmText: '立即重启',
          cancelText: '稍后',
        });
        if (restart) window.location.reload();
      } catch (err) {
        const message = String(err?.message || err || '导入失败').trim();
        setBundleStatus(`导入失败: ${message}`);
        window.toastr?.error?.('资料包导入失败');
      } finally {
        if (this.bundleImportBtn) this.bundleImportBtn.disabled = false;
      }
    });

    this.cleanWallpapersBtn?.addEventListener('click', async () => {
      const confirmed = await appConfirm({
        title: '清理壁纸',
        message: '将清理未被会话引用的壁纸文件，是否继续？',
        danger: true,
      });
      if (!confirmed) return;
      const store = window?.appBridge?.chatStore || null;
      const sessionIds = store?.listSessions?.() || [];
      const referenced = sessionIds
        .map((sid) => store?.getSessionSettings?.(sid)?.wallpaper?.path || '')
        .map((val) => String(val || '').trim())
        .filter(Boolean);
      const unique = Array.from(new Set(referenced));
      if (this.cleanWallpapersBtn) {
        this.cleanWallpapersBtn.disabled = true;
        this.cleanWallpapersBtn.textContent = '清理中...';
      }
      if (this.cleanWallpapersStatus) {
        this.cleanWallpapersStatus.textContent = `已引用 ${unique.length} 个壁纸文件`;
      }
      try {
        const result = await safeInvoke('cleanup_wallpapers', { referencedPaths: unique });
        const removed = Number(result?.removed || 0);
        const kept = Number(result?.kept || 0);
        if (this.cleanWallpapersStatus) {
          this.cleanWallpapersStatus.textContent = `已清理 ${removed} 个残留文件，保留 ${kept} 个在用壁纸`;
        }
      } catch (err) {
        const message = String(err?.message || err || '清理失败').trim();
        if (this.cleanWallpapersStatus) {
          this.cleanWallpapersStatus.textContent = `清理失败: ${message}`;
        }
      } finally {
        if (this.cleanWallpapersBtn) {
          this.cleanWallpapersBtn.disabled = false;
          this.cleanWallpapersBtn.textContent = '清理壁纸残留';
        }
      }
    });
    this.memoryInjectPositionSelect?.addEventListener('change', (e) => {
      const raw = String(e?.target?.value || 'template').toLowerCase();
      const allowed = new Set(['template', 'after_persona', 'system_end', 'before_chat', 'history_depth', 'system_end+before_chat']);
      const next = allowed.has(raw) ? raw : 'template';
      appSettings.update({ memoryInjectPosition: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryInjectPosition', value: next } }));
      this.updateMemoryAutoVisibility();
    });
    this.memoryInjectDepthInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 4;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryInjectDepth: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryInjectDepth', value: safe } }));
    });
    this.memoryBridgeRpToChatToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryBridgeRpToChatEnabled: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryBridgeRpToChatEnabled', value: enabled } }));
      this.updateMemoryAutoVisibility();
    });
    this.memoryBridgeRpToChatLimitInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 5;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryBridgeRpToChatLimit: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryBridgeRpToChatLimit', value: safe } }));
    });
    this.memoryBridgeChatToRpToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryBridgeChatToRpEnabled: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryBridgeChatToRpEnabled', value: enabled } }));
      this.updateMemoryAutoVisibility();
    });
    this.memoryBridgeChatToRpLimitInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 5;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryBridgeChatToRpLimit: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryBridgeChatToRpLimit', value: safe } }));
    });
    this.memoryModeTable?.addEventListener('change', async (e) => {
      const target = e?.target;
      const checked = Boolean(target?.checked);
      if (!checked) return;
      const ok = await appConfirm({
        title: '切换记忆模式',
        message:
          '切换到记忆表格模式？\n\n• 新对话将使用记忆表格\n• 历史摘要数据保留，不会丢失\n• 你可以随时切换回摘要模式\n\n确定切换？',
      });
      if (!ok) {
        if (target) target.checked = false;
        if (this.memoryModeSummary) this.memoryModeSummary.checked = true;
        return;
      }
      applyMemoryMode('table');
    });

    this.element.querySelector('#general-settings-close')?.addEventListener('click', () => this.hide());
    this.element.querySelector('#general-settings-done')?.addEventListener('click', () => this.hide());

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.element);
  }
}
