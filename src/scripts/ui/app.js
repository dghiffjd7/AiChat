import { LLMClient } from '../api/client.js';
import { extractTableEditBlocks, stripTableEditBlocks } from '../memory/memory-edit-parser.js';
import { isSummaryTableId, normalizeMemoryUpdateMode } from '../memory/memory-prompt-utils.js';
import { appSettings } from '../storage/app-settings.js';
import { ChatStore } from '../storage/chat-store.js';
import { ConfigManager } from '../storage/config.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { GroupStore } from '../storage/group-store.js';
import { MemoryTableStore } from '../storage/memory-table-store.js';
import { MemoryTemplateStore } from '../storage/memory-template-store.js';
import { MomentSummaryStore } from '../storage/moment-summary-store.js';
import { MomentsStore } from '../storage/moments-store.js';
import { PersonaStore } from '../storage/persona-store.js';
import { PluginStore } from '../storage/plugin-store.js';
import { RpSessionStore } from '../storage/rp-session-store.js';
import { stickerPackStore } from '../storage/sticker-pack-store.js';
import { normalizeScopeId } from '../storage/store-scope.js';
import { avatarDataUrlFromFile, compressImageDataUrl, isGifFile } from '../utils/image.js';
import { logger } from '../utils/logger.js';
import { buildNameWithBadgesHtml, escapeHtml, getContactBadges } from '../utils/name-badges.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import {
  initMediaAssets,
  isAssetRef,
  isLikelyUrl,
  listMediaAssets,
  resolveMediaAsset,
  setCustomMediaItems,
} from '../utils/media-assets.js';
import { safeInvoke } from '../utils/tauri.js';
import './bridge.js';
import { ChatUI } from './chat/chat-ui.js';
import { DialogueStreamParser } from './chat/dialogue-stream-parser.js';
import { parseSpecialMessage } from './chat/message-parser.js';
import { runCommand } from './command-runner.js';
import { ConfigPanel } from './config-panel.js';
import { ContactDragManager } from './contact-drag-manager.js';
import { ContactGroupRenderer } from './contact-group-renderer.js';
import { ContactSettingsPanel } from './contact-settings-panel.js';
import { GeneralSettingsPanel } from './general-settings-panel.js';
import { GroupCreatePanel, GroupSettingsPanel } from './group-chat-panels.js';
import { GroupPanel } from './group-panel.js';
import { MediaPicker } from './media-picker.js';
import { MemoryTemplatePanel } from './memory-template-panel.js';
import { MomentSummaryPanel } from './moment-summary-panel.js';
import { MomentsPanel } from './moments-panel.js';
import { PersonaPanel } from './persona-panel.js';
import { PresetPanel } from './preset-panel.js';
import { PluginPanel } from './plugin-panel.js';
import { PluginUiManager } from './plugin-ui-manager.js';
import { RegexPanel } from './regex-panel.js';
import { RegexSessionPanel } from './regex-session-panel.js';
import { SessionPanel } from './session-panel.js';
import { StickerPicker } from './sticker-picker.js';
import { VariablePanel } from './variable-panel.js';
import { VariableRuleEngine } from '../variables/variable-rule-engine.js';
import { WorldPanel } from './world-panel.js';
import { WorldInfoIndicator } from './worldinfo-indicator.js';
import { appConfirm } from './app-confirm.js';
import { PluginRuntime } from '../plugins/plugin-runtime.js';

const reportFatalError = (err, label = 'App init failed') => {
  try {
    const msg = err?.message || String(err || 'unknown error');
    logger.error(label, msg, err);
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 40000;
      background: rgba(0,0,0,0.86);
      color: #f8fafc;
      padding: 20px;
      font-family: monospace;
      font-size: 12px;
      overflow: auto;
    `;
    overlay.textContent = `${label}: ${msg}`;
    document.body.appendChild(overlay);
  } catch {}
};

window.addEventListener('error', (event) => {
  if (!event) return;
  reportFatalError(event.error || event.message || 'unknown error', 'Runtime error');
});

window.addEventListener('unhandledrejection', (event) => {
  if (!event) return;
  reportFatalError(event.reason || 'unhandled rejection', 'Unhandled rejection');
});

const initApp = async () => {
  const ui = new ChatUI();
  const applyTypingDotsSetting = () => {
    const enabled = appSettings.get().typingDotsEnabled !== false;
    if (!document?.body) return;
    if (enabled) {
      delete document.body.dataset.typingDots;
    } else {
      document.body.dataset.typingDots = 'off';
    }
  };
  applyTypingDotsSetting();
  const applyCreativeWideSetting = () => {
    const enabled = appSettings.get().creativeWideBubble === true;
    if (!document?.body) return;
    if (enabled) {
      document.body.dataset.creativeWide = 'on';
    } else {
      delete document.body.dataset.creativeWide;
    }
  };
  applyCreativeWideSetting();
  const getMemoryStorageMode = () => {
    const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
    return mode === 'table' ? 'table' : 'summary';
  };
  const isSummaryMemoryEnabled = () => getMemoryStorageMode() === 'summary';
  const getMemoryAutoExtractMode = () => {
    const mode = String(appSettings.get().memoryAutoExtractMode || 'inline').toLowerCase();
    return mode === 'separate' ? 'separate' : 'inline';
  };
  const isMemoryAutoExtractEnabled = () => {
    const settings = appSettings.get();
    return getMemoryStorageMode() === 'table' && settings.memoryAutoExtract === true;
  };
  const isMemoryAutoExtractInline = () => isMemoryAutoExtractEnabled() && getMemoryAutoExtractMode() === 'inline';
  const isMemoryAutoExtractSeparate = () => isMemoryAutoExtractEnabled() && getMemoryAutoExtractMode() === 'separate';
  let updateStickerPreview = () => {};
  const originalSetInputText = ui.setInputText.bind(ui);
  ui.setInputText = val => {
    originalSetInputText(val);
    updateStickerPreview(val);
  };
  const configPanel = new ConfigPanel();
  const chatConfigManager = new ConfigManager();
  const imageConfigManager = new ConfigManager({ scope: 'image' });
  const memoryUpdateConfigManager = new ConfigManager();
  const memoryUpdateRunning = new Set();
  const generalSettingsPanel = new GeneralSettingsPanel();
  const pluginStore = new PluginStore();
  const pluginRuntime =
    typeof Worker === 'undefined' ? null : new PluginRuntime(pluginStore);
  const pluginUiManager = new PluginUiManager();
  if (!pluginRuntime) {
    logger.warn('plugin runtime disabled (Worker unsupported)');
  }
  const presetPanel = new PresetPanel();
  const regexPanel = new RegexPanel();
  const pluginPanel = new PluginPanel({ store: pluginStore, runtime: pluginRuntime });
  const chatStore = new ChatStore();
  window.appBridge.setChatStore(chatStore);
  const variableRuleEngine = new VariableRuleEngine({ chatStore, appBridge: window.appBridge });
  window.appBridge.variableRuleEngine = variableRuleEngine;
  window.appBridge.runVariableRules = (sessionId, ruleId) => variableRuleEngine.runManual(sessionId, ruleId);
  if (pluginRuntime) {
    pluginRuntime.setContext({ uiManager: pluginUiManager });
    window.appBridge.pluginUiManager = pluginUiManager;
    const emitVariableChanged = (name, oldValue, newValue, sessionId, scope = 'chat') => {
      const sid = String(sessionId || chatStore.getCurrent() || '').trim();
      if (!sid && scope !== 'global') return;
      pluginRuntime.dispatchEvent('variable.changed', {
        name: String(name || ''),
        oldValue,
        newValue,
        sessionId: sid || null,
        scope,
      }).catch(err => logger.warn('plugin variable.changed failed', err));
    };
    const originalSetVariable = chatStore.setVariable.bind(chatStore);
    chatStore.setVariable = (key, value, id = chatStore.getCurrent()) => {
      const sid = String(id || chatStore.getCurrent() || '').trim();
      const name = String(key || '').trim();
      const oldValue = chatStore.getVariable(name, sid);
      const ok = originalSetVariable(name, value, sid);
      if (ok && oldValue !== value) emitVariableChanged(name, oldValue, value, sid, 'chat');
      return ok;
    };
    const originalDeleteVariable = chatStore.deleteVariable.bind(chatStore);
    chatStore.deleteVariable = (key, id = chatStore.getCurrent()) => {
      const sid = String(id || chatStore.getCurrent() || '').trim();
      const name = String(key || '').trim();
      const oldValue = chatStore.getVariable(name, sid);
      const ok = originalDeleteVariable(name, sid);
      if (ok) emitVariableChanged(name, oldValue, undefined, sid, 'chat');
      return ok;
    };
    const originalClearVariables = chatStore.clearVariables.bind(chatStore);
    chatStore.clearVariables = (id = chatStore.getCurrent()) => {
      const sid = String(id || chatStore.getCurrent() || '').trim();
      const vars = chatStore.listVariables(sid) || {};
      const ok = originalClearVariables(sid);
      if (ok) {
        Object.keys(vars).forEach((name) => emitVariableChanged(name, vars[name], undefined, sid, 'chat'));
      }
      return ok;
    };
    if (typeof chatStore.setVariableSchema === 'function') {
      const originalSetVariableSchema = chatStore.setVariableSchema.bind(chatStore);
      chatStore.setVariableSchema = (key, schema, id = chatStore.getCurrent()) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const name = String(key || '').trim();
        const oldValue = chatStore.getVariable(name, sid);
        const ok = originalSetVariableSchema(name, schema, sid);
        const nextValue = chatStore.getVariable(name, sid);
        if (ok && oldValue !== nextValue) emitVariableChanged(name, oldValue, nextValue, sid, 'chat');
        return ok;
      };
    }
    if (typeof chatStore.setGlobalVariable === 'function') {
      const originalSetGlobalVariable = chatStore.setGlobalVariable.bind(chatStore);
      chatStore.setGlobalVariable = (key, value) => {
        const name = String(key || '').trim();
        const oldValue = chatStore.getGlobalVariable(name);
        const ok = originalSetGlobalVariable(name, value);
        if (ok && oldValue !== value) emitVariableChanged(name, oldValue, value, null, 'global');
        return ok;
      };
    }
    if (typeof chatStore.deleteGlobalVariable === 'function') {
      const originalDeleteGlobalVariable = chatStore.deleteGlobalVariable.bind(chatStore);
      chatStore.deleteGlobalVariable = (key) => {
        const name = String(key || '').trim();
        const oldValue = chatStore.getGlobalVariable(name);
        const ok = originalDeleteGlobalVariable(name);
        if (ok) emitVariableChanged(name, oldValue, undefined, null, 'global');
        return ok;
      };
    }
    if (typeof chatStore.clearGlobalVariables === 'function') {
      const originalClearGlobalVariables = chatStore.clearGlobalVariables.bind(chatStore);
      chatStore.clearGlobalVariables = () => {
        const vars = chatStore.listGlobalVariables?.() || {};
        const ok = originalClearGlobalVariables();
        if (ok) {
          Object.keys(vars).forEach((name) => emitVariableChanged(name, vars[name], undefined, null, 'global'));
        }
        return ok;
      };
    }
    if (typeof chatStore.patchGlobalVariables === 'function') {
      const originalPatchGlobalVariables = chatStore.patchGlobalVariables.bind(chatStore);
      chatStore.patchGlobalVariables = (updates) => {
        const before = chatStore.listGlobalVariables?.() || {};
        const ok = originalPatchGlobalVariables(updates);
        if (ok && updates && typeof updates === 'object') {
          Object.entries(updates).forEach(([name, value]) => {
            const key = String(name || '').trim();
            if (!key) return;
            emitVariableChanged(key, before[key], value, null, 'global');
          });
        }
        return ok;
      };
    }
  }
  const clearDraftMirror = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    chatStore.setDraft('', sid);
    try {
      sessionStorage.removeItem(`phone_draft_${sid}`);
    } catch {}
  };
  const originalClearInput = ui.clearInput.bind(ui);
  ui.clearInput = () => {
    originalClearInput();
    updateStickerPreview('');
    const sid = chatStore.getCurrent();
    if (sid) clearDraftMirror(sid);
  };
  const contactsStore = new ContactsStore();
  try {
    window.appBridge.setContactsStore?.(contactsStore);
  } catch {}
  if (pluginRuntime) {
    pluginRuntime.setContext({ bridge: window.appBridge, chatStore, contactsStore, ui, uiManager: pluginUiManager });
    window.appBridge.setPluginRuntime?.(pluginRuntime);
    window.appBridge.setChatUI?.(ui);
    pluginRuntime.init().catch((err) => logger.warn('plugin runtime init failed', err));
  }
  const groupStore = new GroupStore();
  const momentsStore = new MomentsStore();
  const momentSummaryStore = new MomentSummaryStore();
  try {
    window.appBridge.setMomentSummaryStore?.(momentSummaryStore);
  } catch {}
  const memoryTableStore = new MemoryTableStore();
  try {
    window.appBridge.setMemoryTableStore?.(memoryTableStore);
  } catch {}
  const memoryTemplateStore = new MemoryTemplateStore();
  try {
    window.appBridge.setMemoryTemplateStore?.(memoryTemplateStore);
  } catch {}
  const memoryTemplatePanel = new MemoryTemplatePanel({
    templateStore: memoryTemplateStore,
    memoryStore: memoryTableStore,
  });
  const personaStore = new PersonaStore();
  const rpSessionStore = new RpSessionStore();
  let activePersonaScopeKey = '';
  let activePersonaId = 'default';
  let chatRoom = null;
  const RP_SESSION_PREFIX = 'rp:';
  const isRpSessionId = (sessionId) => String(sessionId || '').startsWith(RP_SESSION_PREFIX);
  const getRpSessionId = (personaId = activePersonaId) => `${RP_SESSION_PREFIX}${personaId || 'default'}`;
  const getPersonaScopeKey = personaId => {
    const settings = appSettings.get();
    if (settings.personaBindContacts === false) return '';
    const raw = personaId || personaStore.getActive?.()?.id || 'default';
    return normalizeScopeId(raw);
  };
  let lastMomentRawReply = '';
  let lastMomentRawMeta = null;
  const worldPanel = new WorldPanel({ contactsStore, getSessionId: () => chatStore.getCurrent() });
  await personaStore.ready;
  activePersonaId = personaStore.getActive?.()?.id || 'default';
  const initialScopeKey = getPersonaScopeKey(activePersonaId);
  await Promise.all([
    chatStore.setScope?.(initialScopeKey),
    contactsStore.setScope?.(initialScopeKey),
    groupStore.setScope?.(initialScopeKey),
    momentsStore.setScope?.(initialScopeKey),
    momentSummaryStore.setScope?.(initialScopeKey),
    rpSessionStore.setScope?.(initialScopeKey),
  ]);
  const initMemoryStores = async () => {
    const results = await Promise.allSettled([
      memoryTableStore.setScope?.(initialScopeKey),
      memoryTemplateStore.setScope?.(initialScopeKey),
    ]);
    const failed = results.filter(item => item?.status === 'rejected');
    if (failed.length) {
      logger.warn(
        'memory store scope init failed',
        failed.map(item => item.reason),
      );
    }
    try {
      await memoryTemplateStore.ensureDefaultTemplate?.();
    } catch (err) {
      logger.warn('ensure default memory template failed', err);
    }
  };
  void initMemoryStores();
  activePersonaScopeKey = initialScopeKey;
  try {
    window.appBridge?.setPersonaScope?.(initialScopeKey);
  } catch {}
  await initMediaAssets();
  await window.appBridge?.regex?.ready;
  await window.appBridge?.presets?.ready;
  try {
    await window.appBridge?.syncPresetRegexBindings?.();
  } catch {}
  window.appBridge.setActiveSession(chatStore.getCurrent());
  const sessionPanel = new SessionPanel(chatStore, contactsStore, ui, { personaStore, getPersonaScopeKey });
  try {
    window.__sessionPanel = sessionPanel;
  } catch {}
  const regexSessionPanel = new RegexSessionPanel(() => chatStore.getCurrent());
  const contactSettingsPanel = new ContactSettingsPanel({
    contactsStore,
    chatStore,
    getSessionId: () => chatStore.getCurrent(),
    onSaved: async ({ forceRefresh } = {}) => {
      refreshChatAndContacts();
      const id = chatStore.getCurrent();
      const c = contactsStore.getContact(id);
      const titleEl = document.getElementById('current-chat-title');
      if (titleEl) titleEl.innerHTML = renderSessionNameHtml(id, c);
      if (forceRefresh) {
        const msgs = await chatStore.ensureRecentMessagesLoaded(id);
        ui.clearMessages();
        ui.preloadHistory(decorateMessagesForDisplay(msgs, { sessionId: id }));
      }
      try {
        contactSettingsPanel.renderCompactedSummary?.();
      } catch {}
      try {
        if (activePage === 'moments') momentsPanel.render({ preserveScroll: true });
      } catch {}
    },
  });
  const stickerPicker = new StickerPicker(tag => handleSticker(tag));
  const mediaPicker = new MediaPicker({
    onUrl: url => handleImage(url),
    onFile: async (dataUrl, file, kind) => {
      const resolvedKind = kind || (file?.type?.startsWith('audio') ? 'audio' : 'image');
      if (resolvedKind === 'document') {
        await handleDocumentFile(file);
        return;
      }
      if (resolvedKind === 'audio') {
        handleMusicFile(dataUrl, file?.name);
        return;
      }
      let payload = dataUrl;
      try {
        const compressed = await compressImageDataUrl(dataUrl, {
          maxDim: 1280,
          quality: 0.82,
          maxBytes: 1_200_000,
          mime: 'image/jpeg',
        });
        if (compressed) payload = compressed;
      } catch (err) {
        logger.warn('compress image failed', err);
      }
      handleImage(payload, file?.name);
    },
  });
  const worldIndicator = new WorldInfoIndicator();
  const groupCreatePanel = new GroupCreatePanel({
    contactsStore,
    chatStore,
    onCreated: ({ id, name }) => {
      try {
        refreshChatAndContacts();
      } catch {}
      switchPage('chat');
      enterChatRoom(id, name, 'chat');
    },
  });
  const groupSettingsPanel = new GroupSettingsPanel({
    contactsStore,
    chatStore,
    onSaved: async ({ id, forceRefresh } = {}) => {
      try {
        refreshChatAndContacts();
      } catch {}
      const c = contactsStore.getContact(id);
      const cur = chatStore.getCurrent();
      if (cur === id && currentChatTitle) currentChatTitle.innerHTML = renderSessionNameHtml(id, c);
      if (forceRefresh && cur === id) {
        const msgs = await chatStore.ensureRecentMessagesLoaded(id);
        ui.clearMessages();
        ui.preloadHistory(decorateMessagesForDisplay(msgs, { sessionId: id }));
      }
    },
  });

  // 联系人分组功能
  const contactDragManager = new ContactDragManager({
    groupStore,
    onDrop: () => {
      try {
        refreshChatAndContacts();
      } catch {}
    },
  });
  contactDragManager.init();

  const groupPanel = new GroupPanel({
    groupStore,
    onGroupChanged: () => {
      try {
        refreshChatAndContacts();
      } catch {}
    },
  });

  const avatars = {
    user: './assets/external/feather-default.png',
    assistant: './assets/external/feather-default.png',
  };

  const SEND_MODE_KEY = 'chat_send_mode_v1';
  let sendMode = 'chat';
  const loadSendMode = () => {
    try {
      const raw = localStorage.getItem(SEND_MODE_KEY);
      if (raw === 'creative' || raw === 'chat') return raw;
    } catch {}
    return 'chat';
  };
  const applySendModeUI = () => {
    const btn = document.getElementById('send-button');
    if (!btn) return;
    btn.classList.toggle('is-creative', sendMode === 'creative');
    btn.dataset.mode = sendMode;
  };
  const setSendMode = (mode, { silent = false } = {}) => {
    sendMode = mode === 'creative' ? 'creative' : 'chat';
    try {
      localStorage.setItem(SEND_MODE_KEY, sendMode);
    } catch {}
    applySendModeUI();
    if (!silent) {
      const label = sendMode === 'creative' ? '已切换到创意写作模式' : '已切换到聊天对话模式';
      window.toastr?.info?.(label);
    }
  };
  setSendMode(loadSendMode(), { silent: true });

  const UI_MODE_KEY = 'chat_ui_mode_v1';
  let uiMode = 'social';
  let lastSocialState = { activePage: 'chat', sessionId: '', inChatRoom: false };
  let lastSocialSendMode = '';
  const loadUiMode = () => {
    try {
      const raw = localStorage.getItem(UI_MODE_KEY);
      return raw === 'rp' ? 'rp' : 'social';
    } catch {
      return 'social';
    }
  };
  const persistUiMode = () => {
    try {
      localStorage.setItem(UI_MODE_KEY, uiMode);
    } catch {}
  };

  const getEffectivePersona = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim() || 'default';
    const lockedId = chatStore.getPersonaLock?.(sid) || '';
    if (lockedId) {
      const locked = personaStore.get(lockedId);
      if (locked) return locked;
      // Lock refers to missing persona; clean it up.
      try {
        chatStore.clearPersonaLock?.(sid);
      } catch {}
    }
    return personaStore.getActive();
  };

  const isSharedVariableSession = (sessionId = chatStore.getCurrent()) => {
    if (uiMode === 'rp') return true;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const settings = chatStore.getSessionSettings?.(sid) || {};
    if (typeof settings.sharedVariables === 'boolean') return settings.sharedVariables;
    const persona = getEffectivePersona(sid);
    return persona?.source?.type === 'character_card';
  };

  const isSharedMemorySession = (sessionId = chatStore.getCurrent()) => {
    if (uiMode === 'rp') return true;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const settings = chatStore.getSessionSettings?.(sid) || {};
    if (typeof settings.sharedMemory === 'boolean') return settings.sharedMemory;
    const persona = getEffectivePersona(sid);
    return persona?.source?.type === 'character_card';
  };
  try {
    if (window.appBridge) {
      window.appBridge.isSharedVariableSession = isSharedVariableSession;
      window.appBridge.isSharedMemorySession = isSharedMemorySession;
    }
  } catch {}

  const DEFAULT_USER_BUBBLE_COLOR = '#E8F0FE';

  const normalizeHexColor = (value, fallback) => {
    const raw = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(raw) ? raw : fallback;
  };

  const getUserBubbleColor = (sessionId = chatStore.getCurrent()) => {
    const p = getEffectivePersona(sessionId);
    return normalizeHexColor(p?.userBubbleColor, DEFAULT_USER_BUBBLE_COLOR);
  };

  const applyUserBubbleColor = (sessionId = chatStore.getCurrent()) => {
    if (!chatRoom) return;
    const currentId = String(chatStore.getCurrent() || '');
    const sid = String(sessionId || '');
    if (!sid || sid !== currentId) return;
    chatRoom.style.setProperty('--chat-user-bubble-color', getUserBubbleColor(sessionId));
  };

  const syncUserPersonaUI = (sessionId = chatStore.getCurrent()) => {
    const p = getEffectivePersona(sessionId);
    const url = p.avatar || './assets/external/feather-default.png';
    const name = p.name || '我';
    avatars.user = url;
    document.querySelectorAll('.user-avatar-btn img').forEach(img => (img.src = url));
    document.querySelectorAll('.user-nickname').forEach(el => (el.textContent = name));
    try {
      momentsPanel?.setUserAvatar?.(url);
    } catch {}
    applyUserBubbleColor(sessionId);
  };

  const applyPersonaScope = async ({ personaId = null, force = false } = {}) => {
    const pid = personaId || personaStore.getActive?.()?.id || 'default';
    const nextKey = getPersonaScopeKey(pid);
    if (!force && nextKey === activePersonaScopeKey) {
      activePersonaId = pid;
      return false;
    }
    try {
      const prevId = activePersonaId || 'default';
      const cache = (window.__personaContactsCache = window.__personaContactsCache || {});
      cache[prevId] = {
        contacts: (contactsStore.listContacts?.() || []).map(c => ({ ...c })),
        updatedAt: Date.now(),
      };
    } catch {}
    logger.info(`[Persona_test] applyPersonaScope start persona=${pid} scope=${nextKey || 'default'}`);
    activePersonaScopeKey = nextKey;
    await Promise.all([
      chatStore.setScope?.(nextKey),
      contactsStore.setScope?.(nextKey),
      groupStore.setScope?.(nextKey),
      momentsStore.setScope?.(nextKey),
      momentSummaryStore.setScope?.(nextKey),
      rpSessionStore.setScope?.(nextKey),
      memoryTableStore.setScope?.(nextKey),
      memoryTemplateStore.setScope?.(nextKey),
    ]);
    try {
      await memoryTemplateStore.ensureDefaultTemplate?.();
    } catch {}
    try {
      window.appBridge?.setPersonaScope?.(nextKey);
    } catch {}
    try {
      window.appBridge?.setActiveSession?.(chatStore.getCurrent());
    } catch {}
    const sid = chatStore.getCurrent();
    const contact = contactsStore.getContact(sid);
    if (typeof isChatRoomVisible === 'function' && isChatRoomVisible()) {
      enterChatRoom(sid, contact?.name || sid, chatOriginPage);
    } else {
      refreshChatAndContacts({ immediate: true });
    }
    try {
      if (activePage === 'moments') momentsPanel.render({ preserveScroll: false });
    } catch {}
    logger.info(
      `[Persona_test] applyPersonaScope done scope=${nextKey || 'default'} sessions=${
        chatStore.listSessions?.().length || 0
      } contacts=${contactsStore.listContacts?.().length || 0}`,
    );
    if (uiMode === 'rp') {
      enterRpMode({ captureSocial: false });
    }
    activePersonaId = pid;
    return true;
  };

  const personaPanel = new PersonaPanel({
    personaStore,
    chatStore,
    contactsStore,
    rpSessionStore,
    getSessionId: () => chatStore.getCurrent(),
    onPersonaChanged: async () => {
      await applyPersonaScope({ personaId: personaStore.getActive?.()?.id });
      syncUserPersonaUI(chatStore.getCurrent());
      refreshChatAndContacts();
    },
  });
  // Initial sync
  syncUserPersonaUI(chatStore.getCurrent());

  window.addEventListener('app-settings-changed', async ev => {
    const key = String(ev?.detail?.key || '').trim();
    if (!key) return;
    if (key === 'personaBindContacts') {
      await applyPersonaScope({ personaId: personaStore.getActive?.()?.id, force: true });
      refreshChatAndContacts({ immediate: true });
      return;
    }
    if (key === 'memoryStorageMode') {
      refreshChatAndContacts({ immediate: true });
    }
  });

  const variablePanel = new VariablePanel({
    chatStore,
    getSessionId: () => chatStore.getCurrent(),
    getVariableScope: sid => (isSharedVariableSession(sid) ? 'global' : 'session'),
  });

  const getContactCountN = () => {
    try {
      const list = contactsStore.listContacts?.() || [];
      const n = list.filter(c => c && !c.isGroup).length;
      return Math.max(1, n);
    } catch {
      return 1;
    }
  };

  const randInt = (min, max) => {
    const a = Number.isFinite(Number(min)) ? Number(min) : 0;
    const b = Number.isFinite(Number(max)) ? Number(max) : 0;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  };

  const normalizeInitialMomentStats = ({ views, likes }, n) => {
    const nEff = Math.max(1, Number(n) || 1);
    const maxViews = Math.max(0, nEff * 10 - 1);
    const maxLikes = Math.max(0, nEff * 2 - 1);
    let v = Number.isFinite(Number(views)) ? Number(views) : 0;
    let l = Number.isFinite(Number(likes)) ? Number(likes) : 0;

    if (v < 0 || v >= nEff * 10) v = maxViews > 0 ? randInt(Math.max(0, Math.floor(maxViews * 0.25)), maxViews) : 0;
    if (l < 0 || l >= nEff * 2) l = maxLikes > 0 ? randInt(0, maxLikes) : 0;
    l = Math.min(l, v, maxLikes);
    return { views: v, likes: l };
  };

  const bumpMomentEngagement = (momentId, n) => {
    const id = String(momentId || '').trim();
    if (!id) return;
    const m = momentsStore.get(id);
    if (!m) return;
    const nEff = Math.max(1, Number(n) || 1);
    const baseViews = Math.max(2, Math.floor(nEff * 0.9));
    const maxViews = Math.max(baseViews + 2, Math.floor(nEff * 3.2));
    const viewsInc = randInt(baseViews, maxViews);

    // Likes grow slower than views; cap likes increase relative to view increase.
    const baseLikes = Math.max(0, Math.floor(nEff * 0.15));
    const maxLikes = Math.max(baseLikes, Math.floor(nEff * 0.8));
    let likesInc = randInt(baseLikes, maxLikes);
    likesInc = Math.min(likesInc, Math.max(1, Math.floor(viewsInc / 3)));

    const nextViews = Number.isFinite(Number(m.views)) ? Number(m.views) + viewsInc : viewsInc;
    const nextLikesRaw = Number.isFinite(Number(m.likes)) ? Number(m.likes) + likesInc : likesInc;
    const nextLikes = Math.min(nextLikesRaw, nextViews);
    momentsStore.upsert({ id, views: nextViews, likes: nextLikes });
  };

  let requestMomentSummaryCompaction = () => Promise.resolve(false);

  const momentsPanel = new MomentsPanel({
    momentsStore,
    contactsStore,
    defaultAvatar: avatars.assistant,
    userAvatar: personaStore.getActive()?.avatar || avatars.user,
    onUserComment: async (momentId, commentText, meta = null) => {
      const id = String(momentId || '').trim();
      const userComment = String(commentText || '').trim();
      if (!id || !userComment) return;

      if (!window.appBridge.isConfigured()) {
        ui.showErrorBanner('未配置 API，请先填写 Base URL / Key / 模型');
        window.toastr?.warning('请先配置 API 信息', '未配置');
        configPanel.show();
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        ui.showErrorBanner('当前离线，请连接网络后再试');
        window.toastr?.warning('离线状态，无法发送');
        return;
      }

      const m = momentsStore.get(id);
      if (!m) {
        window.toastr?.warning?.('未找到该动态');
        return;
      }
      // Engagement simulation depends on contacts count N (views grow faster than likes)
      const n = getContactCountN();
      try {
        bumpMomentEngagement(id, n);
      } catch {}

      // Build a constrained comment-reply task (adapted from 手机流式.html momentCommentTask)
      const authorName = String(m.author || '').trim() || '发布者';
      const originSessionId = String(m.originSessionId || m.authorId || chatStore.getCurrent() || '').trim();
      const userCommentId = String(meta?.userCommentId || '').trim();
      const replyTo =
        meta && typeof meta === 'object' && meta.replyTo && typeof meta.replyTo === 'object'
          ? {
              id: String(meta.replyTo.id || '').trim(),
              author: String(meta.replyTo.author || '').trim(),
              content: String(meta.replyTo.content || ''),
            }
          : null;
      const isReplyToComment = Boolean(replyTo?.id);
      const candidates = (contactsStore.listContacts?.() || [])
        .filter(c => c && !c.isGroup)
        .map(c => String(c.name || c.id || '').trim())
        .filter(Boolean)
        .filter(n => n !== '我' && n !== '用户' && n.toLowerCase() !== 'user');

      const uniq = [];
      [authorName, ...candidates].forEach(n => {
        if (n && !uniq.includes(n)) uniq.push(n);
      });
      const listPart = uniq
        .slice(0, 16)
        .map(n => `- ${n}`)
        .join('\n');

      const normalizeName = s => String(s || '').trim();
      const resolvePrivateChatTargetSessionId = otherName => {
        const other = normalizeName(otherName);
        if (!other) return null;

        const byId = contactsStore.getContact(other);
        if (byId?.id) return byId.id;

        try {
          const matches = (contactsStore.listContacts?.() || []).filter(c => normalizeName(c?.name || c?.id) === other);
          if (matches.length === 1) return matches[0].id;
        } catch {}

        return null;
      };

      const target = (() => {
        if (isReplyToComment) {
          const n = normalizeName(replyTo?.author);
          const sid =
            resolvePrivateChatTargetSessionId(n) || (n === normalizeName(authorName) ? originSessionId : null);
          return { name: n || authorName, sessionId: sid || '' };
        }
        const sid = String(originSessionId || '').trim() || resolvePrivateChatTargetSessionId(authorName) || '';
        return { name: normalizeName(authorName) || '发布者', sessionId: sid };
      })();

      const recentComments = (() => {
        const list = Array.isArray(m.comments) ? m.comments : [];
        const tail = list.slice(-12);
        return tail
          .map(c => {
            const a = String(c?.author || '').trim();
            const normalized = normalizeStickerTextForPrompt(c?.content || '');
            const content = String(normalized || '').replace(/\n/g, '<br>');
            const rta = String(c?.replyToAuthor || '').trim();
            const parts = [
              a ? `author::${a}` : '',
              rta ? `reply_to_author::${rta}` : '',
              content ? `content::${content}` : '',
            ].filter(Boolean);
            return parts.length ? `- ${parts.join(' | ')}` : '';
          })
          .filter(Boolean)
          .join('\n');
      })();

      const userLine = isReplyToComment
        ? `{{user}}回复了${replyTo.author}：{{lastUserMessage}}`
        : `{{user}}：{{lastUserMessage}}`;

      // 场景 C：动态评论（提示词规则由「预设 → 聊天提示词 → 动态评论回复提示词」注入；评论数据作为 system 注入，用户内容通过 {{lastUserMessage}} 填入）
      const promptData = `
【QQ空间动态评论回复（数据）】
发布者: ${authorName}
动态内容: ${String(normalizeStickerTextForPrompt(m.content || '') || '').trim()}
动态时间: ${String(m.time || '').trim() || '（未知）'}

【用户评论】
${userLine}

${
  isReplyToComment
    ? `【回复上下文】
reply_to_author: ${replyTo.author}
reply_to_content: ${String(normalizeStickerTextForPrompt(replyTo.content || '') || '').trim()}
`
    : ''
}

${
  recentComments
    ? `【当前评论列表（最近12条）】
${recentComments}
`
    : ''
}

【可用联系人名单】
${listPart || '-（无）'}
`.trim();

      const applyEvents = (events = []) => {
        let touchedMoments = false;
        let touchedChats = false;
        (Array.isArray(events) ? events : []).forEach(ev => {
          if (!ev || typeof ev !== 'object') return;
          if (ev.type === 'moments') {
            const list = (ev.moments || []).map(mm => {
              const stats = normalizeInitialMomentStats({ views: mm?.views, likes: mm?.likes }, n);
              return { ...(mm || {}), ...stats, originSessionId };
            });
            momentsStore.addMany(list);
            touchedMoments = true;
            return;
          }
          if (ev.type === 'moment_reply') {
            const requestedId = String(ev.momentId || '').trim();
            let mid = requestedId || id;
            const incoming = Array.isArray(ev.comments) ? ev.comments : [];
            let targetMoment = momentsStore.get(mid);
            if (!targetMoment && id && id !== mid) {
              const fallbackMoment = momentsStore.get(id);
              if (fallbackMoment) {
                try {
                  logger.warn(
                    'moment_reply target not found; fallback to current',
                    JSON.stringify({
                      momentId: mid,
                      fallbackId: id,
                      commentCount: incoming.length,
                    }),
                  );
                } catch {}
                mid = id;
                targetMoment = fallbackMoment;
              }
            }
            if (!targetMoment) {
              try {
                const list = (momentsStore.list?.() || []).map(m => String(m?.id || '')).filter(Boolean);
                logger.warn(
                  'moment_reply target not found',
                  JSON.stringify({
                    momentId: mid,
                    requestedId,
                    commentCount: incoming.length,
                    knownCount: list.length,
                    knownSample: list.slice(0, 6),
                  }),
                );
              } catch {}
              return;
            }
            const patched = (() => {
              if (!isReplyToComment || !replyTo?.id) return incoming;
              return incoming.map(c => {
                if (!c || typeof c !== 'object') return c;
                // If model didn't provide reply_to (because we no longer expose comment_id), attach it for the primary replier.
                const author = String(c.author || '').trim();
                const hasReplyTo = String(c.replyTo || '').trim().length > 0;
                const isPrimaryReplier =
                  author && (author === normalizeName(replyTo?.author) || author === normalizeName(target?.name));
                if (hasReplyTo || !isPrimaryReplier) return c;
                return { ...c, replyTo: String(replyTo.id || ''), replyToAuthor: String(replyTo.author || '') };
              });
            })();
            const saved = momentsStore.addComments(mid, patched);
            if (!saved) {
              try {
                logger.warn(
                  'moment_reply addComments failed',
                  JSON.stringify({
                    momentId: mid,
                    commentCount: patched.length,
                  }),
                );
              } catch {}
              return;
            }
            try {
              bumpMomentEngagement(mid, n);
            } catch {}
            touchedMoments = true;
            return;
          }
          if (ev.type === 'private_chat') {
            const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName);
            if (!targetSessionId) return;
            (ev.messages || []).forEach(msgText => {
              const payload = msgText && typeof msgText === 'object' ? msgText : { content: msgText };
              const speakerRaw = String(payload?.speaker || '').trim();
              const content = String(payload?.content || '').trim();
              if (!content) return;
              const userDisplayName = getEffectivePersona(targetSessionId)?.name || '我';
              const speakerKey = normalizeName(speakerRaw).replace(/[：:]/g, '').trim();
              const userKey = normalizeName(userDisplayName).replace(/[：:]/g, '').trim();
              const isMe = Boolean(
                speakerKey &&
                  userKey &&
                  (speakerKey === userKey || normalizeLooseName(speakerKey) === normalizeLooseName(userKey)),
              );
              const time =
                String(payload?.time || '').trim() ||
                new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              if (isMe) {
                const parsed = parseSpecialMessage(content);
                const meta = { ...(parsed.meta || {}), generatedByAssistant: true };
                const built = {
                  role: 'user',
                  type: 'text',
                  ...parsed,
                  name: userDisplayName,
                  avatar: avatars.user,
                  time,
                  meta,
                };
                chatStore.appendMessage(built, targetSessionId);
              } else {
                const parsed = {
                  role: 'assistant',
                  type: 'text',
                  ...parseSpecialMessage(content),
                  name: '助手',
                  avatar: resolveAvatarForContact(targetSessionId, contactsStore.getContact(targetSessionId)),
                  time,
                };
                const saved = chatStore.appendMessage(parsed, targetSessionId);
                autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
              }
              touchedChats = true;
            });
          }
        });
        if (touchedChats) {
          try {
            refreshChatAndContacts();
          } catch {}
        }
        if (touchedMoments) {
          try {
            momentsPanel.render({ preserveScroll: true });
          } catch {}
        }
        return { touchedMoments, touchedChats };
      };

      const extractMomentSummary = text => {
        const raw = String(text ?? '');
        const re = /<details>\s*<summary>\s*摘要\s*<\/summary>\s*([\s\S]*?)<\/details>/gi;
        let m;
        let last = null;
        while ((m = re.exec(raw))) last = m[1];
        if (!last) return '';
        const plain = String(last || '').replace(/<[^>]+>/g, ' ');
        return plain
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[A-Za-z]+/g, '')
          .trim();
      };

      const applyMomentSummary = raw => {
        const summary = extractMomentSummary(raw);
        if (!summary) return;
        try {
          momentSummaryStore.addSummary(summary);
        } catch {}
        try {
          requestMomentSummaryCompaction();
        } catch {}
        try {
          window.dispatchEvent(new CustomEvent('moment-summaries-updated'));
        } catch {}
      };

      const extractMomentReplySegments = text => {
        const raw = String(text ?? '');
        const lower = raw.toLowerCase();
        const startMark = 'moment_reply_start';
        const endMark = 'moment_reply_end';
        const chunks = [];
        let idx = 0;
        while (true) {
          const startIdx = lower.indexOf(startMark, idx);
          if (startIdx === -1) break;
          const endIdx = lower.indexOf(endMark, startIdx + startMark.length);
          if (endIdx === -1) break;
          chunks.push(raw.slice(startIdx, endIdx + endMark.length));
          idx = endIdx + endMark.length;
        }
        return chunks.join('\n');
      };

      try {
        const config = window.appBridge.config.get();
        const parser = new DialogueStreamParser({ userName: '我' });
        let sawMomentReply = false;
        let fullRaw = '';

        const p = personaStore.getActive?.() || {};
        const persona = getEffectivePersona(originSessionId);
        const uName = String(persona?.name || '').trim() || '我';
        const ctx = {
          user: {
            name: uName,
            persona: String(persona?.description || ''),
            personaPosition: persona?.position,
            personaDepth: persona?.depth,
            personaRole: persona?.role,
          },
          character: { name: target.name || authorName },
          history: [],
          task: { type: 'moment_comment', targetSessionId: target.sessionId || '', targetName: target.name || '' },
          session: { id: originSessionId, isGroup: false },
        };
        ctx.task.promptData = promptData;
        if (isReplyToComment) {
          ctx.task.isReplyToComment = true;
          ctx.task.replyToCommentId = String(replyTo?.id || '').trim();
          ctx.task.replyToAuthor = String(replyTo?.author || '').trim();
        }
        if (config.stream) {
          const stream = await window.appBridge.generate(userComment, ctx);
          for await (const chunk of stream) {
            fullRaw += chunk;
            const events = parser.push(chunk);
            const res = applyEvents(events);
            if (res?.touchedMoments) sawMomentReply = true;
          }
          if (fullRaw) {
            lastMomentRawReply = fullRaw;
            lastMomentRawMeta = { momentId: id, author: authorName, time: m?.time || '', comment: userComment };
          }
        } else {
          const raw = await window.appBridge.generate(userComment, ctx);
          fullRaw = raw;
          const events = parser.push(raw);
          const res = applyEvents(events);
          if (res?.touchedMoments) sawMomentReply = true;
          if (fullRaw) {
            lastMomentRawReply = fullRaw;
            lastMomentRawMeta = { momentId: id, author: authorName, time: m?.time || '', comment: userComment };
          }
        }

        if (!sawMomentReply && fullRaw) {
          try {
            const sanitizeThinkingForMoment = text => {
              const raw = String(text ?? '');
              const lower = raw.toLowerCase();
              const closeThinking = '</thinking>';
              const closeThink = '</think>';
              const i1 = lower.lastIndexOf(closeThinking);
              const i2 = lower.lastIndexOf(closeThink);
              const idx = Math.max(i1, i2);
              if (idx === -1) return raw;
              const cut = idx + (idx === i1 ? closeThinking.length : closeThink.length);
              return raw.slice(cut);
            };
            const parseMomentReplyFrom = text => {
              if (!text) return false;
              const retryParser = new DialogueStreamParser({ userName: '我' });
              const retryEvents = retryParser.push(text);
              const res = applyEvents(retryEvents);
              if (res?.touchedMoments) sawMomentReply = true;
              return Boolean(res?.touchedMoments);
            };

            const retryText = sanitizeThinkingForMoment(fullRaw);
            if (retryText && retryText !== fullRaw) {
              try {
                logger.debug(
                  'moment_reply retry: stripped thinking',
                  JSON.stringify({
                    originalLen: String(fullRaw || '').length,
                    retryLen: String(retryText || '').length,
                  }),
                );
              } catch {}
              parseMomentReplyFrom(retryText);
            }
            if (!sawMomentReply) {
              const extracted = extractMomentReplySegments(retryText || fullRaw);
              try {
                logger.debug(
                  'moment_reply retry: extracted segments',
                  JSON.stringify({
                    extractedLen: String(extracted || '').length,
                    hasStart: String(retryText || fullRaw || '')
                      .toLowerCase()
                      .includes('moment_reply_start'),
                    hasEnd: String(retryText || fullRaw || '')
                      .toLowerCase()
                      .includes('moment_reply_end'),
                  }),
                );
              } catch {}
              if (extracted) {
                parseMomentReplyFrom(extracted);
              }
            }
          } catch {}
        }

        if (sawMomentReply) {
          try {
            await momentsStore.flush();
          } catch {}
        } else {
          try {
            logger.warn(
              'moment_reply parse failed',
              JSON.stringify({
                momentId: id,
                hasStart: String(fullRaw || '')
                  .toLowerCase()
                  .includes('moment_reply_start'),
                hasEnd: String(fullRaw || '')
                  .toLowerCase()
                  .includes('moment_reply_end'),
                rawLen: String(fullRaw || '').length,
              }),
            );
          } catch {}
          window.toastr?.warning?.('未解析到动态评论回复（可能格式不正确）');
        }
        if (fullRaw) {
          try {
            applyMomentSummary(fullRaw);
          } catch {}
        }
      } catch (err) {
        logger.error('动态评论生成失败', err);
        window.toastr?.error?.(err?.message || '动态评论生成失败');
      }
    },
  });

  const momentSummaryPanel = new MomentSummaryPanel({
    store: momentSummaryStore,
    onRunCompaction: opts => requestMomentSummaryCompaction(opts),
  });

  const formatTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatNowTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const isConversationMessage = m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system');

  const sanitizeAssistantReplyText = (text, userName) => {
    const stripXmlBlocks = src => {
      let out = String(src ?? '');
      const paired = /<([A-Za-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/g;
      for (let i = 0; i < 20; i++) {
        const next = out.replace(paired, '');
        if (next === out) break;
        out = next;
      }
      out = out.replace(/<([A-Za-z][\w:-]*)(?:\s[^>]*)?\/\s*>/g, '');
      // Remove any remaining standalone tags (no content removal possible without an end tag).
      out = out.replace(/<([A-Za-z][\w:-]*)(?:\s[^>]*)?>/g, '');
      return out;
    };

    const stripLeadingUserSpeakerLines = (src, name) => {
      const raw = String(src ?? '');
      const lines = raw.split(/\r?\n/);
      const n = String(name || '').trim();
      if (!n) return raw;
      const escaped = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const userRe = new RegExp(`^\\s*${escaped(n)}\\s*[:：]\\s*`, 'i');

      let i = 0;
      while (i < lines.length && !String(lines[i] || '').trim()) i++;
      while (i < lines.length) {
        const line = String(lines[i] || '');
        if (!line.trim()) {
          i++;
          continue;
        }
        if (!userRe.test(line)) break;
        i++;
      }
      return lines.slice(i).join('\n').replace(/^\s+/, '');
    };

    const stripTrailingLineTimes = src => {
      const lines = String(src ?? '').split(/\r?\n/);
      return lines
        .map(line => {
          const trimmed = line.replace(/\s+$/, '');
          return trimmed.replace(/\s*--\s*HH[:：]MM\s*$/i, '');
        })
        .join('\n');
    };

    let out = String(text ?? '');
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    out = stripXmlBlocks(out);
    out = stripLeadingUserSpeakerLines(out, userName);
    out = stripTrailingLineTimes(out);
    out = out.replace(/\n{4,}/g, '\n\n\n');
    return out.trimStart();
  };

  const normalizeCreativeLineBreaks = text =>
    String(text ?? '')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

  const stripSimpleHtml = text =>
    String(text ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '');

  const normalizePlainText = text => normalizeCreativeLineBreaks(String(text ?? ''));

  const escapeRegex = input => String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const getReasoningPreset = () => {
    try {
      return window.appBridge?.presets?.getActive?.('reasoning') || {};
    } catch {
      return {};
    }
  };
  const parseReasoningBlock = (text, { strict = true } = {}) => {
    const raw = String(text ?? '');
    const settings = appSettings.get();
    if (settings.reasoningAutoParse !== true) return { content: raw, reasoning: '' };
    const preset = getReasoningPreset();
    const prefix = String(preset?.prefix ?? '');
    const suffix = String(preset?.suffix ?? '');
    if (!prefix || !suffix) return { content: raw, reasoning: '' };
    try {
      const pattern = `${strict ? '^\\s*?' : ''}${escapeRegex(prefix)}([\\s\\S]*?)${escapeRegex(suffix)}`;
      const regex = new RegExp(pattern, 's');
      const match = raw.match(regex);
      if (!match) return { content: raw, reasoning: '' };
      const reasoning = String(match[1] ?? '').trim();
      const content = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { content, reasoning };
    } catch {
      return { content: raw, reasoning: '' };
    }
  };
  const applyReasoningRegex = (reasoning, { depth } = {}) => {
    const text = String(reasoning ?? '').trim();
    if (!text) return { stored: '', display: '' };
    let stored = text;
    let display = text;
    try {
      stored = window.appBridge.applyReasoningStoredRegex(text, { depth });
      display = window.appBridge.applyReasoningDisplayRegex(stored, { depth });
    } catch {}
    return { stored, display };
  };
  const extractReasoningFromContent = (content, { depth, strict = true } = {}) => {
    const parsed = parseReasoningBlock(content, { strict });
    if (!parsed.reasoning) return { content: parsed.content, reasoning: '', reasoningDisplay: '' };
    const { stored, display } = applyReasoningRegex(parsed.reasoning, { depth });
    return { content: parsed.content, reasoning: stored, reasoningDisplay: display };
  };

  const resolveMessagePlainText = (message, { depth, preferRawSource = false } = {}) => {
    if (!message || typeof message !== 'object') return '';
    const pick = value => {
      const normalized = normalizePlainText(value);
      return normalized.trim() ? normalized : '';
    };

    if (message.role === 'assistant') {
      const rawSource =
        typeof message.rawSource === 'string'
          ? message.rawSource
          : typeof message.raw_source === 'string'
          ? message.raw_source
          : '';
      const filteredRawSource = rawSource
        ? extractReasoningFromContent(rawSource, { depth, strict: true }).content || rawSource
        : '';
      if (preferRawSource && rawSource) {
        try {
          const picked = pick(window.appBridge.applyOutputStoredRegex(filteredRawSource || rawSource, { depth }));
          if (picked) return picked;
        } catch {
          const picked = pick(filteredRawSource || rawSource);
          if (picked) return picked;
        }
      }
      const raw = typeof message.raw === 'string' ? message.raw : '';
      const rawPicked = pick(raw);
      if (rawPicked) return rawPicked;
      if (rawSource) {
        try {
          return pick(window.appBridge.applyOutputStoredRegex(filteredRawSource || rawSource, { depth }));
        } catch {
          return pick(filteredRawSource || rawSource);
        }
      }
      const rawOriginal = typeof message.rawOriginal === 'string' ? message.rawOriginal : '';
      if (rawOriginal) {
        try {
          const filteredOriginal =
            extractReasoningFromContent(rawOriginal, { depth, strict: true }).content || rawOriginal;
          return pick(window.appBridge.applyOutputStoredRegex(filteredOriginal, { depth }));
        } catch {
          const filteredOriginal =
            extractReasoningFromContent(rawOriginal, { depth, strict: true }).content || rawOriginal;
          return pick(filteredOriginal);
        }
      }
      const content = typeof message.content === 'string' ? message.content : '';
      return content ? pick(stripSimpleHtml(content)) : '';
    }

    if (message.role === 'user') {
      const raw = typeof message.raw === 'string' ? message.raw : '';
      const rawPicked = pick(raw);
      if (rawPicked) return rawPicked;
      const content = typeof message.content === 'string' ? message.content : '';
      if (!content) return '';
      try {
        return pick(window.appBridge.applyInputStoredRegex(content, { depth }));
      } catch {
        return pick(content);
      }
    }
    return '';
  };

  const normalizeEchoText = (text = '') => {
    const raw = String(text || '');
    return raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  };

  const createUserEchoGuard = (sentText, userName) => {
    const sentNorm = normalizeEchoText(sentText);
    const sentLoose = sentNorm.replace(/\s+/g, '');
    const parts = sentNorm
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    const partLoose = new Set(parts.map(s => s.replace(/\s+/g, '')));
    let seenNonEcho = false;

    const isUserSpeaker = speaker => {
      const raw = String(speaker || '')
        .trim()
        .replace(/[：:]/g, '');
      if (!raw) return false;
      const user = String(userName || '').trim();
      if (!user) return false;
      if (raw === user) return true;
      return normalizeLooseName(raw) === normalizeLooseName(user);
    };

    return {
      shouldDrop: (content, speaker = '') => {
        if (seenNonEcho) return false;
        const text = normalizeEchoText(content);
        const loose = text.replace(/\s+/g, '');
        if (!text) return true;
        const matchesFull = sentNorm && (text === sentNorm || loose === sentLoose);
        const matchesPart = partLoose.size && partLoose.has(loose);
        const speakerOk = speaker ? isUserSpeaker(speaker) : true;
        if (speakerOk && (matchesFull || matchesPart)) return true;
        seenNonEcho = true;
        return false;
      },
    };
  };

  const normalizeLooseName = s => {
    const raw = String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    return raw.replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
  };

  const resolveContactByDisplayName = displayName => {
    const raw = String(displayName || '').trim();
    if (!raw) return null;
    const key = normalizeLooseName(raw);
    const list = contactsStore.listContacts?.() || [];
    const exact = list.find(c => String(c?.name || c?.id || '').trim() === raw);
    if (exact) return exact;
    const fuzzy = list.find(c => normalizeLooseName(c?.name || c?.id) === key);
    return fuzzy || null;
  };

  const resolveAvatarForMessage = (message, sessionId) => {
    try {
      if (!message || typeof message !== 'object') return '';
      if (message.role === 'user') return avatars.user;

      // Group chats: prefer per-speaker avatar when possible.
      const sid = String(sessionId || '').trim();
      const isGroup = sid.startsWith('group:') || Boolean(contactsStore.getContact(sid)?.isGroup);
      if (isGroup && message.role === 'assistant') {
        const speaker = String(message.name || '').trim();
        if (speaker && speaker !== '助手') {
          try {
            const byName = resolveContactByDisplayName(speaker);
            if (byName?.avatar) return byName.avatar;
          } catch {}
          try {
            const byId = contactsStore.getContact(speaker);
            if (byId?.avatar) return byId.avatar;
          } catch {}
        }
      }

      if (message.role === 'assistant') return getAssistantAvatarForSession(sid);
      return '';
    } catch {
      return '';
    }
  };

  const decorateMessagesForDisplay = (messages = [], { sessionId } = {}) => {
    const list = Array.isArray(messages) ? messages : [];
    const convPos = new Map(); // index -> conversation order
    list.forEach((m, i) => {
      if (m && (m.role === 'user' || m.role === 'assistant')) convPos.set(i, convPos.size);
    });
    const total = convPos.size;
    const resolveLocalAttachmentUrl = value => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
        const g = typeof globalThis !== 'undefined' ? globalThis : window;
        const convert =
          g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
        if (typeof convert === 'function') {
          const converted = convert(raw);
          if (converted) return converted;
        }
      } catch {}
      if (/^(file|asset|tauri|app|https?|data|blob):/i.test(raw)) return raw;
      if (/^[a-zA-Z]:[\\/]/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`;
      if (raw.startsWith('/')) return `file://${raw}`;
      return raw;
    };

    return list.map((m, i) => {
      if (!m || typeof m !== 'object') return m;
      const base = typeof m.raw === 'string' ? m.raw : typeof m.content === 'string' ? m.content : '';
      if (!base) return m;
      const avatar = m.avatar || resolveAvatarForMessage(m, sessionId);
      const j = convPos.has(i) ? convPos.get(i) : null;
      const depth = j === null ? undefined : total - 1 - j;
      const rawSource =
        typeof m.rawSource === 'string' ? m.rawSource : typeof m.raw_source === 'string' ? m.raw_source : '';
      const creativeSource = rawSource ? normalizeCreativeLineBreaks(rawSource) : '';
      const creativeBase = creativeSource || base;
      const meta = m?.meta && typeof m.meta === 'object' ? { ...m.meta } : m?.meta;
      if (meta && typeof meta.reasoning === 'string') {
        try {
          meta.reasoningDisplay = window.appBridge.applyReasoningDisplayRegex(meta.reasoning, { depth });
        } catch {
          meta.reasoningDisplay = meta.reasoning;
        }
      }

      if (m.role === 'assistant' && (m.type === 'text' || !m.type)) {
        if (m?.meta?.renderRich) {
          if (creativeSource) {
            let stored = creativeSource;
            try {
              stored = normalizeCreativeLineBreaks(window.appBridge.applyOutputStoredRegex(creativeSource, { depth }));
            } catch {}
            let display = stored;
            try {
              display = normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(stored, { depth }));
            } catch {}
            return {
              ...m,
              avatar,
              raw: stored,
              content: display,
              status: m.status,
              meta,
            };
          }
          return {
            ...m,
            avatar,
            content: normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(creativeBase, { depth })),
            status: m.status,
            meta,
          };
        }
        return { ...m, avatar, content: base, status: m.status, meta }; // 保留 status 字段
      }
      if (m.role === 'user' && (m.type === 'text' || !m.type)) {
        return {
          ...m,
          avatar,
          content: window.appBridge.applyInputDisplayRegex(base, { depth }),
          status: m.status,
          meta,
        }; // 保留 status 字段
      }
      if (m.type === 'image') {
        const content = typeof m.content === 'string' ? m.content : '';
        const localPath = String(meta?.localPath || '').trim();
        if (isAttachmentExpired(meta)) {
          if (localPath) queueAttachmentCleanup(localPath, sessionId);
          const expiredMeta = meta && typeof meta === 'object' ? { ...meta, expired: true } : { expired: true };
          return {
            ...m,
            type: 'text',
            content: '[图片已过期]',
            avatar,
            status: m.status,
            meta: expiredMeta,
          };
        }
        if (localPath && (!content || content === '[binary omitted]')) {
          const localUrl = resolveLocalAttachmentUrl(localPath);
          if (localUrl) {
            return { ...m, avatar, content: localUrl, status: m.status, meta };
          }
        }
      }
      return { ...m, avatar, status: m.status, meta }; // 保留 status 字段
    });
  };

  const injectUnreadDivider = (messages = [], firstUnreadId = '') => {
    const list = Array.isArray(messages) ? messages.slice() : [];
    const targetId = String(firstUnreadId || '').trim();
    if (!targetId) return { list, dividerId: '' };
    const idx = list.findIndex(m => String(m?.id || '') === targetId);
    if (idx === -1) return { list, dividerId: '' };
    const dividerId = `unread-divider-${targetId}`;
    list.splice(idx, 0, {
      id: dividerId,
      role: 'system',
      type: 'divider',
      content: '以下为未读讯息',
      time: '',
      meta: { transient: true, kind: 'unread-divider' },
    });
    return { list, dividerId };
  };

  const getAssistantAvatarForSession = sessionId => {
    const c = contactsStore.getContact(sessionId);
    return resolveAvatarForContact(sessionId, c);
  };

  const getLastVisibleMessage = sessionId => {
    const msgs = chatStore.getMessages(sessionId) || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (isConversationMessage(msgs[i])) return msgs[i];
    }
    const fallback = chatStore.getLastMessage?.(sessionId) || null;
    if (fallback) return fallback;
    return null;
  };

  const snippetFromMessage = msg => {
    if (!msg) return '尚无聊天';
    if (msg.role === 'assistant' && (msg.type === 'text' || !msg.type)) {
      const summary = String(msg?.meta?.summary || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (summary) return summary.slice(0, 32);
    }
    switch (msg.type) {
      case 'image':
        return '[图片]';
      case 'audio':
        return '[语音]';
      case 'music':
        return `[音乐] ${msg.content || ''}`.trim();
      case 'transfer':
        return `[转账] ${msg.content || ''}`.trim();
      case 'sticker':
        return '[表情]';
      case 'document':
        return `[文件] ${msg.content || ''}`.trim();
      default: {
        const text = String(msg.content || '')
          .replace(/\s+/g, ' ')
          .trim();
        return text.slice(0, 32) || '...';
      }
    }
  };

  const formatSessionName = (sessionId, contact) => {
    const id = String(sessionId || '');
    const c = contact || contactsStore.getContact(id);
    const base = c?.name || (id.startsWith('group:') ? id.replace(/^group:/, '') : id);
    const isGroup = Boolean(c?.isGroup) || id.startsWith('group:');
    if (!isGroup) return base;
    const count = Array.isArray(c?.members) ? c.members.length : 0;
    return `${base}(${count})`;
  };

  const renderSessionNameHtml = (sessionId, contact) => {
    const id = String(sessionId || '');
    const c = contact || contactsStore.getContact(id);
    const isGroup = Boolean(c?.isGroup) || id.startsWith('group:');
    const text = formatSessionName(id, c);
    if (isGroup) return escapeHtml(text);
    const badges = getContactBadges(c);
    return buildNameWithBadgesHtml(text, badges);
  };

  const resolveAvatarForContact = (sessionId, contact) => {
    const id = String(sessionId || contact?.id || '').trim();
    const c = contact || contactsStore.getContact(id) || {};
    const isGroup = Boolean(c?.isGroup) || id.startsWith('group:');
    const tags = Array.isArray(c?.libraryTags) && c.libraryTags.length
      ? c.libraryTags
      : Array.isArray(c?.labels)
        ? c.labels
        : [];
    if (isGroup) {
      return resolveLineAvatar({
        avatar: c?.avatar || FEATHER_DEFAULT,
        name: c?.name || id,
        tags,
        size: 96,
      });
    }
    return resolveLineAvatar({
      avatar: c?.avatar || FEATHER_DEFAULT,
      name: c?.name || id,
      tags,
      size: 96,
    });
  };

  const getPendingCountForSession = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return 0;
    const inHistory = (chatStore.getMessages(sid) || []).filter(m => m?.status === 'pending').length;
    const inQueue = (chatStore.getPendingMessages(sid) || []).length;
    return inHistory + inQueue;
  };

  const parseStickerToken = value => {
    const raw = String(value || '').trim();
    const match = raw.match(/^\[bqb-([\s\S]+)\]$/i);
    if (!match) return '';
    return String(match[1] || '').trim();
  };

  const buildStickerToken = keyword => `[bqb-${keyword}]`;

  const extractStickerTokens = (text = '') => {
    const tokens = [];
    const re = /\[bqb-([\s\S]+?)\]/gi;
    let match = null;
    while ((match = re.exec(String(text || '')))) {
      const key = String(match[1] || '').trim();
      if (key) tokens.push(key);
    }
    return tokens;
  };

  const extractStickerTokenMatches = (text = '') => {
    const matches = [];
    const re = /\[bqb-([\s\S]+?)\]/gi;
    let match = null;
    while ((match = re.exec(String(text || '')))) {
      const key = String(match[1] || '').trim();
      if (!key) continue;
      matches.push({
        key,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return matches;
  };

  const resolveStickerKeywordFromText = (value, { allowLabel = false } = {}) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const tokenKey = parseStickerToken(raw);
    if (tokenKey) return tokenKey;
    const assetish = isLikelyUrl(raw) || isAssetRef(raw) || /[\\/]/.test(raw) || /\.(png|jpe?g|webp|gif)$/i.test(raw);
    if (!allowLabel && !assetish) return '';
    const resolved = resolveMediaAsset('sticker', raw);
    if (resolved?.item && resolved.item.kind !== 'sticker') return '';
    const label = String(resolved?.item?.label || '').trim();
    if (label && (allowLabel || assetish)) return label;
    const id = String(resolved?.item?.id || '').trim();
    if (id && (allowLabel || assetish)) return id;
    if (!assetish) return '';
    const base = raw.split(/[\\/]/).pop() || '';
    const file = base.split('?')[0].split('#')[0];
    return file.replace(/\.[a-z0-9]+$/i, '').trim();
  };

  const resolveStickerKeywordForMessage = message => {
    if (!message || typeof message !== 'object') return '';
    const raw = typeof message.raw === 'string' ? message.raw.trim() : '';
    const rawKey = parseStickerToken(raw);
    if (rawKey) return rawKey;
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
    const metaLabel = String(meta?.assetLabel || '').trim();
    if (metaLabel) return metaLabel;
    const metaId = String(meta?.assetId || '').trim();
    if (metaId) return metaId;
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    return resolveStickerKeywordFromText(content, { allowLabel: message.type === 'sticker' });
  };

  const normalizeStickerTextForPrompt = text => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const key = resolveStickerKeywordFromText(raw, { allowLabel: false });
    return key ? buildStickerToken(key) : raw;
  };

  const getMessageSendText = message => {
    if (!message || typeof message !== 'object') return '';
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
    if (meta?.attachmentsOnly) return '';
    const raw = typeof message.raw === 'string' ? message.raw.trim() : '';
    if (raw) return raw;
    if (message.type === 'sticker') {
      const key = String(message.content || '').trim();
      return key ? buildStickerToken(key) : '';
    }
    if (message.type === 'image') return '[图片]';
    if (message.type === 'audio') return '[语音]';
    if (message.type === 'document') return `[文件] ${message.content || ''}`.trim();
    return String(message.content || '').trim();
  };

  const insertStickerToken = keyword => {
    if (!composerInput) return;
    const key = String(keyword || '').trim();
    if (!key) return;
    const token = buildStickerToken(key);
    const start = Number.isFinite(composerInput.selectionStart)
      ? composerInput.selectionStart
      : composerInput.value.length;
    const end = Number.isFinite(composerInput.selectionEnd) ? composerInput.selectionEnd : composerInput.value.length;
    const before = composerInput.value.slice(0, start);
    const after = composerInput.value.slice(end);
    const needsLeftSpace = Boolean(before) && !/\s$/.test(before);
    const needsRightSpace = Boolean(after) && !/^\s/.test(after);
    const next = `${before}${needsLeftSpace ? ' ' : ''}${token}${needsRightSpace ? ' ' : ''}${after}`;
    composerInput.value = next;
    const caret = (before + (needsLeftSpace ? ' ' : '') + token).length + (needsRightSpace ? 1 : 0);
    try {
      composerInput.selectionStart = composerInput.selectionEnd = caret;
    } catch {}
    try {
      composerInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  };

  const removeStickerTokenByIndex = tokenIndex => {
    if (!composerInput) return;
    const value = String(composerInput.value || '');
    const matches = extractStickerTokenMatches(value);
    const target = matches[tokenIndex];
    if (!target) return;
    const before = value.slice(0, target.start);
    const after = value.slice(target.end);
    const beforeTrim = before.replace(/\s*$/, '');
    const afterTrim = after.replace(/^\s*/, '');
    const needsSpace = /\S$/.test(beforeTrim) && /^\S/.test(afterTrim);
    const next = `${beforeTrim}${needsSpace ? ' ' : ''}${afterTrim}`;
    composerInput.value = next;
    const caret = beforeTrim.length + (needsSpace ? 1 : 0);
    try {
      composerInput.selectionStart = composerInput.selectionEnd = caret;
    } catch {}
    try {
      composerInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  };

  const STICKER_PACK_TAB_PREFIX = 'pack:';
  const STICKER_PACK_COLORS = ['#ff6b6b', '#ff9f43', '#ffd93d', '#6bcb77', '#4dd0e1', '#5c7cfa', '#b197fc'];
  const STICKER_PACK_ASSET_SESSION = 'sticker_pack_assets';
  const STICKER_ICON_SESSION = 'sticker_pack_icons';
  const STICKER_AI_ASSET_SESSION = 'sticker_ai_assets';
  const STICKER_EXPORT_SESSION = 'sticker_export';
  const STICKER_AI_STATE_KEY = 'sticker_ai_state_v1';
  const STICKER_SOFT_IMAGE_BYTES = 600_000;
  const STICKER_SOFT_GIF_BYTES = 2_000_000;
  const STICKER_SOFT_PACK_LIMIT = 72;
  const STICKER_SOFT_TOTAL_LIMIT = 400;
  const STICKER_ANIM_DEFAULT_FPS = 12;
  const clampStickerFps = (value, fallback = STICKER_ANIM_DEFAULT_FPS) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(60, Math.max(1, Math.trunc(num)));
  };
  let stickerPackState = stickerPackStore.getState();
  let stickerPackDeleteMode = false;
  let stickerPackDeleteTarget = '';
  let activeStickerEditor = null;
  const stickerLoadErrorKeys = new Set();
  const STICKER_AI_TEMPLATE = `
A 4K resolution, 16:9 image featuring a character sheet with a 4x6 grid layout.
Style: cute Q-version (Chibi) anime art, resembling LINE stickers, full-body portraits.
Background: solid white. Split by clean lines between each block.
Subject: the character from the reference image. Redesign the poses creatively.
Crucial: ensure headwear/accessories are drawn correctly and consistently.
No text. Clean outlines, flat colors typical of sticker packs.
No numbers, no labels, no index markers.
Atmosphere: pink, bubbly, extremely girly.
第一排（日常互动与可爱系）：...
第二排（打工/学习/生活状态）：...
`;
  const STICKER_AI_SPRITE_TEMPLATE = `
任务：
根据用户输入，生成一份完整、可直接丢给生图模型的专业提示词，用<prompt>...</prompt>包裹。

---

## 固定画面结构（不可更改）
- 画布：正方形
- 布局：6×6 = 36 格 Sprite Sheet
- 播放顺序：从左上 → 右下
- 风格：像素风（或用户选择风格）
- 背景：纯白
- 每一格之间：必须有 1px 细线分隔，方便切割
- 主体与特效：不可出界
- 动作连贯性：每一格必须与上一格自然衔接
- 结尾必须能无缝回到第 1 格
- 不要文字、水印、数字、序号或多余标记

---

## 7 阶段结构（可根据用户输入调整）
Phase A（Frames 1–4）：基准姿态
Phase B（Frames 5–10）：张力积累
Phase C（Frames 11–17）：能量/动态汇聚
Phase D（Frames 18–25）：高潮爆发
Phase E（Frames 26–31）：余波扩散
Phase F（Frames 32–35）：回归平衡
Phase G（Frame 36）：循环衔接

---

## 视觉风格补充
- 像素等级：按用户输入
- 色彩基调：按用户输入
- 视觉特效：按主题设计但不得遮挡主体

---

## 输出要求
- 只输出完整提示词，用<prompt>...</prompt>包裹，不要解释
- 结尾必须包含：
"Output as one single 6×6 sprite sheet image with thin grid lines."
`;
  const canUseApiConfig = config => {
    const cfg = config || {};
    const hasKey = typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0;
    const hasVertexSa =
      cfg.provider === 'vertexai' &&
      typeof cfg.vertexaiServiceAccount === 'string' &&
      cfg.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
  };
  const ensureChatConfigReady = async () => {
    const config = await chatConfigManager.load();
    if (!canUseApiConfig(config)) {
      window.toastr?.warning?.('请先配置聊天模型 API');
      try {
        stickerAiModal?.hide?.();
      } catch {}
      configPanel.show({ tab: 'chat' });
      return null;
    }
    return config;
  };
  const ensureImageConfigReady = async () => {
    const config = await imageConfigManager.load();
    if (!canUseApiConfig(config)) {
      window.toastr?.warning?.('请先配置图片生成 API');
      try {
        stickerAiModal?.hide?.();
      } catch {}
      configPanel.show({ tab: 'image' });
      return null;
    }
    return config;
  };

  const getStickerLoadErrors = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g.__stickerLoadErrors) g.__stickerLoadErrors = [];
    return g.__stickerLoadErrors;
  };

  const formatStickerDebugValue = (value, maxLen = 160) => {
    const raw = String(value || '');
    if (!raw) return '';
    if (raw.startsWith('data:')) {
      return `data:${raw.slice(0, 24)}...(${raw.length})`;
    }
    if (raw.length > maxLen) return `${raw.slice(0, maxLen)}...`;
    return raw;
  };

  const recordStickerLoadError = (detail = {}) => {
    const payload = {
      time: new Date().toISOString(),
      packId: String(detail.packId || '').trim(),
      stickerId: String(detail.stickerId || '').trim(),
      keyword: String(detail.keyword || '').trim(),
      url: formatStickerDebugValue(detail.url),
    };
    const key = `${payload.packId}|${payload.stickerId}|${payload.url}`;
    if (stickerLoadErrorKeys.has(key)) return;
    stickerLoadErrorKeys.add(key);
    const errors = getStickerLoadErrors();
    errors.push(payload);
    if (errors.length > 50) errors.shift();
    logger.warn(
      `贴图加载失败 pack=${payload.packId || '无'} sticker=${payload.stickerId || '无'} key=${
        payload.keyword || '空'
      } url=${payload.url || '空'}`,
    );
  };

  const createFilePicker = (accept, { multiple = false } = {}) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = Boolean(multiple);
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  };

  const stickerFilePicker = createFilePicker('image/*', { multiple: true });
  const stickerIconPicker = createFilePicker('image/*', { multiple: false });
  const stickerPackIconManagePicker = createFilePicker('image/*', { multiple: false });
  const stickerAiReferencePicker = createFilePicker('image/*', { multiple: true });
  const stickerAiUploadPicker = createFilePicker('image/*', { multiple: true });

  const readFileAsDataUrl = file => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const readFileAsBase64 = file => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!result) {
          resolve('');
          return;
        }
        const bytes = new Uint8Array(result);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const slice = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...slice);
        }
        resolve(btoa(binary));
      };
      reader.onerror = () => resolve('');
      reader.readAsArrayBuffer(file);
    });
  };

  const hasTauriRuntime = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
  };

  const sanitizeExportName = (value, fallback = 'download') => {
    const raw = String(value || '').trim();
    const cleaned = raw.replace(/[\\/:*?"<>|]+/g, '_');
    return cleaned || fallback;
  };

  const pickSavePath = async ({ defaultName, filters }) => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const result = await save({ defaultPath: defaultName, filters });
      if (!result) return { path: '', cancelled: true };
      return { path: result, cancelled: false };
    } catch {
      return { path: '', cancelled: false };
    }
  };

  const exportAttachmentFile = async ({
    dataUrl = '',
    sourcePath = '',
    fileName = '',
    filters = [],
    bytes = null,
    mimeType = '',
    skipStream = false,
  } = {}) => {
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持下载');
      return '';
    }
    const safeName = sanitizeExportName(fileName, 'download');
    const pick = await pickSavePath({ defaultName: safeName, filters });
    if (pick.cancelled) return '';
    let tempPath = '';
    try {
      let resolvedDataUrl = dataUrl || '';
      let resolvedSourcePath = sourcePath || '';
      const rawBytes = bytes ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : null;
      if (!resolvedSourcePath && rawBytes && rawBytes.length) {
        try {
          tempPath = await saveStickerAssetBytesStreamed(rawBytes, safeName, STICKER_EXPORT_SESSION, mimeType);
          if (tempPath) {
            resolvedSourcePath = tempPath;
            resolvedDataUrl = '';
          }
        } catch (err) {
          logger.warn('附件导出字节流写入失败', err);
          window.toastr?.error?.('附件写入失败');
          return '';
        }
      }
      if (resolvedDataUrl && !resolvedSourcePath) {
        const { mime } = parseDataUrlPayload(resolvedDataUrl);
        const bytes = estimateDataUrlBytes(resolvedDataUrl);
        const shouldStream = !skipStream && (mime === 'image/gif' || bytes > STICKER_STREAM_THRESHOLD_BYTES);
        if (shouldStream) {
          try {
            tempPath = await saveStickerAssetStreamed(resolvedDataUrl, safeName, STICKER_EXPORT_SESSION);
            if (tempPath) {
              resolvedSourcePath = tempPath;
              resolvedDataUrl = '';
            }
          } catch (err) {
            logger.warn('附件导出流式写入失败，回退普通导出', err);
          }
        }
      }
      const resp = await safeInvoke('export_attachment', {
        dataUrl: resolvedDataUrl,
        sourcePath: resolvedSourcePath,
        fileName: safeName,
        path: pick.path || '',
      });
      const savedPath = String(resp?.path || '').trim();
      if (savedPath) window.toastr?.success?.(`已下载：${savedPath}`);
      return savedPath;
    } catch (err) {
      window.toastr?.error?.(`下载失败：${err?.message || '未知错误'}`);
      return '';
    } finally {
      if (tempPath) {
        safeInvoke('delete_attachment', { sessionId: STICKER_EXPORT_SESSION, path: tempPath }).catch(() => {});
      }
    }
  };

  const exportStickerGifFile = async ({ frames = [], fps = STICKER_ANIM_DEFAULT_FPS, fileName = '' } = {}) => {
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持下载');
      return '';
    }
    const list = Array.isArray(frames) ? frames.map(item => String(item || '').trim()).filter(Boolean) : [];
    if (list.length < 2) {
      window.toastr?.warning?.('动图帧不足，无法下载');
      return '';
    }
    const safeName = sanitizeExportName(fileName, 'sticker.gif');
    const pick = await pickSavePath({ defaultName: safeName, filters: [{ name: 'GIF', extensions: ['gif'] }] });
    if (pick.cancelled) return '';
    try {
      const resp = await safeInvoke('export_sticker_gif', {
        frames: list,
        fps: clampStickerFps(fps),
        fileName: safeName,
        path: pick.path || '',
      });
      const savedPath = String(resp?.path || '').trim();
      if (savedPath) window.toastr?.success?.(`已下载：${savedPath}`);
      return savedPath;
    } catch (err) {
      window.toastr?.error?.(`下载动图失败：${err?.message || '未知错误'}`);
      return '';
    }
  };

  const exportStickerZip = async ({ entries = [], fileName = '' } = {}) => {
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持下载');
      return '';
    }
    if (!entries.length) {
      window.toastr?.warning?.('暂无可下载的切割结果');
      return '';
    }
    const safeName = sanitizeExportName(fileName, 'sticker_slices.zip');
    const pick = await pickSavePath({ defaultName: safeName, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    if (pick.cancelled) return '';
    try {
      const resp = await safeInvoke('export_sticker_zip', {
        entries,
        fileName: safeName,
        path: pick.path || '',
      });
      const savedPath = String(resp?.path || '').trim();
      if (savedPath) window.toastr?.success?.(`已下载：${savedPath}`);
      return savedPath;
    } catch (err) {
      window.toastr?.error?.(`下载失败：${err?.message || '未知错误'}`);
      return '';
    }
  };

  const ensureFileExtension = (name, ext) => {
    const raw = String(name || '').trim();
    if (!raw) return ext ? `download.${ext}` : 'download';
    if (!ext) return raw;
    if (/\.[a-z0-9]+$/i.test(raw)) return raw;
    return `${raw}.${ext}`;
  };

  const inferImageExtension = (dataUrl, fallback = 'png') => {
    const raw = String(dataUrl || '').trim();
    if (!raw.startsWith('data:')) return fallback;
    const { mime } = parseDataUrlPayload(raw);
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/png') return 'png';
    return fallback;
  };

  const readUrlAsDataUrl = async (url) => {
    const src = String(url || '').trim();
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    try {
      const resp = await fetch(src);
      if (!resp.ok) return '';
      const blob = await resp.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const loadImageElement = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load image failed'));
    img.src = src;
  });

  const GIF_TRANSPARENT_INDEX = 255;
  const GIF_ALPHA_THRESHOLD = 1;
  const GIF_MIN_CODE_SIZE = 8;
  const buildGifPalette = () => {
    const palette = new Uint8Array(256 * 3);
    let idx = 0;
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          const offset = idx * 3;
          palette[offset] = r * 51;
          palette[offset + 1] = g * 51;
          palette[offset + 2] = b * 51;
          idx += 1;
        }
      }
    }
    for (let i = idx; i < 256; i++) {
      const offset = i * 3;
      palette[offset] = 0;
      palette[offset + 1] = 0;
      palette[offset + 2] = 0;
    }
    return palette;
  };
  const quantizeToPalette = (imageData, width, height) => {
    const total = width * height;
    const indices = new Uint8Array(total);
    const data = imageData.data;
    for (let i = 0; i < total; i++) {
      const offset = i * 4;
      const alpha = data[offset + 3];
      if (alpha < GIF_ALPHA_THRESHOLD) {
        indices[i] = GIF_TRANSPARENT_INDEX;
        continue;
      }
      const r = Math.round(data[offset] / 51);
      const g = Math.round(data[offset + 1] / 51);
      const b = Math.round(data[offset + 2] / 51);
      indices[i] = r * 36 + g * 6 + b;
    }
    return indices;
  };
  const lzwEncode = (indices, minCodeSize) => {
    if (!indices.length) return new Uint8Array();
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    const dict = new Map();
    const out = [];
    let cur = 0;
    let bits = 0;
    const pushCode = code => {
      cur |= code << bits;
      bits += codeSize;
      while (bits >= 8) {
        out.push(cur & 0xff);
        cur >>= 8;
        bits -= 8;
      }
    };
    pushCode(clearCode);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const next = indices[i];
      const key = `${prefix},${next}`;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      pushCode(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize += 1;
        }
      } else {
        pushCode(clearCode);
        dict.clear();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      }
      prefix = next;
    }
    pushCode(prefix);
    pushCode(endCode);
    if (bits > 0) out.push(cur & 0xff);
    return new Uint8Array(out);
  };
  const bytesToBase64 = bytes => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }
    return btoa(binary);
  };
  const encodeGifFrames = (frames, width, height, fps) => {
    const palette = buildGifPalette();
    const bytes = [];
    const pushByte = val => bytes.push(val & 0xff);
    const pushString = str => {
      for (let i = 0; i < str.length; i++) pushByte(str.charCodeAt(i));
    };
    const pushUint16 = val => {
      pushByte(val & 0xff);
      pushByte((val >> 8) & 0xff);
    };
    const pushSubBlocks = data => {
      let offset = 0;
      while (offset < data.length) {
        const size = Math.min(255, data.length - offset);
        pushByte(size);
        for (let i = 0; i < size; i++) pushByte(data[offset + i]);
        offset += size;
      }
      pushByte(0);
    };
    const delay = Math.max(1, Math.round(100 / Math.max(1, fps)));
    pushString('GIF89a');
    pushUint16(width);
    pushUint16(height);
    pushByte(0xf7);
    pushByte(0);
    pushByte(0);
    for (let i = 0; i < palette.length; i++) pushByte(palette[i]);
    pushByte(0x21);
    pushByte(0xff);
    pushByte(0x0b);
    pushString('NETSCAPE2.0');
    pushByte(0x03);
    pushByte(0x01);
    pushByte(0x00);
    pushByte(0x00);
    pushByte(0x00);
    frames.forEach(frame => {
      const indices = quantizeToPalette(frame, width, height);
      const lzw = lzwEncode(indices, GIF_MIN_CODE_SIZE);
      pushByte(0x21);
      pushByte(0xf9);
      pushByte(0x04);
      pushByte(0x09);
      pushUint16(delay);
      pushByte(GIF_TRANSPARENT_INDEX);
      pushByte(0x00);
      pushByte(0x2c);
      pushUint16(0);
      pushUint16(0);
      pushUint16(width);
      pushUint16(height);
      pushByte(0x00);
      pushByte(GIF_MIN_CODE_SIZE);
      pushSubBlocks(lzw);
    });
    pushByte(0x3b);
    return new Uint8Array(bytes);
  };



  const buildGifFramesFromSources = async (sources) => {
    const list = (sources || []).filter(Boolean);
    if (!list.length) return null;
    const images = [];
    for (const src of list) {
      let resolved = src;
      if (!String(src || '').startsWith('data:')) {
        const dataUrl = await readUrlAsDataUrl(src);
        if (dataUrl) resolved = dataUrl;
      }
      try {
        const img = await loadImageElement(resolved);
        images.push(img);
      } catch {
        return null;
      }
    }
    const maxW = Math.max(...images.map(img => img.naturalWidth || img.width || 0));
    const maxH = Math.max(...images.map(img => img.naturalHeight || img.height || 0));
    if (!maxW || !maxH) return null;
    const canvas = document.createElement('canvas');
    canvas.width = maxW;
    canvas.height = maxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const frames = [];
    for (const img of images) {
      try {
        ctx.clearRect(0, 0, maxW, maxH);
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        const x = Math.floor((maxW - width) / 2);
        const y = Math.floor((maxH - height) / 2);
        if (width && height) {
          ctx.drawImage(img, x, y, width, height);
        } else {
          ctx.drawImage(img, x, y);
        }
        frames.push(ctx.getImageData(0, 0, maxW, maxH));
      } catch {
        return null;
      }
    }
    if (!frames.length) return null;
    return { frames, width: maxW, height: maxH };
  };

  const buildGifBytesFromSources = async (sources, fps) => {
    const frameData = await buildGifFramesFromSources(sources);
    if (!frameData) return null;
    const bytes = encodeGifFrames(frameData.frames, frameData.width, frameData.height, fps);
    return {
      bytes,
      frameCount: frameData.frames.length,
      width: frameData.width,
      height: frameData.height,
    };
  };

  const buildGifDataUrlFromSources = async (sources, fps) => {
    const frameData = await buildGifFramesFromSources(sources);
    if (!frameData) return null;
    const bytes = encodeGifFrames(frameData.frames, frameData.width, frameData.height, fps);
    const base64 = bytesToBase64(bytes);
    return {
      dataUrl: `data:image/gif;base64,${base64}`,
      byteLength: bytes.length,
      frameCount: frameData.frames.length,
      width: frameData.width,
      height: frameData.height,
    };
  };

  const downloadChatAttachment = async (message) => {
    if (!message || typeof message !== 'object') return;
    const type = String(message.type || '').trim();
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : {};
    if (type === 'image') {
      const localPath = String(meta.localPath || '').trim();
      const baseName = sanitizeExportName(meta.originalName || message.content || 'image', 'image');
      if (localPath) {
        await exportAttachmentFile({
          sourcePath: localPath,
          fileName: ensureFileExtension(baseName, 'png'),
          filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        return;
      }
      const dataUrl = await readUrlAsDataUrl(message.content || '');
      if (!dataUrl) {
        window.toastr?.warning?.('无法读取图片内容');
        return;
      }
      const ext = inferImageExtension(dataUrl, 'png');
      await exportAttachmentFile({
        dataUrl,
        fileName: ensureFileExtension(baseName, ext),
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      return;
    }
    if (type === 'sticker') {
      try {
        const keyword = resolveStickerKeywordForMessage(message) || String(message.content || '').trim();
        const lookupKey = keyword || String(message.content || '').trim();
        const resolved = resolveMediaAsset('sticker', lookupKey) || resolveMediaAsset('image', lookupKey);
        const frames = resolveStickerFramesByKeyword(lookupKey, resolved?.item).filter(Boolean);
        const fps = resolveStickerFpsByKeyword(lookupKey, resolved?.item) || STICKER_ANIM_DEFAULT_FPS;
        if (frames.length > 1) {
          const framePaths = resolveStickerFramePathsByKeyword(lookupKey, resolved?.item).filter(Boolean);
          if (framePaths.length < 2) {
            window.toastr?.warning?.('动图资源不可下载');
            return;
          }
          const baseName = sanitizeExportName(keyword || 'sticker', 'sticker').replace(/\.[a-z0-9]+$/i, '') || 'sticker';
          await exportStickerGifFile({
            frames: framePaths,
            fps,
            fileName: ensureFileExtension(baseName, 'gif'),
          });
          return;
        }
        const src = resolved?.url || frames[0] || '';
        if (!src) {
          window.toastr?.warning?.('未找到贴图资源');
          return;
        }
        const dataUrl = await readUrlAsDataUrl(src);
        if (!dataUrl) {
          window.toastr?.warning?.('无法读取贴图内容');
          return;
        }
        const ext = inferImageExtension(dataUrl, 'png');
        await exportAttachmentFile({
          dataUrl,
          fileName: ensureFileExtension(sanitizeExportName(keyword || 'sticker', 'sticker'), ext),
          filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        return;
      } catch (err) {
        window.toastr?.error?.(`下载动图失败：${err?.message || '未知错误'}`);
        return;
      }
    }
    if (type === 'document') {
      const localPath = String(meta.localPath || '').trim();
      if (!localPath) {
        window.toastr?.warning?.('未找到附件文件');
        return;
      }
      const name = meta.originalName || message.content || 'document';
      await exportAttachmentFile({
        sourcePath: localPath,
        fileName: sanitizeExportName(name, 'document'),
      });
    }
  };

  const resolveLocalStickerUrl = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : window;
      const convert =
        g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
      if (typeof convert === 'function') {
        const converted = convert(raw);
        if (converted) return converted;
      }
    } catch {}
    if (/^(file|asset|tauri|app|https?|data|blob):/i.test(raw)) return raw;
    if (/^[a-zA-Z]:[\\/]/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`;
    if (raw.startsWith('/')) return `file://${raw}`;
    return raw;
  };

  const buildCustomStickerAssets = state => {
    const items = [];
    const packs = Array.isArray(state?.packs) ? state.packs : [];
    packs.forEach(pack => {
      const stickers = Array.isArray(pack?.stickers) ? pack.stickers : [];
      stickers.forEach(sticker => {
        const id = String(sticker?.id || '').trim();
        const frames = Array.isArray(sticker?.frames)
          ? sticker.frames.map(frame => String(frame || '').trim()).filter(Boolean)
          : [];
        const file = String(sticker?.path || sticker?.dataUrl || frames[0] || '').trim();
        if (!id || !file) return;
        const keyword = String(sticker?.keyword || '').trim();
        const aliases = [];
        if (keyword && keyword !== id) aliases.push(keyword);
        const name = String(sticker?.name || '').trim();
        if (name) aliases.push(name);
        const fps = Number(sticker?.fps);
        items.push({
          kind: 'sticker',
          id,
          label: keyword,
          file,
          aliases,
          frames,
          fps: Number.isFinite(fps) ? fps : 0,
        });
      });
    });
    return items;
  };

  const syncStickerPackState = (nextState = null) => {
    stickerPackState = nextState || stickerPackStore.getState();
    setCustomMediaItems(buildCustomStickerAssets(stickerPackState));
    return stickerPackState;
  };
  syncStickerPackState();

  const formatStickerPackLabel = (pack, index = 0) => {
    const name = String(pack?.name || '').trim();
    if (name) return name;
    const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
    return `贴图包${safeIndex + 1}`;
  };

  const createStickerPack = () => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pack_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const packCount = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs.length : 0;
    const nextIndex = packCount;
    const colorIndex = STICKER_PACK_COLORS.length ? nextIndex % STICKER_PACK_COLORS.length : 0;
    const pack = {
      id,
      name: '',
      colorIndex,
      iconPath: '',
      iconDataUrl: '',
      iconMeta: { zoom: 1, rotate: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 },
      boundSessions: [],
      aiEnabled: false,
      stickers: [],
    };
    const nextState = stickerPackStore.upsertPack(pack);
    syncStickerPackState(nextState);
    return pack;
  };

  const getStickerPackIdFromTab = tab => {
    const raw = String(tab || '').trim();
    if (!raw.startsWith(STICKER_PACK_TAB_PREFIX)) return '';
    return raw.slice(STICKER_PACK_TAB_PREFIX.length);
  };

  const getStickerPackById = id => {
    const key = String(id || '').trim();
    if (!key) return null;
    return (stickerPackState?.packs || []).find(p => p.id === key) || null;
  };

  const resolveStickerMediaUrl = item => {
    if (!item || typeof item !== 'object') return '';
    if (item.dataUrl) return String(item.dataUrl || '').trim();
    if (item.path) return resolveLocalStickerUrl(item.path);
    const frames = Array.isArray(item.frames) ? item.frames : [];
    if (frames.length) return resolveLocalStickerUrl(frames[0]);
    return '';
  };
  const resolveStickerFrameSources = item => {
    const frames = Array.isArray(item?.frames) ? item.frames : [];
    return frames.map(frame => resolveLocalStickerUrl(frame)).filter(Boolean);
  };
  const resolveStickerFramePaths = item => {
    const frames = Array.isArray(item?.frames) ? item.frames : [];
    return frames.map(frame => String(frame || '').trim()).filter(Boolean);
  };
  const normalizeStickerKeywordKey = value => String(value || '').trim().toLowerCase();
  const findStickerByKeyword = keyword => {
    const key = normalizeStickerKeywordKey(keyword);
    if (!key) return null;
    const packs = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs : [];
    for (const pack of packs) {
      const stickers = Array.isArray(pack?.stickers) ? pack.stickers : [];
      for (const sticker of stickers) {
        const stickerKey = normalizeStickerKeywordKey(sticker?.keyword || sticker?.id);
        if (stickerKey && stickerKey === key) return sticker;
      }
    }
    return null;
  };
  const resolveStickerFramesByKeyword = (keyword, resolvedItem) => {
    const primary = resolveStickerFrameSources(resolvedItem);
    if (primary.length > 1) return primary;
    const fallback = findStickerByKeyword(keyword);
    if (!fallback) return primary;
    const next = resolveStickerFrameSources(fallback);
    return next.length ? next : primary;
  };
  const resolveStickerFramePathsByKeyword = (keyword, resolvedItem) => {
    const primary = resolveStickerFramePaths(resolvedItem);
    if (primary.length > 1) return primary;
    const fallback = findStickerByKeyword(keyword);
    if (!fallback) return primary;
    const next = resolveStickerFramePaths(fallback);
    return next.length ? next : primary;
  };
  const resolveStickerFpsByKeyword = (keyword, resolvedItem) => {
    const rawPrimary = Number(resolvedItem?.fps);
    if (Number.isFinite(rawPrimary) && rawPrimary > 0) return clampStickerFps(rawPrimary);
    const fallback = findStickerByKeyword(keyword);
    return clampStickerFps(fallback?.fps);
  };
  const startStickerFrameAnimation = (img, frames, fps) => {
    if (!img) return false;
    const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
    if (list.length < 2) {
      if (list.length) img.src = list[0];
      return false;
    }
    let index = 0;
    img.src = list[0];
    const interval = Math.max(16, Math.round(1000 / Math.max(1, Number(fps) || 1)));
    const timer = setInterval(() => {
      if (!img.isConnected) {
        clearInterval(timer);
        return;
      }
      index = (index + 1) % list.length;
      img.src = list[index];
    }, interval);
    return true;
  };

  const applyStickerTabIconTransform = (img, meta) => {
    if (!img || !meta) return;
    const wrap = img.parentElement;
    const rect = wrap?.getBoundingClientRect?.();
    const cw = rect?.width || 20;
    const ch = rect?.height || 20;
    const iw = Number(meta?.width) || img.naturalWidth || 0;
    const ih = Number(meta?.height) || img.naturalHeight || 0;
    if (!iw || !ih || !cw || !ch) return;
    const baseScale = Math.max(cw / iw, ch / ih);
    const zoom = Number(meta?.zoom || 1);
    const rotate = Number(meta?.rotate || 0);
    const offsetX = Number(meta?.offsetX || 0) * cw;
    const offsetY = Number(meta?.offsetY || 0) * ch;
    img.classList.add('is-transformed');
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;
    img.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${rotate}deg) scale(${baseScale * zoom})`;
    img.style.transformOrigin = 'center';
  };

  const buildStickerTabIcon = ({ url = '', alt = '', meta = null } = {}) => {
    if (!url) return null;
    const wrap = document.createElement('span');
    wrap.className = 'sticker-tab-icon-wrap';
    const img = document.createElement('img');
    img.className = 'sticker-tab-icon-img';
    img.src = url;
    img.alt = alt || '贴图包';
    wrap.appendChild(img);
    if (meta) {
      const apply = () => applyStickerTabIconTransform(img, meta);
      img.addEventListener('load', apply);
      if (img.complete) apply();
    }
    return wrap;
  };

  const formatStickerNameSuggestion = (name, index) => {
    const raw = String(name || '').trim();
    if (raw) return raw.replace(/\.[a-z0-9]+$/i, '');
    return `贴图${index + 1}`;
  };
  const formatStickerFileSize = bytes => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${Math.round(size)} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  };
  const estimateDataUrlBytes = dataUrl => {
    const raw = String(dataUrl || '').trim();
    if (!raw.startsWith('data:')) return raw.length;
    const comma = raw.indexOf(',');
    if (comma < 0) return raw.length;
    const base64 = raw.slice(comma + 1);
    const padding = (base64.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  };
  const STICKER_STREAM_THRESHOLD_BYTES = 800_000;
  const STICKER_STREAM_CHUNK_SIZE = 64 * 1024;

  const parseDataUrlPayload = dataUrl => {
    const raw = String(dataUrl || '').trim();
    const comma = raw.indexOf(',');
    if (comma < 0) return { mime: '', base64: '' };
    const meta = raw.slice(5, comma);
    const mime = meta.split(';')[0] || '';
    return { mime, base64: raw.slice(comma + 1) };
  };

  const saveStickerAssetStreamed = async (dataUrl, fileName, sessionId) => {
    const { mime, base64 } = parseDataUrlPayload(dataUrl);
    if (!base64) return '';
    const startResp = await safeInvoke('save_attachment_stream_start', {
      sessionId: String(sessionId || STICKER_PACK_ASSET_SESSION),
      fileName: fileName || '',
      mimeType: mime || '',
    });
    const uploadId = startResp?.upload_id || startResp?.uploadId;
    if (!uploadId) throw new Error('invalid attachment upload id');
    const chunkSize = Math.max(4, STICKER_STREAM_CHUNK_SIZE - (STICKER_STREAM_CHUNK_SIZE % 4));
    for (let offset = 0; offset < base64.length; offset += chunkSize) {
      const chunk = base64.slice(offset, offset + chunkSize);
      await safeInvoke('save_attachment_stream_chunk', { uploadId, chunk });
    }
    const finishResp = await safeInvoke('save_attachment_stream_finish', { uploadId });
    return String(finishResp?.path || startResp?.path || '').trim();
  };

  const saveStickerAssetBytesStreamed = async (bytes, fileName, sessionId, mimeType = '') => {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!raw.length) return '';
    const startResp = await safeInvoke('save_attachment_stream_start', {
      sessionId: String(sessionId || STICKER_PACK_ASSET_SESSION),
      fileName: fileName || '',
      mimeType: mimeType || '',
    });
    const uploadId = startResp?.upload_id || startResp?.uploadId;
    if (!uploadId) throw new Error('invalid attachment upload id');
    const chunkSize = Math.max(3, STICKER_STREAM_CHUNK_SIZE - (STICKER_STREAM_CHUNK_SIZE % 3));
    for (let offset = 0; offset < raw.length; offset += chunkSize) {
      const chunkBytes = raw.subarray(offset, offset + chunkSize);
      const chunk = bytesToBase64(chunkBytes);
      await safeInvoke('save_attachment_stream_chunk', { uploadId, chunk });
    }
    const finishResp = await safeInvoke('save_attachment_stream_finish', { uploadId });
    return String(finishResp?.path || startResp?.path || '').trim();
  };

  const saveStickerAsset = async (dataUrl, fileName, sessionId, options = {}) => {
    const payload = String(dataUrl || '').trim();
    if (!payload.startsWith('data:image/')) return '';
    const fileLower = String(fileName || '').trim().toLowerCase();
    const { mime } = parseDataUrlPayload(payload);
    const bytes = estimateDataUrlBytes(payload);
    const forceStream = Boolean(options?.forceStream) || mime === 'image/gif' || fileLower.endsWith('.gif');
    try {
      if (forceStream || bytes > STICKER_STREAM_THRESHOLD_BYTES) {
        try {
          const streamedPath = await saveStickerAssetStreamed(payload, fileName, sessionId);
          if (streamedPath) return streamedPath;
        } catch (err) {
          logger.warn('附件流式保存失败，回退普通保存', err);
        }
      }
      const resp = await safeInvoke('save_attachment', {
        sessionId: String(sessionId || STICKER_PACK_ASSET_SESSION),
        dataUrl: payload,
        fileName: fileName || '',
      });
      const savedPath = String(resp?.path || '').trim();
      const savedBytes = Number(resp?.bytes || 0);
      if (forceStream && savedPath && bytes && savedBytes && savedBytes < bytes) {
        try {
          const streamedPath = await saveStickerAssetStreamed(payload, fileName, sessionId);
          return streamedPath || savedPath;
        } catch (err) {
          logger.warn('附件流式保存补救失败', err);
        }
      }
      return savedPath;
    } catch {
      return '';
    }
  };

  const pickFilesFromInput = input => {
    return new Promise(resolve => {
      input.onchange = () => {
        const files = Array.from(input.files || []).filter(Boolean);
        input.value = '';
        resolve(files);
      };
      input.click();
    });
  };

  const ensureStickerKeywords = pack => {
    const next = { ...pack };
    const stickers = Array.isArray(pack?.stickers) ? pack.stickers.map(s => ({ ...s })) : [];
    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i];
      if (String(sticker.keyword || '').trim()) continue;
      const suggestion = formatStickerNameSuggestion(sticker.name, i);
      const raw = prompt(`请输入贴图关键词（用于 AI 调用）`, suggestion);
      if (raw === null) return { ok: false, pack };
      const keyword = String(raw || '').trim();
      if (!keyword) return { ok: false, pack };
      sticker.keyword = keyword;
      stickers[i] = sticker;
    }
    next.stickers = stickers;
    return { ok: true, pack: next };
  };

  const removeStickerFromPack = async (packId, stickerId) => {
    const pack = getStickerPackById(packId);
    if (!pack || !stickerId) return;
    const stickers = Array.isArray(pack.stickers) ? pack.stickers.slice() : [];
    const target = stickers.find(s => s.id === stickerId);
    if (!target) return;
    const ok = await appConfirm({ title: '删除贴图', message: '删除该贴图？', danger: true });
    if (!ok) return;
    if (target.path) {
      safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path: target.path }).catch(() => {});
    }
    const frames = Array.isArray(target.frames) ? target.frames : [];
    frames.forEach(frame => {
      const path = String(frame || '').trim();
      if (!path || path.startsWith('data:')) return;
      safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path }).catch(() => {});
    });
    const nextPack = { ...pack, stickers: stickers.filter(s => s.id !== stickerId) };
    const nextState = stickerPackStore.updatePack(packId, nextPack);
    syncStickerPackState(nextState);
    renderStickerPanel();
  };

  const removeStickerPack = async packId => {
    const pack = getStickerPackById(packId);
    if (!pack) return;
    const count = Array.isArray(pack.stickers) ? pack.stickers.length : 0;
    if (count > 0) {
      const ok = await appConfirm({
        title: '删除贴图包',
        message: `该贴图包包含 ${count} 张贴图，是否一并删除？`,
        danger: true,
      });
      if (!ok) return;
    }
    (pack.stickers || []).forEach(sticker => {
      const path = String(sticker?.path || '').trim();
      if (path) {
        safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path }).catch(() => {});
      }
      const frames = Array.isArray(sticker?.frames) ? sticker.frames : [];
      frames.forEach(frame => {
        const framePath = String(frame || '').trim();
        if (!framePath || framePath.startsWith('data:')) return;
        safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path: framePath }).catch(() => {});
      });
    });
    if (pack.iconPath) {
      safeInvoke('delete_attachment', { sessionId: STICKER_ICON_SESSION, path: pack.iconPath }).catch(() => {});
    }
    const nextState = stickerPackStore.removePack(packId);
    syncStickerPackState(nextState);
    stickerPackDeleteMode = false;
    stickerPackDeleteTarget = '';
    if (stickerPanelTab === `${STICKER_PACK_TAB_PREFIX}${packId}`) {
      stickerPanelTab = 'default';
      stickerPanelPage = 0;
    }
    renderStickerPanel();
  };

  const getStickerFromPack = (packId, stickerId) => {
    const pack = getStickerPackById(packId);
    if (!pack || !stickerId) return null;
    return (pack.stickers || []).find(s => s.id === stickerId) || null;
  };

  const isStickerKeywordMissing = (packId, stickerId) => {
    const pack = getStickerPackById(packId);
    if (!pack) return false;
    const sticker = getStickerFromPack(packId, stickerId);
    if (!sticker) return false;
    return !String(sticker.keyword || '').trim();
  };

  const updateStickerKeywordInline = (packId, stickerId, keyword) => {
    const pack = getStickerPackById(packId);
    if (!pack || !stickerId) return;
    const nextKeyword = String(keyword || '').trim();
    let changed = false;
    const stickers = (pack.stickers || []).map(s => {
      if (s.id !== stickerId) return s;
      if (String(s.keyword || '').trim() === nextKeyword) return s;
      changed = true;
      return { ...s, keyword: nextKeyword };
    });
    if (!changed) return;
    const nextPack = { ...pack, stickers };
    const nextState = stickerPackStore.updatePack(packId, nextPack);
    syncStickerPackState(nextState);
  };

  const openStickerEditor = (btn, item) => {
    if (!btn || !item) return;
    if (activeStickerEditor?.btn === btn) return;
    if (activeStickerEditor) closeStickerEditor();
    const packId = String(item?.packId || '').trim();
    const stickerId = String(item?.stickerId || '').trim();
    if (!packId || !stickerId) return;
    const input = btn.querySelector('.sticker-item-input');
    const indicator = btn.querySelector('.sticker-item-indicator');
    btn.classList.add('is-editing');
    if (indicator) {
      indicator.textContent = '×';
      indicator.disabled = false;
    }
    if (input) {
      const sticker = getStickerFromPack(packId, stickerId);
      input.value = String(sticker?.keyword || '').trim();
      setTimeout(() => input.focus(), 0);
    }
    activeStickerEditor = { btn, packId, stickerId };
  };

  const closeStickerEditor = () => {
    const current = activeStickerEditor;
    if (!current?.btn) return;
    const { btn, packId, stickerId } = current;
    const indicator = btn.querySelector('.sticker-item-indicator');
    btn.classList.remove('is-editing');
    const missing = isStickerKeywordMissing(packId, stickerId);
    btn.classList.toggle('has-indicator', missing);
    if (indicator) {
      indicator.textContent = missing ? '!' : '';
      indicator.disabled = true;
    }
    activeStickerEditor = null;
  };

  const updateStickerKeyword = (pack, stickerId) => {
    if (!pack || !stickerId) return pack;
    const stickers = Array.isArray(pack.stickers) ? pack.stickers.map(s => ({ ...s })) : [];
    const idx = stickers.findIndex(s => s.id === stickerId);
    if (idx < 0) return pack;
    const current = stickers[idx];
    const suggestion = String(current.keyword || '').trim() || formatStickerNameSuggestion(current.name, idx);
    const raw = prompt(`编辑贴图关键词（用于 AI 调用）`, suggestion);
    if (raw === null) return pack;
    const keyword = String(raw || '').trim();
    if (!keyword) {
      window.toastr?.warning?.('关键词不能为空');
      return pack;
    }
    stickers[idx] = { ...current, keyword };
    return { ...pack, stickers };
  };

  const addStickersToPack = async packId => {
    const pack = getStickerPackById(packId);
    if (!pack) return;
    const files = await pickFilesFromInput(stickerFilePicker);
    if (!files.length) return;
    const stickers = Array.isArray(pack.stickers) ? pack.stickers.slice() : [];
    const warnings = new Set();
    const addWarning = msg => {
      const text = String(msg || '').trim();
      if (text) warnings.add(text);
    };
    const existingPackCount = stickers.length;
    const existingTotal = (stickerPackState?.packs || []).reduce(
      (sum, p) => sum + (Array.isArray(p?.stickers) ? p.stickers.length : 0),
      0,
    );
    let addedCount = 0;
    for (const file of files) {
      const rawDataUrl = await readFileAsDataUrl(file);
      if (!rawDataUrl) continue;
      const fileSize = Number(file?.size || 0);
      const isGif = isGifFile(file);
      if (isGif && fileSize > STICKER_SOFT_GIF_BYTES) {
        addWarning(
          `贴图 ${file?.name || ''} 体积较大（${formatStickerFileSize(fileSize)}），建议压缩或裁切（GIF 建议 <= 2MB）`,
        );
      } else if (!isGif && fileSize > STICKER_SOFT_IMAGE_BYTES) {
        addWarning(
          `贴图 ${file?.name || ''} 体积较大（${formatStickerFileSize(
            fileSize,
          )}），建议压缩或裁切（建议 <= 600KB/640px）`,
        );
      }
      let dataUrl = rawDataUrl;
      if (!isGif) {
        try {
          dataUrl = await compressImageDataUrl(rawDataUrl, { maxDim: 640, quality: 0.86, maxBytes: 600_000 });
        } catch {
          dataUrl = rawDataUrl;
        }
      }
      const dataBytes = estimateDataUrlBytes(dataUrl);
      if (isGif && dataBytes > STICKER_SOFT_GIF_BYTES) {
        addWarning(`贴图 ${file?.name || ''} 压缩后仍较大（${formatStickerFileSize(dataBytes)}），建议进一步压缩`);
      } else if (!isGif && dataBytes > STICKER_SOFT_IMAGE_BYTES) {
        addWarning(`贴图 ${file?.name || ''} 压缩后仍较大（${formatStickerFileSize(dataBytes)}），建议进一步压缩`);
      }
      const path = await saveStickerAsset(dataUrl, file?.name || 'sticker', STICKER_PACK_ASSET_SESSION);
      stickers.push({
        id: String(Date.now()) + Math.random().toString(16).slice(2, 8),
        name: String(file?.name || '').trim(),
        keyword: '',
        path: path || '',
        dataUrl: path ? '' : dataUrl,
      });
      addedCount += 1;
    }
    if (addedCount > 0) {
      const packAfter = existingPackCount + addedCount;
      const totalAfter = existingTotal + addedCount;
      if (packAfter > STICKER_SOFT_PACK_LIMIT) {
        addWarning(`该贴图包已超过建议上限（${STICKER_SOFT_PACK_LIMIT} 张），建议分包或清理以避免卡顿`);
      }
      if (totalAfter > STICKER_SOFT_TOTAL_LIMIT) {
        addWarning(`自定义贴图总量已超过建议上限（${STICKER_SOFT_TOTAL_LIMIT} 张），建议清理或分包以避免崩溃`);
      }
    }
    if (warnings.size) {
      warnings.forEach(msg => window.toastr?.warning?.(msg));
    }
    let nextPack = { ...pack, stickers };
    if (nextPack.aiEnabled) {
      const ensured = ensureStickerKeywords(nextPack);
      nextPack = ensured.ok ? ensured.pack : nextPack;
    }
    const nextState = stickerPackStore.updatePack(packId, nextPack);
    syncStickerPackState(nextState);
    renderStickerPanel();
  };

  const updateStickerPackIcon = async packId => {
    const pack = getStickerPackById(packId);
    if (!pack) return;
    const files = await pickFilesFromInput(stickerIconPicker);
    const file = files[0];
    if (!file) return;
    const dataUrl = await avatarDataUrlFromFile(file, { maxDim: 64, quality: 0.88, maxBytes: 160_000 });
    if (!dataUrl) return;
    const path = await saveStickerAsset(dataUrl, file?.name || 'sticker_icon', STICKER_ICON_SESSION);
    const nextPack = {
      ...pack,
      iconPath: path || '',
      iconDataUrl: path ? '' : dataUrl,
    };
    const nextState = stickerPackStore.updatePack(packId, nextPack);
    syncStickerPackState(nextState);
    renderStickerPanel();
  };

  const resolveStickerItems = keywords => {
    const items = [];
    (keywords || []).forEach(keyword => {
      const key = String(keyword || '').trim();
      if (!key) return;
      const resolved = resolveMediaAsset('sticker', key) || resolveMediaAsset('image', key);
      const frames = resolveStickerFramesByKeyword(key, resolved?.item);
      const fps = resolveStickerFpsByKeyword(key, resolved?.item);
      items.push({
        keyword: key,
        label: key,
        url: resolved?.url || '',
        frames,
        fps,
      });
    });
    return items;
  };
  const getMostUsedStickerKeys = () => {
    const entries = Object.entries(stickerUsage || {})
      .map(([key, count]) => ({ key, count: Number(count || 0) }))
      .filter(item => item.key && Number.isFinite(item.count) && item.count > 0)
      .sort((a, b) => b.count - a.count);
    const keys = entries.map(item => item.key);
    if (keys.length) return keys.slice(0, 48);
    try {
      const raw = localStorage.getItem(STICKER_RECENT_KEY);
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list) && list.length) return list.slice(0, 48);
    } catch {}
    return [];
  };
  const getStickerItemsForTab = tab => {
    if (tab === 'recent') {
      return resolveStickerItems(getMostUsedStickerKeys());
    }
    if (tab === 'default') {
      return listMediaAssets('sticker')
        .map(item => ({
          keyword: String(item?.id || item?.label || '').trim(),
          label: String(item?.label || item?.id || '').trim(),
          url: String(item?.url || ''),
        }))
        .filter(item => item.keyword);
    }
    const packId = getStickerPackIdFromTab(tab);
    if (packId) {
      const pack = getStickerPackById(packId);
      const stickers = Array.isArray(pack?.stickers) ? pack.stickers : [];
      const items = stickers
        .map((sticker, idx) => {
          const keyword = String(sticker?.keyword || sticker?.id || '').trim();
          const missingKeyword = !String(sticker?.keyword || '').trim();
          const frames = resolveStickerFrameSources(sticker);
          const fps = clampStickerFps(sticker?.fps);
          return {
            keyword,
            label: String(sticker?.keyword || formatStickerNameSuggestion(sticker?.name, idx) || keyword).trim(),
            url: resolveStickerMediaUrl(sticker),
            missingKeyword,
            stickerId: String(sticker?.id || '').trim(),
            packId,
            frames,
            fps,
          };
        })
        .filter(item => item.keyword);
      items.unshift({ action: 'add', label: '添加', packId });
      return items;
    }
    return [];
  };
  const getStickerTotalPages = () => {
    const items = getStickerItemsForTab(stickerPanelTab);
    return Math.max(1, Math.ceil(items.length / STICKER_PAGE_SIZE));
  };
  const updateStickerDotsActive = (page, totalPages) => {
    if (!stickerPanel?.dots) return;
    const dots = Array.from(stickerPanel.dots.querySelectorAll('.sticker-dot'));
    dots.forEach((dot, idx) => {
      dot.classList.toggle('is-active', idx === page);
    });
  };
  const scrollToStickerPage = (page, behavior = 'smooth') => {
    if (!stickerPanel?.grid) return;
    const grid = stickerPanel.grid;
    const width = grid.clientWidth || 0;
    if (!width) return;
    const left = Math.max(0, Math.trunc(page) * width);
    try {
      grid.scrollTo({ left, behavior });
    } catch {
      grid.scrollLeft = left;
    }
  };
  const renderStickerDots = totalPages => {
    if (!stickerPanel?.dots) return;
    stickerPanel.dots.innerHTML = '';
    if (totalPages <= 1) return;
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `sticker-dot${i === stickerPanelPage ? ' is-active' : ''}`;
      dot.dataset.page = String(i);
      dot.setAttribute('aria-label', `第${i + 1}页`);
      dot.addEventListener('click', event => {
        event.stopPropagation();
        stickerPanelPage = i;
        updateStickerDotsActive(stickerPanelPage, totalPages);
        scrollToStickerPage(stickerPanelPage);
      });
      stickerPanel.dots.appendChild(dot);
    }
  };
  const renderStickerItems = (pageItems, container) => {
    if (!container) return;
    container.innerHTML = '';
    if (!pageItems.length) return;
    pageItems.forEach(item => {
      if (item?.action === 'add') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sticker-item sticker-item-add';
        btn.textContent = item?.label || '＋';
        btn.setAttribute('aria-label', '新增贴图');
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const packId = String(item?.packId || '').trim();
          if (packId) addStickersToPack(packId);
        });
        container.appendChild(btn);
        return;
      }
      const keyword = String(item?.keyword || '').trim();
      if (!keyword) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-item';
      if (item?.missingKeyword) btn.classList.add('has-indicator');
      btn.dataset.keyword = keyword;
      btn.dataset.stickerId = String(item?.stickerId || '').trim();
      btn.dataset.packId = String(item?.packId || '').trim();
      btn.setAttribute('aria-label', item?.label || keyword);
      const content = document.createElement('div');
      content.className = 'sticker-item-content';
      if (item?.url) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item?.label || keyword;
        img.addEventListener('error', () => {
          recordStickerLoadError({
            packId: item?.packId,
            stickerId: item?.stickerId,
            keyword,
            url: item?.url,
          });
        });
        if (Array.isArray(item?.frames) && item.frames.length > 1) {
          startStickerFrameAnimation(img, item.frames, item.fps);
        }
        content.appendChild(img);
      } else {
        const label = document.createElement('span');
        label.className = 'sticker-item-text';
        label.textContent = item?.label || keyword;
        content.appendChild(label);
      }
      btn.appendChild(content);
      if (item?.packId) {
        const indicator = document.createElement('button');
        indicator.type = 'button';
        indicator.className = 'sticker-item-indicator';
        indicator.textContent = item?.missingKeyword ? '!' : '';
        indicator.disabled = true;
        indicator.setAttribute('aria-label', '贴图状态');
        indicator.addEventListener('click', event => {
          event.stopPropagation();
          if (!btn.classList.contains('is-editing')) return;
          const packId = String(item?.packId || '').trim();
          const stickerId = String(item?.stickerId || '').trim();
          if (packId && stickerId) {
            removeStickerFromPack(packId, stickerId);
          }
        });
        btn.appendChild(indicator);

        const editor = document.createElement('div');
        editor.className = 'sticker-item-editor';
        editor.innerHTML = '<input type="text" class="sticker-item-input" placeholder="输入关键词">';
        editor.addEventListener('click', e => e.stopPropagation());
        editor.addEventListener('pointerdown', e => e.stopPropagation());
        const input = editor.querySelector('.sticker-item-input');
        const packId = String(item?.packId || '').trim();
        const stickerId = String(item?.stickerId || '').trim();
        const applyKeywordUpdate = rawValue => {
          if (!packId || !stickerId) return;
          const nextKeyword = String(rawValue || '').trim();
          updateStickerKeywordInline(packId, stickerId, nextKeyword);
          item.keyword = nextKeyword;
          const fallbackKey = nextKeyword || stickerId;
          btn.dataset.keyword = fallbackKey;
          const nextLabel = nextKeyword || item?.label || fallbackKey;
          btn.setAttribute('aria-label', nextLabel);
        };
        input?.addEventListener('input', event => {
          applyKeywordUpdate(event?.target?.value);
        });
        input?.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            closeStickerEditor();
          }
        });
        btn.appendChild(editor);
      }
      let suppressClick = false;
      let pressTimer = null;
      const clearPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      btn.addEventListener('pointerdown', event => {
        if (!item?.packId) return;
        clearPress();
        pressTimer = setTimeout(() => {
          suppressClick = true;
          openStickerEditor(btn, item);
        }, 520);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
        btn.addEventListener(evt, () => clearPress());
      });
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (btn.classList.contains('is-editing')) {
          closeStickerEditor();
          return;
        }
        const packId = String(btn.dataset.packId || '').trim();
        const stickerId = String(btn.dataset.stickerId || '').trim();
        if (packId && stickerId && isStickerKeywordMissing(packId, stickerId)) {
          window.toastr?.warning?.('请先填写关键词');
          openStickerEditor(btn, item);
          return;
        }
        const key = String(btn.dataset.keyword || '').trim();
        if (!key) return;
        bumpStickerUsage(key);
        insertStickerToken(key);
        if (stickerPanelTab === 'recent') renderStickerPanel();
      });
      container.appendChild(btn);
    });
  };
  const buildStickerPage = (items, pageIndex) => {
    const page = document.createElement('div');
    page.className = 'sticker-page';
    if (!items.length) return page;
    const start = pageIndex * STICKER_PAGE_SIZE;
    const pageItems = items.slice(start, start + STICKER_PAGE_SIZE);
    renderStickerItems(pageItems, page);
    return page;
  };
  const bindStickerTabLongPress = (btn, packId) => {
    if (!btn || !packId) return;
    let pressTimer = null;
    let triggered = false;
    const clearPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    btn.addEventListener('pointerdown', () => {
      triggered = false;
      clearPress();
      pressTimer = setTimeout(() => {
        triggered = true;
        btn.dataset.longpress = '1';
        stickerPackManager?.show?.(packId);
      }, 520);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
      btn.addEventListener(evt, () => clearPress());
    });
    btn.addEventListener('click', () => {
      if (!triggered) return;
      triggered = false;
    });
  };
  const renderStickerTabs = () => {
    if (!stickerPanel?.tabWrap) return;
    const tabWrap = stickerPanel.tabWrap;
    tabWrap.innerHTML = '';
    const tabs = [];
    const addTab = btn => {
      tabWrap.appendChild(btn);
      tabs.push(btn);
    };
    const recent = document.createElement('button');
    recent.type = 'button';
    recent.className = 'sticker-tab';
    recent.dataset.tab = 'recent';
    recent.title = '常用';
    recent.textContent = '🕛';
    addTab(recent);

    const def = document.createElement('button');
    def.type = 'button';
    def.className = 'sticker-tab';
    def.dataset.tab = 'default';
    def.title = '默认贴图';
    const defIcon = buildStickerTabIcon({
      url: './assets/external/feather-default.png',
      alt: '默认贴图',
    });
    if (defIcon) def.appendChild(defIcon);
    addTab(def);

    const packs = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs : [];
    packs.forEach((pack, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-tab sticker-tab-pack';
      btn.dataset.tab = `${STICKER_PACK_TAB_PREFIX}${pack.id}`;
      btn.title = formatStickerPackLabel(pack, idx);
      const color = STICKER_PACK_COLORS[pack.colorIndex % STICKER_PACK_COLORS.length];
      if (color) {
        btn.style.background = color;
        btn.style.borderColor = color;
        btn.style.color = '#fff';
      }
      const iconUrl = resolveStickerMediaUrl({ dataUrl: pack.iconDataUrl, path: pack.iconPath });
      const showNumber = idx >= STICKER_PACK_COLORS.length;
      if (iconUrl) {
        const icon = buildStickerTabIcon({
          url: iconUrl,
          alt: formatStickerPackLabel(pack, idx),
          meta: pack.iconMeta,
        });
        if (icon) btn.appendChild(icon);
      } else {
        btn.textContent = showNumber ? String(idx + 1) : '';
      }
      bindStickerTabLongPress(btn, pack.id);
      addTab(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'sticker-tab sticker-tab-add';
    addBtn.dataset.action = 'add-pack';
    addBtn.title = '新增';
    addBtn.textContent = '＋';
    addTab(addBtn);
    stickerPanel.tabs = tabs;
  };
  const updateStickerToggleUI = () => {
    if (!stickerPanel?.toggle || !stickerPanel?.el) return;
    const packId = getStickerPackIdFromTab(stickerPanelTab);
    let canToggle = true;
    let enabled = true;
    if (stickerPanelTab === 'recent') {
      canToggle = false;
      enabled = false;
    } else if (stickerPanelTab === 'default') {
      enabled = stickerPackState?.defaultEnabled !== false;
    } else if (packId) {
      const pack = getStickerPackById(packId);
      enabled = Boolean(pack?.aiEnabled);
    } else {
      canToggle = false;
      enabled = false;
    }
    stickerPanel.toggle.disabled = !canToggle;
    stickerPanel.toggle.classList.toggle('is-enabled', canToggle && enabled);
    stickerPanel.toggle.classList.toggle('is-disabled', canToggle && !enabled);
    stickerPanel.toggle.classList.toggle('is-hidden', !canToggle);
    stickerPanel.toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    stickerPanel.toggle.title = canToggle
      ? enabled
        ? 'AI 可使用此贴图包'
        : 'AI 不可使用此贴图包'
      : 'AI 贴图开关不可用';
    stickerPanel.el.classList.toggle('sticker-ai-disabled', canToggle && !enabled);
  };
  const updateStickerDeleteUI = () => {
    if (!stickerPanel?.deleteBtn) return;
    const packId = getStickerPackIdFromTab(stickerPanelTab);
    const deletable = Boolean(packId);
    const show = Boolean(deletable && stickerPackDeleteMode && stickerPackDeleteTarget === packId);
    stickerPanel.deleteBtn.classList.toggle('is-active', show);
    stickerPanel.deleteBtn.classList.toggle('is-hidden', !deletable);
  };
  const updateStickerGenerateUI = () => {
    if (!stickerPanel?.generateBtn) return;
    const packId = getStickerPackIdFromTab(stickerPanelTab);
    const show = Boolean(packId);
    stickerPanel.generateBtn.classList.toggle('is-hidden', !show);
  };
  const handleStickerToggle = () => {
    const packId = getStickerPackIdFromTab(stickerPanelTab);
    if (stickerPanelTab === 'recent') return;
    if (stickerPanelTab === 'default') {
      const nextEnabled = !(stickerPackState?.defaultEnabled !== false);
      const nextState = stickerPackStore.setDefaultEnabled(nextEnabled);
      syncStickerPackState(nextState);
      updateStickerToggleUI();
      return;
    }
    if (!packId) return;
    const pack = getStickerPackById(packId);
    if (!pack) return;
    const enable = !pack.aiEnabled;
    const nextPack = { ...pack, aiEnabled: enable };
    const nextState = stickerPackStore.updatePack(packId, nextPack);
    syncStickerPackState(nextState);
    renderStickerPanel();
  };
  const renderStickerPanel = () => {
    if (!stickerPanel?.grid) return;
    if (getStickerPackIdFromTab(stickerPanelTab) && !getStickerPackById(getStickerPackIdFromTab(stickerPanelTab))) {
      stickerPanelTab = 'default';
    }
    if (activeStickerEditor) closeStickerEditor();
    const activePackId = getStickerPackIdFromTab(stickerPanelTab);
    if (!activePackId || activePackId !== stickerPackDeleteTarget) {
      stickerPackDeleteMode = false;
      stickerPackDeleteTarget = '';
    }
    renderStickerTabs();
    const tabs = Array.isArray(stickerPanel?.tabs) ? stickerPanel.tabs : [];
    tabs.forEach(tab => {
      const target = String(tab?.dataset?.tab || '').trim();
      tab.classList.toggle('is-active', target === stickerPanelTab);
    });
    updateStickerToggleUI();
    updateStickerDeleteUI();
    updateStickerGenerateUI();
    const grid = stickerPanel.grid;
    grid.classList.remove('sticker-pages');
    grid.style.transition = 'none';
    grid.style.transform = 'translateX(0px)';
    const items = getStickerItemsForTab(stickerPanelTab);
    const totalPages = Math.max(1, Math.ceil(items.length / STICKER_PAGE_SIZE));
    if (stickerPanelPage >= totalPages) stickerPanelPage = totalPages - 1;
    if (!items.length) {
      const label = stickerPanelTab === 'recent' ? '暂无常用贴图' : '暂无贴图';
      grid.innerHTML = `<div class="sticker-empty">${label}</div>`;
      renderStickerDots(0);
      return;
    }
    grid.innerHTML = '';
    if (totalPages === 1) {
      grid.appendChild(buildStickerPage(items, stickerPanelPage));
      renderStickerDots(1);
      requestAnimationFrame(() => scrollToStickerPage(0, 'auto'));
      return;
    }
    grid.classList.add('sticker-pages');
    for (let i = 0; i < totalPages; i++) {
      grid.appendChild(buildStickerPage(items, i));
    }
    renderStickerDots(totalPages);
    requestAnimationFrame(() => scrollToStickerPage(stickerPanelPage, 'auto'));
  };

  updateStickerPreview = (text = '') => {
    if (!stickerPreview?.el || !stickerPreview.list) return;
    const matches = extractStickerTokenMatches(text || composerInput?.value || '');
    if (!matches.length) {
      stickerPreview.el.classList.remove('is-active');
      chatRoom?.classList.remove('sticker-preview-active');
      stickerPreview.list.innerHTML = '';
      return;
    }
    stickerPreview.list.innerHTML = '';
    matches.forEach((match, idx) => {
      const keyword = match.key;
      const resolved = resolveMediaAsset('sticker', keyword) || resolveMediaAsset('image', keyword);
      const item = document.createElement('div');
      item.className = 'sticker-preview-item';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sticker-preview-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', '删除贴图');
      removeBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeStickerTokenByIndex(idx);
      });
      item.appendChild(removeBtn);
      if (resolved?.url) {
        const img = document.createElement('img');
        img.src = resolved.url;
        img.alt = keyword;
        const frames = resolveStickerFramesByKeyword(keyword, resolved?.item);
        if (frames.length > 1) {
          const fps = resolveStickerFpsByKeyword(keyword, resolved?.item);
          startStickerFrameAnimation(img, frames, fps);
        }
        item.appendChild(img);
      } else {
        item.textContent = keyword || `贴图${idx + 1}`;
      }
      stickerPreview.list.appendChild(item);
    });
    stickerPreview.el.classList.add('is-active');
    chatRoom?.classList.add('sticker-preview-active');
  };

  const setActionPanelOpen = open => {
    if (!actionPanel?.el || !chatRoom) return;
    const next = Boolean(open);
    actionPanelOpen = next;
    if (next) {
      actionPanel.el.classList.add('is-active');
      chatRoom.classList.add('action-panel-open');
      setStickerPanelOpen(false);
      composerInput?.blur();
    } else {
      actionPanel.el.classList.remove('is-active');
      chatRoom.classList.remove('action-panel-open');
    }
    syncChatInputOffset();
  };

  const setStickerPanelOpen = open => {
    if (!stickerPanel?.el || !chatRoom) return;
    const next = Boolean(open);
    stickerPanelOpen = next;
    if (next) {
      setActionPanelOpen(false);
      renderStickerPanel();
      stickerPanel.el.classList.add('is-active');
      chatRoom.classList.add('sticker-panel-open');
      composerInput?.blur();
    } else {
      stickerPanel.el.classList.remove('is-active');
      chatRoom.classList.remove('sticker-panel-open');
      if (activeStickerEditor) closeStickerEditor();
      stickerPackDeleteMode = false;
      stickerPackDeleteTarget = '';
      updateStickerDeleteUI();
    }
    updateStickerPreview(composerInput?.value || '');
    syncChatInputOffset();
  };

  const renderChatList = () => {
    const el = document.getElementById('chat-list');
    if (!el) return;
    const ids = chatStore
      .listSessions()
      .filter(id => !isRpSessionId(id))
      .filter(id => chatStore.hasMessages?.(id) || (chatStore.getMessages(id) || []).some(isConversationMessage))
      .slice(0, 50);
    el.innerHTML = '';
    if (!ids.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px 12px; color:#94a3b8; text-align:center;';
      empty.textContent = '暂无聊天记录';
      el.appendChild(empty);
      return;
    }
    ids.forEach(id => {
      const contact = contactsStore.getContact(id);
      const displayName = formatSessionName(id, contact);
      const displayNameHtml = renderSessionNameHtml(id, contact);
      const avatar = resolveAvatarForContact(id, contact);
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      // 蓝点：显示 pending 消息数量
      const pendingCount = getPendingCountForSession(id);
      const pendingBadge =
        pendingCount > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#199AFF; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${pendingCount}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.session = id;
      item.dataset.name = displayName;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="chat-item-avatar">
	                <div class="chat-item-content">
	                    <div class="chat-item-header">
	                        <div class="chat-item-name">${displayNameHtml}${unreadBadge}${pendingBadge}</div>
	                        <div class="chat-item-time">${time}</div>
	                    </div>
	                    <div class="chat-item-preview">${preview}</div>
	                </div>
	            `;
      el.appendChild(item);
    });
  };

  // 创建联系人分组渲染器
  const contactGroupRenderer = new ContactGroupRenderer({
    groupStore,
    contactsStore,
    filterContactFn: contact => !isRpSessionId(contact?.id),
    dragManager: contactDragManager,
    onGroupChanged: () => {
      try {
        refreshChatAndContacts();
      } catch {}
    },
    renderContactFn: contact => {
      const id = contact.id;
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const name = formatSessionName(id, contact);
      const nameHtml = renderSessionNameHtml(id, contact);
      const avatar = resolveAvatarForContact(id, contact);
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      // 蓝点：显示 pending 消息数量
      const pendingCount = getPendingCountForSession(id);
      const pendingBadge =
        pendingCount > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#199AFF; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${pendingCount}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'contact-item';
      item.dataset.session = id;
      item.dataset.name = name;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="contact-avatar">
	                <div class="contact-info">
	                    <div class="contact-name">${nameHtml}${unreadBadge}${pendingBadge}</div>
	                    <div class="contact-desc">${preview}</div>
	                </div>
	                <div class="contact-time">${time}</div>
	            `;
      return item;
    },
  });

  const renderContactsUngrouped = () => {
    const el = document.getElementById('contacts-ungrouped-list');
    if (!el) return;
    const contacts = contactsStore.listContacts().filter(c => c && !c.isGroup && !isRpSessionId(c.id));
    if (!contacts.length) {
      el.innerHTML = '';
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 6px; color:#94a3b8; font-size:13px;';
      empty.textContent = '（暂无联系人）';
      el.appendChild(empty);
      return;
    }
    // 使用分组渲染器渲染联系人
    contactGroupRenderer.render(el);
  };

  const renderGroupsList = () => {
    const el = document.getElementById('contacts-groups-list');
    if (!el) return;
    const groups = contactsStore.listContacts().filter(c => c && c.isGroup);
    el.innerHTML = '';
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 6px; color:#94a3b8; font-size:13px;';
      empty.textContent = '（暂无群聊）';
      el.appendChild(empty);
      return;
    }
    groups.forEach(g => {
      const id = g.id;
      const last = getLastVisibleMessage(id);
      const preview = snippetFromMessage(last);
      const time = last?.timestamp ? formatTime(last.timestamp) : '';
      const name = formatSessionName(id, g);
      const nameHtml = renderSessionNameHtml(id, g);
      const avatar = resolveAvatarForContact(id, g);
      const count = Array.isArray(g.members) ? g.members.length : 0;
      const unread = chatStore.getUnreadCount(id);
      const unreadBadge =
        unread > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      const item = document.createElement('div');
      item.className = 'contact-item';
      item.dataset.session = id;
      item.dataset.name = name;
      item.innerHTML = `
	                <img src="${avatar}" alt="" class="contact-avatar">
	                <div class="contact-info">
	                    <div class="contact-name">${nameHtml}${unreadBadge}</div>
	                    <div class="contact-desc">${preview || `群成员：${count}人`}</div>
	                </div>
	                <div class="contact-time">${time || String(count).padStart(2, '0') + '人'}</div>
	            `;
      el.appendChild(item);
    });
  };

  const refreshChatAndContactsNow = () => {
    if (chatStore.scopeId !== contactsStore.scopeId) {
      logger.info(
        `[Persona_test] refreshChatAndContacts skip scope mismatch chat=${chatStore.scopeId || 'default'} contacts=${
          contactsStore.scopeId || 'default'
        }`,
      );
      return;
    }
    const socialSessions = chatStore.listSessions().filter(id => !isRpSessionId(id));
    contactsStore.ensureFromSessions(socialSessions, { defaultAvatar: FEATHER_DEFAULT });
    renderChatList();
    renderGroupsList();
    renderContactsUngrouped();
    if (contactsSearch.term && String(contactsSearch.term).trim()) {
      try {
        applyContactsSearchFilter();
      } catch {}
    }
  };

  // Coalesce multiple refresh requests into a single paint cycle to reduce redundant re-renders.
  let refreshChatAndContactsQueued = false;
  let refreshChatAndContactsHandle = null;
  const refreshChatAndContacts = ({ immediate = false } = {}) => {
    if (immediate) {
      refreshChatAndContactsQueued = false;
      if (refreshChatAndContactsHandle != null) {
        try {
          if (typeof window !== 'undefined' && window.cancelAnimationFrame)
            window.cancelAnimationFrame(refreshChatAndContactsHandle);
          else clearTimeout(refreshChatAndContactsHandle);
        } catch {}
        refreshChatAndContactsHandle = null;
      }
      return refreshChatAndContactsNow();
    }
    if (refreshChatAndContactsQueued) return;
    refreshChatAndContactsQueued = true;
    const schedule = cb => {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) return window.requestAnimationFrame(cb);
      } catch {}
      return setTimeout(cb, 16);
    };
    refreshChatAndContactsHandle = schedule(() => {
      refreshChatAndContactsQueued = false;
      refreshChatAndContactsHandle = null;
      refreshChatAndContactsNow();
    });
  };
  sessionPanel.onUpdated = refreshChatAndContacts;

  /* ---------------- 联系人搜索（参照手机流式.html） ---------------- */
  const contactsSearch = {
    term: '',
    timeout: null,
  };

  const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const setHighlighted = (el, term) => {
    if (!el) return;
    const original = el.getAttribute('data-original-text') || el.textContent || '';
    if (!el.getAttribute('data-original-text')) el.setAttribute('data-original-text', original);
    const t = String(term || '').trim();
    if (!t) {
      el.innerHTML = original;
      return;
    }
    const re = new RegExp(`(${escapeRegExp(t)})`, 'gi');
    el.innerHTML = original.replace(re, '<span class="search-highlight">$1</span>');
  };

  const restoreHighlighted = el => {
    if (!el) return;
    const original = el.getAttribute('data-original-text');
    if (original != null) el.innerHTML = original;
  };

  const filterContactItem = (item, searchLower, rawTerm) => {
    const nameEl = item.querySelector('.contact-name');
    const descEl = item.querySelector('.contact-desc');
    const name = (nameEl?.getAttribute('data-original-text') || nameEl?.textContent || '').toLowerCase();
    const desc = (descEl?.getAttribute('data-original-text') || descEl?.textContent || '').toLowerCase();
    const isMatch = !searchLower || name.includes(searchLower) || desc.includes(searchLower);
    item.style.display = isMatch ? '' : 'none';
    if (!searchLower) {
      restoreHighlighted(nameEl);
      restoreHighlighted(descEl);
    } else {
      if (name.includes(searchLower)) setHighlighted(nameEl, rawTerm);
      else restoreHighlighted(nameEl);
      if (desc.includes(searchLower)) setHighlighted(descEl, rawTerm);
      else restoreHighlighted(descEl);
    }
    return isMatch;
  };

  const applyContactsSearchFilter = () => {
    const rawTerm = String(contactsSearch.term || '').trim();
    const searchLower = rawTerm.toLowerCase();

    const groupsWrap = document.getElementById('contacts-groups-list')?.closest('.contact-group') || null;
    const ungroupedWrap = document.getElementById('contacts-ungrouped-list')?.closest('.contact-group') || null;
    const groupsList = document.getElementById('contacts-groups-list');
    const ungroupedList = document.getElementById('contacts-ungrouped-list');

    const filterSection = (listEl, wrapperEl) => {
      if (!listEl || !wrapperEl) return;
      const items = [...listEl.querySelectorAll('.contact-item')];
      let visible = 0;
      for (const it of items) {
        if (filterContactItem(it, searchLower, rawTerm)) visible++;
      }
      wrapperEl.style.display = rawTerm && visible === 0 ? 'none' : '';
    };

    filterSection(groupsList, groupsWrap);
    filterSection(ungroupedList, ungroupedWrap);
  };

  const initContactSearch = () => {
    const input = document.getElementById('contact_search_input');
    const clearBtn = document.getElementById('search_clear_btn');
    const box = document.getElementById('floating_search_box');
    if (!input || !clearBtn || !box) return;
    if (input.hasAttribute('data-initialized')) return;

    const setActiveUi = active => {
      box.classList.toggle('is-active', Boolean(active));
    };

    const update = (nextTerm, { immediate = false } = {}) => {
      contactsSearch.term = String(nextTerm || '');
      const has = contactsSearch.term.trim().length > 0;
      clearBtn.style.display = has ? 'block' : 'none';
      setActiveUi(has);
      if (contactsSearch.timeout) clearTimeout(contactsSearch.timeout);
      const run = () => applyContactsSearchFilter();
      if (immediate) run();
      else contactsSearch.timeout = setTimeout(run, 300);
    };

    input.addEventListener('input', e => update(e.target.value));
    input.addEventListener('focus', () => box.classList.add('is-focus'));
    input.addEventListener('blur', () => box.classList.remove('is-focus'));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        update('', { immediate: true });
        input.value = '';
      }
    });
    clearBtn.addEventListener('click', () => {
      input.value = '';
      update('', { immediate: true });
      input.focus();
    });

    input.setAttribute('data-initialized', 'true');
  };

  /* ---------------- 底部导航（聊天/联系人/动态） ---------------- */
  const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
  const modeSwitch = document.getElementById('mode-switch');
  const modeButtons = modeSwitch ? Array.from(modeSwitch.querySelectorAll('button')) : [];
  const applyUiModeUI = () => {
    if (document?.body) document.body.dataset.uiMode = uiMode;
    modeButtons.forEach(btn => {
      const target = btn.dataset.mode === 'rp' ? 'rp' : 'social';
      const isActive = uiMode === target;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };
  const initialUiMode = loadUiMode();
  const pages = {
    chat: document.getElementById('chat-page'),
    contacts: document.getElementById('contacts-page'),
    moments: document.getElementById('moments-page'),
  };
  const chatList = document.getElementById('chat-list');
  chatRoom = document.getElementById('chat-room');
  const rpToolbar = document.getElementById('rp-toolbar');
  const rpGreetingSelect = document.getElementById('rp-greeting-select');
  const rpResetBtn = document.getElementById('rp-reset-btn');
  const rpVarsBtn = document.getElementById('rp-vars-btn');
  const chatScroll = document.getElementById('chat-scroll');
  const composerInput = document.getElementById('composer-input');
  const chatInputContainer = document.querySelector('.chat-input-container');
  pluginUiManager.mount({ chatRoom, chatInputContainer });
  let chatInputGapTweak = 0;
  const syncChatInputOffset = () => {
    if (!chatRoom || !chatInputContainer || !chatScroll) return;
    if (chatRoom.classList.contains('hidden')) return;
    const inputRect = chatInputContainer.getBoundingClientRect();
    const scrollRect = chatScroll.getBoundingClientRect();
    const baseOffset = Math.max(0, Math.round(scrollRect.bottom - inputRect.top));
    const offset = Math.max(0, baseOffset + chatInputGapTweak);
    if (offset) {
      chatRoom.style.setProperty('--qq-size-input-bar', `${offset}px`);
    }
  };
  const syncChatBottomGap = () => {
    if (!chatRoom || !chatInputContainer || !chatScroll) return;
    if (chatRoom.classList.contains('hidden')) return;
    const maxScroll = chatScroll.scrollHeight - chatScroll.clientHeight;
    if (maxScroll > 0 && chatScroll.scrollTop < maxScroll - 2) return;
    const last = chatScroll.lastElementChild;
    if (!last) return;
    const gap = Math.round(chatInputContainer.getBoundingClientRect().top - last.getBoundingClientRect().bottom);
    if (!Number.isFinite(gap)) return;
    const desired = 8;
    const delta = desired - gap;
    if (Math.abs(delta) < 2) return;
    chatInputGapTweak = Math.max(-120, Math.min(120, chatInputGapTweak + delta));
    syncChatInputOffset();
  };
  syncChatInputOffset();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(syncChatBottomGap);
  }
  if (typeof ResizeObserver !== 'undefined' && chatInputContainer) {
    const observer = new ResizeObserver(() => {
      syncChatInputOffset();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncChatBottomGap);
    });
    observer.observe(chatInputContainer);
  }
  window.addEventListener('resize', () => {
    syncChatInputOffset();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncChatBottomGap);
  });
  composerInput?.addEventListener('input', () => {
    requestAnimationFrame(syncChatInputOffset);
    requestAnimationFrame(syncChatBottomGap);
  });
  chatScroll?.addEventListener(
    'scroll',
    () => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncChatBottomGap);
    },
    { passive: true },
  );
  if (chatScroll && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncChatBottomGap);
    });
    observer.observe(chatScroll, { childList: true });
  }
  const composerAttachmentsEl = document.getElementById('composer-attachments');
  const MAX_IMAGE_ATTACHMENTS = 6;
  const ATTACHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_DOC_TEXT_CHARS = 20_000;
  const MAX_DOC_BYTES = 400_000;
  let composerAttachments = [];
  const expiredAttachmentCleanup = new Set();
  const createAttachmentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `att_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  };
  const formatFileSize = bytes => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  };
  const isAttachmentExpired = meta => {
    const expiresAt = Number(meta?.expiresAt || 0);
    return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt;
  };
  const queueAttachmentCleanup = (path, sessionId) => {
    const target = String(path || '').trim();
    if (!target || expiredAttachmentCleanup.has(target)) return;
    expiredAttachmentCleanup.add(target);
    safeInvoke('delete_attachment', { sessionId, path: target }).catch(() => {});
  };
  const isTextDocumentFile = file => {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('text/')) return true;
    if (/(json|xml|csv|yaml|markdown)/.test(type)) return true;
    const name = String(file.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const textExts = new Set([
      'txt',
      'md',
      'markdown',
      'json',
      'csv',
      'tsv',
      'log',
      'xml',
      'yaml',
      'yml',
      'ini',
      'cfg',
      'conf',
    ]);
    return textExts.has(ext);
  };
  const readBlobText = async blob => {
    if (!blob) return '';
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read text failed'));
      reader.readAsText(blob);
    });
  };
  const extractDocumentText = async file => {
    if (!file || !isTextDocumentFile(file)) return { text: '', truncated: false, supported: false };
    const total = Number(file.size || 0);
    const slice = total > MAX_DOC_BYTES ? file.slice(0, MAX_DOC_BYTES) : file;
    let text = '';
    try {
      text = await readBlobText(slice);
    } catch (err) {
      return { text: '', truncated: false, supported: false };
    }
    let truncated = false;
    if (text.length > MAX_DOC_TEXT_CHARS) {
      text = text.slice(0, MAX_DOC_TEXT_CHARS);
      truncated = true;
    }
    if (total > MAX_DOC_BYTES) truncated = true;
    return { text, truncated, supported: true };
  };
  const renderComposerAttachments = () => {
    if (!composerAttachmentsEl) return;
    composerAttachmentsEl.innerHTML = '';
    if (!composerAttachments.length) {
      composerAttachmentsEl.classList.remove('is-active');
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          syncChatInputOffset();
          requestAnimationFrame(syncChatBottomGap);
        });
      } else {
        syncChatInputOffset();
        syncChatBottomGap();
      }
      return;
    }
    composerAttachmentsEl.classList.add('is-active');
    composerAttachments.forEach(attachment => {
      if (!attachment || typeof attachment !== 'object') return;
      const item = document.createElement('div');
      item.className = 'chat-attachment-item';
      item.dataset.attachmentId = attachment.id || '';

      if (attachment.kind === 'image') {
        const img = document.createElement('img');
        img.src = attachment.url || '';
        img.alt = attachment.name || 'image';
        item.appendChild(img);
      } else {
        const doc = document.createElement('div');
        doc.className = 'chat-attachment-doc';
        const icon = document.createElement('div');
        icon.className = 'chat-attachment-doc-icon';
        icon.textContent = 'DOC';
        const name = document.createElement('div');
        name.className = 'chat-attachment-doc-name';
        name.textContent = attachment.name || '文件';
        doc.appendChild(icon);
        doc.appendChild(name);
        if (attachment.sizeLabel) {
          const meta = document.createElement('div');
          meta.className = 'chat-attachment-doc-meta';
          meta.textContent = attachment.sizeLabel;
          doc.appendChild(meta);
        }
        item.appendChild(doc);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chat-attachment-remove';
      remove.dataset.attachmentId = attachment.id || '';
      remove.textContent = 'x';
      item.appendChild(remove);
      composerAttachmentsEl.appendChild(item);
    });
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        syncChatInputOffset();
        requestAnimationFrame(syncChatBottomGap);
      });
    } else {
      syncChatInputOffset();
      syncChatBottomGap();
    }
  };
  const addComposerAttachment = attachment => {
    if (!attachment || typeof attachment !== 'object') return false;
    const item = { ...attachment };
    if (!item.id) item.id = createAttachmentId();
    if (item.kind === 'image') {
      const count = composerAttachments.filter(a => a?.kind === 'image').length;
      if (count >= MAX_IMAGE_ATTACHMENTS) {
        window.toastr?.warning?.(`一次最多发送 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
        return false;
      }
      if (!item.url) return false;
    }
    if (item.kind === 'document') {
      item.name = item.name || '文件';
      item.sizeLabel = item.sizeLabel || formatFileSize(item.size);
    }
    composerAttachments.push(item);
    renderComposerAttachments();
    return true;
  };
  const removeComposerAttachment = id => {
    const targetId = String(id || '');
    if (!targetId) return;
    const idx = composerAttachments.findIndex(a => String(a?.id || '') === targetId);
    if (idx === -1) return;
    composerAttachments.splice(idx, 1);
    renderComposerAttachments();
  };
  const clearComposerAttachments = () => {
    if (!composerAttachments.length) return;
    composerAttachments = [];
    renderComposerAttachments();
  };
  const buildDocumentPromptText = attachment => {
    const name = String(attachment?.name || '文件').trim() || '文件';
    const meta = [];
    if (attachment?.mime) meta.push(String(attachment.mime));
    if (attachment?.sizeLabel) meta.push(String(attachment.sizeLabel));
    const header = meta.length ? `【文件】${name} (${meta.join(', ')})` : `【文件】${name}`;
    const body = String(attachment?.text || '').trim();
    if (!body) return `${header}\n[无法读取文件内容，仅提供文件信息]`;
    const suffix = attachment?.textTruncated ? '\n[内容已截断]' : '';
    return `${header}\n${body}${suffix}`;
  };
  const buildAttachmentParts = attachments => {
    const parts = [];
    (attachments || []).forEach(attachment => {
      if (!attachment || typeof attachment !== 'object') return;
      if (attachment.kind === 'image' && attachment.url) {
        parts.push({ type: 'image_url', image_url: { url: attachment.url } });
        return;
      }
      if (attachment.kind === 'document') {
        const text = buildDocumentPromptText(attachment);
        if (text) parts.push({ type: 'text', text });
      }
    });
    return parts;
  };
  const buildAttachmentMessages = (attachments, { name, avatar } = {}) => {
    const list = [];
    (attachments || []).forEach(attachment => {
      if (!attachment || typeof attachment !== 'object') return;
      if (attachment.kind === 'image' && attachment.url) {
        const expiresAt = Date.now() + ATTACHMENT_TTL_MS;
        list.push({
          role: 'user',
          type: 'image',
          content: attachment.url,
          name: name || '我',
          avatar,
          time: formatNowTime(),
          meta: {
            attachmentId: attachment.id || '',
            originalName: attachment.name || '',
            expiresAt,
          },
        });
        return;
      }
      if (attachment.kind === 'document') {
        list.push({
          role: 'user',
          type: 'document',
          content: attachment.name || '文件',
          name: name || '我',
          avatar,
          time: formatNowTime(),
          meta: {
            attachmentId: attachment.id || '',
            mime: attachment.mime || '',
            size: Number(attachment.size || 0),
            sizeLabel: attachment.sizeLabel || '',
            textTruncated: Boolean(attachment.textTruncated),
            localPath: attachment.localPath || '',
            localBytes: Number(attachment.localBytes || 0) || 0,
            originalName: attachment.originalName || attachment.name || '',
          },
        });
      }
    });
    return list;
  };
  const persistImageAttachmentMessage = async (message, attachment, sessionId) => {
    if (!message || !attachment) return;
    const dataUrl = String(attachment.url || '').trim();
    if (!dataUrl.startsWith('data:image/')) return;
    try {
      const resp = await safeInvoke('save_attachment', {
        sessionId,
        dataUrl,
        fileName: attachment.name || '',
      });
      const path = String(resp?.path || '').trim();
      if (!path) return;
      const nextMeta = {
        ...(message.meta || {}),
        localPath: path,
        localBytes: Number(resp?.bytes || 0) || undefined,
        savedAt: Date.now(),
      };
      const updated = chatStore.updateMessage(message.id, { meta: nextMeta }, sessionId);
      ui.updateMessage(message.id, updated || { ...message, meta: nextMeta });
    } catch (err) {
      logger.warn('save attachment failed', err);
    }
  };
  if (composerAttachmentsEl) {
    composerAttachmentsEl.addEventListener('click', event => {
      const btn = event?.target?.closest ? event.target.closest('.chat-attachment-remove') : null;
      if (!btn) return;
      event.preventDefault();
      const targetId = btn.dataset.attachmentId || '';
      if (targetId) removeComposerAttachment(targetId);
    });
  }
  const scanExpiredAttachments = () => {
    const sessions = chatStore.listSessions();
    if (!sessions || !sessions.length) return;
    const queue = sessions.map(sid => String(sid || '').trim()).filter(Boolean);
    const currentId = String(chatStore.getCurrent() || '');
    const runSessionScan = sessionId => {
      const messages = chatStore.getMessages(sessionId) || [];
      messages.forEach(message => {
        if (!message || message.type !== 'image') return;
        const meta = message.meta && typeof message.meta === 'object' ? message.meta : {};
        if (!isAttachmentExpired(meta)) return;
        const localPath = String(meta.localPath || '').trim();
        if (localPath) queueAttachmentCleanup(localPath, sessionId);
        if (meta.expired) return;
        const nextMeta = { ...meta, expired: true };
        const updated = chatStore.updateMessage(message.id, { meta: nextMeta }, sessionId);
        if (sessionId === currentId && updated) ui.updateMessage(message.id, updated);
      });
    };
    const work = deadline => {
      const getRemaining = () => (typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 0);
      while (queue.length && (getRemaining() > 6 || deadline?.didTimeout)) {
        const sessionId = queue.shift();
        if (sessionId) runSessionScan(sessionId);
      }
      if (!queue.length) return;
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(work, { timeout: 2000 });
      } else {
        setTimeout(() => work({ didTimeout: true, timeRemaining: () => 0 }), 16);
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(work, { timeout: 2000 });
    } else {
      setTimeout(() => work({ didTimeout: true, timeRemaining: () => 0 }), 0);
    }
  };
  const ATTACHMENT_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const scheduleExpiredAttachmentScan = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => scanExpiredAttachments(), { timeout: 2000 });
    } else {
      setTimeout(() => scanExpiredAttachments(), 0);
    }
  };
  scheduleExpiredAttachmentScan();
  setInterval(() => scheduleExpiredAttachmentScan(), ATTACHMENT_SCAN_INTERVAL_MS);
  const stickerToggleBtn = document.querySelector('.voice-btn');
  let chatSettingsReady = false;
  let pendingChatSettingsSessionId = '';
  let pendingFloatActive = null;
  const pendingFloat = (() => {
    if (!chatRoom) return null;
    const wrap = document.createElement('div');
    wrap.id = 'pending-float';
    wrap.className = 'pending-float';
    wrap.innerHTML = `
      <div class="pending-float-title"></div>
      <div class="pending-float-list"></div>
    `;
    const titleEl = wrap.querySelector('.pending-float-title');
    const listEl = wrap.querySelector('.pending-float-list');
    wrap.addEventListener('click', event => {
      const target = event?.target?.closest ? event.target.closest('[data-msg-id]') : null;
      const msgId = target?.dataset?.msgId || '';
      if (!msgId) return;
      event.stopPropagation();
      const sid = chatStore.getCurrent();
      const pending = (chatStore.getPendingMessages(sid) || []).find(m => String(m?.id || '') === String(msgId));
      if (!pending) return;
      pendingFloatActive = pending;
      if (pendingFloatMenu) toggleSheetAt(pendingFloatMenu, target, { alignRight: true, kind: 'pending-float' });
    });
    chatRoom.appendChild(wrap);
    return { el: wrap, titleEl, listEl };
  })();
  let actionPanelOpen = false;
  let stickerPanelOpen = false;
  let stickerPanelTab = 'default';
  let stickerPanelPage = 0;
  const STICKER_PAGE_SIZE = 8;
  const STICKER_USAGE_KEY = 'sticker_usage_v1';
  const STICKER_RECENT_KEY = 'sticker_recents';
  let stickerUsage = {};
  const loadStickerUsage = () => {
    try {
      const raw = localStorage.getItem(STICKER_USAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  const saveStickerUsage = () => {
    try {
      localStorage.setItem(STICKER_USAGE_KEY, JSON.stringify(stickerUsage));
    } catch {}
  };
  const updateStickerRecents = keyword => {
    const key = String(keyword || '').trim();
    if (!key) return;
    try {
      const raw = localStorage.getItem(STICKER_RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = [key, ...list.filter(item => item !== key)].slice(0, 24);
      localStorage.setItem(STICKER_RECENT_KEY, JSON.stringify(next));
    } catch {}
  };
  const bumpStickerUsage = keyword => {
    const key = String(keyword || '').trim();
    if (!key) return;
    const next = Number(stickerUsage[key] || 0) + 1;
    stickerUsage[key] = Number.isFinite(next) ? next : 1;
    saveStickerUsage();
    updateStickerRecents(key);
  };
  stickerUsage = loadStickerUsage();
  const actionPanel = (() => {
    if (!chatRoom) return null;
    const panel = document.createElement('div');
    panel.id = 'action-panel';
    panel.className = 'action-panel';
    panel.innerHTML = `
      <div class="action-panel-grid">
        <button type="button" class="action-item" data-action="sticker" aria-label="贴图">
          <div class="action-icon">😊</div>
          <div class="action-label">贴图</div>
        </button>
        <button type="button" class="action-item" data-action="image" aria-label="传送图片">
          <div class="action-icon">🖼️</div>
          <div class="action-label">图片</div>
        </button>
        <button type="button" class="action-item" data-action="document" aria-label="传送文档">
          <div class="action-icon">📄</div>
          <div class="action-label">文档</div>
        </button>
      </div>
    `;
    panel.addEventListener('click', event => {
      const btn = event?.target?.closest ? event.target.closest('button[data-action]') : null;
      const action = btn?.dataset?.action || '';
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof runQuickAction === 'function') runQuickAction(action);
    });
    chatRoom.appendChild(panel);
    return { el: panel };
  })();
  const stickerPanel = (() => {
    if (!chatRoom) return null;
    const panel = document.createElement('div');
    panel.id = 'sticker-panel';
    panel.className = 'sticker-panel';
    panel.innerHTML = `
      <div class="sticker-tabbar">
        <div class="sticker-tabs"></div>
        <div class="sticker-tab-actions">
          <button type="button" class="sticker-ai-toggle" aria-label="AI 贴图开关" title="AI 可用贴图">
            <span class="sticker-ai-label">AI</span>
            <span class="sticker-ai-dot"></span>
          </button>
          <button type="button" class="sticker-ai-generate" aria-label="生成贴图" title="AI 生成贴图">
            <span class="sticker-ai-generate-icon">✨</span>
            <span>生成</span>
          </button>
          <button type="button" class="sticker-pack-delete" aria-label="删除贴图包" title="删除贴图包">×</button>
        </div>
      </div>
      <div class="sticker-grid"></div>
      <div class="sticker-dots"></div>
    `;
    panel.addEventListener('click', event => {
      const tabBtn = event?.target?.closest ? event.target.closest('button.sticker-tab') : null;
      const action = tabBtn?.dataset?.action || '';
      const tab = tabBtn?.dataset?.tab || '';
      if (!action && !tab) return;
      event.preventDefault();
      event.stopPropagation();
      if (tabBtn?.dataset?.longpress === '1') {
        tabBtn.dataset.longpress = '';
        return;
      }
      if (action === 'add-pack') {
        const pack = createStickerPack();
        if (pack?.id) {
          stickerPanelTab = `${STICKER_PACK_TAB_PREFIX}${pack.id}`;
          stickerPanelPage = 0;
          renderStickerPanel();
        }
        return;
      }
      if (tab !== stickerPanelTab) {
        stickerPanelTab = tab;
        stickerPanelPage = 0;
        renderStickerPanel();
      }
    });
    chatRoom.appendChild(panel);
    return {
      el: panel,
      grid: panel.querySelector('.sticker-grid'),
      dots: panel.querySelector('.sticker-dots'),
      tabWrap: panel.querySelector('.sticker-tabs'),
      toggle: panel.querySelector('.sticker-ai-toggle'),
      generateBtn: panel.querySelector('.sticker-ai-generate'),
      deleteBtn: panel.querySelector('.sticker-pack-delete'),
    };
  })();
  const stickerAiModal = (() => {
    const overlay = document.createElement('div');
    overlay.className = 'sticker-ai-overlay';
    const modal = document.createElement('div');
    modal.className = 'sticker-ai-modal';
    modal.innerHTML = `
      <div class="sticker-ai-header">
        <div>
          <div class="sticker-ai-title" id="sticker-ai-title">AI 生成贴图</div>
          <div class="sticker-ai-subtitle" id="sticker-ai-subtitle">先生成完整提示词，再调用图片模型出图</div>
        </div>
        <button type="button" class="sticker-ai-close" aria-label="关闭">×</button>
      </div>
      <div class="sticker-ai-body">
        <div class="sticker-ai-tabs">
          <button type="button" class="sticker-ai-tab is-active" data-mode="sticker">贴图模式</button>
          <button type="button" class="sticker-ai-tab" data-mode="sprite">动图模式</button>
        </div>

        <div class="sticker-ai-mode sticker-ai-mode-sticker is-active" data-mode="sticker">
          <div class="sticker-ai-label-row">
            <label class="sticker-ai-label" for="sticker-ai-style">风格描述</label>
            <button type="button" class="sticker-ai-zoom" data-target="style" aria-label="放大编辑">⤢</button>
          </div>
          <textarea id="sticker-ai-style" class="sticker-ai-textarea" placeholder="描述想要的风格、角色、动作与情绪（可简短）"></textarea>
        </div>

        <div class="sticker-ai-mode sticker-ai-mode-sprite" data-mode="sprite">
          <div class="sticker-ai-form-grid">
            <label>主题类型
              <select id="sprite-theme">
                <option value="">不指定</option>
                <option value="角色动画">角色动画</option>
                <option value="物体动画">物体动画</option>
                <option value="场景循环">场景循环</option>
                <option value="抽象视觉">抽象视觉</option>
                <option value="UI 动画">UI 动画</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>主题类型补充
              <input type="text" id="sprite-theme-custom" placeholder="自填（可选）">
            </label>
            <label>叙事感
              <select id="sprite-narrative">
                <option value="">不指定</option>
                <option value="强">强</option>
                <option value="中">中</option>
                <option value="弱">弱</option>
              </select>
            </label>
          </div>
          <div class="sticker-ai-form-grid">
            <label>主体是什么
              <input type="text" id="sprite-subject" placeholder="例如：猫、机器人、角色">
            </label>
            <label>外观/风格
              <input type="text" id="sprite-look" placeholder="例如：像素风、赛博、可爱">
            </label>
            <label>情绪氛围
              <input type="text" id="sprite-mood" placeholder="例如：轻快、紧张、治愈">
            </label>
          </div>
          <div class="sticker-ai-form-grid">
            <label>表现关键词
              <select id="sprite-expression">
                <option value="">不指定</option>
                <option value="力量">力量</option>
                <option value="速度">速度</option>
                <option value="优雅">优雅</option>
                <option value="恐惧">恐惧</option>
                <option value="可爱">可爱</option>
                <option value="混乱">混乱</option>
                <option value="神圣">神圣</option>
                <option value="科幻">科幻</option>
                <option value="奇幻">奇幻</option>
                <option value="机械感">机械感</option>
                <option value="治愈感">治愈感</option>
                <option value="自订">自订</option>
              </select>
            </label>
            <label>表现自订
              <input type="text" id="sprite-expression-custom" placeholder="可自填">
            </label>
            <label>色彩基调
              <select id="sprite-tone">
                <option value="">不指定</option>
                <option value="鲜艳">鲜艳</option>
                <option value="冷色">冷色</option>
                <option value="暖色">暖色</option>
                <option value="霓虹">霓虹</option>
                <option value="高饱和">高饱和</option>
              </select>
            </label>
          </div>
          <div class="sticker-ai-form-grid">
            <label>像素等级
              <select id="sprite-pixel">
                <option value="">不指定</option>
                <option value="16px">16px</option>
                <option value="32px" selected>32px</option>
                <option value="48px">48px</option>
                <option value="64px">64px</option>
              </select>
            </label>
            <label>背景
              <select id="sprite-bg">
                <option value="纯白" selected>纯白</option>
                <option value="自订">自订</option>
              </select>
            </label>
            <label>动画结构
              <select id="sprite-structure">
                <option value="7 阶段" selected>7 阶段结构</option>
                <option value="简化">简化结构</option>
              </select>
            </label>
          </div>
          <div class="sticker-ai-form-grid">
            <label>帧速（fps）
              <input type="number" id="sprite-fps" min="1" max="60" value="12">
            </label>
            <label class="sticker-ai-checkbox">
              <span>透明背景（去背）</span>
              <input type="checkbox" id="sprite-transparent" checked>
            </label>
          </div>
          <div class="sticker-ai-label-row">
            <label class="sticker-ai-label" for="sticker-ai-sprite-extra">补充描述</label>
            <button type="button" class="sticker-ai-zoom" data-target="sprite-extra" aria-label="放大编辑">⤢</button>
          </div>
          <textarea id="sticker-ai-sprite-extra" class="sticker-ai-textarea" placeholder="补充任何想强调的细节（可选）"></textarea>
          <div class="sticker-ai-hint">表单内容会自动合并为用户输入，用于生成完整提示词。</div>
        </div>

        <div class="sticker-ai-label-row">
          <label class="sticker-ai-label" for="sticker-ai-template">提示词模板</label>
          <button type="button" class="sticker-ai-zoom" data-target="template" aria-label="放大编辑">⤢</button>
        </div>
        <textarea id="sticker-ai-template" class="sticker-ai-textarea sticker-ai-template"></textarea>
        <div class="sticker-ai-hint">模板会与风格描述一起发送给主模型，自动生成完整提示词。</div>

        <div class="sticker-ai-actions">
          <button type="button" class="sticker-ai-btn" id="sticker-ai-build">生成完整提示词</button>
          <button type="button" class="sticker-ai-btn ghost" id="sticker-ai-reset">重置模板</button>
        </div>

        <label class="sticker-ai-label">参考图片（可选）</label>
        <div class="sticker-ai-ref">
          <button type="button" class="sticker-ai-btn" id="sticker-ai-ref-add">添加参考图片</button>
          <small class="sticker-ai-hint">参考图片仅在支持图像输入的模型中生效。</small>
          <div class="sticker-ai-ref-list" id="sticker-ai-ref-list"></div>
        </div>

        <div class="sticker-ai-label-row">
          <label class="sticker-ai-label" for="sticker-ai-final">完整提示词（可编辑）</label>
          <div class="sticker-ai-label-actions">
            <button type="button" class="sticker-ai-continue" id="sticker-ai-continue">继续</button>
            <button type="button" class="sticker-ai-zoom" data-target="final" aria-label="放大编辑">⤢</button>
          </div>
        </div>
        <textarea id="sticker-ai-final" class="sticker-ai-textarea" placeholder="这里会显示生成后的完整提示词"></textarea>

        <div class="sticker-ai-actions">
          <button type="button" class="sticker-ai-btn primary" id="sticker-ai-render">开始生成贴图</button>
          <button type="button" class="sticker-ai-btn ghost" id="sticker-ai-upload">上传生成图</button>
        </div>

        <div class="sticker-ai-status" id="sticker-ai-status"></div>
        <div class="sticker-ai-preview" id="sticker-ai-preview"></div>

        <label class="sticker-ai-label">切割设置</label>
        <div class="sticker-ai-slice-settings">
          <label>行数<input type="number" id="sticker-ai-rows" min="1" value="4"></label>
          <label>列数<input type="number" id="sticker-ai-cols" min="1" value="6"></label>
          <label>外边距<input type="number" id="sticker-ai-margin" min="0" value="16"><span class="sticker-ai-slice-hint">四周留白</span></label>
          <label>内间距<input type="number" id="sticker-ai-gap" min="0" value="8"><span class="sticker-ai-slice-hint">格子间距</span></label>
          <label>容差<input type="number" id="sticker-ai-tolerance" min="5" max="80" value="28"><span class="sticker-ai-slice-hint">背景相近范围</span></label>
          <label>去白边<input type="number" id="sticker-ai-shrink" min="0" max="4" value="1"><span class="sticker-ai-slice-hint">向内收缩</span></label>
          <label>羽化<input type="number" id="sticker-ai-feather" min="0" max="6" value="2"><span class="sticker-ai-slice-hint">边缘柔化</span></label>
        </div>
        <div class="sticker-ai-actions">
          <button type="button" class="sticker-ai-btn" id="sticker-ai-slice">去背并切割</button>
          <button type="button" class="sticker-ai-btn ghost" id="sticker-ai-auto">自动推断</button>
        </div>

        <div class="sticker-ai-mode sticker-ai-mode-sprite-anim" data-mode="sprite">
          <label class="sticker-ai-label">动图预览</label>
          <div class="sticker-ai-anim">
            <div class="sticker-ai-anim-preview">
              <img id="sticker-ai-anim-image" alt="动图预览" />
              <div class="sticker-ai-anim-placeholder" id="sticker-ai-anim-placeholder">暂无切割结果</div>
            </div>
            <div class="sticker-ai-anim-controls">
              <label>预览帧速
                <input type="number" id="sticker-ai-preview-fps" min="1" max="60" value="12">
              </label>
              <label class="sticker-ai-checkbox">
                <span>仅预览已选</span>
                <input type="checkbox" id="sticker-ai-preview-selected" checked>
              </label>
            </div>
          </div>
        </div>

        <label class="sticker-ai-label">切割结果</label>
        <div class="sticker-ai-slice-actions">
          <button type="button" class="sticker-ai-btn ghost" id="sticker-ai-select-all">全选</button>
          <button type="button" class="sticker-ai-btn ghost" id="sticker-ai-select-none">全不选</button>
          <select id="sticker-ai-pack"></select>
          <button type="button" class="sticker-ai-btn primary" id="sticker-ai-save">保存到贴图包</button>
          <button type="button" class="sticker-ai-btn" id="sticker-ai-download-zip">下载ZIP</button>
        </div>
        <div class="sticker-ai-slice-list" id="sticker-ai-slice-list"></div>
      </div>
    `;

    const titleEl = modal.querySelector('#sticker-ai-title');
    const subtitleEl = modal.querySelector('#sticker-ai-subtitle');
    const modeTabs = Array.from(modal.querySelectorAll('.sticker-ai-tab'));
    const modePanels = Array.from(modal.querySelectorAll('.sticker-ai-mode'));
    const styleInput = modal.querySelector('#sticker-ai-style');
    const spriteThemeInput = modal.querySelector('#sprite-theme');
    const spriteThemeCustomInput = modal.querySelector('#sprite-theme-custom');
    const spriteNarrativeInput = modal.querySelector('#sprite-narrative');
    const spriteSubjectInput = modal.querySelector('#sprite-subject');
    const spriteLookInput = modal.querySelector('#sprite-look');
    const spriteMoodInput = modal.querySelector('#sprite-mood');
    const spriteExpressionInput = modal.querySelector('#sprite-expression');
    const spriteExpressionCustomInput = modal.querySelector('#sprite-expression-custom');
    const spriteToneInput = modal.querySelector('#sprite-tone');
    const spritePixelInput = modal.querySelector('#sprite-pixel');
    const spriteBgInput = modal.querySelector('#sprite-bg');
    const spriteStructureInput = modal.querySelector('#sprite-structure');
    const spriteFpsInput = modal.querySelector('#sprite-fps');
    const spriteTransparentInput = modal.querySelector('#sprite-transparent');
    const spriteExtraInput = modal.querySelector('#sticker-ai-sprite-extra');
    const templateInput = modal.querySelector('#sticker-ai-template');
    const finalInput = modal.querySelector('#sticker-ai-final');
    const statusEl = modal.querySelector('#sticker-ai-status');
    const previewEl = modal.querySelector('#sticker-ai-preview');
    const continueBtn = modal.querySelector('#sticker-ai-continue');
    const refAddBtn = modal.querySelector('#sticker-ai-ref-add');
    const refListEl = modal.querySelector('#sticker-ai-ref-list');
    const sliceBtn = modal.querySelector('#sticker-ai-slice');
    const autoSliceBtn = modal.querySelector('#sticker-ai-auto');
    const animPreviewImg = modal.querySelector('#sticker-ai-anim-image');
    const animPreviewPlaceholder = modal.querySelector('#sticker-ai-anim-placeholder');
    const animPreviewFpsInput = modal.querySelector('#sticker-ai-preview-fps');
    const animPreviewSelectedInput = modal.querySelector('#sticker-ai-preview-selected');
    const sliceListEl = modal.querySelector('#sticker-ai-slice-list');
    const selectAllBtn = modal.querySelector('#sticker-ai-select-all');
    const selectNoneBtn = modal.querySelector('#sticker-ai-select-none');
    const packSelectEl = modal.querySelector('#sticker-ai-pack');
    const saveBtn = modal.querySelector('#sticker-ai-save');
    const rowsInput = modal.querySelector('#sticker-ai-rows');
    const colsInput = modal.querySelector('#sticker-ai-cols');
    const marginInput = modal.querySelector('#sticker-ai-margin');
    const gapInput = modal.querySelector('#sticker-ai-gap');
    const toleranceInput = modal.querySelector('#sticker-ai-tolerance');
    const shrinkInput = modal.querySelector('#sticker-ai-shrink');
    const featherInput = modal.querySelector('#sticker-ai-feather');
    const buildBtn = modal.querySelector('#sticker-ai-build');
    const resetBtn = modal.querySelector('#sticker-ai-reset');
    const renderBtn = modal.querySelector('#sticker-ai-render');
    const uploadBtn = modal.querySelector('#sticker-ai-upload');
    const closeBtn = modal.querySelector('.sticker-ai-close');
    const downloadZipBtn = modal.querySelector('#sticker-ai-download-zip');

    let referenceImages = [];
    let generatedImages = [];
    let selectedGeneratedIndex = 0;
    let sliceItems = [];
    let slicePreviewTimer = null;
    let slicePreviewIdle = null;
    let sliceSettingsSaveTimer = null;
    let previewSettingsSaveTimer = null;
    let sliceInProgress = false;
    let slicePending = null;
    let textSaveTimer = null;
    let sliceSettingsTouched = false;
    let suppressSliceSettingsTouch = false;
    let lastSlicePreviewKey = '';
    let animPreviewTimer = null;
    let animPreviewFrameIndex = 0;
    const sliceSettingsCacheByMode = { sticker: new Map(), sprite: new Map() };
    const autoSliceCacheByMode = { sticker: new Map(), sprite: new Map() };
    let sliceSettingsCache = sliceSettingsCacheByMode.sticker;
    let autoSliceCache = autoSliceCacheByMode.sticker;

    const loadStickerAiState = () => {
      try {
        const raw = localStorage.getItem(STICKER_AI_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    };

    const persistStickerAiState = state => {
      try {
        localStorage.setItem(STICKER_AI_STATE_KEY, JSON.stringify(state || {}));
      } catch {}
    };

    const normalizeStickerAiImage = item => {
      const dataUrl = typeof item?.dataUrl === 'string' ? item.dataUrl.trim() : '';
      const url = typeof item?.url === 'string' ? item.url.trim() : '';
      const path = typeof item?.path === 'string' ? item.path.trim() : '';
      return { dataUrl, url, path };
    };

    const normalizeStickerAiSlice = item => {
      const base = normalizeStickerAiImage(item);
      return {
        ...base,
        fullDataUrl: typeof item?.fullDataUrl === 'string' ? item.fullDataUrl.trim() : '',
        fullPath: typeof item?.fullPath === 'string' ? item.fullPath.trim() : '',
        keyword: String(item?.keyword || '').trim(),
        name: String(item?.name || '').trim(),
        defaultName: String(item?.defaultName || '').trim(),
        selected: item?.selected !== false,
      };
    };

    const serializeStickerAiImage = item => {
      const base = normalizeStickerAiImage(item);
      if (base.path) return { path: base.path };
      if (base.url) return { url: base.url };
      if (base.dataUrl) return { dataUrl: base.dataUrl };
      return {};
    };

    const serializeStickerAiSlice = item => {
      const base = normalizeStickerAiSlice(item);
      return {
        ...serializeStickerAiImage(base),
        fullPath: base.fullPath || '',
        fullDataUrl: base.fullPath ? '' : base.fullDataUrl,
        keyword: base.keyword,
        name: base.name,
        defaultName: base.defaultName,
        selected: base.selected,
      };
    };

    const collectStickerAiPaths = state => {
      const paths = new Set();
      const list = []
        .concat(Array.isArray(state?.generated) ? state.generated : [])
        .concat(Array.isArray(state?.slices) ? state.slices : []);
      list.forEach(item => {
        const path = String(item?.path || '').trim();
        if (path) paths.add(path);
        const fullPath = String(item?.fullPath || '').trim();
        if (fullPath) paths.add(fullPath);
      });
      return Array.from(paths);
    };

    const clearStickerAiAssets = state => {
      const paths = collectStickerAiPaths(state);
      if (!paths.length) return;
      paths.forEach(path => {
        safeInvoke('delete_attachment', { sessionId: STICKER_AI_ASSET_SESSION, path }).catch(() => {});
      });
    };

    const getStickerAiImageSource = item => {
      const base = normalizeStickerAiImage(item);
      if (base.dataUrl) return base.dataUrl;
      if (base.url) return base.url;
      if (base.path) return resolveLocalStickerUrl(base.path);
      return '';
    };
    const getStickerAiFrameSource = (item, { full = false } = {}) => {
      if (!item || typeof item !== 'object') return '';
      if (full) {
        const fullPath = String(item.fullPath || '').trim();
        if (fullPath) return resolveLocalStickerUrl(fullPath);
        const fullDataUrl = String(item.fullDataUrl || '').trim();
        if (fullDataUrl) return fullDataUrl;
      }
      return getStickerAiImageSource(item);
    };

    const getStickerAiImageKey = (item, idx) => {
      const base = normalizeStickerAiImage(item);
      if (base.path) return `path:${base.path}`;
      if (base.url) return `url:${base.url}`;
      if (base.dataUrl) return `data:${base.dataUrl.length}:${idx}`;
      return `idx:${idx}`;
    };

    const inferStickerAiExtension = (item, fallback = 'png') => {
      const base = normalizeStickerAiImage(item);
      if (base.dataUrl && base.dataUrl.startsWith('data:')) {
        const { mime } = parseDataUrlPayload(base.dataUrl);
        if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
        if (mime === 'image/webp') return 'webp';
        if (mime === 'image/gif') return 'gif';
        if (mime === 'image/png') return 'png';
      }
      const hint = base.path || base.url || '';
      const match = hint.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
      return match ? match[1].toLowerCase() : fallback;
    };

    const clampNumber = (value, min, max, fallback) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(num)));
    };
    const STICKER_SLICE_DEFAULTS = {
      rows: 4,
      cols: 6,
      margin: 16,
      gap: 8,
      tolerance: 28,
      shrink: 1,
      feather: 2,
    };
    const SPRITE_SLICE_DEFAULTS = {
      rows: 6,
      cols: 6,
      margin: 0,
      gap: 1,
      tolerance: 28,
      shrink: 1,
      feather: 2,
    };
    const SPRITE_FORM_DEFAULTS = {
      theme: '',
      themeCustom: '',
      narrative: '',
      subject: '',
      look: '',
      mood: '',
      expression: '',
      expressionCustom: '',
      tone: '',
      pixel: '32px',
      background: '纯白',
      structure: '7 阶段',
      fps: '12',
      transparent: true,
      extraText: '',
    };
    const PREVIEW_SETTINGS_DEFAULTS = {
      fps: 12,
      selectedOnly: true,
    };
    let stickerAiMode = 'sticker';

    const normalizeSpriteText = value => String(value || '').trim();
    const normalizeSpriteFormState = (state = {}) => ({
      theme: normalizeSpriteText(state.theme),
      themeCustom: normalizeSpriteText(state.themeCustom),
      narrative: normalizeSpriteText(state.narrative),
      subject: normalizeSpriteText(state.subject),
      look: normalizeSpriteText(state.look),
      mood: normalizeSpriteText(state.mood),
      expression: normalizeSpriteText(state.expression),
      expressionCustom: normalizeSpriteText(state.expressionCustom),
      tone: normalizeSpriteText(state.tone),
      pixel: normalizeSpriteText(state.pixel) || SPRITE_FORM_DEFAULTS.pixel,
      background: normalizeSpriteText(state.background) || SPRITE_FORM_DEFAULTS.background,
      structure: normalizeSpriteText(state.structure) || SPRITE_FORM_DEFAULTS.structure,
      fps: normalizeSpriteText(state.fps) || SPRITE_FORM_DEFAULTS.fps,
      transparent: typeof state.transparent === 'boolean' ? state.transparent : SPRITE_FORM_DEFAULTS.transparent,
      extraText: normalizeSpriteText(state.extraText),
    });
    const readSpriteFormState = () => ({
      theme: normalizeSpriteText(spriteThemeInput?.value),
      themeCustom: normalizeSpriteText(spriteThemeCustomInput?.value),
      narrative: normalizeSpriteText(spriteNarrativeInput?.value),
      subject: normalizeSpriteText(spriteSubjectInput?.value),
      look: normalizeSpriteText(spriteLookInput?.value),
      mood: normalizeSpriteText(spriteMoodInput?.value),
      expression: normalizeSpriteText(spriteExpressionInput?.value),
      expressionCustom: normalizeSpriteText(spriteExpressionCustomInput?.value),
      tone: normalizeSpriteText(spriteToneInput?.value),
      pixel: normalizeSpriteText(spritePixelInput?.value),
      background: normalizeSpriteText(spriteBgInput?.value) || SPRITE_FORM_DEFAULTS.background,
      structure: normalizeSpriteText(spriteStructureInput?.value) || SPRITE_FORM_DEFAULTS.structure,
      fps: normalizeSpriteText(spriteFpsInput?.value) || '',
      transparent: spriteTransparentInput ? Boolean(spriteTransparentInput.checked) : SPRITE_FORM_DEFAULTS.transparent,
      extraText: normalizeSpriteText(spriteExtraInput?.value),
    });
    const applySpriteFormState = (state = {}) => {
      const normalized = normalizeSpriteFormState(state);
      if (spriteThemeInput) spriteThemeInput.value = normalized.theme;
      if (spriteThemeCustomInput) spriteThemeCustomInput.value = normalized.themeCustom;
      if (spriteNarrativeInput) spriteNarrativeInput.value = normalized.narrative;
      if (spriteSubjectInput) spriteSubjectInput.value = normalized.subject;
      if (spriteLookInput) spriteLookInput.value = normalized.look;
      if (spriteMoodInput) spriteMoodInput.value = normalized.mood;
      if (spriteExpressionInput) spriteExpressionInput.value = normalized.expression;
      if (spriteExpressionCustomInput) spriteExpressionCustomInput.value = normalized.expressionCustom;
      if (spriteToneInput) spriteToneInput.value = normalized.tone;
      if (spritePixelInput) spritePixelInput.value = normalized.pixel;
      if (spriteBgInput) spriteBgInput.value = normalized.background;
      if (spriteStructureInput) spriteStructureInput.value = normalized.structure;
      if (spriteFpsInput) spriteFpsInput.value = normalized.fps;
      if (spriteTransparentInput) spriteTransparentInput.checked = normalized.transparent;
      if (spriteExtraInput) spriteExtraInput.value = normalized.extraText;
    };
    const resolveSpriteOption = (value, custom) => {
      const raw = normalizeSpriteText(value);
      const extra = normalizeSpriteText(custom);
      if (raw === '其他' || raw === '自订') {
        return extra || '';
      }
      if (!raw && extra) return extra;
      return raw;
    };
    const buildSpriteInputSummary = () => {
      const form = readSpriteFormState();
      const lines = [];
      const theme = resolveSpriteOption(form.theme, form.themeCustom);
      const expression = resolveSpriteOption(form.expression, form.expressionCustom);
      const background = form.background === '自订' ? '' : form.background;
      if (theme) lines.push(`主题类型: ${theme}`);
      if (form.subject) lines.push(`主体: ${form.subject}`);
      if (form.look) lines.push(`外观/风格: ${form.look}`);
      if (form.mood) lines.push(`情绪氛围: ${form.mood}`);
      if (expression) lines.push(`表现: ${expression}`);
      if (form.narrative) lines.push(`叙事感: ${form.narrative}`);
      if (form.pixel) lines.push(`像素等级: ${form.pixel}`);
      if (form.tone) lines.push(`色彩基调: ${form.tone}`);
      if (background) {
        const bgLine = form.transparent && background === '纯白' ? '背景: 纯白（后处理透明）' : `背景: ${background}`;
        lines.push(bgLine);
      }
      if (form.structure) lines.push(`动画结构: ${form.structure}`);
      if (form.fps) lines.push(`帧速: ${form.fps}fps`);
      if (form.extraText) lines.push(`补充: ${form.extraText}`);
      return lines.join('\n').trim();
    };
    const getPromptInputText = () => {
      if (stickerAiMode === 'sprite') return buildSpriteInputSummary();
      return String(styleInput?.value || '').trim();
    };
    const getDefaultTemplateForMode = mode => (mode === 'sprite' ? STICKER_AI_SPRITE_TEMPLATE : STICKER_AI_TEMPLATE);
    const normalizePreviewSettings = (settings = {}) => {
      const raw = settings && typeof settings === 'object' ? settings : {};
      return {
        fps: clampNumber(raw.fps, 1, 60, PREVIEW_SETTINGS_DEFAULTS.fps),
        selectedOnly: raw.selectedOnly !== false,
      };
    };
    const readPreviewSettings = () => ({
      fps: clampNumber(animPreviewFpsInput?.value, 1, 60, PREVIEW_SETTINGS_DEFAULTS.fps),
      selectedOnly: animPreviewSelectedInput ? Boolean(animPreviewSelectedInput.checked) : PREVIEW_SETTINGS_DEFAULTS.selectedOnly,
    });
    const applyPreviewSettings = (settings = {}) => {
      const normalized = normalizePreviewSettings(settings);
      if (animPreviewFpsInput) animPreviewFpsInput.value = String(normalized.fps);
      if (animPreviewSelectedInput) animPreviewSelectedInput.checked = normalized.selectedOnly;
    };
    const getPreviewSettingsFromState = (state, mode) => {
      const legacy = state?.previewSettings;
      const modes = state?.preview && typeof state.preview === 'object' ? state.preview : {};
      const value = modes[mode] || (mode === 'sticker' ? legacy : null);
      return normalizePreviewSettings(value);
    };
    const writePreviewSettingsToState = (state, mode, settings) => {
      if (!state || typeof state !== 'object') return;
      if (!state.preview || typeof state.preview !== 'object') state.preview = {};
      state.preview[mode] = normalizePreviewSettings(settings);
      if (mode === 'sticker') {
        state.previewSettings = state.preview[mode];
      }
    };

    const buildAnimationFrames = async items => {
      const sources = items
        .map(item => getStickerAiFrameSource(item, { full: false }))
        .map(src => src || '')
        .filter(Boolean);
      if (!sources.length) return null;
      const images = [];
      let maxW = 0;
      let maxH = 0;
      for (const src of sources) {
        const img = await loadImageElement(src);
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        images.push({ img, width, height });
        maxW = Math.max(maxW, width);
        maxH = Math.max(maxH, height);
      }
      if (!maxW || !maxH) return null;
      const canvas = document.createElement('canvas');
      canvas.width = maxW;
      canvas.height = maxH;
      const ctx = canvas.getContext('2d');
      const frames = [];
      images.forEach(({ img, width, height }) => {
        ctx.clearRect(0, 0, maxW, maxH);
        const x = Math.floor((maxW - width) / 2);
        const y = Math.floor((maxH - height) / 2);
        if (width && height) {
          ctx.drawImage(img, x, y, width, height);
        } else {
          ctx.drawImage(img, x, y);
        }
        frames.push(ctx.getImageData(0, 0, maxW, maxH));
      });
      return { frames, width: maxW, height: maxH };
    };
    const buildGifDataUrl = async (items, fps) => {
      const frameData = await buildAnimationFrames(items);
      if (!frameData) throw new Error('无法生成动图帧');
      const bytes = encodeGifFrames(frameData.frames, frameData.width, frameData.height, fps);
      const base64 = bytesToBase64(bytes);
      return {
        dataUrl: `data:image/gif;base64,${base64}`,
        bytes: bytes.length,
        frameCount: frameData.frames.length,
        width: frameData.width,
        height: frameData.height,
      };
    };
    const saveAnimationFrames = async (items) => {
      const frames = [];
      const now = Date.now();
      for (let i = 0; i < items.length; i++) {
        const source = getStickerAiImageSource(items[i]);
        if (!source) continue;
        let dataUrl = '';
        if (source.startsWith('data:image/')) {
          dataUrl = source;
        } else {
          try {
            const img = await loadImageElement(source);
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (!width || !height) continue;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            dataUrl = canvas.toDataURL('image/png');
          } catch {}
        }
        if (!dataUrl) continue;
        const fileName = `sticker_anim_${now}_${i + 1}.png`;
        const path = await saveStickerAsset(dataUrl, fileName, STICKER_PACK_ASSET_SESSION);
        frames.push(path || dataUrl);
      }
      return frames;
    };

    const normalizeSliceSettings = (settings) => {
      if (!settings || typeof settings !== 'object') return null;
      return {
        rows: clampNumber(settings.rows, 1, 20, 4),
        cols: clampNumber(settings.cols, 1, 20, 6),
        margin: clampNumber(settings.margin, 0, 200, 16),
        gap: clampNumber(settings.gap, 0, 200, 8),
        tolerance: clampNumber(settings.tolerance, 5, 80, 28),
        shrink: clampNumber(settings.shrink, 0, 6, 1),
        feather: clampNumber(settings.feather, 0, 8, 2),
      };
    };

    const setModeCaches = (mode) => {
      const key = mode === 'sprite' ? 'sprite' : 'sticker';
      if (!sliceSettingsCacheByMode[key]) sliceSettingsCacheByMode[key] = new Map();
      if (!autoSliceCacheByMode[key]) autoSliceCacheByMode[key] = new Map();
      sliceSettingsCache = sliceSettingsCacheByMode[key];
      autoSliceCache = autoSliceCacheByMode[key];
    };

    const restoreSliceSettingsCache = (sliceSettings, mode = stickerAiMode) => {
      const target = new Map();
      const raw = sliceSettings && typeof sliceSettings === 'object' ? sliceSettings : null;
      if (raw) {
        Object.entries(raw).forEach(([key, value]) => {
          const normalized = normalizeSliceSettings(value);
          if (normalized) target.set(key, normalized);
        });
      }
      sliceSettingsCacheByMode[mode] = target;
      if (mode === stickerAiMode) sliceSettingsCache = target;
    };

    const serializeSliceSettingsCache = () => {
      const payload = {};
      sliceSettingsCache.forEach((value, key) => {
        const normalized = normalizeSliceSettings(value);
        if (normalized) payload[key] = normalized;
      });
      return payload;
    };

    const pruneSliceSettingsCache = (images = []) => {
      const keys = new Set();
      images.forEach((item, idx) => {
        keys.add(getStickerAiImageKey(item, idx));
      });
      sliceSettingsCache.forEach((_, key) => {
        if (!keys.has(key)) sliceSettingsCache.delete(key);
      });
    };

    const getCurrentStickerAiImageKey = () => {
      if (!generatedImages.length) return '';
      const current = generatedImages[selectedGeneratedIndex] || generatedImages[0];
      if (!current) return '';
      return getStickerAiImageKey(current, selectedGeneratedIndex);
    };

    const rememberSliceSettings = (settings) => {
      const key = getCurrentStickerAiImageKey();
      if (!key) return;
      const normalized = normalizeSliceSettings(settings);
      if (!normalized) return;
      sliceSettingsCache.set(key, normalized);
    };

    const normalizeAssetState = (asset) => {
      const normalized = asset && typeof asset === 'object' ? asset : {};
      const images = Array.isArray(normalized.generated) ? normalized.generated.map(normalizeStickerAiImage) : [];
      const slices = Array.isArray(normalized.slices) ? normalized.slices.map(normalizeStickerAiSlice) : [];
      const filteredImages = images.filter(item => item.dataUrl || item.url || item.path);
      const filteredSlices = slices.filter(item => item.dataUrl || item.url || item.path);
      const maxIndex = filteredImages.length ? filteredImages.length - 1 : 0;
      const rawIndex = Number(normalized.selectedIndex ?? 0);
      const nextIndex = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : 0;
      return {
        generated: filteredImages,
        slices: filteredSlices,
        selectedIndex: Math.max(0, Math.min(maxIndex, nextIndex)),
        sliceSettings: normalized.sliceSettings && typeof normalized.sliceSettings === 'object' ? normalized.sliceSettings : {},
      };
    };
    const getAssetStateFromState = (state, mode) => {
      const assets = state?.assets;
      if (assets && typeof assets === 'object' && assets[mode]) return assets[mode];
      if (mode === 'sticker') {
        const fallback = {
          generated: state?.generated,
          slices: state?.slices,
          selectedIndex: state?.selectedIndex,
          sliceSettings: state?.sliceSettings,
        };
        const hasFallback = Object.values(fallback).some(value => value !== undefined);
        return hasFallback ? fallback : null;
      }
      return null;
    };
    const buildAssetStateFromMemory = () => ({
      generated: generatedImages.map(serializeStickerAiImage),
      slices: sliceItems.map(serializeStickerAiSlice),
      selectedIndex: selectedGeneratedIndex,
      sliceSettings: serializeSliceSettingsCache(),
    });
    const writeAssetStateForMode = (state, mode, assetState) => {
      if (!state || typeof state !== 'object') return;
      if (!state.assets || typeof state.assets !== 'object') state.assets = {};
      state.assets[mode] = assetState;
      if (mode === 'sticker') {
        state.generated = assetState.generated;
        state.slices = assetState.slices;
        state.selectedIndex = assetState.selectedIndex;
        state.sliceSettings = assetState.sliceSettings;
      }
    };
    const applyAssetState = (assetState, mode) => {
      setModeCaches(mode);
      const normalized = normalizeAssetState(assetState);
      generatedImages = normalized.generated;
      sliceItems = normalized.slices;
      selectedGeneratedIndex = normalized.selectedIndex;
      restoreSliceSettingsCache(normalized.sliceSettings, mode);
      pruneSliceSettingsCache(generatedImages);
      sliceSettingsTouched = false;
      lastSlicePreviewKey = '';
    };
    const applyAssetStateFromStore = (state, mode) => {
      const assetState = getAssetStateFromState(state, mode) || {};
      applyAssetState(assetState, mode);
    };

    const readImageSourceAsDataUrl = async source => {
      const src = String(source || '').trim();
      if (!src) return '';
      if (src.startsWith('data:image/')) return src;
      try {
        const resp = await fetch(src);
        if (!resp.ok) return '';
        const blob = await resp.blob();
        return await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch {
        try {
          const img = await loadImageElement(src);
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          ctx.drawImage(img, 0, 0);
          return canvas.toDataURL('image/png');
        } catch {
          return '';
        }
      }
    };

    const getModeTemplateText = (state, mode) => {
      if (mode === 'sprite') {
        return typeof state?.sprite?.templateText === 'string' ? state.sprite.templateText : '';
      }
      return typeof state?.templateText === 'string' ? state.templateText : '';
    };
    const getModeFinalText = (state, mode) => {
      if (mode === 'sprite') {
        return typeof state?.sprite?.finalText === 'string' ? state.sprite.finalText : '';
      }
      return typeof state?.finalText === 'string' ? state.finalText : '';
    };
    const applyModeTexts = (state, mode) => {
      if (!templateInput || !finalInput) return;
      templateInput.value = getModeTemplateText(state, mode) || '';
      finalInput.value = getModeFinalText(state, mode) || '';
    };
    const applySliceDefaultsForMode = (mode) => {
      if (!rowsInput || !colsInput) return;
      if (applyCachedSliceSettingsForSelection()) return;
      const defaults = mode === 'sprite' ? SPRITE_SLICE_DEFAULTS : STICKER_SLICE_DEFAULTS;
      applySliceSettings(defaults);
      sliceSettingsTouched = false;
    };
    const updateStickerAiModeUI = () => {
      const next = stickerAiMode === 'sprite' ? 'sprite' : 'sticker';
      modeTabs.forEach(btn => {
        const mode = btn?.dataset?.mode || '';
        const isActive = mode === next;
        btn.classList.toggle('is-active', isActive);
      });
      modePanels.forEach(panel => {
        const mode = panel?.dataset?.mode || '';
        panel.classList.toggle('is-active', mode === next);
      });
      if (titleEl) titleEl.textContent = next === 'sprite' ? 'AI 生成精灵图' : 'AI 生成贴图';
      if (subtitleEl) {
        subtitleEl.textContent =
          next === 'sprite' ? '先生成完整提示词，再调用图片模型出图（6×6 精灵图）' : '先生成完整提示词，再调用图片模型出图';
      }
      if (renderBtn) renderBtn.textContent = next === 'sprite' ? '开始生成精灵图' : '开始生成贴图';
      if (uploadBtn) uploadBtn.textContent = next === 'sprite' ? '上传精灵图' : '上传贴图';
      if (saveBtn) saveBtn.textContent = next === 'sprite' ? '保存动图' : '保存到贴图包';
    };

    const applyStickerAiState = state => {
      stickerAiMode = state?.mode === 'sprite' ? 'sprite' : 'sticker';
      if (styleInput && typeof state?.styleText === 'string') {
        styleInput.value = state.styleText;
      }
      const spriteState = state?.sprite && typeof state.sprite === 'object' ? state.sprite : {};
      const spriteForm = spriteState?.form && typeof spriteState.form === 'object' ? spriteState.form : spriteState;
      applySpriteFormState(spriteForm);
      applyModeTexts(state, stickerAiMode);
      applyAssetStateFromStore(state, stickerAiMode);
      applyPreviewSettings(getPreviewSettingsFromState(state, stickerAiMode));
      updateStickerAiModeUI();
    };

    const persistStickerAiMeta = () => {
      const state = loadStickerAiState() || {};
      const assetState = buildAssetStateFromMemory();
      writeAssetStateForMode(state, stickerAiMode, assetState);
      state.mode = stickerAiMode;
      persistStickerAiState(state);
    };

    const persistStickerAiSelection = () => {
      const state = loadStickerAiState();
      if (state && typeof state === 'object') {
        const assetState = normalizeAssetState(getAssetStateFromState(state, stickerAiMode) || {});
        assetState.selectedIndex = selectedGeneratedIndex;
        writeAssetStateForMode(state, stickerAiMode, assetState);
        state.mode = stickerAiMode;
        persistStickerAiState(state);
        return;
      }
      persistStickerAiMeta();
    };

    const persistStickerAiGenerated = async images => {
      const previous = loadStickerAiState();
      if (previous) {
        const prevAsset = getAssetStateFromState(previous, stickerAiMode);
        if (prevAsset) clearStickerAiAssets(prevAsset);
      }
      const now = Date.now();
      const stored = [];
      for (let i = 0; i < images.length; i++) {
        const item = normalizeStickerAiImage(images[i]);
        if (item.dataUrl && item.dataUrl.startsWith('data:image/')) {
          const match = item.dataUrl.match(/^data:image\/([a-z0-9+.-]+);/i);
          const ext = match ? match[1].replace('jpeg', 'jpg') : 'png';
          const fileName = `sticker_ai_${now}_${i + 1}.${ext}`;
          const path = await saveStickerAsset(item.dataUrl, fileName, STICKER_AI_ASSET_SESSION);
          if (path) {
            stored.push({ path });
          } else {
            stored.push({ dataUrl: item.dataUrl });
          }
          continue;
        }
        if (item.url) {
          stored.push({ url: item.url });
        }
      }
      setModeCaches(stickerAiMode);
      sliceSettingsCache.clear();
      autoSliceCache.clear();
      lastSlicePreviewKey = '';
      sliceSettingsTouched = false;
      const prevState = loadStickerAiState() || {};
      const assetState = {
        generated: stored,
        slices: [],
        selectedIndex: 0,
        sliceSettings: {},
      };
      writeAssetStateForMode(prevState, stickerAiMode, assetState);
      prevState.mode = stickerAiMode;
      persistStickerAiState(prevState);
      return stored;
    };

    const persistStickerAiSlices = async items => {
      const state = loadStickerAiState() || {};
      const assetState = normalizeAssetState(getAssetStateFromState(state, stickerAiMode) || {});
      const prevSlices = Array.isArray(assetState.slices) ? assetState.slices : [];
      if (prevSlices.length) {
        prevSlices.forEach(item => {
          const path = String(item?.path || '').trim();
          if (!path) return;
          safeInvoke('delete_attachment', { sessionId: STICKER_AI_ASSET_SESSION, path }).catch(() => {});
        });
      }
      const now = Date.now();
      const stored = [];
      for (let i = 0; i < items.length; i++) {
        const current = normalizeStickerAiSlice(items[i]);
        let path = current.path;
        let fullPath = current.fullPath;
        if (!path && current.dataUrl && current.dataUrl.startsWith('data:image/')) {
          const match = current.dataUrl.match(/^data:image\/([a-z0-9+.-]+);/i);
          const ext = match ? match[1].replace('jpeg', 'jpg') : 'png';
          const fileName = `sticker_ai_slice_${now}_${i + 1}.${ext}`;
          path = await saveStickerAsset(current.dataUrl, fileName, STICKER_AI_ASSET_SESSION);
        }
        if (!fullPath && current.fullDataUrl && current.fullDataUrl.startsWith('data:image/')) {
          const match = current.fullDataUrl.match(/^data:image\/([a-z0-9+.-]+);/i);
          const ext = match ? match[1].replace('jpeg', 'jpg') : 'png';
          const fileName = `sticker_ai_frame_${now}_${i + 1}.${ext}`;
          fullPath = await saveStickerAsset(current.fullDataUrl, fileName, STICKER_AI_ASSET_SESSION);
        }
        if (path) items[i].path = path;
        if (fullPath) items[i].fullPath = fullPath;
        stored.push({
          ...serializeStickerAiImage({ ...current, path }),
          fullPath: fullPath || '',
          fullDataUrl: fullPath ? '' : current.fullDataUrl,
          keyword: current.keyword,
          name: current.name,
          defaultName: current.defaultName,
          selected: current.selected,
        });
      }
      const nextAssetState = {
        generated: assetState.generated.length ? assetState.generated : generatedImages.map(serializeStickerAiImage),
        slices: stored,
        selectedIndex: selectedGeneratedIndex,
        sliceSettings: serializeSliceSettingsCache(),
      };
      writeAssetStateForMode(state, stickerAiMode, nextAssetState);
      state.mode = stickerAiMode;
      persistStickerAiState(state);
      return stored;
    };

    const initialState = loadStickerAiState();
    if (initialState) applyStickerAiState(initialState);

    const zoomOverlay = document.createElement('div');
    zoomOverlay.className = 'sticker-ai-zoom-overlay';
    const zoomModal = document.createElement('div');
    zoomModal.className = 'sticker-ai-zoom-modal';
    zoomModal.innerHTML = `
      <div class="sticker-ai-zoom-header">
        <div class="sticker-ai-zoom-title">放大编辑</div>
        <button type="button" class="sticker-ai-zoom-close" aria-label="关闭">×</button>
      </div>
      <textarea class="sticker-ai-zoom-textarea" placeholder="输入内容"></textarea>
    `;
    let zoomTarget = null;
    const zoomTitle = zoomModal.querySelector('.sticker-ai-zoom-title');
    const zoomTextarea = zoomModal.querySelector('.sticker-ai-zoom-textarea');
    const zoomClose = zoomModal.querySelector('.sticker-ai-zoom-close');
    const zoomTargets = {
      style: { input: styleInput, label: '风格描述' },
      'sprite-extra': { input: spriteExtraInput, label: '补充描述' },
      template: { input: templateInput, label: '提示词模板' },
      final: { input: finalInput, label: '完整提示词' },
    };
    const openZoom = (key) => {
      const target = zoomTargets[key];
      if (!target?.input) return;
      zoomTarget = target.input;
      if (zoomTitle) zoomTitle.textContent = target.label || '放大编辑';
      if (zoomTextarea) zoomTextarea.value = String(zoomTarget.value || '');
      zoomOverlay.classList.add('is-active');
      zoomModal.classList.add('is-active');
      zoomTextarea?.focus();
    };
    const closeZoom = () => {
      zoomOverlay.classList.remove('is-active');
      zoomModal.classList.remove('is-active');
      zoomTarget = null;
    };
    zoomOverlay.addEventListener('click', closeZoom);
    zoomModal.addEventListener('click', event => event.stopPropagation());
    zoomClose?.addEventListener('click', closeZoom);
    zoomTextarea?.addEventListener('input', () => {
      if (!zoomTarget) return;
      zoomTarget.value = zoomTextarea.value;
      zoomTarget.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const setStatus = (text, tone = '') => {
      if (!statusEl) return;
      statusEl.textContent = String(text || '');
      statusEl.dataset.tone = tone;
    };

    const setBusy = busy => {
      if (buildBtn) buildBtn.disabled = busy;
      if (renderBtn) renderBtn.disabled = busy;
      if (uploadBtn) uploadBtn.disabled = busy;
      if (resetBtn) resetBtn.disabled = busy;
      if (continueBtn) continueBtn.disabled = busy;
      if (sliceBtn) sliceBtn.disabled = busy;
      if (autoSliceBtn) autoSliceBtn.disabled = busy;
      if (saveBtn) saveBtn.disabled = busy;
      if (downloadZipBtn) downloadZipBtn.disabled = busy;
    };

    const updateStateFromStickerInputs = state => {
      state.styleText = String(styleInput?.value || '');
      state.templateText = String(templateInput?.value || '');
      state.finalText = String(finalInput?.value || '');
    };
    const updateStateFromSpriteInputs = state => {
      const spriteState = state.sprite && typeof state.sprite === 'object' ? state.sprite : {};
      spriteState.form = readSpriteFormState();
      spriteState.templateText = String(templateInput?.value || '');
      spriteState.finalText = String(finalInput?.value || '');
      state.sprite = spriteState;
    };
    const applyModeInputsFromState = (state, mode) => {
      if (mode === 'sprite') {
        const spriteState = state?.sprite && typeof state.sprite === 'object' ? state.sprite : {};
        const spriteForm = spriteState?.form && typeof spriteState.form === 'object' ? spriteState.form : spriteState;
        applySpriteFormState(spriteForm);
      } else if (styleInput) {
        styleInput.value = typeof state?.styleText === 'string' ? state.styleText : '';
      }
      applyModeTexts(state, mode);
      if (templateInput && !String(templateInput.value || '').trim()) {
        templateInput.value = getDefaultTemplateForMode(mode);
      }
    };
    const setStickerAiMode = (mode, { persist = true } = {}) => {
      const next = mode === 'sprite' ? 'sprite' : 'sticker';
      if (next === stickerAiMode) return;
      const state = loadStickerAiState() || {};
      const currentAssetState = buildAssetStateFromMemory();
      writeAssetStateForMode(state, stickerAiMode, currentAssetState);
      writePreviewSettingsToState(state, stickerAiMode, readPreviewSettings());
      if (stickerAiMode === 'sprite') {
        updateStateFromSpriteInputs(state);
      } else {
        updateStateFromStickerInputs(state);
      }
      stickerAiMode = next;
      state.mode = next;
      applyModeInputsFromState(state, next);
      applyAssetStateFromStore(state, next);
      applyPreviewSettings(getPreviewSettingsFromState(state, next));
      updateStickerAiModeUI();
      applySliceDefaultsForMode(next);
      renderPreview();
      renderSliceList();
      updateAnimationPreview();
      if (persist) persistStickerAiState(state);
    };

    const scheduleTextSave = (immediate = false) => {
      if (!templateInput || !finalInput) return;
      if (textSaveTimer) {
        clearTimeout(textSaveTimer);
        textSaveTimer = null;
      }
      const delay = immediate ? 0 : 360;
      textSaveTimer = setTimeout(() => {
        textSaveTimer = null;
        const state = loadStickerAiState() || {};
        if (stickerAiMode === 'sprite') {
          updateStateFromSpriteInputs(state);
        } else {
          updateStateFromStickerInputs(state);
        }
        state.mode = stickerAiMode;
        persistStickerAiState(state);
      }, delay);
    };

    const schedulePreviewSettingsSave = (immediate = false) => {
      if (previewSettingsSaveTimer) {
        clearTimeout(previewSettingsSaveTimer);
        previewSettingsSaveTimer = null;
      }
      const delay = immediate ? 0 : 240;
      previewSettingsSaveTimer = setTimeout(() => {
        previewSettingsSaveTimer = null;
        const state = loadStickerAiState() || {};
        writePreviewSettingsToState(state, stickerAiMode, readPreviewSettings());
        state.mode = stickerAiMode;
        persistStickerAiState(state);
      }, delay);
    };

    const scheduleSliceSettingsSave = (immediate = false) => {
      if (sliceSettingsSaveTimer) {
        clearTimeout(sliceSettingsSaveTimer);
        sliceSettingsSaveTimer = null;
      }
      const delay = immediate ? 0 : 240;
      sliceSettingsSaveTimer = setTimeout(() => {
        sliceSettingsSaveTimer = null;
        const state = loadStickerAiState() || {};
        const assetState = buildAssetStateFromMemory();
        writeAssetStateForMode(state, stickerAiMode, assetState);
        state.mode = stickerAiMode;
        persistStickerAiState(state);
      }, delay);
    };

    const scheduleSlicePreview = (options = {}) => {
      if (!generatedImages.length) return;
      if (slicePreviewTimer) {
        clearTimeout(slicePreviewTimer);
        slicePreviewTimer = null;
      }
      if (slicePreviewIdle) {
        if (typeof cancelIdleCallback === 'function') {
          cancelIdleCallback(slicePreviewIdle);
        }
        slicePreviewIdle = null;
      }
      const delay = options.immediate ? 0 : 360;
      const auto = Boolean(options.auto);
      slicePreviewTimer = setTimeout(() => {
        slicePreviewTimer = null;
        const run = () => handleSliceSheet({ silent: true, auto });
        if (typeof requestIdleCallback === 'function') {
          slicePreviewIdle = requestIdleCallback(
            () => {
              slicePreviewIdle = null;
              run();
            },
            { timeout: 1200 },
          );
        } else {
          run();
        }
      }, delay);
    };

    const renderPreview = (items = null) => {
      if (!previewEl) return;
      if (Array.isArray(items)) {
        generatedImages = items.slice();
        selectedGeneratedIndex = 0;
        sliceItems = [];
        sliceSettingsTouched = false;
        lastSlicePreviewKey = '';
        setModeCaches(stickerAiMode);
        sliceSettingsCache.clear();
        autoSliceCache.clear();
        applySliceDefaultsForMode(stickerAiMode);
        renderSliceList();
      }
      previewEl.innerHTML = '';
      if (!generatedImages.length) return;
      generatedImages.forEach((item, idx) => {
        const src = getStickerAiImageSource(item);
        if (!src) return;
        const wrap = document.createElement('div');
        wrap.className = 'sticker-ai-preview-item';
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'AI 贴图源图';
        if (idx === selectedGeneratedIndex) img.classList.add('is-selected');
        img.addEventListener('click', () => {
          selectedGeneratedIndex = idx;
          const imageKey = getStickerAiImageKey(item, idx);
          const cached = sliceSettingsCache.get(imageKey);
          if (cached) {
            applySliceSettings(cached);
            sliceSettingsTouched = true;
          } else {
            sliceSettingsTouched = false;
          }
          lastSlicePreviewKey = '';
          renderPreview();
          persistStickerAiSelection();
          scheduleSlicePreview({ immediate: true, auto: !cached });
        });
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'sticker-ai-preview-download';
        downloadBtn.setAttribute('aria-label', '下载贴图');
        downloadBtn.title = '下载贴图';
        downloadBtn.textContent = '↓';
        downloadBtn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          handleDownloadCurrentPreview(item, idx);
        });
        wrap.appendChild(img);
        wrap.appendChild(downloadBtn);
        previewEl.appendChild(wrap);
      });
      if (Array.isArray(items) && generatedImages.length) {
        scheduleSlicePreview({ immediate: true, auto: true });
      }
    };

    const renderReferenceList = () => {
      if (!refListEl) return;
      refListEl.innerHTML = '';
      if (!referenceImages.length) return;
      referenceImages.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'sticker-ai-ref-item';
        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = item.name || '参考图片';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'sticker-ai-ref-remove';
        remove.textContent = '×';
        remove.dataset.index = String(idx);
        wrap.appendChild(img);
        wrap.appendChild(remove);
        refListEl.appendChild(wrap);
      });
    };

    let preferredPackId = '';
    const renderPackOptions = () => {
      if (!packSelectEl) return;
      const currentValue = String(packSelectEl.value || '').trim();
      const nextPreferred = String(preferredPackId || '').trim();
      packSelectEl.innerHTML = '';
      const createOption = document.createElement('option');
      createOption.value = '__new__';
      createOption.textContent = '新建贴图包';
      packSelectEl.appendChild(createOption);
      const packs = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs : [];
      packs.forEach((pack, idx) => {
        const option = document.createElement('option');
        option.value = String(pack?.id || '');
        option.textContent = formatStickerPackLabel(pack, idx);
        packSelectEl.appendChild(option);
      });
      const candidate = nextPreferred || currentValue;
      if (candidate && candidate !== '__new__' && packs.some(pack => String(pack?.id || '') === candidate)) {
        packSelectEl.value = candidate;
        return;
      }
      if (currentValue && currentValue !== '__new__') {
        packSelectEl.value = '__new__';
      }
    };

    const stopAnimationPreview = () => {
      if (animPreviewTimer) {
        clearInterval(animPreviewTimer);
        animPreviewTimer = null;
      }
      animPreviewFrameIndex = 0;
    };

    const getAnimationFrames = () => {
      const all = sliceItems
        .map(item => ({ item, src: getStickerAiImageSource(item) }))
        .filter(entry => entry.src);
      const selected = all.filter(entry => entry.item.selected !== false);
      const useSelected = animPreviewSelectedInput ? Boolean(animPreviewSelectedInput.checked) : PREVIEW_SETTINGS_DEFAULTS.selectedOnly;
      return (useSelected ? selected : all).map(entry => entry.src);
    };

    const updateAnimationPreview = () => {
      if (!animPreviewImg || !animPreviewPlaceholder) return;
      stopAnimationPreview();
      const frames = getAnimationFrames();
      if (!frames.length) {
        animPreviewImg.style.display = 'none';
        animPreviewPlaceholder.style.display = 'flex';
        animPreviewPlaceholder.textContent = sliceItems.length ? '未选择任何帧' : '暂无切割结果';
        return;
      }
      animPreviewPlaceholder.style.display = 'none';
      animPreviewImg.style.display = 'block';
      animPreviewImg.src = frames[0];
      const settings = readPreviewSettings();
      const interval = Math.max(16, Math.round(1000 / settings.fps));
      animPreviewTimer = setInterval(() => {
        animPreviewFrameIndex = (animPreviewFrameIndex + 1) % frames.length;
        animPreviewImg.src = frames[animPreviewFrameIndex];
      }, interval);
    };

    const renderSliceList = () => {
      if (!sliceListEl) return;
      sliceListEl.innerHTML = '';
      if (!sliceItems.length) {
        updateAnimationPreview();
        return;
      }
      sliceItems.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'sticker-ai-slice-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected !== false;
        checkbox.dataset.index = String(idx);
        const img = document.createElement('img');
        img.src = getStickerAiImageSource(item);
        img.alt = item.keyword || item.name || item.defaultName || `贴图${idx + 1}`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.keyword || item.name || '';
        input.placeholder = '关键词';
        input.dataset.index = String(idx);
        card.appendChild(checkbox);
        card.appendChild(img);
        card.appendChild(input);
        sliceListEl.appendChild(card);
      });
      updateAnimationPreview();
    };

    const readSliceSettings = () => ({
      rows: clampNumber(rowsInput?.value, 1, 20, STICKER_SLICE_DEFAULTS.rows),
      cols: clampNumber(colsInput?.value, 1, 20, STICKER_SLICE_DEFAULTS.cols),
      margin: clampNumber(marginInput?.value, 0, 200, STICKER_SLICE_DEFAULTS.margin),
      gap: clampNumber(gapInput?.value, 0, 200, STICKER_SLICE_DEFAULTS.gap),
      tolerance: clampNumber(toleranceInput?.value, 5, 80, STICKER_SLICE_DEFAULTS.tolerance),
      shrink: clampNumber(shrinkInput?.value, 0, 6, STICKER_SLICE_DEFAULTS.shrink),
      feather: clampNumber(featherInput?.value, 0, 8, STICKER_SLICE_DEFAULTS.feather),
    });

    const applySliceSettings = (settings = {}) => {
      suppressSliceSettingsTouch = true;
      if (rowsInput && Number.isFinite(settings.rows)) rowsInput.value = String(settings.rows);
      if (colsInput && Number.isFinite(settings.cols)) colsInput.value = String(settings.cols);
      if (marginInput && Number.isFinite(settings.margin)) marginInput.value = String(settings.margin);
      if (gapInput && Number.isFinite(settings.gap)) gapInput.value = String(settings.gap);
      if (toleranceInput && Number.isFinite(settings.tolerance)) toleranceInput.value = String(settings.tolerance);
      if (shrinkInput && Number.isFinite(settings.shrink)) shrinkInput.value = String(settings.shrink);
      if (featherInput && Number.isFinite(settings.feather)) featherInput.value = String(settings.feather);
      suppressSliceSettingsTouch = false;
    };

    const applyCachedSliceSettingsForSelection = () => {
      const key = getCurrentStickerAiImageKey();
      if (!key) return false;
      const cached = sliceSettingsCache.get(key);
      if (!cached) return false;
      applySliceSettings(cached);
      sliceSettingsTouched = true;
      return true;
    };


    const sampleCornerStats = (data, width, height, size) => {
      const clamp = (v, max) => Math.min(max, Math.max(0, v));
      const points = [
        { x: 0, y: 0 },
        { x: width - size, y: 0 },
        { x: 0, y: height - size },
        { x: width - size, y: height - size },
      ];
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let totalR2 = 0;
      let totalG2 = 0;
      let totalB2 = 0;
      let count = 0;
      points.forEach((pt) => {
        const startX = clamp(pt.x, width - 1);
        const startY = clamp(pt.y, height - 1);
        for (let y = startY; y < startY + size && y < height; y++) {
          for (let x = startX; x < startX + size && x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            totalR += r;
            totalG += g;
            totalB += b;
            totalR2 += r * r;
            totalG2 += g * g;
            totalB2 += b * b;
            count += 1;
          }
        }
      });
      if (!count) {
        return { r: 255, g: 255, b: 255, dev: 0, count: 0 };
      }
      const meanR = totalR / count;
      const meanG = totalG / count;
      const meanB = totalB / count;
      const varR = totalR2 / count - meanR * meanR;
      const varG = totalG2 / count - meanG * meanG;
      const varB = totalB2 / count - meanB * meanB;
      return {
        r: Math.round(meanR),
        g: Math.round(meanG),
        b: Math.round(meanB),
        dev: Math.sqrt(Math.max(0, varR, varG, varB)),
        count,
      };
    };

    const sampleCornerColor = (data, width, height, size) => {
      const stats = sampleCornerStats(data, width, height, size);
      return {
        r: stats.r,
        g: stats.g,
        b: stats.b,
      };
    };

    const computeAutoTolerance = stats => {
      if (!stats || !Number.isFinite(stats.dev)) return null;
      const suggested = Math.round(stats.dev * 2.2 + 6);
      return clampNumber(suggested, 10, 50, 28);
    };

    const computeMedian = (values = []) => {
      const list = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      const len = list.length;
      if (!len) return 0;
      const mid = Math.floor(len / 2);
      if (len % 2) return list[mid];
      return Math.round((list[mid - 1] + list[mid]) / 2);
    };

    const extractBands = (flags, minSize = 1) => {
      const bands = [];
      let start = null;
      for (let i = 0; i < flags.length; i++) {
        if (flags[i]) {
          if (start === null) start = i;
        } else if (start !== null) {
          if (i - start >= minSize) bands.push({ start, end: i });
          start = null;
        }
      }
      if (start !== null && flags.length - start >= minSize) {
        bands.push({ start, end: flags.length });
      }
      if (bands.length < 2) return bands;
      const merged = [bands[0]];
      for (let i = 1; i < bands.length; i++) {
        const last = merged[merged.length - 1];
        const next = bands[i];
        if (next.start - last.end <= 1) {
          last.end = next.end;
        } else {
          merged.push(next);
        }
      }
      return merged;
    };

    const buildCellRanges = (bands, length) => {
      const ranges = [];
      let cursor = 0;
      bands.forEach(band => {
        if (band.start > cursor) {
          ranges.push({ start: cursor, end: band.start });
        }
        cursor = Math.max(cursor, band.end);
      });
      if (cursor < length) {
        ranges.push({ start: cursor, end: length });
      }
      return ranges;
    };

    const filterCellRanges = (ranges) => {
      if (!ranges.length) return { ranges: [], median: 0 };
      const sizes = ranges.map(r => r.end - r.start).filter(s => s > 0);
      if (!sizes.length) return { ranges: [], median: 0 };
      const median = computeMedian(sizes);
      if (sizes.length < 2) return { ranges, median };
      const minCell = Math.max(2, Math.round(median * 0.5));
      const filtered = ranges.filter(r => (r.end - r.start) >= minCell);
      return { ranges: filtered.length ? filtered : ranges, median };
    };

    const computeMedianGap = (ranges) => {
      if (ranges.length < 2) return 0;
      const gaps = [];
      for (let i = 0; i < ranges.length - 1; i++) {
        gaps.push(ranges[i + 1].start - ranges[i].end);
      }
      return computeMedian(gaps);
    };

    const computeAdaptiveThreshold = (scores, fallback = 0.9) => {
      if (!scores?.length) return fallback;
      const sorted = Array.from(scores).sort((a, b) => a - b);
      const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
      const p90 = pick(0.9);
      const p95 = pick(0.95);
      return Math.max(0.7, Math.min(0.98, p90 + (p95 - p90) * 0.5));
    };

    const computeLineScores = (data, width, height, baseColor, tolerance) => {
      const stepX = clampNumber(Math.round(width / 900), 1, 8, 3);
      const stepY = clampNumber(Math.round(height / 900), 1, 8, 3);
      const darkThreshold = 60;
      const tol = Number.isFinite(tolerance) ? tolerance : 28;
      const rowScore = new Float32Array(height);
      for (let y = 0; y < height; y++) {
        let total = 0;
        let bg = 0;
        let dark = 0;
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x += stepX) {
          const idx = rowOffset + x * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const dr = Math.abs(r - baseColor.r);
          const dg = Math.abs(g - baseColor.g);
          const db = Math.abs(b - baseColor.b);
          if (Math.max(dr, dg, db) <= tol) bg += 1;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luma <= darkThreshold) dark += 1;
          total += 1;
        }
        rowScore[y] = total ? Math.max(bg / total, dark / total) : 0;
      }
      const colScore = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        let total = 0;
        let bg = 0;
        let dark = 0;
        for (let y = 0; y < height; y += stepY) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const dr = Math.abs(r - baseColor.r);
          const dg = Math.abs(g - baseColor.g);
          const db = Math.abs(b - baseColor.b);
          if (Math.max(dr, dg, db) <= tol) bg += 1;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luma <= darkThreshold) dark += 1;
          total += 1;
        }
        colScore[x] = total ? Math.max(bg / total, dark / total) : 0;
      }
      return { rowScore, colScore };
    };

    const scoreAt = (scores, pos, radius = 1) => {
      if (!scores?.length) return 0;
      const start = Math.max(0, Math.round(pos - radius));
      const end = Math.min(scores.length - 1, Math.round(pos + radius));
      let total = 0;
      let count = 0;
      for (let i = start; i <= end; i++) {
        total += scores[i];
        count += 1;
      }
      return count ? total / count : 0;
    };

    const refineGridWithScores = (rowScore, colScore, width, height, settings) => {
      const rows = settings.rows;
      const cols = settings.cols;
      let baseMargin = clampNumber(settings.margin, 0, 200, 16);
      let baseGap = clampNumber(settings.gap, 0, 200, 8);
      const marginRange = clampNumber(Math.round(Math.min(width, height) * 0.02), 6, 28, 16);
      const gapRange = clampNumber(Math.round(Math.min(width, height) * 0.01), 4, 24, 10);
      let bestScore = -1;
      let bestMargin = baseMargin;
      let bestGap = baseGap;
      const scoreGrid = (margin, gap) => {
        const cellH = (height - margin * 2 - gap * (rows - 1)) / rows;
        const cellW = (width - margin * 2 - gap * (cols - 1)) / cols;
        if (!Number.isFinite(cellH) || !Number.isFinite(cellW)) return -1;
        if (cellH <= 2 || cellW <= 2) return -1;
        let total = 0;
        const lineRadius = 1;
        for (let r = 0; r < rows - 1; r++) {
          const pos = margin + (r + 1) * cellH + r * gap + gap / 2;
          total += scoreAt(rowScore, pos, lineRadius);
        }
        for (let c = 0; c < cols - 1; c++) {
          const pos = margin + (c + 1) * cellW + c * gap + gap / 2;
          total += scoreAt(colScore, pos, lineRadius);
        }
        return total;
      };
      for (let margin = baseMargin - marginRange; margin <= baseMargin + marginRange; margin++) {
        const clampedMargin = clampNumber(margin, 0, 200, margin);
        for (let gap = baseGap - gapRange; gap <= baseGap + gapRange; gap++) {
          const clampedGap = clampNumber(gap, 0, 200, gap);
          const score = scoreGrid(clampedMargin, clampedGap);
          if (score > bestScore) {
            bestScore = score;
            bestMargin = clampedMargin;
            bestGap = clampedGap;
          }
        }
      }
      return { margin: bestMargin, gap: bestGap };
    };

    const detectAutoSliceSettings = (img, options = {}) => {
      if (!img?.width || !img?.height) return null;
      const maxDim = Number.isFinite(options.maxDim) ? options.maxDim : 960;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const sw = Math.max(1, Math.round(img.width * scale));
      const sh = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, sw, sh);
      const imageData = ctx.getImageData(0, 0, sw, sh);
      const sampleSize = Math.max(2, Math.round(Math.min(sw, sh) * 0.02));
      const cornerStats = sampleCornerStats(imageData.data, sw, sh, sampleSize);
      const baseColor = { r: cornerStats.r, g: cornerStats.g, b: cornerStats.b };
      const bgTolerance = computeAutoTolerance(cornerStats);
      const rowBg = new Uint16Array(sh);
      const rowDark = new Uint16Array(sh);
      const colBg = new Uint16Array(sw);
      const colDark = new Uint16Array(sw);
      const darkThreshold = 60;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = (y * sw + x) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          const dr = Math.abs(r - baseColor.r);
          const dg = Math.abs(g - baseColor.g);
          const db = Math.abs(b - baseColor.b);
          const isBg = bgTolerance !== null ? Math.max(dr, dg, db) <= bgTolerance : false;
          if (isBg) {
            rowBg[y] += 1;
            colBg[x] += 1;
          }
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (luma <= darkThreshold) {
            rowDark[y] += 1;
            colDark[x] += 1;
          }
        }
      }
      const rowScore = new Float32Array(sh);
      const colScore = new Float32Array(sw);
      for (let y = 0; y < sh; y++) {
        rowScore[y] = Math.max(rowBg[y] / sw, rowDark[y] / sw);
      }
      for (let x = 0; x < sw; x++) {
        colScore[x] = Math.max(colBg[x] / sh, colDark[x] / sh);
      }
      const rowSep = new Array(sh).fill(false);
      const colSep = new Array(sw).fill(false);
      const rowThreshold = computeAdaptiveThreshold(rowScore);
      const colThreshold = computeAdaptiveThreshold(colScore);
      for (let y = 0; y < sh; y++) {
        rowSep[y] = rowScore[y] >= rowThreshold;
      }
      for (let x = 0; x < sw; x++) {
        colSep[x] = colScore[x] >= colThreshold;
      }
      const rowBands = extractBands(rowSep, 1);
      const colBands = extractBands(colSep, 1);
      const rowRangesInfo = filterCellRanges(buildCellRanges(rowBands, sh));
      const colRangesInfo = filterCellRanges(buildCellRanges(colBands, sw));
      const result = {};
      if (bgTolerance !== null) result.tolerance = bgTolerance;
      if (rowRangesInfo.ranges.length >= 2 && colRangesInfo.ranges.length >= 2) {
        const rows = clampNumber(rowRangesInfo.ranges.length, 1, 20, rowRangesInfo.ranges.length);
        const cols = clampNumber(colRangesInfo.ranges.length, 1, 20, colRangesInfo.ranges.length);
        const rowMargin = rowRangesInfo.ranges[0].start;
        const colMargin = colRangesInfo.ranges[0].start;
        const rowGap = computeMedianGap(rowRangesInfo.ranges);
        const colGap = computeMedianGap(colRangesInfo.ranges);
        const scaleX = img.width / sw;
        const scaleY = img.height / sh;
        const margin = Math.round((rowMargin * scaleY + colMargin * scaleX) / 2);
        const gap = Math.round((rowGap * scaleY + colGap * scaleX) / 2);
        result.rows = rows;
        result.cols = cols;
        result.margin = clampNumber(margin, 0, 200, margin);
        result.gap = clampNumber(gap, 0, 200, gap);
      }
      const sourceData = options.sourceData;
      const sourceWidth = options.sourceWidth || img.width;
      const sourceHeight = options.sourceHeight || img.height;
      if (sourceData && result.rows && result.cols) {
        const sourceSample = Math.max(2, Math.round(Math.min(sourceWidth, sourceHeight) * 0.01));
        const sourceStats = sampleCornerStats(sourceData.data, sourceWidth, sourceHeight, sourceSample);
        const sourceTolerance = computeAutoTolerance(sourceStats);
        if (Number.isFinite(sourceTolerance)) {
          result.tolerance = sourceTolerance;
        }
        const base = { r: sourceStats.r, g: sourceStats.g, b: sourceStats.b };
        const scores = computeLineScores(sourceData.data, sourceWidth, sourceHeight, base, result.tolerance);
        const refined = refineGridWithScores(scores.rowScore, scores.colScore, sourceWidth, sourceHeight, result);
        result.margin = refined.margin;
        result.gap = refined.gap;
      }
      return Object.keys(result).length ? result : null;
    };

    const buildSlicePreviewKey = (imageKey, settings) => [
      imageKey,
      settings.rows,
      settings.cols,
      settings.margin,
      settings.gap,
      settings.tolerance,
      settings.shrink,
      settings.feather,
    ].join('|');

    const buildBackgroundMask = (data, width, height, baseColor, tolerance) => {
      const mask = new Uint8Array(width * height);
      const stack = [];
      const isBg = (x, y) => {
        const idx = (y * width + x) * 4;
        const dr = Math.abs(data[idx] - baseColor.r);
        const dg = Math.abs(data[idx + 1] - baseColor.g);
        const db = Math.abs(data[idx + 2] - baseColor.b);
        return Math.max(dr, dg, db) <= tolerance;
      };
      const pushIf = (x, y) => {
        const idx = y * width + x;
        if (mask[idx]) return;
        if (!isBg(x, y)) return;
        mask[idx] = 1;
        stack.push([x, y]);
      };
      for (let x = 0; x < width; x++) {
        pushIf(x, 0);
        pushIf(x, height - 1);
      }
      for (let y = 0; y < height; y++) {
        pushIf(0, y);
        pushIf(width - 1, y);
      }
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x > 0) pushIf(x - 1, y);
        if (x < width - 1) pushIf(x + 1, y);
        if (y > 0) pushIf(x, y - 1);
        if (y < height - 1) pushIf(x, y + 1);
      }
      return mask;
    };

    const dilateMask = (mask, width, height, iterations) => {
      if (iterations <= 0) return mask;
      let current = mask;
      for (let i = 0; i < iterations; i++) {
        const next = current.slice();
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (current[idx]) continue;
            const left = x > 0 ? current[idx - 1] : 0;
            const right = x < width - 1 ? current[idx + 1] : 0;
            const up = y > 0 ? current[idx - width] : 0;
            const down = y < height - 1 ? current[idx + width] : 0;
            if (left || right || up || down) next[idx] = 1;
          }
        }
        current = next;
      }
      return current;
    };

    const applyMaskToImage = (imageData, mask, width, height, featherRadius) => {
      const data = imageData.data;
      if (featherRadius <= 0) {
        for (let i = 0; i < mask.length; i++) {
          if (mask[i]) data[i * 4 + 3] = 0;
        }
        return imageData;
      }
      const radius = Math.max(1, Math.trunc(featherRadius));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (mask[idx]) {
            data[idx * 4 + 3] = 0;
            continue;
          }
          let minDist = null;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              const nidx = ny * width + nx;
              if (!mask[nidx]) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (minDist === null || dist < minDist) minDist = dist;
            }
          }
          if (minDist !== null) {
            const alphaScale = Math.min(1, Math.max(0, minDist / (radius + 0.5)));
            const baseAlpha = data[idx * 4 + 3] / 255;
            data[idx * 4 + 3] = Math.round(255 * Math.min(baseAlpha, alphaScale));
          }
        }
      }
      return imageData;
    };

    const sliceStickerSheet = (canvas, settings, options = {}) => {
      const { rows, cols, margin, gap, alphaThreshold } = settings;
      const keepFullFrame = Boolean(options.keepFullFrame);
      const width = canvas.width;
      const height = canvas.height;
      const cellWidth = Math.floor((width - margin * 2 - gap * (cols - 1)) / cols);
      const cellHeight = Math.floor((height - margin * 2 - gap * (rows - 1)) / rows);
      if (cellWidth <= 0 || cellHeight <= 0) {
        throw new Error('切割参数不合法，请检查行列与间距');
      }
      const ctx = canvas.getContext('2d');
      const slices = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = margin + col * (cellWidth + gap);
          const y = margin + row * (cellHeight + gap);
          const cellData = ctx.getImageData(x, y, cellWidth, cellHeight);
          let minX = cellWidth;
          let minY = cellHeight;
          let maxX = -1;
          let maxY = -1;
          for (let cy = 0; cy < cellHeight; cy++) {
            for (let cx = 0; cx < cellWidth; cx++) {
              const idx = (cy * cellWidth + cx) * 4 + 3;
              if (cellData.data[idx] > alphaThreshold) {
                if (cx < minX) minX = cx;
                if (cy < minY) minY = cy;
                if (cx > maxX) maxX = cx;
                if (cy > maxY) maxY = cy;
              }
            }
          }
          if (maxX < 0) continue;
          const trimW = maxX - minX + 1;
          const trimH = maxY - minY + 1;
          const cellCanvas = document.createElement('canvas');
          cellCanvas.width = cellWidth;
          cellCanvas.height = cellHeight;
          const cellCtx = cellCanvas.getContext('2d');
          cellCtx.putImageData(cellData, 0, 0);
          const outCanvas = document.createElement('canvas');
          outCanvas.width = trimW;
          outCanvas.height = trimH;
          const outCtx = outCanvas.getContext('2d');
          outCtx.drawImage(cellCanvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
          slices.push({
            dataUrl: outCanvas.toDataURL('image/png'),
            fullDataUrl: keepFullFrame ? cellCanvas.toDataURL('image/png') : '',
            name: '',
            keyword: '',
            defaultName: `贴图${slices.length + 1}`,
            selected: true,
          });
        }
      }
      return slices;
    };

    const handleSliceSheet = async (options = {}) => {
      const silent = Boolean(options.silent);
      const auto = Boolean(options.auto);
      if (sliceInProgress) {
        slicePending = { silent, auto };
        return;
      }
      const current = generatedImages[selectedGeneratedIndex];
      const source = getStickerAiImageSource(current);
      if (!source) {
        if (!silent) window.toastr?.warning?.('请先生成贴图原图');
        return;
      }
      const imageKey = getStickerAiImageKey(current, selectedGeneratedIndex);
      sliceInProgress = true;
      if (!silent) setBusy(true);
      if (!silent) setStatus('正在去背并切割...', 'loading');
      try {
        const img = await loadImageElement(source);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (auto && !sliceSettingsTouched) {
          const cacheKey = imageKey;
          let autoSettings = autoSliceCache.get(cacheKey);
          if (!autoSettings) {
            autoSettings = detectAutoSliceSettings(img, {
              maxDim: 960,
              sourceData: imageData,
              sourceWidth: canvas.width,
              sourceHeight: canvas.height,
            });
            if (autoSettings) autoSliceCache.set(cacheKey, autoSettings);
          }
          if (autoSettings) applySliceSettings(autoSettings);
        }
        const settings = readSliceSettings();
        rememberSliceSettings(settings);
        scheduleSliceSettingsSave(true);
        const previewKey = buildSlicePreviewKey(imageKey, settings);
        if (silent && previewKey === lastSlicePreviewKey) return;
        const baseColor = sampleCornerColor(imageData.data, canvas.width, canvas.height, 6);
        const mask = buildBackgroundMask(imageData.data, canvas.width, canvas.height, baseColor, settings.tolerance);
        const refinedMask = dilateMask(mask, canvas.width, canvas.height, settings.shrink);
        const processed = applyMaskToImage(imageData, refinedMask, canvas.width, canvas.height, settings.feather);
        ctx.putImageData(processed, 0, 0);
        sliceItems = sliceStickerSheet(
          canvas,
          {
            rows: settings.rows,
            cols: settings.cols,
            margin: settings.margin,
            gap: settings.gap,
            alphaThreshold: 5,
          },
          {
            keepFullFrame: stickerAiMode === 'sprite',
          },
        );
        renderSliceList();
        await persistStickerAiSlices(sliceItems);
        if (!silent) setStatus(`切割完成：${sliceItems.length} 张`, 'success');
        lastSlicePreviewKey = previewKey;
      } catch (err) {
        if (!silent) setStatus(`切割失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        if (!silent) setBusy(false);
        sliceInProgress = false;
        if (slicePending) {
          const next = slicePending;
          slicePending = null;
          if (next.silent) {
            scheduleSlicePreview({ immediate: true, auto: next.auto });
          } else {
            handleSliceSheet(next);
          }
        }
      }
    };

    const handleAutoInfer = async () => {
      if (sliceInProgress) {
        window.toastr?.warning?.('正在切割中，请稍候');
        return;
      }
      const current = generatedImages[selectedGeneratedIndex];
      const source = getStickerAiImageSource(current);
      if (!source) {
        window.toastr?.warning?.('请先生成贴图原图');
        return;
      }
      setBusy(true);
      setStatus('正在自动推断...', 'loading');
      try {
        const img = await loadImageElement(source);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const autoSettings = detectAutoSliceSettings(img, {
          maxDim: 960,
          sourceData: imageData,
          sourceWidth: canvas.width,
          sourceHeight: canvas.height,
        });
        if (!autoSettings) {
          setStatus('自动推断失败，请手动调整', 'error');
          return;
        }
        const imageKey = getStickerAiImageKey(current, selectedGeneratedIndex);
        autoSliceCache.set(imageKey, autoSettings);
        applySliceSettings(autoSettings);
        sliceSettingsTouched = true;
        rememberSliceSettings(readSliceSettings());
        scheduleSliceSettingsSave(true);
        lastSlicePreviewKey = '';
        setStatus('自动推断完成，可继续调整', 'success');
        scheduleSlicePreview({ immediate: true, auto: false });
      } catch (err) {
        setStatus(`自动推断失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        setBusy(false);
      }
    };

    const handleAddReference = async () => {
      const files = await pickFilesFromInput(stickerAiReferencePicker);
      if (!files.length) return;
      for (const file of files) {
        const rawDataUrl = await readFileAsDataUrl(file);
        if (!rawDataUrl) continue;
        let dataUrl = rawDataUrl;
        if (!isGifFile(file)) {
          try {
            dataUrl = await compressImageDataUrl(rawDataUrl, {
              maxDim: 1024,
              quality: 0.9,
              maxBytes: 1_500_000,
            });
          } catch {
            dataUrl = rawDataUrl;
          }
        }
        referenceImages.push({
          dataUrl,
          name: String(file?.name || '').trim(),
        });
      }
      renderReferenceList();
    };

    const normalizeKeywordKey = (value) => String(value || '').trim().toLowerCase();

    const collectExistingStickerKeywords = () => {
      const used = new Set();
      const add = (value) => {
        const key = normalizeKeywordKey(value);
        if (key) used.add(key);
      };
      listMediaAssets('sticker').forEach((item) => {
        add(item?.id);
        add(item?.label);
        const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
        aliases.forEach(alias => add(alias));
      });
      const packs = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs : [];
      packs.forEach((pack) => {
        (pack?.stickers || []).forEach((sticker) => {
          add(sticker?.keyword);
        });
      });
      return used;
    };

    const makeUniqueKeyword = (base, used) => {
      const raw = String(base || '').trim();
      if (!raw) return '';
      const normalized = normalizeKeywordKey(raw);
      if (!used.has(normalized)) {
        used.add(normalized);
        return raw;
      }
      let idx = 1;
      let next = `${raw}${idx}`;
      while (used.has(normalizeKeywordKey(next))) {
        idx += 1;
        next = `${raw}${idx}`;
      }
      used.add(normalizeKeywordKey(next));
      return next;
    };

    const handleSaveAnimation = async () => {
      if (!sliceItems.length) {
        window.toastr?.warning?.('暂无切割结果');
        return;
      }
      const selected = sliceItems.filter(item => item.selected !== false);
      if (!selected.length) {
        window.toastr?.warning?.('请先选择要保存的帧');
        return;
      }
      let packId = String(packSelectEl?.value || '').trim();
      if (!packId || packId === '__new__') {
        const pack = createStickerPack();
        packId = pack?.id || '';
        renderPackOptions();
        if (packSelectEl) packSelectEl.value = packId;
      }
      if (!packId) {
        window.toastr?.warning?.('未找到贴图包');
        return;
      }
      const pack = getStickerPackById(packId);
      if (!pack) {
        window.toastr?.warning?.('贴图包不存在');
        return;
      }
      setBusy(true);
      setStatus('正在保存动图...', 'loading');
      try {
        const fps = readPreviewSettings().fps;
        const frames = await saveAnimationFrames(selected);
        if (!frames.length) {
          throw new Error('未能保存动图帧');
        }
        if (frames.length < selected.length) {
          window.toastr?.warning?.(`动图帧保存不完整（${frames.length}/${selected.length}）`);
        }
        const usedKeywords = collectExistingStickerKeywords();
        const count = Array.isArray(pack.stickers) ? pack.stickers.length : 0;
        const fallbackName = `动图${count + 1}`;
        const rawKeyword = String(selected[0]?.keyword || '').trim();
        const nameCandidate = String(selected[0]?.name || selected[0]?.defaultName || '').trim();
        const baseName = nameCandidate || rawKeyword || fallbackName;
        const keyword = rawKeyword ? makeUniqueKeyword(rawKeyword, usedKeywords) : '';
        const name = baseName || fallbackName;
        const stickers = Array.isArray(pack.stickers) ? pack.stickers.slice() : [];
        stickers.push({
          id: String(Date.now()) + Math.random().toString(16).slice(2, 8),
          name,
          keyword,
          frames,
          fps,
          path: '',
          dataUrl: '',
        });
        const nextPack = { ...pack, stickers };
        const nextState = stickerPackStore.updatePack(packId, nextPack);
        syncStickerPackState(nextState);
        stickerPanelTab = `${STICKER_PACK_TAB_PREFIX}${packId}`;
        stickerPanelPage = 0;
        renderStickerPanel();
        setStatus(`已保存动图（${frames.length} 帧）`, 'success');
      } catch (err) {
        setStatus(`保存动图失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        setBusy(false);
      }
    };

    const handleUploadGenerated = async () => {
      const files = await pickFilesFromInput(stickerAiUploadPicker);
      if (!files.length) return;
      const images = [];
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl) continue;
        images.push({ dataUrl });
      }
      if (!images.length) {
        window.toastr?.warning?.('未读取到可用图片');
        return;
      }
      setBusy(true);
      setStatus('正在导入图片...', 'loading');
      try {
        const stored = await persistStickerAiGenerated(images);
        renderPreview(stored.length ? stored : images);
        setStatus('导入完成，可继续去背与切割', 'success');
      } catch (err) {
        setStatus(`导入失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        setBusy(false);
      }
    };

    const handleDownloadCurrentPreview = async (item, idx) => {
      if (!item) return;
      const ext = inferStickerAiExtension(item);
      const modeLabel = stickerAiMode === 'sprite' ? 'sprite' : 'sticker';
      const fileName = `${modeLabel}_source_${idx + 1}.${ext}`;
      const base = normalizeStickerAiImage(item);
      let dataUrl = base.dataUrl;
      if (!dataUrl && !base.path && base.url) {
        dataUrl = await readUrlAsDataUrl(base.url);
      }
      await exportAttachmentFile({
        dataUrl,
        sourcePath: base.path,
        fileName,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
    };

    const handleDownloadSlicesZip = async () => {
      if (!sliceItems.length) {
        window.toastr?.warning?.('暂无切割结果');
        return;
      }
      const selected = sliceItems.filter(item => item.selected !== false);
      if (!selected.length) {
        window.toastr?.warning?.('请先选择要下载的贴图');
        return;
      }
      const stamp = new Date();
      const pad = value => String(value).padStart(2, '0');
      const ts = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(
        stamp.getMinutes(),
      )}${pad(stamp.getSeconds())}`;
      const fileName = stickerAiMode === 'sprite' ? `sprite_slices_${ts}.zip` : `sticker_slices_${ts}.zip`;
      const entries = selected.map((item, index) => {
        const baseName = String(item.keyword || item.name || item.defaultName || `slice_${index + 1}`).trim();
        const safeName = sanitizeExportName(baseName, `slice_${index + 1}`);
        return {
          name: `${safeName}.png`,
          path: String(item.path || '').trim(),
          dataUrl: String(item.dataUrl || '').trim(),
        };
      });
      await exportStickerZip({ entries, fileName });
    };

    const handleSaveSlices = async () => {
      if (stickerAiMode === 'sprite') {
        await handleSaveAnimation();
        return;
      }
      if (!sliceItems.length) {
        window.toastr?.warning?.('暂无切割结果');
        return;
      }
      const selected = sliceItems.filter(item => item.selected !== false);
      if (!selected.length) {
        window.toastr?.warning?.('请先选择要保存的贴图');
        return;
      }
      let packId = String(packSelectEl?.value || '').trim();
      if (!packId || packId === '__new__') {
        const pack = createStickerPack();
        packId = pack?.id || '';
        renderPackOptions();
        if (packSelectEl) packSelectEl.value = packId;
      }
      if (!packId) {
        window.toastr?.warning?.('未找到贴图包');
        return;
      }
      const pack = getStickerPackById(packId);
      if (!pack) {
        window.toastr?.warning?.('贴图包不存在');
        return;
      }
      setBusy(true);
      try {
        const stickers = Array.isArray(pack.stickers) ? pack.stickers.slice() : [];
        const usedKeywords = collectExistingStickerKeywords();
        const updatedIndexes = new Set();
        for (let i = 0; i < selected.length; i++) {
          const item = selected[i];
          const baseKeyword = String(item.keyword || '').trim();
          const keyword = makeUniqueKeyword(baseKeyword, usedKeywords);
          const name = String(item.name || '').trim();
          item.keyword = keyword;
          item.name = name;
          const idx = sliceItems.indexOf(item);
          if (idx >= 0) updatedIndexes.add(idx);
          const fileBase = name || keyword || `slice_${i + 1}`;
          const fileName = `${fileBase}.png`;
          let dataUrl = String(item.dataUrl || '').trim();
          if (!dataUrl) {
            const source = getStickerAiImageSource(item);
            dataUrl = await readImageSourceAsDataUrl(source);
          }
          if (!dataUrl) {
            throw new Error('读取贴图失败，请重新切割');
          }
          const path = await saveStickerAsset(dataUrl, fileName, STICKER_PACK_ASSET_SESSION);
          stickers.push({
            id: String(Date.now()) + Math.random().toString(16).slice(2, 8),
            name,
            keyword,
            path: path || '',
            dataUrl: path ? '' : dataUrl,
          });
        }
        if (updatedIndexes.size) {
          renderSliceList();
          persistStickerAiMeta();
        }
        const nextPack = { ...pack, stickers };
        const nextState = stickerPackStore.updatePack(packId, nextPack);
        syncStickerPackState(nextState);
        stickerPanelTab = `${STICKER_PACK_TAB_PREFIX}${packId}`;
        stickerPanelPage = 0;
        renderStickerPanel();
        setStatus(`已保存 ${selected.length} 张贴图`, 'success');
      } catch (err) {
        setStatus(`保存失败：${err?.message || '未知错误'}`, 'error');
      } finally {
        setBusy(false);
      }
    };

    const buildPromptMessages = (template, inputText) => {
      const trimmedTemplate = String(template || '').trim();
      const trimmedInput = String(inputText || '').trim();
      const userContent = [
        '请参考模板（包裹在<prompt>当中）和用户输入（包裹在<input>中）：',
        `<prompt>${trimmedTemplate || '(空模板)'}</prompt>`,
        `<input>${trimmedInput || '(未提供)'}</input>`,
        '请直接生成由<prompt>表情包裹的完整提示词，不要生成图片：',
      ].join('\n');
      return [{ role: 'user', content: userContent }];
    };

    const buildPromptContinueMessages = (template, inputText, draft) => {
      const trimmedTemplate = String(template || '').trim();
      const trimmedInput = String(inputText || '').trim();
      const trimmedDraft = String(draft || '').trim();
      const userContent = [
        '请参考模板（包裹在<prompt>当中）和用户输入（包裹在<input>中），并补全已生成的提示词草稿（包裹在<draft>中）：',
        `<prompt>${trimmedTemplate || '(空模板)'}</prompt>`,
        `<input>${trimmedInput || '(未提供)'}</input>`,
        `<draft>${trimmedDraft || '(空草稿)'}</draft>`,
        '请输出完整且自洽的提示词，只返回一个<prompt>...</prompt>，不要附加解释：',
      ].join('\n');
      return [{ role: 'user', content: userContent }];
    };

    const handleBuildPrompt = async () => {
      const template = String(templateInput?.value || '').trim();
      if (!template) {
        window.toastr?.warning?.('请先填写提示词模板');
        return;
      }
      const config = await ensureChatConfigReady();
      if (!config) return;
      setBusy(true);
      setStatus('正在生成提示词...', 'loading');
      try {
        const client = new LLMClient(config);
        const messages = buildPromptMessages(template, getPromptInputText());
        const output = await client.chat(messages, { temperature: 0.6 });
        finalInput.value = String(output || '').trim();
        scheduleTextSave(true);
        const modeLabel = stickerAiMode === 'sprite' ? '精灵图' : '贴图';
        setStatus(`提示词已生成，可继续编辑或直接生成${modeLabel}`, 'success');
      } catch (err) {
        setStatus(`生成提示词失败：${err?.message || '未知错误'}`, 'error');
        window.toastr?.error?.('生成提示词失败');
      } finally {
        setBusy(false);
      }
    };

    const handleContinuePrompt = async () => {
      const template = String(templateInput?.value || '').trim();
      if (!template) {
        window.toastr?.warning?.('请先填写提示词模板');
        return;
      }
      const draft = String(finalInput?.value || '').trim();
      if (!draft) {
        window.toastr?.warning?.('暂无可补全的提示词草稿');
        return;
      }
      const config = await ensureChatConfigReady();
      if (!config) return;
      setBusy(true);
      setStatus('正在补全提示词...', 'loading');
      try {
        const client = new LLMClient(config);
        const messages = buildPromptContinueMessages(template, getPromptInputText(), draft);
        const output = await client.chat(messages, { temperature: 0.6 });
        finalInput.value = String(output || '').trim();
        scheduleTextSave(true);
        const modeLabel = stickerAiMode === 'sprite' ? '精灵图' : '贴图';
        setStatus(`提示词已补全，可继续编辑或直接生成${modeLabel}`, 'success');
      } catch (err) {
        setStatus(`补全提示词失败：${err?.message || '未知错误'}`, 'error');
        window.toastr?.error?.('补全提示词失败');
      } finally {
        setBusy(false);
      }
    };

    const handleGenerateImage = async () => {
      const prompt = String(finalInput?.value || '').trim();
      if (!prompt) {
        window.toastr?.warning?.('请先生成或填写完整提示词');
        return;
      }
      const config = await ensureImageConfigReady();
      if (!config) return;
      setBusy(true);
      setStatus('正在生成图片...', 'loading');
      try {
        const client = new LLMClient(config);
        const options = { responseFormat: 'b64_json' };
        if (referenceImages.length) {
          options.referenceImages = referenceImages.map(item => item.dataUrl).filter(Boolean);
        }
        const images = await client.generateImage(prompt, options);
        if (!images.length) {
          setStatus('生成完成，但未返回图片结果', 'error');
          return;
        }
        const stored = await persistStickerAiGenerated(images);
        renderPreview(stored.length ? stored : images);
        setStatus('生成完成，下一步可进行去背与切割', 'success');
      } catch (err) {
        const detailRaw = String(err?.response || '').trim();
        const detail = detailRaw.length > 600 ? `${detailRaw.slice(0, 600)}...` : detailRaw;
        const baseMsg = detail ? `${err?.message || '未知错误'}\n${detail}` : (err?.message || '未知错误');
        const meta = `provider=${config?.provider || 'unknown'} model=${config?.model || 'unknown'}`;
        setStatus(`生成图片失败：${baseMsg}\n${meta}`, 'error');
        window.toastr?.error?.('生成图片失败');
      } finally {
        setBusy(false);
      }
    };

    const show = (options = {}) => {
      const optionPackId = String(options?.packId || '').trim();
      const currentPackId = getStickerPackIdFromTab(stickerPanelTab);
      preferredPackId = optionPackId || currentPackId || preferredPackId;
      if (!templateInput?.value) {
        templateInput.value = getDefaultTemplateForMode(stickerAiMode);
      }
      const stored = loadStickerAiState() || {};
      applyPreviewSettings(getPreviewSettingsFromState(stored, stickerAiMode));
      scheduleTextSave(true);
      setStatus('');
      renderPreview();
      pruneSliceSettingsCache(generatedImages);
      updateStickerAiModeUI();
      applySliceDefaultsForMode(stickerAiMode);
      renderReferenceList();
      renderPackOptions();
      renderSliceList();
      overlay.classList.add('is-active');
      modal.classList.add('is-active');
    };

    const hide = () => {
      overlay.classList.remove('is-active');
      modal.classList.remove('is-active');
      stopAnimationPreview();
    };

    overlay.addEventListener('click', () => hide());
    modal.addEventListener('click', event => event.stopPropagation());
    modeTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn?.dataset?.mode || 'sticker';
        setStickerAiMode(mode);
      });
    });
    buildBtn?.addEventListener('click', () => handleBuildPrompt());
    continueBtn?.addEventListener('click', () => handleContinuePrompt());
    renderBtn?.addEventListener('click', () => handleGenerateImage());
    uploadBtn?.addEventListener('click', () => handleUploadGenerated());
    styleInput?.addEventListener('input', () => scheduleTextSave());
    templateInput?.addEventListener('input', () => scheduleTextSave());
    finalInput?.addEventListener('input', () => scheduleTextSave());
    [
      spriteThemeInput,
      spriteThemeCustomInput,
      spriteNarrativeInput,
      spriteSubjectInput,
      spriteLookInput,
      spriteMoodInput,
      spriteExpressionInput,
      spriteExpressionCustomInput,
      spriteToneInput,
      spritePixelInput,
      spriteBgInput,
      spriteStructureInput,
      spriteFpsInput,
      spriteTransparentInput,
      spriteExtraInput,
    ].forEach(input => {
      if (!input) return;
      input.addEventListener('input', () => scheduleTextSave());
      input.addEventListener('change', () => scheduleTextSave());
    });
    if (animPreviewFpsInput) {
      animPreviewFpsInput.addEventListener('input', () => {
        updateAnimationPreview();
        schedulePreviewSettingsSave();
      });
      animPreviewFpsInput.addEventListener('change', () => schedulePreviewSettingsSave(true));
    }
    if (animPreviewSelectedInput) {
      animPreviewSelectedInput.addEventListener('change', () => {
        updateAnimationPreview();
        schedulePreviewSettingsSave(true);
      });
    }
    if (packSelectEl) {
      packSelectEl.addEventListener('change', () => {
        preferredPackId = String(packSelectEl.value || '').trim();
      });
    }
    resetBtn?.addEventListener('click', () => {
      templateInput.value = getDefaultTemplateForMode(stickerAiMode);
      scheduleTextSave(true);
    });
    refAddBtn?.addEventListener('click', () => handleAddReference());
    refListEl?.addEventListener('click', (event) => {
      const btn = event?.target?.closest ? event.target.closest('button.sticker-ai-ref-remove') : null;
      const idxRaw = btn?.dataset?.index;
      if (!idxRaw) return;
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx)) return;
      referenceImages.splice(idx, 1);
      renderReferenceList();
    });
    sliceBtn?.addEventListener('click', () => handleSliceSheet({ auto: !sliceSettingsTouched }));
    autoSliceBtn?.addEventListener('click', () => handleAutoInfer());
    selectAllBtn?.addEventListener('click', () => {
      sliceItems = sliceItems.map(item => ({ ...item, selected: true }));
      renderSliceList();
      persistStickerAiMeta();
      updateAnimationPreview();
    });
    selectNoneBtn?.addEventListener('click', () => {
      sliceItems = sliceItems.map(item => ({ ...item, selected: false }));
      renderSliceList();
      persistStickerAiMeta();
      updateAnimationPreview();
    });
    downloadZipBtn?.addEventListener('click', () => handleDownloadSlicesZip());
    const handleSliceListInput = (event) => {
      const target = event?.target;
      if (!target || !target.dataset) return;
      const idx = Number(target.dataset.index);
      if (!Number.isFinite(idx) || !sliceItems[idx]) return;
      if (target.type === 'checkbox') {
        sliceItems[idx].selected = Boolean(target.checked);
      } else if (target.type === 'text') {
        const value = String(target.value || '');
        sliceItems[idx].keyword = value;
        sliceItems[idx].name = value;
      }
      persistStickerAiMeta();
      updateAnimationPreview();
    };
    sliceListEl?.addEventListener('input', handleSliceListInput);
    sliceListEl?.addEventListener('change', handleSliceListInput);
    saveBtn?.addEventListener('click', () => handleSaveSlices());
    closeBtn?.addEventListener('click', () => hide());

    const handleSliceSettingsInput = () => {
      if (!suppressSliceSettingsTouch) sliceSettingsTouched = true;
      const settings = readSliceSettings();
      rememberSliceSettings(settings);
      scheduleSliceSettingsSave();
      scheduleSlicePreview({ auto: false });
    };
    [
      rowsInput,
      colsInput,
      marginInput,
      gapInput,
      toleranceInput,
      shrinkInput,
      featherInput,
    ].filter(Boolean).forEach(input => {
      input.addEventListener('input', handleSliceSettingsInput);
      input.addEventListener('change', handleSliceSettingsInput);
    });

    const zoomButtons = Array.from(modal.querySelectorAll('.sticker-ai-zoom'));
    zoomButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = String(btn.dataset.target || '');
        openZoom(target);
      });
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    document.body.appendChild(zoomOverlay);
    document.body.appendChild(zoomModal);

    return { show, hide };
  })();
  const stickerPackManager = (() => {
    const overlay = document.createElement('div');
    overlay.className = 'sticker-pack-overlay';
    const modal = document.createElement('div');
    modal.className = 'sticker-pack-modal';
    modal.innerHTML = `
      <div class="sticker-pack-header">
        <div>
          <div class="sticker-pack-title">贴图分页管理</div>
          <div class="sticker-pack-subtitle" id="sticker-pack-subtitle"></div>
        </div>
        <button type="button" class="sticker-pack-close" aria-label="关闭">×</button>
      </div>
      <div class="sticker-pack-body">
        <div class="sticker-pack-section">
          <label class="sticker-pack-label">
            分页名称
            <input type="text" id="sticker-pack-name" placeholder="输入贴图包名称">
          </label>
          <div class="sticker-pack-bind">
            <div class="sticker-pack-bind-row">
              <span>绑定到当前聊天室</span>
              <button type="button" id="sticker-pack-bind-toggle" class="sticker-pack-bind-toggle" aria-pressed="false">
                <span class="sticker-pack-bind-text">未绑定</span>
                <span class="sticker-pack-bind-dot"></span>
              </button>
            </div>
            <div class="sticker-pack-bind-hint">绑定后该聊天室 AI 可使用此贴图包（长按管理多聊天室）</div>
          </div>
        </div>
        <div class="sticker-pack-section">
          <div class="sticker-pack-section-title">分页图标</div>
          <div class="sticker-pack-editor">
            <div class="sticker-pack-preview is-square" id="sticker-pack-icon-preview">
              <img id="sticker-pack-icon-image" alt="" />
              <div class="sticker-pack-preview-overlay">
                <div class="sticker-pack-preview-bubble">预览气泡</div>
              </div>
            </div>
            <div class="sticker-pack-controls">
              <button type="button" id="sticker-pack-icon-upload">上传图标</button>
              <button type="button" id="sticker-pack-icon-reset">重置</button>
              <button type="button" id="sticker-pack-icon-clear">清除</button>
            </div>
            <div class="sticker-pack-sliders">
              <label>缩放
                <input type="range" id="sticker-pack-icon-zoom" min="0.6" max="2.5" step="0.01" value="1">
              </label>
              <label>旋转
                <input type="range" id="sticker-pack-icon-rotate" min="-180" max="180" step="1" value="0">
              </label>
            </div>
          </div>
        </div>
        <div class="sticker-pack-section">
          <div class="sticker-pack-section-title">贴图管理</div>
          <div class="sticker-pack-toolbar">
            <div class="sticker-pack-selection">已选 <span id="sticker-pack-selected-count">0</span> 项</div>
            <div class="sticker-pack-actions">
              <button type="button" id="sticker-pack-select-all">全选</button>
              <button type="button" id="sticker-pack-select-none">全不选</button>
              <button type="button" id="sticker-pack-delete-selected">删除</button>
            </div>
          </div>
          <div class="sticker-pack-move">
            <select id="sticker-pack-move-target"></select>
            <button type="button" id="sticker-pack-move-btn">移动</button>
            <button type="button" id="sticker-pack-download-btn">批量下载</button>
          </div>
          <div class="sticker-pack-keywords">
            <div class="sticker-pack-keywords-title">批量关键词（按勾选顺序，每行一个）</div>
            <textarea id="sticker-pack-keywords-input" placeholder="例如：开心&#10;生气&#10;点赞"></textarea>
            <div class="sticker-pack-keywords-actions">
              <button type="button" id="sticker-pack-keywords-apply">应用到所选</button>
            </div>
          </div>
          <div class="sticker-pack-list" id="sticker-pack-list"></div>
        </div>
      </div>
      <div class="sticker-pack-footer">
        <button type="button" id="sticker-pack-save">保存</button>
        <button type="button" id="sticker-pack-close">关闭</button>
      </div>
    `;

    const subtitleEl = modal.querySelector('#sticker-pack-subtitle');
    const nameInput = modal.querySelector('#sticker-pack-name');
    const bindToggle = modal.querySelector('#sticker-pack-bind-toggle');
    const bindText = modal.querySelector('.sticker-pack-bind-text');
    const iconPreview = modal.querySelector('#sticker-pack-icon-preview');
    const iconImage = modal.querySelector('#sticker-pack-icon-image');
    const iconZoom = modal.querySelector('#sticker-pack-icon-zoom');
    const iconRotate = modal.querySelector('#sticker-pack-icon-rotate');
    const iconUpload = modal.querySelector('#sticker-pack-icon-upload');
    const iconReset = modal.querySelector('#sticker-pack-icon-reset');
    const iconClear = modal.querySelector('#sticker-pack-icon-clear');
    const selectedCountEl = modal.querySelector('#sticker-pack-selected-count');
    const selectAllBtn = modal.querySelector('#sticker-pack-select-all');
    const selectNoneBtn = modal.querySelector('#sticker-pack-select-none');
    const deleteSelectedBtn = modal.querySelector('#sticker-pack-delete-selected');
    const moveSelect = modal.querySelector('#sticker-pack-move-target');
    const moveBtn = modal.querySelector('#sticker-pack-move-btn');
    const downloadBtn = modal.querySelector('#sticker-pack-download-btn');
    const keywordInput = modal.querySelector('#sticker-pack-keywords-input');
    const keywordApplyBtn = modal.querySelector('#sticker-pack-keywords-apply');
    const listEl = modal.querySelector('#sticker-pack-list');
    const saveBtn = modal.querySelector('#sticker-pack-save');
    const closeBtn = modal.querySelector('#sticker-pack-close');
    const headerCloseBtn = modal.querySelector('.sticker-pack-close');

    let currentPackId = '';
    let selectedIds = new Set();
    let bindSelection = new Set();

    const getCurrentSessionId = () => String(chatStore.getCurrent() || '').trim();
    const isPackBoundToSession = (pack, sessionId) => {
      const sid = String(sessionId || '').trim();
      if (!sid || !pack) return false;
      const list = Array.isArray(pack.boundSessions) ? pack.boundSessions : [];
      return list.map(item => String(item || '').trim()).includes(sid);
    };

    const createEditableImageState = () => ({
      previewUrl: '',
      path: '',
      dataUrl: '',
      pendingDataUrl: '',
      fileName: '',
      zoom: 1,
      rotate: 0,
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0,
      dragging: false,
      dragStart: null,
      dirty: false,
      cleared: false,
    });

    const applyEditorTransform = (state, previewEl, imageEl) => {
      if (!previewEl || !imageEl || !state.previewUrl) return;
      const rect = previewEl.getBoundingClientRect();
      const cw = rect.width || 1;
      const ch = rect.height || 1;
      const iw = state.width || imageEl.naturalWidth || 0;
      const ih = state.height || imageEl.naturalHeight || 0;
      if (!iw || !ih) return;
      const baseScale = Math.max(cw / iw, ch / ih);
      const scale = baseScale * (Number(state.zoom) || 1);
      const offsetX = Number(state.offsetX || 0) * cw;
      const offsetY = Number(state.offsetY || 0) * ch;
      imageEl.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${state.rotate}deg) scale(${scale})`;
    };

    const bindEditorImage = (state, previewEl, imageEl) => {
      if (!previewEl || !imageEl) return;
      const url = state.previewUrl;
      previewEl.classList.toggle('has-image', Boolean(url));
      if (!url) {
        imageEl.src = '';
        state.width = 0;
        state.height = 0;
        return;
      }
      imageEl.onload = () => {
        state.width = imageEl.naturalWidth || imageEl.width || 0;
        state.height = imageEl.naturalHeight || imageEl.height || 0;
        applyEditorTransform(state, previewEl, imageEl);
      };
      imageEl.src = url;
      if (imageEl.complete) {
        state.width = imageEl.naturalWidth || imageEl.width || 0;
        state.height = imageEl.naturalHeight || imageEl.height || 0;
        applyEditorTransform(state, previewEl, imageEl);
      }
    };

    const bindEditorDrag = (state, previewEl, imageEl) => {
      if (!previewEl) return;
      const handleDragStart = event => {
        if (!state.previewUrl) return;
        state.dragging = true;
        state.dragStart = {
          x: event.clientX,
          y: event.clientY,
          offsetX: state.offsetX,
          offsetY: state.offsetY,
        };
        previewEl.classList.add('is-dragging');
        previewEl.setPointerCapture?.(event.pointerId);
      };
      const handleDragMove = event => {
        if (!state.dragging || !state.dragStart) return;
        const rect = previewEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dx = (event.clientX - state.dragStart.x) / rect.width;
        const dy = (event.clientY - state.dragStart.y) / rect.height;
        state.offsetX = state.dragStart.offsetX + dx;
        state.offsetY = state.dragStart.offsetY + dy;
        state.dirty = true;
        applyEditorTransform(state, previewEl, imageEl);
      };
      const handleDragEnd = event => {
        if (!state.dragging) return;
        state.dragging = false;
        previewEl.classList.remove('is-dragging');
        previewEl.releasePointerCapture?.(event.pointerId);
      };
      previewEl.addEventListener('pointerdown', handleDragStart);
      previewEl.addEventListener('pointermove', handleDragMove);
      previewEl.addEventListener('pointerup', handleDragEnd);
      previewEl.addEventListener('pointerleave', handleDragEnd);
      previewEl.addEventListener('pointercancel', handleDragEnd);
    };

    const createImageEditor = ({
      previewEl,
      imageEl,
      zoomInput,
      rotateInput,
      uploadBtn,
      resetBtn,
      clearBtn,
      picker,
      compressOptions,
    }) => {
      const state = createEditableImageState();
      const updateInputs = () => {
        if (zoomInput) zoomInput.value = String(state.zoom || 1);
        if (rotateInput) rotateInput.value = String(state.rotate || 0);
      };
      const resetTransform = () => {
        state.zoom = 1;
        state.rotate = 0;
        state.offsetX = 0;
        state.offsetY = 0;
        state.dirty = true;
        updateInputs();
        applyEditorTransform(state, previewEl, imageEl);
      };
      const setFromPack = (pack, { pathKey, dataKey, metaKey }) => {
        const meta = pack?.[metaKey] || {};
        state.path = String(pack?.[pathKey] || '').trim();
        state.dataUrl = String(pack?.[dataKey] || '').trim();
        state.pendingDataUrl = '';
        state.fileName = '';
        state.zoom = Number(meta.zoom || 1);
        state.rotate = Number(meta.rotate || 0);
        state.offsetX = Number(meta.offsetX || 0);
        state.offsetY = Number(meta.offsetY || 0);
        state.width = Number(meta.width || 0);
        state.height = Number(meta.height || 0);
        state.dirty = false;
        state.cleared = false;
        updateInputs();
        const url = state.dataUrl || resolveLocalStickerUrl(state.path);
        state.previewUrl = url;
        bindEditorImage(state, previewEl, imageEl);
      };
      const pickFile = async () => {
        const files = await pickFilesFromInput(picker);
        const file = files[0];
        if (!file) return;
        let dataUrl = await readFileAsDataUrl(file);
        if (compressOptions && !isGifFile(file)) {
          try {
            dataUrl = await compressImageDataUrl(dataUrl, compressOptions);
          } catch {}
        }
        state.pendingDataUrl = dataUrl;
        state.fileName = file.name || '';
        state.path = '';
        state.dataUrl = '';
        state.cleared = false;
        state.previewUrl = dataUrl;
        resetTransform();
        bindEditorImage(state, previewEl, imageEl);
      };
      const clear = () => {
        state.previewUrl = '';
        state.path = '';
        state.dataUrl = '';
        state.pendingDataUrl = '';
        state.fileName = '';
        state.cleared = true;
        resetTransform();
        bindEditorImage(state, previewEl, imageEl);
      };
      const persistToPack = async (pack, { pathKey, dataKey, metaKey, sessionId }) => {
        const previousPath = String(pack?.[pathKey] || '').trim();
        let nextPath = previousPath;
        let nextDataUrl = String(pack?.[dataKey] || '').trim();
        if (state.cleared) {
          if (previousPath) {
            safeInvoke('delete_attachment', { sessionId, path: previousPath }).catch(() => {});
          }
          nextPath = '';
          nextDataUrl = '';
        } else if (state.pendingDataUrl) {
          const savedPath = await saveStickerAsset(state.pendingDataUrl, state.fileName || 'sticker_pack', sessionId);
          if (savedPath && previousPath && savedPath !== previousPath) {
            safeInvoke('delete_attachment', { sessionId, path: previousPath }).catch(() => {});
          }
          nextPath = savedPath || '';
          nextDataUrl = savedPath ? '' : state.pendingDataUrl;
        } else {
          nextPath = state.path || nextPath;
          nextDataUrl = state.dataUrl || nextDataUrl;
        }
        const meta = state.previewUrl
          ? {
              zoom: state.zoom,
              rotate: state.rotate,
              offsetX: state.offsetX,
              offsetY: state.offsetY,
              width: state.width,
              height: state.height,
            }
          : { zoom: 1, rotate: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 };
        const next = { ...pack, [pathKey]: nextPath, [dataKey]: nextDataUrl, [metaKey]: meta };
        state.path = nextPath;
        state.dataUrl = nextDataUrl;
        state.pendingDataUrl = '';
        state.cleared = false;
        state.dirty = false;
        return next;
      };

      zoomInput?.addEventListener('input', e => {
        state.zoom = Number(e.target?.value || 1);
        state.dirty = true;
        applyEditorTransform(state, previewEl, imageEl);
      });
      rotateInput?.addEventListener('input', e => {
        state.rotate = Number(e.target?.value || 0);
        state.dirty = true;
        applyEditorTransform(state, previewEl, imageEl);
      });
      uploadBtn?.addEventListener('click', () => pickFile());
      resetBtn?.addEventListener('click', () => resetTransform());
      clearBtn?.addEventListener('click', () => clear());

      bindEditorDrag(state, previewEl, imageEl);

      return { state, setFromPack, persistToPack, resetTransform, clear };
    };

    const iconEditor = createImageEditor({
      previewEl: iconPreview,
      imageEl: iconImage,
      zoomInput: iconZoom,
      rotateInput: iconRotate,
      uploadBtn: iconUpload,
      resetBtn: iconReset,
      clearBtn: iconClear,
      picker: stickerPackIconManagePicker,
      compressOptions: { maxDim: 256, quality: 0.86, maxBytes: 220_000 },
    });

    const getCurrentPack = () => {
      const packId = String(currentPackId || '').trim();
      if (!packId) return null;
      return getStickerPackById(packId);
    };

    const updateBindToggleUI = () => {
      if (!bindToggle || !bindText) return;
      const pack = getCurrentPack();
      const sessionId = getCurrentSessionId();
      const bound = isPackBoundToSession(pack, sessionId);
      bindToggle.classList.toggle('is-on', bound);
      bindToggle.setAttribute('aria-pressed', bound ? 'true' : 'false');
      bindText.textContent = bound ? '已绑定' : '未绑定';
    };

    const refreshMoveOptions = () => {
      if (!moveSelect) return;
      const currentValue = String(moveSelect.value || '').trim();
      moveSelect.innerHTML = '';
      const createOption = document.createElement('option');
      createOption.value = '__new__';
      createOption.textContent = '新建贴图包';
      moveSelect.appendChild(createOption);
      const packs = Array.isArray(stickerPackState?.packs) ? stickerPackState.packs : [];
      packs.forEach((pack, idx) => {
        const option = document.createElement('option');
        option.value = String(pack?.id || '');
        option.textContent = formatStickerPackLabel(pack, idx);
        moveSelect.appendChild(option);
      });
      if (currentValue) moveSelect.value = currentValue;
    };

    const syncSelectedCount = () => {
      if (selectedCountEl) selectedCountEl.textContent = String(selectedIds.size || 0);
    };

    const resolvePackStickerList = pack => {
      const list = Array.isArray(pack?.stickers) ? pack.stickers : [];
      return list.map(sticker => ({ ...sticker }));
    };

    const renderStickerList = () => {
      if (!listEl) return;
      const pack = getCurrentPack();
      listEl.innerHTML = '';
      if (!pack) return;
      const stickers = resolvePackStickerList(pack);
      if (!stickers.length) {
        listEl.innerHTML = '<div class="sticker-pack-empty">暂无贴图</div>';
        syncSelectedCount();
        return;
      }
      stickers.forEach((sticker, idx) => {
        const id = String(sticker?.id || '').trim();
        if (!id) return;
        const item = document.createElement('div');
        item.className = 'sticker-pack-item';
        item.dataset.stickerId = id;
        const checked = selectedIds.has(id);
        if (checked) item.classList.add('is-selected');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedIds.add(id);
          else selectedIds.delete(id);
          item.classList.toggle('is-selected', checkbox.checked);
          syncSelectedCount();
        });
        const thumb = document.createElement('div');
        thumb.className = 'sticker-pack-thumb';
        const url = resolveStickerMediaUrl(sticker);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = sticker.keyword || sticker.name || `贴图${idx + 1}`;
          thumb.appendChild(img);
        } else {
          thumb.textContent = '无图';
        }
        const info = document.createElement('div');
        info.className = 'sticker-pack-info';
        const title = document.createElement('div');
        title.className = 'sticker-pack-name';
        title.textContent = sticker.name || sticker.keyword || `贴图${idx + 1}`;
        const meta = document.createElement('div');
        meta.className = 'sticker-pack-meta';
        const keyword = String(sticker.keyword || '').trim();
        meta.textContent = keyword ? `关键词：${keyword}` : '关键词：未设置';
        info.appendChild(title);
        info.appendChild(meta);
        item.appendChild(checkbox);
        item.appendChild(thumb);
        item.appendChild(info);
        item.addEventListener('click', event => {
          if (event.target === checkbox) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        });
        listEl.appendChild(item);
      });
      syncSelectedCount();
    };

    const getSelectedStickerIds = pack => {
      const list = Array.isArray(pack?.stickers) ? pack.stickers : [];
      return list.map(sticker => String(sticker?.id || '').trim()).filter(id => id && selectedIds.has(id));
    };

    const applyPackUpdate = nextState => {
      syncStickerPackState(nextState);
      renderStickerPanel();
      refreshMoveOptions();
      renderStickerList();
      updateBindToggleUI();
    };

    const handleDeleteSelected = async () => {
      const pack = getCurrentPack();
      if (!pack) return;
      const targets = getSelectedStickerIds(pack);
      if (!targets.length) {
        window.toastr?.warning?.('请先选择要删除的贴图');
        return;
      }
      const ok = await appConfirm({
        title: '删除贴图',
        message: `确定删除选中的 ${targets.length} 张贴图？`,
        danger: true,
      });
      if (!ok) return;
      const nextStickers = (pack.stickers || []).filter(sticker => !targets.includes(String(sticker?.id || '').trim()));
      (pack.stickers || []).forEach(sticker => {
        const id = String(sticker?.id || '').trim();
        if (!targets.includes(id)) return;
        const path = String(sticker?.path || '').trim();
        if (path) {
          safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path }).catch(() => {});
        }
        const frames = Array.isArray(sticker?.frames) ? sticker.frames : [];
        frames.forEach(frame => {
          const framePath = String(frame || '').trim();
          if (!framePath || framePath.startsWith('data:')) return;
          safeInvoke('delete_attachment', { sessionId: STICKER_PACK_ASSET_SESSION, path: framePath }).catch(() => {});
        });
      });
      selectedIds = new Set();
      const nextPack = { ...pack, stickers: nextStickers };
      const nextState = stickerPackStore.updatePack(pack.id, nextPack);
      applyPackUpdate(nextState);
    };

    const handleMoveSelected = async () => {
      const pack = getCurrentPack();
      if (!pack) return;
      const targets = getSelectedStickerIds(pack);
      if (!targets.length) {
        window.toastr?.warning?.('请先选择要移动的贴图');
        return;
      }
      let targetId = String(moveSelect?.value || '').trim();
      if (!targetId) return;
      if (targetId === '__new__') {
        const newPack = createStickerPack();
        targetId = newPack?.id || '';
      }
      if (!targetId || targetId === pack.id) return;
      const moving = (pack.stickers || []).filter(sticker => targets.includes(String(sticker?.id || '').trim()));
      if (!moving.length) return;
      const nextState = stickerPackStore.update(state => {
        const packs = (state.packs || []).map(p => {
          if (p.id === pack.id) {
            return {
              ...p,
              stickers: (p.stickers || []).filter(sticker => !targets.includes(String(sticker?.id || '').trim())),
            };
          }
          if (p.id === targetId) {
            return { ...p, stickers: (p.stickers || []).concat(moving) };
          }
          return p;
        });
        return { ...state, packs };
      });
      selectedIds = new Set();
      applyPackUpdate(nextState);
    };

    const handleApplyKeywords = () => {
      const pack = getCurrentPack();
      if (!pack) return;
      const targets = getSelectedStickerIds(pack);
      if (!targets.length) {
        window.toastr?.warning?.('请先选择要写关键词的贴图');
        return;
      }
      const lines = String(keywordInput?.value || '')
        .split(/\r?\n/)
        .map(line => line.trim());
      if (!lines.filter(Boolean).length) {
        window.toastr?.warning?.('请输入关键词，每行一个');
        return;
      }
      if (lines.length < targets.length) {
        window.toastr?.warning?.('关键词数量不足，未覆盖的贴图将保留原关键词');
      }
      let lineIndex = 0;
      const nextStickers = (pack.stickers || []).map(sticker => {
        const id = String(sticker?.id || '').trim();
        if (!targets.includes(id)) return sticker;
        const keyword = String(lines[lineIndex] || '').trim();
        lineIndex += 1;
        if (!keyword) return sticker;
        return { ...sticker, keyword };
      });
      const nextPack = { ...pack, stickers: nextStickers };
      const nextState = stickerPackStore.updatePack(pack.id, nextPack);
      applyPackUpdate(nextState);
    };

    const handleDownloadSelected = async () => {
      const pack = getCurrentPack();
      if (!pack) return;
      const targets = getSelectedStickerIds(pack);
      if (!targets.length) {
        window.toastr?.warning?.('请先选择要下载的贴图');
        return;
      }
      const entries = [];
      const stickers = (pack.stickers || []).filter(sticker => targets.includes(String(sticker?.id || '').trim()));
      stickers.forEach((sticker, idx) => {
        const baseName = sanitizeExportName(
          sticker.keyword || sticker.name || `sticker_${idx + 1}`,
          `sticker_${idx + 1}`,
        );
        const framePaths = resolveStickerFramePaths(sticker);
        if (framePaths.length > 1) {
          framePaths.forEach((frame, frameIndex) => {
            const name = `${baseName}_frame_${String(frameIndex + 1).padStart(2, '0')}.png`;
            if (frame.startsWith('data:')) {
              entries.push({ name, dataUrl: frame });
            } else {
              entries.push({ name, path: frame });
            }
          });
          return;
        }
        const path = String(sticker?.path || '').trim();
        if (path) {
          const extMatch = path.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
          const ext = extMatch ? extMatch[1] : 'png';
          entries.push({ name: ensureFileExtension(baseName, ext), path });
          return;
        }
        const dataUrl = String(sticker?.dataUrl || '').trim();
        if (dataUrl) {
          const ext = inferImageExtension(dataUrl, 'png');
          entries.push({ name: ensureFileExtension(baseName, ext), dataUrl });
        }
      });
      if (!entries.length) {
        window.toastr?.warning?.('未找到可下载的贴图资源');
        return;
      }
      await exportStickerZip({ entries, fileName: `${sanitizeExportName(pack.name || 'sticker_pack', '贴图包')}.zip` });
    };

    const handleSavePack = async () => {
      const pack = getCurrentPack();
      if (!pack) return;
      let nextPack = { ...pack, name: String(nameInput?.value || '').trim() };
      nextPack = await iconEditor.persistToPack(nextPack, {
        pathKey: 'iconPath',
        dataKey: 'iconDataUrl',
        metaKey: 'iconMeta',
        sessionId: STICKER_ICON_SESSION,
      });
      const nextState = stickerPackStore.updatePack(pack.id, nextPack);
      applyPackUpdate(nextState);
      window.toastr?.success?.('贴图包已保存');
    };

    const show = packId => {
      const pack = getStickerPackById(packId);
      if (!pack) return;
      currentPackId = packId;
      selectedIds = new Set();
      const packIndex = (stickerPackState?.packs || []).findIndex(item => item.id === pack.id);
      const defaultLabel = formatStickerPackLabel(pack, packIndex);
      if (nameInput) nameInput.value = String(pack.name || '').trim() || defaultLabel;
      if (subtitleEl) subtitleEl.textContent = defaultLabel;
      iconEditor.setFromPack(pack, { pathKey: 'iconPath', dataKey: 'iconDataUrl', metaKey: 'iconMeta' });
      if (keywordInput) keywordInput.value = '';
      refreshMoveOptions();
      renderStickerList();
      updateBindToggleUI();
      overlay.classList.add('is-active');
    };

    const hide = () => {
      overlay.classList.remove('is-active');
      currentPackId = '';
      selectedIds = new Set();
    };

    selectAllBtn?.addEventListener('click', () => {
      const pack = getCurrentPack();
      if (!pack) return;
      (pack.stickers || []).forEach(sticker => {
        const id = String(sticker?.id || '').trim();
        if (id) selectedIds.add(id);
      });
      renderStickerList();
    });
    selectNoneBtn?.addEventListener('click', () => {
      selectedIds = new Set();
      renderStickerList();
    });
    deleteSelectedBtn?.addEventListener('click', () => handleDeleteSelected());
    moveBtn?.addEventListener('click', () => handleMoveSelected());
    downloadBtn?.addEventListener('click', () => handleDownloadSelected());
    keywordApplyBtn?.addEventListener('click', () => handleApplyKeywords());
    saveBtn?.addEventListener('click', () => handleSavePack());
    closeBtn?.addEventListener('click', () => hide());
    headerCloseBtn?.addEventListener('click', () => hide());

    const bindModal = (() => {
      const bindOverlay = document.createElement('div');
      bindOverlay.className = 'sticker-bind-overlay';
      bindOverlay.innerHTML = `
        <div class="sticker-bind-modal">
          <div class="sticker-bind-header">
            <div>
              <div class="sticker-bind-title">绑定聊天室</div>
              <div class="sticker-bind-subtitle">选择要绑定的聊天室</div>
            </div>
            <button type="button" class="sticker-bind-close" aria-label="关闭">×</button>
          </div>
          <div class="sticker-bind-search">
            <input type="text" id="sticker-bind-search" placeholder="搜索聊天室">
          </div>
          <div class="sticker-bind-toolbar">
            <div class="sticker-bind-selection">已选 <span id="sticker-bind-count">0</span> 项</div>
            <div class="sticker-bind-actions">
              <button type="button" id="sticker-bind-select-all">全选</button>
              <button type="button" id="sticker-bind-select-none">全不选</button>
            </div>
          </div>
          <div class="sticker-bind-list" id="sticker-bind-list"></div>
          <div class="sticker-bind-footer">
            <button type="button" id="sticker-bind-save">保存</button>
            <button type="button" id="sticker-bind-cancel">关闭</button>
          </div>
        </div>
      `;
      const modalEl = bindOverlay.querySelector('.sticker-bind-modal');
      const closeBtn = bindOverlay.querySelector('.sticker-bind-close');
      const cancelBtn = bindOverlay.querySelector('#sticker-bind-cancel');
      const saveBtn = bindOverlay.querySelector('#sticker-bind-save');
      const searchInput = bindOverlay.querySelector('#sticker-bind-search');
      const countEl = bindOverlay.querySelector('#sticker-bind-count');
      const selectAllBtn = bindOverlay.querySelector('#sticker-bind-select-all');
      const selectNoneBtn = bindOverlay.querySelector('#sticker-bind-select-none');
      const listEl = bindOverlay.querySelector('#sticker-bind-list');

      const updateCount = () => {
        if (countEl) countEl.textContent = String(bindSelection.size || 0);
      };

      const renderList = () => {
        if (!listEl) return;
        listEl.innerHTML = '';
        const keyword = String(searchInput?.value || '').trim().toLowerCase();
        const sessionIds = chatStore.listSessions().filter(id => !isRpSessionId(id));
        const items = sessionIds.map(id => {
          const contact = contactsStore.getContact(id);
          const name = formatSessionName(id, contact);
          const avatar = resolveAvatarForContact(id, contact);
          return { id, name: name || id, avatar };
        });
        const filtered = keyword
          ? items.filter(item => item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword))
          : items;
        if (!filtered.length) {
          listEl.innerHTML = '<div class="sticker-bind-empty">暂无匹配聊天室</div>';
          updateCount();
          return;
        }
        filtered.forEach(item => {
          const row = document.createElement('label');
          row.className = 'sticker-bind-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = bindSelection.has(item.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) bindSelection.add(item.id);
            else bindSelection.delete(item.id);
            updateCount();
          });
          const avatar = document.createElement('img');
          avatar.className = 'sticker-bind-avatar';
          avatar.src = item.avatar || avatars.assistant;
          avatar.alt = '';
          const textWrap = document.createElement('div');
          textWrap.className = 'sticker-bind-info';
          const title = document.createElement('div');
          title.className = 'sticker-bind-name';
          title.textContent = item.name;
          const meta = document.createElement('div');
          meta.className = 'sticker-bind-meta';
          meta.textContent = item.id;
          textWrap.appendChild(title);
          textWrap.appendChild(meta);
          row.appendChild(checkbox);
          row.appendChild(avatar);
          row.appendChild(textWrap);
          listEl.appendChild(row);
        });
        updateCount();
      };

      const open = () => {
        const pack = getCurrentPack();
        if (!pack) return;
        bindSelection = new Set(
          Array.isArray(pack.boundSessions)
            ? pack.boundSessions.map(item => String(item || '').trim()).filter(Boolean)
            : [],
        );
        if (searchInput) searchInput.value = '';
        renderList();
        bindOverlay.classList.add('is-active');
        setTimeout(() => searchInput?.focus?.(), 0);
      };

      const close = () => {
        bindOverlay.classList.remove('is-active');
      };

      const handleSave = () => {
        const pack = getCurrentPack();
        if (!pack) return;
        const nextPack = {
          ...pack,
          boundSessions: Array.from(bindSelection),
        };
        const nextState = stickerPackStore.updatePack(pack.id, nextPack);
        applyPackUpdate(nextState);
        close();
      };

      searchInput?.addEventListener('input', () => renderList());
      selectAllBtn?.addEventListener('click', () => {
        chatStore.listSessions().filter(id => !isRpSessionId(id)).forEach(id => bindSelection.add(id));
        renderList();
      });
      selectNoneBtn?.addEventListener('click', () => {
        bindSelection = new Set();
        renderList();
      });
      saveBtn?.addEventListener('click', () => handleSave());
      cancelBtn?.addEventListener('click', () => close());
      closeBtn?.addEventListener('click', () => close());
      bindOverlay.addEventListener('click', () => close());
      modalEl?.addEventListener('click', event => event.stopPropagation());
      document.body.appendChild(bindOverlay);

      return { open, close };
    })();

    if (bindToggle) {
      let bindPressTimer = null;
      let bindLongPress = false;
      const clearBindPress = () => {
        if (bindPressTimer) {
          clearTimeout(bindPressTimer);
          bindPressTimer = null;
        }
      };
      bindToggle.addEventListener('pointerdown', () => {
        bindLongPress = false;
        clearBindPress();
        bindPressTimer = setTimeout(() => {
          bindLongPress = true;
          bindModal.open();
        }, 520);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
        bindToggle.addEventListener(evt, () => clearBindPress());
      });
      bindToggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (bindLongPress) {
          bindLongPress = false;
          return;
        }
        const pack = getCurrentPack();
        const sessionId = getCurrentSessionId();
        if (!pack || !sessionId) {
          window.toastr?.warning?.('未找到当前聊天室');
          return;
        }
        const boundSessions = Array.isArray(pack.boundSessions)
          ? pack.boundSessions.map(item => String(item || '').trim()).filter(Boolean)
          : [];
        const nextBound = new Set(boundSessions);
        if (nextBound.has(sessionId)) nextBound.delete(sessionId);
        else nextBound.add(sessionId);
        const nextPack = { ...pack, boundSessions: Array.from(nextBound) };
        const nextState = stickerPackStore.updatePack(pack.id, nextPack);
        applyPackUpdate(nextState);
      });
    }

    overlay.addEventListener('click', () => hide());
    modal.addEventListener('click', event => event.stopPropagation());
    document.body.appendChild(overlay);
    overlay.appendChild(modal);

    return { show, hide };
  })();
  if (stickerPanel?.toggle) {
    let deletePressTimer = null;
    let deletePressTriggered = false;
    let suppressToggle = false;
    const clearDeletePress = () => {
      if (deletePressTimer) {
        clearTimeout(deletePressTimer);
        deletePressTimer = null;
      }
    };
    stickerPanel.toggle.addEventListener('pointerdown', () => {
      deletePressTriggered = false;
      clearDeletePress();
      deletePressTimer = setTimeout(() => {
        const packId = getStickerPackIdFromTab(stickerPanelTab);
        if (!packId) return;
        deletePressTriggered = true;
        suppressToggle = true;
        stickerPackDeleteMode = true;
        stickerPackDeleteTarget = packId;
        updateStickerDeleteUI();
      }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
      stickerPanel.toggle.addEventListener(evt, () => clearDeletePress());
    });
    stickerPanel.toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressToggle || deletePressTriggered) {
        suppressToggle = false;
        deletePressTriggered = false;
        return;
      }
      handleStickerToggle();
    });
  }
  if (stickerPanel?.generateBtn) {
    stickerPanel.generateBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const packId = getStickerPackIdFromTab(stickerPanelTab);
      stickerAiModal.show({ packId });
    });
  }
  if (stickerPanel?.deleteBtn) {
    stickerPanel.deleteBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const packId = getStickerPackIdFromTab(stickerPanelTab);
      if (!packId) return;
      removeStickerPack(packId);
    });
  }
  if (stickerPanel?.grid) {
    const grid = stickerPanel.grid;
    let raf = null;
    grid.addEventListener(
      'scroll',
      () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const width = grid.clientWidth || 0;
          if (!width) return;
          const nextPage = Math.round(grid.scrollLeft / width);
          const total = getStickerTotalPages();
          const clamped = Math.max(0, Math.min(total - 1, nextPage));
          if (clamped !== stickerPanelPage) {
            stickerPanelPage = clamped;
            updateStickerDotsActive(stickerPanelPage, total);
          }
        });
      },
      { passive: true },
    );
  }
  const stickerPreview = (() => {
    if (!chatRoom) return null;
    const panel = document.createElement('div');
    panel.id = 'sticker-preview';
    panel.className = 'sticker-preview';
    panel.innerHTML = '<div class="sticker-preview-list"></div>';
    chatRoom.appendChild(panel);
    return { el: panel, list: panel.querySelector('.sticker-preview-list') };
  })();
  const pendingFloatMenu = (() => {
    const menu = document.createElement('div');
    menu.id = 'pending-float-menu';
    menu.className = 'sheet hidden';
    menu.innerHTML = `
      <button data-action="send">发送</button>
      <button data-action="delete">删除</button>
    `;
    menu.addEventListener('click', async event => {
      event.stopPropagation();
      const action = event?.target?.closest ? event.target.closest('button')?.dataset?.action : '';
      if (!action || !pendingFloatActive) return;
      const sid = chatStore.getCurrent();
      if (action === 'send') {
        await sendPendingFromFloat(pendingFloatActive, sid);
      } else if (action === 'delete') {
        chatStore.removePendingMessage(pendingFloatActive.id, sid);
        pendingFloatActive = null;
        updatePendingFloat(sid);
        refreshChatAndContacts();
      }
      hideMenus();
    });
    document.body.appendChild(menu);
    return menu;
  })();
  let activePage = 'chat';
  const UI_STATE_KEY = 'phone_ui_state_v1';
  const UI_STATE_KV = 'phone_ui_state_v1';
  let uiStateArmed = false;
  let uiStateDiskTimer = null;
  const uiLog = (...args) => {
    try {
      console.log('[CHATAPP_UI]', ...args);
    } catch {}
    try {
      logger.info('[CHATAPP_UI]', ...args);
    } catch {}
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : window;
      if (g?.__TAURI__) {
        const msg = args
          .map(a => {
            if (a == null) return '';
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .filter(Boolean)
          .join(' ');
        safeInvoke('log_js', {
          tag: 'CHATAPP_UI',
          level: 'info',
          message: msg.slice(0, 2000),
        }).catch(() => {});
      }
    } catch {}
  };
  const saveUiState = () => {
    try {
      const state = {
        activePage,
        inChatRoom: chatRoom ? !chatRoom.classList.contains('hidden') : false,
        sessionId: chatStore.getCurrent(),
        at: Date.now(),
      };
      const raw = JSON.stringify(state);
      try {
        sessionStorage.setItem(UI_STATE_KEY, raw);
      } catch {}
      try {
        localStorage.setItem(UI_STATE_KEY, raw);
      } catch {}
      if (uiStateDiskTimer) clearTimeout(uiStateDiskTimer);
      uiStateDiskTimer = setTimeout(() => {
        safeInvoke('save_kv', { name: UI_STATE_KV, data: state }).catch(() => {});
      }, 400);
      uiLog('saveUiState', state);
    } catch {}
  };
  const restoreUiState = async () => {
    try {
      const pick = async () => {
        try {
          const raw1 = sessionStorage.getItem(UI_STATE_KEY);
          if (raw1) return JSON.parse(raw1);
        } catch {}
        try {
          const raw2 = localStorage.getItem(UI_STATE_KEY);
          if (raw2) return JSON.parse(raw2);
        } catch {}
        try {
          const kv = await safeInvoke('load_kv', { name: UI_STATE_KV });
          if (kv && typeof kv === 'object') return kv;
        } catch {}
        return null;
      };
      const s = await pick();
      if (!s) {
        uiLog('restoreUiState: no saved state');
        return false;
      }
      const page = String(s?.activePage || '').trim();
      const sid = String(s?.sessionId || '').trim();
      const inChatRoom = Boolean(s?.inChatRoom);
      uiLog('restoreUiState: picked', { page, sid, inChatRoom, at: s?.at || 0 });
      if (page && pages[page]) switchPage(page);
      const sidKnown = sid && (chatStore.hasSession?.(sid) || contactsStore.getContact(sid));
      if (sidKnown) {
        // ensure session exists
        chatStore.switchSession(sid);
        window.appBridge.setActiveSession(sid);
        syncUserPersonaUI(sid);
        const msgs = await chatStore.ensureRecentMessagesLoaded(sid);
        const draft = chatStore.getDraft(sid);
        ui.clearMessages();
        {
          const PAGE = 90;
          const start = Math.max(0, msgs.length - PAGE);
          ui.preloadHistory(decorateMessagesForDisplay(msgs.slice(start), { sessionId: sid }));
          chatRenderState.set(sid, { start });
        }
        ui.setInputText(draft || '');
        ui.setSessionLabel(sid);
      }
      if (inChatRoom && sid && sidKnown) {
        const c = contactsStore.getContact(sid);
        enterChatRoom(sid, c?.name || sid, page || 'chat');
      }
      if (sid && !sidKnown) {
        uiLog('restoreUiState: sid not yet known (skip switchSession)', { sid });
      }
      return true;
    } catch {
      return false;
    }
  };
  const switchPage = name => {
    activePage = name;
    navBtns.forEach(t => t.classList.toggle('active', t.dataset.page === name));
    Object.entries(pages).forEach(([k, el]) => {
      if (el) el.classList.toggle('active', k === name);
    });
    // 返回聊天列表视图（非聊天室）以贴合原始切换逻辑
    if (name !== 'chat') {
      chatRoom?.classList.add('hidden');
      chatList?.classList.remove('hidden');
    }
    if (name === 'moments') {
      try {
        momentsPanel.render();
      } catch {}
    }
    if (uiStateArmed) saveUiState();
    uiLog('switchPage', { activePage });
  };
  navBtns.forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));

  // 搜索框初始化（仅联系人页）
  initContactSearch();

  if (stickerToggleBtn) {
    stickerToggleBtn.textContent = '+';
    stickerToggleBtn.setAttribute('aria-label', '更多功能');
    stickerToggleBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      setActionPanelOpen(!actionPanelOpen);
    });
  }
  composerInput?.addEventListener('focus', () => {
    setStickerPanelOpen(false);
    setActionPanelOpen(false);
  });

  // Mirror composer draft to sessionStorage to avoid losing the last few keystrokes on reload/update.
  try {
    const el = document.getElementById('composer-input');
    if (el && !el.hasAttribute('data-draft-mirror')) {
      el.setAttribute('data-draft-mirror', 'true');
      el.addEventListener('input', () => {
        const sid = chatStore.getCurrent();
        const text = String(el.value || '');
        const maxLen = 20_000;
        const trimmed = text.length > maxLen ? text.slice(-maxLen) : text;
        try {
          sessionStorage.setItem(`phone_draft_${sid}`, trimmed);
        } catch {}
      });
    }
  } catch {}

  /* ---------------- 原始回复面板（调试） ---------------- */
  const rawReplyModal = (() => {
    let overlay = null;
    let panel = null;
    let textarea = null;
    let metaEl = null;

    const ensure = () => {
      if (panel) return;
      overlay = document.createElement('div');
      overlay.id = 'raw-reply-overlay';
      overlay.style.cssText = `
                display:none; position:fixed; inset:0;
                background: rgba(0,0,0,0.38);
                z-index: 22000;
                padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
                box-sizing: border-box;
            `;

      panel = document.createElement('div');
      panel.id = 'raw-reply-panel';
      panel.style.cssText = `
                width: 100%;
                height: 100%;
                background: #fff;
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:900;">原始回复</div>
                    <div id="raw-reply-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="raw-reply-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="raw-reply-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                    <textarea id="raw-reply-text" readonly style="
                        width:100%;
                        height:100%;
                        min-height: 100%;
                        resize:none;
                        border:1px solid rgba(0,0,0,0.10);
                        border-radius:12px;
                        padding:12px;
                        font-size:13px;
                        line-height:1.4;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        white-space: pre;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
            `;

      overlay.appendChild(panel);
      overlay.addEventListener('click', () => hide());
      document.body.appendChild(overlay);

      textarea = panel.querySelector('#raw-reply-text');
      metaEl = panel.querySelector('#raw-reply-meta');
      panel.querySelector('#raw-reply-close')?.addEventListener('click', hide);
      panel.querySelector('#raw-reply-copy')?.addEventListener('click', async () => {
        const text = String(textarea?.value || '');
        if (!text) {
          window.toastr?.warning?.('暂无可复制内容');
          return;
        }
        try {
          await navigator.clipboard?.writeText?.(text);
          window.toastr?.success?.('已复制到剪贴簿');
        } catch {
          // fallback: select
          textarea?.focus?.();
          textarea?.select?.();
          window.toastr?.info?.('已选中，请手动复制');
        }
      });
    };

    const show = (text, meta) => {
      ensure();
      if (metaEl) metaEl.textContent = meta || '';
      if (textarea) {
        textarea.value = String(text || '');
        textarea.scrollTop = 0;
      }
      overlay.style.display = 'block';
    };

    const hide = () => {
      if (overlay) overlay.style.display = 'none';
    };

    return { show, hide };
  })();

  const showMomentRawReply = () => {
    const raw = String(lastMomentRawReply || '').trim();
    if (!raw) {
      window.toastr?.warning?.('暂无动态原始回复');
      return;
    }
    const metaParts = [];
    if (lastMomentRawMeta?.author) metaParts.push(String(lastMomentRawMeta.author));
    if (lastMomentRawMeta?.time) metaParts.push(String(lastMomentRawMeta.time));
    const meta = metaParts.length ? `动态评论 · ${metaParts.join(' ')}` : '动态评论';
    rawReplyModal.show(raw, meta);
  };

  /* ---------------- Prompt 预览面板（调试） ---------------- */
  const promptPreviewModal = (() => {
    let overlay = null;
    let panel = null;
    let textarea = null;
    let metaEl = null;

    const ensure = () => {
      if (panel) return;
      overlay = document.createElement('div');
      overlay.id = 'prompt-preview-overlay';
      overlay.style.cssText = `
                display:none; position:fixed; inset:0;
                background: rgba(0,0,0,0.38);
                z-index: 22000;
                padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
                box-sizing: border-box;
            `;

      panel = document.createElement('div');
      panel.id = 'prompt-preview-panel';
      panel.style.cssText = `
                width: 100%;
                height: 100%;
                background: #fff;
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:900;">本次 Prompt</div>
                    <div id="prompt-preview-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="prompt-preview-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="prompt-preview-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                    <textarea id="prompt-preview-text" readonly style="
                        width:100%;
                        height:100%;
                        min-height: 100%;
                        resize:none;
                        border:1px solid rgba(0,0,0,0.10);
                        border-radius:12px;
                        padding:12px;
                        font-size:13px;
                        line-height:1.4;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        white-space: pre;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
            `;

      overlay.appendChild(panel);
      overlay.addEventListener('click', () => hide());
      document.body.appendChild(overlay);

      textarea = panel.querySelector('#prompt-preview-text');
      metaEl = panel.querySelector('#prompt-preview-meta');
      panel.querySelector('#prompt-preview-close')?.addEventListener('click', hide);
      panel.querySelector('#prompt-preview-copy')?.addEventListener('click', async () => {
        const text = String(textarea?.value || '');
        if (!text) {
          window.toastr?.warning?.('暂无内容可复制');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          window.toastr?.success?.('已复制');
        } catch {
          try {
            textarea?.select?.();
            document.execCommand?.('copy');
            window.toastr?.success?.('已复制');
          } catch {
            window.toastr?.error?.('复制失败');
          }
        }
      });
    };

    const show = (text, meta = '') => {
      ensure();
      if (!overlay || !panel || !textarea) return;
      textarea.value = String(text || '');
      if (metaEl) metaEl.textContent = meta || '';
      overlay.style.display = 'block';
    };

    const hide = () => {
      if (!overlay) return;
      overlay.style.display = 'none';
    };

    return { show, hide };
  })();

  /* ---------------- 头像设置菜单 ---------------- */
  const settingsMenu = document.getElementById('settings-menu');
  const quickMenu = document.getElementById('quick-menu');
  // 顶部头像/＋按钮在「消息」与「联系人」页共用同样外观
  const avatarBtns = document.querySelectorAll('.qq-message-topbar .user-avatar-btn');
  const plusBtns = document.querySelectorAll('.qq-message-topbar .icon-button');
  const chatMenuBtn = document.getElementById('chat-menu-btn');
  const chatroomMenu = document.getElementById('chatroom-menu');
  const momentsSettingsBtn = document.getElementById('moments-settings-btn');
  const momentsMenu = (() => {
    const menu = document.createElement('div');
    menu.id = 'moments-menu';
    menu.className = 'sheet hidden';
    menu.innerHTML = `
      <div class="sheet-header">动态菜单</div>
      <div class="sheet-desc">动态相关操作</div>
      <button data-action="moment-summary">📘 动态摘要</button>
      <button data-action="raw-reply">🧾 原始回复</button>
    `;
    menu.addEventListener('click', e => {
      const action = e?.target?.closest ? e.target.closest('button')?.dataset?.action : '';
      if (!action) return;
      if (action === 'moment-summary') momentSummaryPanel.show();
      if (action === 'raw-reply') showMomentRawReply();
      hideMenus();
    });
    document.body.appendChild(menu);
    return menu;
  })();

  // Chat settings modal elements
  const chatSettingsModal = document.getElementById('chat-settings-modal');
  const chatSettingsOverlay = document.getElementById('chat-settings-overlay');
  const closeChatSettingsBtn = document.getElementById('close-chat-settings');
  const bubbleColorInput = document.getElementById('bubble-color-input');
  const bubbleColorPicker = document.getElementById('bubble-color');
  const textColorInput = document.getElementById('text-color-input');
  const textColorPicker = document.getElementById('text-color');
  const chatWallpaperFile = document.getElementById('chat-wallpaper-file');
  const chatWallpaperDrop = document.getElementById('chat-wallpaper-drop');
  const chatWallpaperStatus = document.getElementById('wallpaper-status');
  const wallpaperPreview = document.getElementById('wallpaper-preview');
  const wallpaperPreviewImage = document.getElementById('wallpaper-preview-image');
  const wallpaperSaveOriginal = document.getElementById('wallpaper-save-original');
  const wallpaperZoomInput = document.getElementById('wallpaper-zoom');
  const wallpaperRotateInput = document.getElementById('wallpaper-rotate');
  const wallpaperFitBtn = document.getElementById('wallpaper-fit-btn');
  const wallpaperResetBtn = document.getElementById('wallpaper-reset-btn');
  const wallpaperClearBtn = document.getElementById('wallpaper-clear-btn');
  const chatSettingScopeRadios = Array.from(document.querySelectorAll('input[name="chat-setting-scope"]'));
  const chatSettingPreview = document.getElementById('chat-setting-preview');
  const randomSettingBtn = document.getElementById('random-setting-btn');
  const restoreSettingBtn = document.getElementById('restore-setting-btn');
  const saveSettingBtn = document.getElementById('save-setting-btn');
  const cancelSettingBtn = document.getElementById('cancel-setting-btn');

  const hideMenus = () => {
    settingsMenu?.classList.add('hidden');
    quickMenu?.classList.add('hidden');
    chatroomMenu?.classList.add('hidden');
    momentsMenu?.classList.add('hidden');
    document.getElementById('chat-title-menu')?.classList.add('hidden');
    const gd = document.getElementById('group-management-dropdown');
    if (gd) gd.style.display = 'none';
    pendingFloatMenu?.classList.add('hidden');
  };

  const positionSheet = (menuEl, anchorEl, offsetX = 0, offsetY = 0, alignRight = false) => {
    if (!menuEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const desiredTop = rect.bottom + window.scrollY + 1 + offsetY;
    const top = Math.max(0, desiredTop);

    menuEl.style.top = `${top}px`;
    if (alignRight) {
      // Right align: position from right edge of anchor
      const right = window.innerWidth - rect.right - window.scrollX + offsetX;
      menuEl.style.right = `${right}px`;
      menuEl.style.left = 'auto';
    } else {
      // Left align: position from left edge of anchor
      const left = rect.left + window.scrollX + offsetX;
      menuEl.style.left = `${left}px`;
      menuEl.style.right = 'auto';
    }
  };

  let lastSettingsAnchor = null;
  let lastQuickAnchor = null;
  let lastMomentsAnchor = null;

  const toggleSheetAt = (menuEl, anchorEl, { alignRight = false, kind = 'generic' } = {}) => {
    if (!menuEl || !anchorEl) return;
    const isVisible = !menuEl.classList.contains('hidden');
    const lastAnchor =
      kind === 'settings'
        ? lastSettingsAnchor
        : kind === 'quick'
        ? lastQuickAnchor
        : kind === 'moments'
        ? lastMomentsAnchor
        : null;
    const sameAnchor = lastAnchor === anchorEl;
    hideMenus();
    positionSheet(menuEl, anchorEl, 0, 4, alignRight);
    // 若是同一个锚点且当前已显示，则视为 toggle 关闭；否则打开并重定位
    if (!isVisible || !sameAnchor) {
      menuEl.classList.remove('hidden');
    } else {
      menuEl.classList.add('hidden');
    }
    if (kind === 'settings') lastSettingsAnchor = anchorEl;
    if (kind === 'quick') lastQuickAnchor = anchorEl;
    if (kind === 'moments') lastMomentsAnchor = anchorEl;
  };

  avatarBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(settingsMenu, btn, { kind: 'settings' });
    });
  });

  plusBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(quickMenu, btn, { alignRight: true, kind: 'quick' });
    });
  });
  if (momentsSettingsBtn) {
    momentsSettingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(momentsMenu, momentsSettingsBtn, { alignRight: true, kind: 'moments' });
    });
  }

  // Mount moments list renderer
  try {
    const momentsListEl = document.getElementById('moments-list');
    if (momentsListEl) momentsPanel.mount(momentsListEl);
  } catch {}
  chatMenuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    positionSheet(chatroomMenu, chatMenuBtn, 0, 4, true);
    chatroomMenu?.classList.toggle('hidden');
    settingsMenu?.classList.add('hidden');
    quickMenu?.classList.add('hidden');
  });
  document.addEventListener('click', hideMenus);

  settingsMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'settings') generalSettingsPanel.show();
      if (action === 'persona') personaPanel.show();
      if (action === 'session') sessionPanel.show();
      if (action === 'preset') presetPanel.show();
      if (action === 'memory-templates') memoryTemplatePanel.show();
      if (action === 'world-global') worldPanel.show({ scope: 'global' });
      if (action === 'regex') regexPanel.show();
      if (action === 'plugins') pluginPanel.show();
      if (action === 'config') configPanel.show();
      hideMenus();
    });
  });
  chatroomMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'world') worldPanel.show();
      if (action === 'regex') regexSessionPanel.show();
      if (action === 'vars') variablePanel.show();
      if (action === 'chat-settings') openChatSettings();
      if (action === 'prompt-preview') {
        try {
          const sid = chatStore.getCurrent();
          const contact = contactsStore.getContact(sid);
          const name = contact?.name || sid;
          const req = window.appBridge?.lastRequest;
          const msgs = Array.isArray(req?.messages) ? req.messages : null;
          if (!msgs || !msgs.length) {
            window.toastr?.warning?.('暂无本次 Prompt 记录（请先发送一次）');
          } else {
            const at = req?.at ? new Date(req.at).toLocaleString() : '';
            const head = [
              `provider: ${req?.provider || ''}`,
              `model: ${req?.model || ''}`,
              `baseUrl: ${req?.baseUrl || ''}`,
              `stream: ${req?.stream ? 'true' : 'false'}`,
              req?.options
                ? `options: ${Object.entries(req.options)
                    .filter(([_, v]) => v !== undefined)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n');
            // Display only: show prompt text content for easier reading (no JSON, no numbering).
            const body =
              typeof buildRequestPromptText === 'function'
                ? buildRequestPromptText(msgs)
                : msgs
                    .map(m => String(m?.content ?? ''))
                    .filter(t => t.trim().length > 0)
                    .join('\n\n');
            const meta = `${name}${at ? ` · ${at}` : ''}`;
            promptPreviewModal.show(`${head}\n\n${body}`.trim(), meta);
          }
        } catch (err) {
          logger.warn('prompt preview failed', err);
          window.toastr?.error?.('打开本次 Prompt 失败');
        }
      }
      if (action === 'raw-reply') {
        const sid = chatStore.getCurrent();
        const contact = contactsStore.getContact(sid);
        const name = contact?.name || sid;
        const raw = chatStore.getLastRawResponse(sid);
        const at = chatStore.getLastRawAt(sid);
        if (!raw) {
          window.toastr?.warning?.('暂无原始回复记录（请先让 AI 回复一次）');
        } else {
          const meta = `${name}${at ? ` · ${new Date(at).toLocaleString()}` : ''}`;
          rawReplyModal.show(raw, meta);
        }
      }
      hideMenus();
    });
  });

  // Chat title menu (click current title)
  const chatTitleMenu = document.getElementById('chat-title-menu');
  const currentChatTitle = document.getElementById('current-chat-title');

  const ensureGroupDropdown = () => {
    let el = document.getElementById('group-management-dropdown');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'group-management-dropdown';
    el.style.cssText = `
            display:none;
            position: fixed;
            background: white;
            border: 1px solid rgba(0,0,0,0.10);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.18);
            z-index: 15000;
            max-height: min(320px, calc(100vh - 140px));
            overflow: auto;
            -webkit-overflow-scrolling: touch;
            min-width: 240px;
        `;
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
    return el;
  };

  const renderGroupDropdown = (groupId, anchorEl) => {
    const el = ensureGroupDropdown();
    const g = contactsStore.getContact(groupId);
    const members = Array.isArray(g?.members) ? g.members : [];
    const title = `${g?.name || '群聊'} · ${members.length}人`;
    el.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); border-radius:12px 12px 0 0;">
                <div style="font-weight:900; color:#0f172a; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                <button id="group-dd-settings" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">⚙</button>
            </div>
            <div style="padding:8px 0;">
                ${
                  members
                    .map(mid => {
                      const c = contactsStore.getContact(mid);
                      const name = c?.name || mid;
                      const avatar = resolveAvatarForContact(mid, c);
                      return `
                        <button class="group-dd-member" data-mid="${mid}" style="width:100%; display:flex; align-items:center; gap:10px; padding:10px 12px; border:none; background:transparent; cursor:pointer; text-align:left;">
                            <img src="${avatar}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                                <div style="color:#64748b; font-size:12px;">点击进入私聊</div>
                            </div>
                        </button>
                    `;
                    })
                    .join('') || `<div style="color:#94a3b8; font-size:13px; padding:10px 12px;">暂无成员</div>`
                }
            </div>
        `;

    positionSheet(el, anchorEl, 0, 6, false);
    el.style.display = 'block';

    el.querySelector('#group-dd-settings')?.addEventListener('click', () => {
      el.style.display = 'none';
      groupSettingsPanel.show(groupId);
    });
    el.querySelectorAll('.group-dd-member').forEach(btn => {
      btn.addEventListener('click', () => {
        const mid = btn.dataset.mid;
        if (!mid) return;
        const c = contactsStore.getContact(mid);
        el.style.display = 'none';
        switchPage('chat');
        enterChatRoom(mid, c?.name || mid, 'chat');
      });
    });
  };

  currentChatTitle?.addEventListener('click', e => {
    e.stopPropagation();
    const sid = chatStore.getCurrent();
    const c = contactsStore.getContact(sid);
    const isGroup = Boolean(c?.isGroup) || String(sid || '').startsWith('group:');
    if (isGroup) {
      const el = document.getElementById('group-management-dropdown');
      const showing = el && el.style.display !== 'none';
      hideMenus();
      if (!showing) renderGroupDropdown(sid, currentChatTitle);
      return;
    }
    toggleSheetAt(chatTitleMenu, currentChatTitle, { kind: 'title' });
  });
  chatTitleMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'contact-settings') contactSettingsPanel.show();
      hideMenus();
    });
  });

  /* ---------------- 聊天列表 <-> 聊天室切换 ---------------- */
  const backToListBtn = document.getElementById('back-to-list');
  let chatOriginPage = 'chat';
  const chatRenderState = new Map(); // sessionId -> { start }
  const isChatRoomVisible = () => Boolean(chatRoom) && !chatRoom.classList.contains('hidden');
  const updatePendingFloat = (sessionId = chatStore.getCurrent()) => {
    if (!pendingFloat?.el) return;
    if (!isChatRoomVisible()) {
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const sid = String(sessionId || '').trim();
    if (!sid) {
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const pending = chatStore.getPendingMessages(sid) || [];
    if (!pending.length) {
      pendingFloatActive = null;
      pendingFloat.el.classList.remove('is-active');
      return;
    }
    const maxItems = 3;
    pendingFloat.titleEl.textContent = `待发送 ${pending.length} 条`;
    pendingFloat.listEl.innerHTML = '';
    pending.slice(-maxItems).forEach(m => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pending-float-item';
      item.dataset.msgId = String(m?.id || '');
      const raw = String(m?.content ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      item.textContent = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw || '(空)';
      pendingFloat.listEl.appendChild(item);
    });
    if (pending.length > maxItems) {
      const more = document.createElement('div');
      more.className = 'pending-float-more';
      more.textContent = `还有 ${pending.length - maxItems} 条`;
      pendingFloat.listEl.appendChild(more);
    }
    pendingFloat.el.classList.add('is-active');
  };
  const movePendingFromHistoryToQueue = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const messages = chatStore.getMessages(sid) || [];
    const pending = messages.filter(m => m?.status === 'pending');
    if (!pending.length) return [];
    const existing = new Set((chatStore.getPendingMessages(sid) || []).map(m => String(m?.id || '')));
    pending.forEach(m => {
      const id = String(m?.id || '').trim();
      if (!id) return;
      if (!existing.has(id)) {
        chatStore.addPendingMessage(m, sid);
        existing.add(id);
      }
      chatStore.deleteMessage(id, sid);
      ui.removeMessage(id);
    });
    refreshChatAndContacts();
    return pending;
  };
  const finalizePendingMessages = (sessionId, sentMessages = []) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const ids = new Set(sentMessages.map(m => String(m?.id || '')).filter(Boolean));
    if (!ids.size) return;
    const history = chatStore.getMessages(sid) || [];
    history.forEach(m => {
      const mid = String(m?.id || '');
      if (!ids.has(mid)) return;
      const updated = chatStore.updateMessage(m.id, { status: 'sent' }, sid);
      ui.updateMessage(m.id, updated || { ...m, status: 'sent' });
    });
    const pendingQueue = chatStore.getPendingMessages(sid) || [];
    pendingQueue.forEach(m => {
      const mid = String(m?.id || '');
      if (!ids.has(mid)) return;
      chatStore.removePendingMessage(m.id, sid);
    });
  };
  const sendPendingFromFloat = async (pendingMsg, sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !pendingMsg) return false;
    const content = String(pendingMsg?.content ?? '').trim();
    if (!content) {
      window.toastr?.warning?.('未找到缓存内容');
      return false;
    }
    const msgId = String(pendingMsg?.id || '').trim();
    if (!msgId) return false;
    const history = chatStore.getMessages(sid) || [];
    const existing = history.find(m => String(m?.id || '') === msgId);
    if (existing) {
      const updated = chatStore.updateMessage(existing.id, { status: 'pending' }, sid);
      if (isChatRoomVisible() && String(chatStore.getCurrent() || '') === sid) {
        ui.updateMessage(existing.id, updated || { ...existing, status: 'pending' });
      }
    } else {
      const saved = chatStore.appendMessage({ ...pendingMsg, status: 'pending' }, sid);
      if (isChatRoomVisible() && String(chatStore.getCurrent() || '') === sid) {
        ui.addMessage(saved);
      }
    }
    chatStore.removePendingMessage(msgId, sid);
    pendingFloatActive = null;
    updatePendingFloat(sid);
    refreshChatAndContacts();
    return true;
  };
  const autoMarkReadIfActive = (sessionId, messageId = '') => {
    try {
      const sid = String(sessionId || '').trim();
      if (!sid) return;
      if (!isChatRoomVisible()) return;
      if (String(chatStore.getCurrent() || '') !== sid) return;
      chatStore.markRead(sid, messageId);
    } catch {}
  };
  const isSessionActive = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    if (!isChatRoomVisible()) return false;
    return String(chatStore.getCurrent() || '').trim() === sid;
  };

  const enterChatRoom = async (sessionId, sessionName, originPage = activePage) => {
    chatOriginPage = originPage || 'chat';
    chatList?.classList.add('hidden');
    chatRoom?.classList.remove('hidden');
    pages.chat?.classList.add('chat-room-active');
    document.body?.classList.add('chat-room-active');
    chatInputGapTweak = 0;
    setStickerPanelOpen(false);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        syncChatInputOffset();
        requestAnimationFrame(syncChatInputOffset);
      });
    } else {
      setTimeout(syncChatInputOffset, 0);
    }

    // 隐藏消息界面顶部和底部导航栏
    const messageTopbar = document.getElementById('message-topbar');
    const bottomNav = document.querySelector('.bottom-nav');
    if (messageTopbar) messageTopbar.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';

    const contact = contactsStore.getContact(sessionId);
    if (currentChatTitle)
      currentChatTitle.innerHTML = renderSessionNameHtml(sessionId, contact);
    // 切换会话
    chatStore.switchSession(sessionId);
    window.appBridge.setActiveSession(sessionId);
    syncUserPersonaUI(sessionId);
    if (chatSettingsReady) {
      try {
        const sessionSettings = normalizeChatSettings(chatStore.getSessionSettings(sessionId) || {});
        applyChatSettings(sessionId, sessionSettings);
      } catch (err) {
        logger.warn('应用会话聊天设置失败', err);
      }
    } else {
      pendingChatSettingsSessionId = sessionId;
    }
    // 加载历史
    const history = await chatStore.ensureRecentMessagesLoaded(sessionId);
    const firstUnreadId = chatStore.getFirstUnreadMessageId(sessionId);
    const PAGE = 90;
    let start = Math.max(0, history.length - PAGE);
    if (firstUnreadId) {
      const idx = history.findIndex(m => String(m?.id || '') === String(firstUnreadId));
      if (idx !== -1 && idx < start) {
        start = Math.max(0, idx - 10);
      }
    }
    const initial = history.slice(start, start + PAGE);
    const { list: initialWithDivider, dividerId } = injectUnreadDivider(initial, firstUnreadId);
    ui.clearMessages();
    ui.hideTyping();
    ui.preloadHistory(decorateMessagesForDisplay(initialWithDivider, { sessionId }), { keepScroll: true });
    chatStore.prefetchRawOriginals?.(sessionId).catch(() => {});
    // Keep a render cursor so we can lazy-load earlier messages when scrolling up.
    chatRenderState.set(sessionId, { start });

    const jumpToUnread = () => {
      if (dividerId && ui.scrollToMessage(dividerId)) return true;
      if (firstUnreadId) return ui.scrollToMessage(firstUnreadId);
      return false;
    };
    if (dividerId || firstUnreadId) {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
          window.requestAnimationFrame(() => {
            if (!jumpToUnread()) setTimeout(jumpToUnread, 80);
            requestAnimationFrame(syncChatBottomGap);
          });
        } else {
          setTimeout(() => {
            if (!jumpToUnread()) setTimeout(jumpToUnread, 80);
            setTimeout(syncChatBottomGap, 0);
          }, 0);
        }
      } catch {
        setTimeout(() => {
          if (!jumpToUnread()) setTimeout(jumpToUnread, 80);
          setTimeout(syncChatBottomGap, 0);
        }, 0);
      }
    } else {
      setTimeout(() => {
        ui.scrollToBottom();
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(syncChatBottomGap);
        } else {
          setTimeout(syncChatBottomGap, 0);
        }
      }, 0);
    }
    // Mark read once user enters the chatroom
    try {
      chatStore.markRead(sessionId);
    } catch {}
    refreshChatAndContacts();
    const draft = chatStore.getDraft(sessionId);
    if (draft) {
      ui.setInputText(draft);
    } else {
      // Fallback: sessionStorage draft mirror (survives hot reload)
      try {
        const tmp = sessionStorage.getItem(`phone_draft_${sessionId}`) || '';
        if (tmp) ui.setInputText(tmp);
      } catch {}
    }
    ui.setSessionLabel(sessionId);
    if (uiStateArmed) saveUiState();
    updatePendingFloat(sessionId);
    if (activeGeneration && !activeGeneration.cancelled && activeGeneration.sessionId === sessionId) {
      ui.showTyping(getAssistantAvatarForSession(sessionId));
    }
    uiLog('enterChatRoom', { sessionId, originPage: chatOriginPage });
  };

  const exitChatRoom = () => {
    chatRoom?.classList.add('hidden');
    chatList?.classList.remove('hidden');
    pages.chat?.classList.remove('chat-room-active');
    document.body?.classList.remove('chat-room-active');
    setStickerPanelOpen(false);
    setActionPanelOpen(false);
    scheduleWallpaperIdle();

    // 恢复显示消息界面顶部和底部导航栏
    const messageTopbar = document.getElementById('message-topbar');
    const bottomNav = document.querySelector('.bottom-nav');
    if (messageTopbar) messageTopbar.style.display = '';
    if (bottomNav) bottomNav.style.display = '';

    if (chatOriginPage && chatOriginPage !== 'chat') {
      switchPage(chatOriginPage);
    }
    chatOriginPage = 'chat';
    updatePendingFloat();
    if (uiStateArmed) saveUiState();
    uiLog('exitChatRoom', { activePage, sessionId: chatStore.getCurrent() });
  };

  const getRpTitle = () => {
    const p = personaStore.getActive?.() || {};
    const name = String(p?.name || '').trim();
    return name ? `RP · ${name}` : 'RP';
  };

  const getRpGreetings = () => rpSessionStore.getGreetings?.() || [];
  const ensureRpGreetingActive = () => {
    const list = getRpGreetings();
    if (!list.length) return null;
    const active = rpSessionStore.getActiveGreeting?.();
    if (active) return active;
    const nextId = list[0]?.id || '';
    if (nextId) rpSessionStore.setActiveGreeting?.(nextId);
    return list[0] || null;
  };

  const renderRpToolbar = () => {
    if (!rpGreetingSelect) return;
    const list = getRpGreetings();
    rpGreetingSelect.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '无开场白';
      rpGreetingSelect.appendChild(opt);
      rpGreetingSelect.disabled = true;
      return;
    }
    list.forEach((g, idx) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.title || `开场白 ${idx + 1}`;
      rpGreetingSelect.appendChild(opt);
    });
    rpGreetingSelect.disabled = false;
    const active = ensureRpGreetingActive();
    if (active?.id) rpGreetingSelect.value = active.id;
  };

  const buildRpGreetingMessage = (greeting, sessionId) => {
    const content = String(greeting?.content || '').trim();
    if (!content) return null;
    const parsed = parseSpecialMessage(content);
    const assistantName = String(personaStore.getActive?.()?.name || '角色');
    const meta = { ...(parsed.meta || {}), isGreeting: true };
    return {
      role: 'assistant',
      ...parsed,
      name: assistantName,
      avatar: getAssistantAvatarForSession(sessionId),
      time: formatNowTime(),
      meta,
    };
  };

  const seedRpGreetingIfNeeded = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const messages = chatStore.getMessages(sid) || [];
    if (messages.some(isConversationMessage)) return false;
    const greeting = ensureRpGreetingActive();
    const msg = buildRpGreetingMessage(greeting, sid);
    if (!msg) return false;
    chatStore.appendMessage(msg, sid);
    if (String(chatStore.getCurrent() || '') === sid) ui.addMessage(msg);
    return true;
  };

  const resetRpHistory = (sessionId, { keepInput = false } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    chatStore.clear(sid);
    ui.clearMessages();
    chatRenderState.set(sid, { start: 0 });
    seedRpGreetingIfNeeded(sid);
    if (!keepInput) ui.clearInput();
    refreshChatAndContacts();
    updatePendingFloat(sid);
  };

  const enterRpMode = async ({ captureSocial = true } = {}) => {
    if (uiMode === 'rp') return;
    if (captureSocial) {
      lastSocialState = {
        activePage,
        sessionId: chatStore.getCurrent(),
        inChatRoom: isChatRoomVisible(),
      };
      lastSocialSendMode = sendMode;
    }
    uiMode = 'rp';
    persistUiMode();
    applyUiModeUI();
    if (sendMode !== 'creative') {
      setSendMode('creative', { silent: true });
    }
    try {
      await rpSessionStore?.ready;
    } catch {}
    renderRpToolbar();
    if (activePage !== 'chat') {
      switchPage('chat');
    }
    const rpSessionId = getRpSessionId(activePersonaId);
    if (typeof chatStore._ensureSession === 'function') {
      chatStore._ensureSession(rpSessionId);
      const settings = chatStore.getSessionSettings?.(rpSessionId) || {};
      chatStore.setSessionSettings?.(rpSessionId, { ...settings, sharedVariables: true, sharedMemory: true });
      chatStore._persist?.();
    }
    enterChatRoom(rpSessionId, getRpTitle(), 'chat');
    if (currentChatTitle) currentChatTitle.textContent = getRpTitle();
    seedRpGreetingIfNeeded(rpSessionId);
    if (rpToolbar) rpToolbar.style.display = '';
  };

  const exitRpMode = () => {
    if (uiMode !== 'rp') return;
    uiMode = 'social';
    persistUiMode();
    applyUiModeUI();
    if (lastSocialSendMode) {
      setSendMode(lastSocialSendMode, { silent: true });
    }
    if (rpToolbar) rpToolbar.style.display = 'none';

    const restorePage = lastSocialState.activePage || 'chat';
    const restoreSession = String(lastSocialState.sessionId || '').trim();
    const restoreInRoom = Boolean(lastSocialState.inChatRoom);

    chatOriginPage = restorePage;
    exitChatRoom();

    if (restoreInRoom && restoreSession) {
      const c = contactsStore.getContact(restoreSession);
      switchPage(restorePage);
      enterChatRoom(restoreSession, c?.name || restoreSession, restorePage);
    } else {
      switchPage(restorePage);
    }
  };

  backToListBtn?.addEventListener('click', () => {
    if (uiMode === 'rp') {
      exitRpMode();
      return;
    }
    exitChatRoom();
  });

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.mode === 'rp' ? 'rp' : 'social';
      if (target === 'rp') {
        enterRpMode();
      } else {
        exitRpMode();
      }
    });
  });

  rpGreetingSelect?.addEventListener('change', async () => {
    const nextId = String(rpGreetingSelect.value || '').trim();
    if (!nextId) return;
    const prevId = rpSessionStore.getActiveGreetingId?.() || '';
    if (nextId === prevId) return;
    rpSessionStore.setActiveGreeting?.(nextId);
    if (uiMode !== 'rp') return;
    const rpSessionId = getRpSessionId(activePersonaId);
    const hasHistory = (chatStore.getMessages(rpSessionId) || []).some(isConversationMessage);
    if (hasHistory) {
      const ok = await appConfirm({
        title: '切换开场白',
        message: '切换开场白将清空当前 RP 剧情，是否继续？',
        confirmText: '切换并清空',
        cancelText: '取消',
        danger: true,
      });
      if (!ok) {
        if (prevId) rpGreetingSelect.value = prevId;
        return;
      }
    }
    resetRpHistory(rpSessionId);
  });

  rpResetBtn?.addEventListener('click', async () => {
    if (uiMode !== 'rp') return;
    const ok = await appConfirm({
      title: '重置 RP 剧情',
      message: '将清空当前 RP 历史并重新插入开场白，是否继续？',
      confirmText: '重置',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    resetRpHistory(getRpSessionId(activePersonaId));
  });

  rpVarsBtn?.addEventListener('click', () => {
    variablePanel.show();
  });

  quickMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'add-friend') sessionPanel.show();
      if (action === 'create-group') groupCreatePanel.show();
      if (action === 'new-group') groupPanel.show();
      hideMenus();
    });
  });

  /* ---------------- 列表入口共用会话 ---------------- */
  chatList?.addEventListener('click', e => {
    const item = e.target.closest('.chat-list-item');
    if (!item) return;
    const id = item.dataset.session || 'default';
    const name = item.dataset.name || id;
    enterChatRoom(id, name);
    switchPage('chat');
  });

  const contactsUngroupedEl = document.getElementById('contacts-ungrouped-list');
  contactsUngroupedEl?.addEventListener('click', e => {
    const item = e.target.closest('.contact-item');
    if (!item || !item.dataset.session) return;
    const id = item.dataset.session;
    const name = item.dataset.name || id;
    const origin = activePage;
    switchPage('chat');
    enterChatRoom(id, name, origin);
  });

  const contactsGroupsEl = document.getElementById('contacts-groups-list');
  contactsGroupsEl?.addEventListener('click', e => {
    const item = e.target.closest('.contact-item');
    if (!item || !item.dataset.session) return;
    const id = item.dataset.session;
    const name = item.dataset.name || id;
    const origin = activePage;
    switchPage('chat');
    enterChatRoom(id, name, origin);
  });

  // Quick action buttons
  const actionHandlers = {
    image: async () => {
      await mediaPicker.pickFile('image');
    },
    music: async () => {
      const useFile = await appConfirm({
        title: '音频来源',
        message: '使用本地音频文件吗？',
        confirmText: '本地文件',
        cancelText: '使用 URL',
      });
      if (useFile) {
        await mediaPicker.pickFile('audio');
      } else {
        const title = prompt('输入歌名', '未命名');
        const artist = prompt('输入歌手', '');
        const audioUrl = prompt('音源 URL（可留空）', '');
        if (!title) return;
        const msg = {
          role: 'user',
          type: 'music',
          content: title,
          meta: { artist, url: audioUrl },
          name: getEffectivePersona(chatStore.getCurrent())?.name || '我',
          avatar: avatars.user,
          time: formatNowTime(),
        };
        ui.addMessage(msg);
        chatStore.appendMessage(msg);
      }
    },
    transfer: async () => {
      const amount = prompt('输入金額（示例：520元）', '520元');
      if (!amount) return;
      const msg = {
        role: 'user',
        type: 'transfer',
        content: amount,
        name: getEffectivePersona(chatStore.getCurrent())?.name || '我',
        avatar: avatars.user,
        time: formatNowTime(),
      };
      ui.addMessage(msg);
      chatStore.appendMessage(msg);
    },
    sticker: async () => {
      setStickerPanelOpen(true);
    },
    document: async () => {
      await mediaPicker.pickFile('document');
    },
  };
  const runQuickAction = action => {
    const handler = actionHandlers[action];
    if (handler) {
      setActionPanelOpen(false);
      handler();
      return;
    }
    window.toastr?.info?.(`快捷操作占位：${action}`);
  };

  document.querySelectorAll('.chat-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      runQuickAction(action);
    });
  });
  const chatStickerBtn = document.querySelector('.chat-sticker-btn');
  chatStickerBtn?.addEventListener('click', () => {
    runQuickAction('sticker');
  });

  document.querySelectorAll('.action-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      runQuickAction(action);
    });
  });
  // Support badge for grouping/role
  const sessionBadge = document.createElement('span');
  sessionBadge.className = 'badge';
  sessionBadge.textContent = '单聊';
  sessionBadge.id = 'session-badge';
  const titleEl = document.querySelector('.app-title');
  if (titleEl) {
    titleEl.appendChild(sessionBadge);
    worldIndicator.mount(titleEl);
  }

  // Button: open config
  ui.onConfig(() => configPanel.show());
  // Button: open world
  ui.onWorld(() => {
    worldPanel.show();
    updateWorldIndicator();
  });
  // Button: session switcher
  const sessionBtn = document.getElementById('session-button');
  if (sessionBtn) {
    sessionBtn.addEventListener('click', () => sessionPanel.show());
  }

  // Preload chat history if available
  try {
    const sessions = chatStore.listSessions();
    const currentId = chatStore.getCurrent();
    const history = await chatStore.ensureRecentMessagesLoaded(currentId);
    ui.setSessionLabel(currentId);
    if (history && history.length) {
      const PAGE = 90;
      const start = Math.max(0, history.length - PAGE);
      ui.preloadHistory(decorateMessagesForDisplay(history.slice(start), { sessionId: currentId }));
      chatRenderState.set(currentId, { start });
      chatStore.prefetchRawOriginals?.(currentId).catch(() => {});
    }
    const draft = chatStore.getDraft(currentId);
    if (draft) ui.setInputText(draft);
  } catch (error) {
    logger.warn('加载历史记录失败，跳过', error);
  }

  // Track the current in-flight generation so we can support "收回" (cancel + retract)
  let activeGeneration = null; // { sessionId, userMsgId, streamCtrl, cancelled }
  const pendingGroupJoins = new Set();

  // Chat UI lazy-load: only render the latest N messages; load earlier on scroll-to-top.
  const bindChatScrollLazyLoad = () => {
    if (!ui?.scrollEl || ui.__chatappLazyBound) return;
    ui.__chatappLazyBound = true;
    let loading = false;
    ui.scrollEl.addEventListener(
      'scroll',
      async () => {
        if (loading) return;
        if (ui.scrollEl.scrollTop > 18) return;
        const sid = String(chatStore.getCurrent() || '').trim();
        if (!sid) return;
        const st = chatRenderState.get(sid);
        if (!st || !Number.isFinite(st.start)) return;
        loading = true;
        try {
          const all = chatStore.getMessages(sid) || [];
          const PAGE = 90;
          if (st.start > 0) {
            const nextStart = Math.max(0, st.start - PAGE);
            const chunk = all.slice(nextStart, st.start);
            if (chunk.length) {
              ui.prependHistory(decorateMessagesForDisplay(chunk, { sessionId: sid }));
              chatRenderState.set(sid, { start: nextStart });
              chatStore.prefetchRawOriginalsForMessages?.(chunk, sid).catch(() => {});
              return;
            }
            chatRenderState.set(sid, { start: 0 });
          }
          if (!chatStore.hasOlderMessages?.(sid)) return;
          const older = await chatStore.loadOlderMessages(sid, { partCount: 1 });
          if (older.length) {
            ui.prependHistory(decorateMessagesForDisplay(older, { sessionId: sid }));
            chatRenderState.set(sid, { start: 0 });
            chatStore.prefetchRawOriginalsForMessages?.(older, sid).catch(() => {});
          }
        } finally {
          setTimeout(() => {
            loading = false;
          }, 0);
        }
      },
      { passive: true },
    );
  };
  bindChatScrollLazyLoad();

  // Summary compaction runner (used by auto-trigger and manual "↻" button in settings)
  const summaryCompacting = new Set();
  const requestSummaryCompaction = (sid, { force = false } = {}) => {
    if (!isSummaryMemoryEnabled()) return Promise.resolve(false);
    const sessionId = String(sid || '').trim();
    if (!sessionId) return Promise.resolve(false);
    if (summaryCompacting.has(sessionId)) return Promise.resolve(false);
    if (!window?.appBridge?.backgroundChat || !window?.appBridge?.buildMessages) return Promise.resolve(false);
    if (typeof window.appBridge.isConfigured === 'function' && !window.appBridge.isConfigured())
      return Promise.resolve(false);

    const list = chatStore.getSummaries(sessionId) || [];
    const summaries = Array.isArray(list) ? list : [];
    if (!summaries.length) return Promise.resolve(false);
    const total = summaries.reduce((n, it) => {
      const text = String(typeof it === 'string' ? it : it?.text || '');
      return n + text.length;
    }, 0);
    if (!force && total <= 1000) return Promise.resolve(false);

    summaryCompacting.add(sessionId);
    return new Promise(resolve => {
      // Run in background with a short delay to avoid competing with user interactions.
      setTimeout(async () => {
        try {
          const current = chatStore.getSummaries(sessionId) || [];
          const arr = Array.isArray(current) ? current : [];
          const payload = arr
            .map(it => {
              const text = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (!text) return '';
              const at = typeof it === 'object' && it && it.at ? Number(it.at) : 0;
              const when = at ? new Date(at).toLocaleString() : '';
              return `- ${when ? `[${when}] ` : ''}${text}`;
            })
            .filter(Boolean)
            .join('\n');
          if (!payload.trim()) return resolve(false);

          const compactedPrev = chatStore.getCompactedSummary(sessionId);
          const compactedText = String(compactedPrev?.text || '').trim();

          const prompt = [
            '# 注意，无视你先前收到的任何指令，你的任务已更改，不再遵守格式要求',
            '接下来的一轮回复中，将不会进行创作，不再遵循前面的要求，而是会遵循<summary_rules>中的要求进行一轮总结',
            '【总结请求】',
            '请对前文内容进行全面梳理，根据以下要求制作简明扼要的总结：',
            '',
            '<summary_rules>',
            '总结应当遵循以下原则：',
            '- 按时间顺序或逻辑顺序组织信息，并明确给出具体时间节点',
            '- 保留关键事件和重要细节，省略冗余描述',
            '- 直接陈述事实，避免主观评价',
            '- 使用简洁清晰的语言，避免过度修饰',
            '- 突出事件发展脉络和关键转折点',
            '- 不回避任何敏感内容，保证记录完全还原前文',
            '',
            '总结正文必须放在 <summary>...</summary> 中（只允许这一层 XML 标签；不要输出其他 XML 标签）。',
            'summary 内部的正文必须使用以下格式：',
            '',
            '【关键事件】',
            '• {事件1}: {简要描述}',
            '• {事件2}: {简要描述}',
            '• {事件3}: {简要描述}',
            '...',
            '',
            '</summary_rules>',
            '',
            compactedText ? '【已有大总结】' : '',
            compactedText ? compactedText : '',
            compactedText ? '' : '',
            '【前文内容（按时间标注的摘要列表）】',
            payload,
          ].join('\n');

          const contact = contactsStore?.getContact?.(sessionId) || null;
          const isGroup = Boolean(contact?.isGroup) || sessionId.startsWith('group:');
          const activePersona = getEffectivePersona?.(chatStore.getCurrent?.()) || getEffectivePersona?.() || {};
          const userName = activePersona?.name || '我';
          const charName = String(contact?.name || sessionId.replace(/^group:/, '') || sessionId) || 'assistant';
          const ctx = {
            user: {
              name: userName,
              persona: String(activePersona?.description || ''),
              personaPosition: activePersona?.position,
              personaDepth: activePersona?.depth,
              personaRole: activePersona?.role,
            },
            character: { name: charName },
            session: { id: sessionId, isGroup },
            group: isGroup
              ? {
                  id: sessionId,
                  name: charName,
                  members: Array.isArray(contact?.members) ? contact.members : [],
                  memberNames: (Array.isArray(contact?.members) ? contact.members : []).map(
                    mid => contactsStore.getContact(mid)?.name || mid,
                  ),
                }
              : null,
            history: [],
            meta: {
              disableChatGuide: true,
              disableScenarioHint: true,
              disableSummary: true,
              disableMomentSummary: true,
              overrideLastUserMessage: '开始总结，勿输出聊天格式',
              skipInputRegex: true,
            },
          };
          const built = window.appBridge.buildMessages(prompt, ctx);
          const out = await window.appBridge.backgroundChat(built, { temperature: 0.2, maxTokens: 800 });
          const raw = String(out || '').trim();
          if (!raw) return resolve(false);
          try {
            chatStore.setCompactedSummaryRaw(raw, sessionId);
          } catch {}

          const extractSummaryTag = s => {
            const input = String(s || '');
            const re = /<summary>([\s\S]*?)<\/summary>/gi;
            let m;
            let last = null;
            while ((m = re.exec(input))) last = m[1];
            const inner = String(last || '').trim();
            return inner;
          };
          const text = extractSummaryTag(raw);
          if (!text) {
            try {
              window.dispatchEvent(
                new CustomEvent('chatapp-summary-compaction-failed', {
                  detail: { sessionId, reason: 'missing_summary_tag' },
                }),
              );
            } catch {}
            return resolve(false);
          }

          // Validate output format so UI can rely on a recognizable "big summary".
          const hasHeader = /【\s*关键事件\s*】/.test(text);
          const hasBullet = /^[ \t]*[•\-]\s*\S+/m.test(text);
          if (!hasHeader || !hasBullet) {
            try {
              window.dispatchEvent(
                new CustomEvent('chatapp-summary-compaction-failed', {
                  detail: { sessionId, reason: 'format' },
                }),
              );
            } catch {}
            return resolve(false);
          }

          // Store compact summary below the normal summary list and keep only the latest 2 summaries.
          try {
            chatStore.setCompactedSummary(text, sessionId, { raw });
          } catch {}
          try {
            const keep = (chatStore.getSummaries(sessionId) || []).slice(-2);
            chatStore.clearSummaries(sessionId);
            keep.forEach(it => {
              const t = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (t) chatStore.addSummary(t, sessionId);
            });
          } catch {}

          try {
            refreshChatAndContacts();
          } catch {}
          try {
            window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId } }));
          } catch {}
          resolve(true);
        } catch (err) {
          logger.debug('summary compaction failed', err);
          resolve(false);
        } finally {
          summaryCompacting.delete(sessionId);
        }
      }, 450);
    });
  };
  try {
    globalThis.__chatappRequestSummaryCompaction = requestSummaryCompaction;
  } catch {}
  try {
    window.__chatappRequestSummaryCompaction = requestSummaryCompaction;
  } catch {}
  try {
    if (window?.appBridge) window.appBridge.requestSummaryCompaction = requestSummaryCompaction;
  } catch {}

  const momentSummaryCompacting = new Set();
  requestMomentSummaryCompaction = ({ force = false } = {}) => {
    if (momentSummaryCompacting.has('global')) return Promise.resolve(false);
    if (!momentSummaryStore?.getSummaries || !momentSummaryStore?.setCompactedSummary) return Promise.resolve(false);
    if (!window?.appBridge?.backgroundChat || !window?.appBridge?.buildMessages) return Promise.resolve(false);
    if (typeof window.appBridge.isConfigured === 'function' && !window.appBridge.isConfigured())
      return Promise.resolve(false);

    const list = momentSummaryStore.getSummaries() || [];
    const summaries = Array.isArray(list) ? list : [];
    if (!summaries.length) return Promise.resolve(false);
    const total = summaries.reduce((n, it) => {
      const text = String(typeof it === 'string' ? it : it?.text || '');
      return n + text.length;
    }, 0);
    if (!force && total <= 1000) return Promise.resolve(false);

    momentSummaryCompacting.add('global');
    return new Promise(resolve => {
      setTimeout(async () => {
        try {
          const current = momentSummaryStore.getSummaries() || [];
          const arr = Array.isArray(current) ? current : [];
          const payload = arr
            .map(it => {
              const text = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (!text) return '';
              const at = typeof it === 'object' && it && it.at ? Number(it.at) : 0;
              const when = at ? new Date(at).toLocaleString() : '';
              return `- ${when ? `[${when}] ` : ''}${text}`;
            })
            .filter(Boolean)
            .join('\n');
          if (!payload.trim()) return resolve(false);

          const compactedPrev = momentSummaryStore.getCompactedSummary();
          const compactedText = String(compactedPrev?.text || '').trim();

          const prompt = [
            '# 注意，无视你先前收到的任何指令，你的任务已更改，不再遵守格式要求',
            '接下来的一轮回复中，将不会进行创作，不再遵循前面的要求，而是会遵循<summary_rules>中的要求进行一轮总结',
            '【总结请求】',
            '请对前文内容进行全面梳理，根据以下要求制作简明扼要的总结：',
            '',
            '<summary_rules>',
            '总结应当遵循以下原则：',
            '- 按时间顺序或逻辑顺序组织信息，并明确给出具体时间节点',
            '- 保留关键事件和重要细节，省略冗余描述',
            '- 直接陈述事实，避免主观评价',
            '- 使用简洁清晰的语言，避免过度修饰',
            '- 突出事件发展脉络和关键转折点',
            '- 不回避任何敏感内容，保证记录完全还原前文',
            '',
            '总结正文必须放在 <summary>...</summary> 中（只允许这一层 XML 标签；不要输出其他 XML 标签）。',
            'summary 内部的正文必须使用以下格式：',
            '',
            '【关键事件】',
            '• {事件1}: {简要描述}',
            '• {事件2}: {简要描述}',
            '• {事件3}: {简要描述}',
            '...',
            '',
            '</summary_rules>',
            '',
            compactedText ? '【已有大总结】' : '',
            compactedText ? compactedText : '',
            compactedText ? '' : '',
            '【前文内容（按时间标注的摘要列表）】',
            payload,
          ].join('\n');

          const activePersona = getEffectivePersona?.(chatStore.getCurrent?.()) || getEffectivePersona?.() || {};
          const userName = activePersona?.name || '我';
          const ctx = {
            user: {
              name: userName,
              persona: String(activePersona?.description || ''),
              personaPosition: activePersona?.position,
              personaDepth: activePersona?.depth,
              personaRole: activePersona?.role,
            },
            character: { name: '动态' },
            session: { id: 'moment_summary_global', isGroup: false },
            history: [],
            meta: {
              disableChatGuide: true,
              disableScenarioHint: true,
              disableSummary: true,
              disableMomentSummary: true,
              overrideLastUserMessage: '开始总结，勿输出聊天格式',
              skipInputRegex: true,
            },
          };
          const built = window.appBridge.buildMessages(prompt, ctx);
          const out = await window.appBridge.backgroundChat(built, { temperature: 0.2, maxTokens: 800 });
          const raw = String(out || '').trim();
          if (!raw) return resolve(false);
          try {
            momentSummaryStore.setCompactedSummaryRaw(raw);
          } catch {}

          const extractSummaryTag = s => {
            const input = String(s || '');
            const re = /<summary>([\s\S]*?)<\/summary>/gi;
            let m;
            let last = null;
            while ((m = re.exec(input))) last = m[1];
            const inner = String(last || '').trim();
            return inner;
          };
          const text = extractSummaryTag(raw);
          if (!text) return resolve(false);

          const hasHeader = /【\s*关键事件\s*】/.test(text);
          const hasBullet = /^[ \t]*[•\-]\s*\S+/m.test(text);
          if (!hasHeader || !hasBullet) return resolve(false);

          try {
            momentSummaryStore.setCompactedSummary(text, { raw });
          } catch {}
          try {
            const keep = (momentSummaryStore.getSummaries() || []).slice(-2);
            momentSummaryStore.clearSummaries();
            keep.forEach(it => {
              const t = String(typeof it === 'string' ? it : it?.text || '').trim();
              if (t) momentSummaryStore.addSummary(t);
            });
          } catch {}
          try {
            window.dispatchEvent(new CustomEvent('moment-summaries-updated'));
          } catch {}
          resolve(true);
        } catch (err) {
          logger.debug('moment summary compaction failed', err);
          resolve(false);
        } finally {
          momentSummaryCompacting.delete('global');
        }
      }, 450);
    });
  };

  // ============ Pending Message Handlers ============

  /**
   * Handle Enter key: 添加半透明气泡到聊天室 (不发送请求)
   */
  const handleEnter = () => {
    const text = ui.getInputText();
    const hasAttachments = composerAttachments.length > 0;
    if (!text && !hasAttachments) return;

    const sessionId = chatStore.getCurrent();
    const activePersona = getEffectivePersona(sessionId);
    const stickerKey = text ? parseStickerToken(text) : '';
    const attachmentSummary = () => {
      const images = composerAttachments.filter(a => a?.kind === 'image').length;
      const docs = composerAttachments.filter(a => a?.kind === 'document').length;
      const parts = [];
      if (images) parts.push(images === 1 ? '[图片]' : `[图片]x${images}`);
      if (docs) parts.push(docs === 1 ? '[文件]' : `[文件]x${docs}`);
      return parts.join(' ');
    };

    // 创建 pending 消息（status: 'pending'）
    const pendingMessage = {
      role: 'user',
      type: stickerKey ? 'sticker' : 'text',
      content: stickerKey || text || attachmentSummary() || '[附件]',
      raw: stickerKey ? text : undefined,
      status: 'pending', // 标记为待发送
      avatar: avatars.user,
      name: activePersona.name || '我',
      time: formatNowTime(),
    };
    if (!text && hasAttachments && !stickerKey) {
      pendingMessage.meta = { attachmentsOnly: true };
    }

    // 添加到聊天历史（作为 pending 状态的消息）
    const saved = chatStore.appendMessage(pendingMessage, sessionId);

    // 在UI中渲染为半透明气泡
    ui.addMessage(saved);

    // 清空输入框
    ui.clearInput();

    // 提示用户
    const pendingCount = chatStore.getMessages(sessionId).filter(m => m.status === 'pending').length;
    window.toastr?.info?.(`已缓存消息 (${pendingCount} 条待发送)`, { timeOut: 1500 });

    // 刷新聊天列表（更新蓝点）
    refreshChatAndContacts();
    updatePendingFloat(sessionId);
  };

  // Send handler (发送 pending 消息)
  /**
   * @param {string} targetMessageId - 可选，点击的 pending 消息 ID（发送到这里）
   */
  const handleSend = async (targetMessageId = null, options = {}) => {
    if (targetMessageId && typeof targetMessageId === 'object') {
      if (typeof targetMessageId.preventDefault === 'function') {
        targetMessageId = null;
        options = {};
      } else {
        options = targetMessageId;
        targetMessageId = null;
      }
    }
    if (!options || typeof options !== 'object') options = {};
    const overrideTextRaw = typeof options.overrideText === 'string' ? options.overrideText : '';
    const overrideText = overrideTextRaw.trim() ? overrideTextRaw : '';
    const ignorePending = Boolean(options.ignorePending);
    const suppressUserMessage = Boolean(options.suppressUserMessage);
    const existingUserMessageId =
      typeof options.existingUserMessageId === 'string' ? options.existingUserMessageId : '';
    const skipInputRegex = Boolean(options.skipInputRegex);
    const creativeMode = sendMode === 'creative' || uiMode === 'rp';
    const includeAttachments = options.includeAttachments !== false;
    const attachmentQueue = includeAttachments ? composerAttachments.slice() : [];
    const hasAttachments = attachmentQueue.length > 0;
    const sessionId = chatStore.getCurrent();
    const allMessages = chatStore.getMessages(sessionId);

    // 找到所有 pending 消息
    const pendingMessages = ignorePending ? [] : allMessages.filter(m => m.status === 'pending');
    const pendingQueue = !ignorePending && !targetMessageId ? chatStore.getPendingMessages(sessionId) || [] : [];
    if (pendingQueue.length) {
      const historyIds = new Set(allMessages.map(m => String(m?.id || '')).filter(Boolean));
      const restored = [];
      pendingQueue.forEach(m => {
        const id = String(m?.id || '').trim();
        if (!id || historyIds.has(id)) return;
        const saved = chatStore.appendMessage({ ...m, status: 'pending' }, sessionId);
        ui.addMessage(saved);
        restored.push(saved);
        historyIds.add(saved.id);
      });
      pendingQueue.forEach(m => chatStore.removePendingMessage(m?.id, sessionId));
      if (restored.length) pendingMessages.push(...restored);
    }

    // 用于追踪哪些消息需要在发送成功后标记为 sent
    let pendingMessagesToConfirm = [];

    // 确定要发送的文本内容
    let text = '';

    if (pendingMessages.length > 0) {
      // 有 pending 消息，根据 targetMessageId 决定发送范围
      let messagesToSend = [];

      if (targetMessageId) {
        // 点击了某条 pending 消息，发送从第1条到点击的这条
        const targetIndex = pendingMessages.findIndex(m => m.id === targetMessageId);
        if (targetIndex === -1) {
          window.toastr?.error?.('未找到指定消息');
          return false;
        }
        messagesToSend = pendingMessages.slice(0, targetIndex + 1);
      } else {
        // 点击发送按钮（没有指定消息），发送所有 pending 消息
        messagesToSend = pendingMessages;

        // 如果输入框也有内容，先将其添加为 pending 消息
        const currentInput = ui.getInputText().trim();
        if (currentInput) {
          const activePersona = getEffectivePersona(sessionId);
          const stickerKey = parseStickerToken(currentInput);
          const newPendingMsg = {
            role: 'user',
            type: stickerKey ? 'sticker' : 'text',
            content: stickerKey || currentInput,
            raw: stickerKey ? currentInput : undefined,
            status: 'pending',
            avatar: avatars.user,
            name: activePersona.name || '我',
            time: formatNowTime(),
          };
          const saved = chatStore.appendMessage(newPendingMsg, sessionId);
          ui.addMessage(saved);
          messagesToSend.push(saved);
          ui.clearInput();
        }
      }

      // 合并消息内容（换行分隔）
      text = messagesToSend.map(getMessageSendText).filter(Boolean).join('\n');
      pendingMessagesToConfirm = messagesToSend;

      if (!text && !hasAttachments) {
        window.toastr?.warning?.('没有可发送的消息');
        return false;
      }

      // 标记这些消息为"发送中"（保持半透明，等待 AI 响应）
      pendingMessagesToConfirm.forEach(m => {
        chatStore.updateMessage(m.id, { status: 'sending' }, sessionId);
        ui.updateMessage(m.id, { ...m, status: 'sending' });
      });
      if (pluginRuntime) {
        pendingMessagesToConfirm.forEach(m => {
          const updated = chatStore.findMessage(m.id, sessionId) || { ...m, status: 'sending' };
          pluginRuntime.dispatchEvent('message.after_send', { message: updated, sessionId }).catch(err => {
            logger.warn('plugin message.after_send failed', err);
          });
        });
      }
      // 立即刷新列表/浮层，避免发送中仍显示旧的 pending 计数
      refreshChatAndContacts({ immediate: true });
      updatePendingFloat(sessionId);
    } else {
      // 没有 pending 消息，使用输入框内容（兼容旧行为）
      text = overrideText || ui.getInputText();
      if (!text && !hasAttachments) return false;
    }
    const contact = contactsStore.getContact(sessionId);
    const isRpMode = uiMode === 'rp';
    const sharedVariables = isSharedVariableSession(sessionId);
    const sharedMemory = isSharedMemorySession(sessionId);
    const activePersona = getEffectivePersona(sessionId);
    const characterName = isRpMode
      ? (String(activePersona?.name || '').trim() || '角色')
      : (contact?.name || (sessionId.startsWith('group:') ? sessionId.replace(/^group:/, '') : sessionId) || 'assistant');
    const userName = isRpMode ? '我' : (activePersona?.name || '我');
    const userEchoGuard = createUserEchoGuard(text, userName);
    const isGroupChat = Boolean(contact?.isGroup) || sessionId.startsWith('group:');
    const groupMembers = isGroupChat ? (Array.isArray(contact?.members) ? contact.members : []) : [];
    if (pluginRuntime) {
      try {
        const payload = {
          content: text,
          sessionId,
          userName,
          isGroup: isGroupChat,
          hasAttachments,
        };
        const updated = await pluginRuntime.dispatchEvent('message.before_send', payload);
        if (
          updated &&
          typeof updated.content === 'string' &&
          updated.content !== text &&
          (!pendingMessagesToConfirm || pendingMessagesToConfirm.length === 0)
        ) {
          text = updated.content;
        }
      } catch (err) {
        logger.warn('plugin message.before_send failed', err);
      }
    }
    if (variableRuleEngine) {
      variableRuleEngine.handleBeforeSend({ sessionId, content: text, useGlobalVariables: sharedVariables }).catch(err => {
        logger.warn('variable rules before_send failed', err);
      });
    }
    const normalizeName = s => String(s || '').trim();
    const normalizeKey = s => normalizeName(s).toLowerCase().replace(/\s+/g, '');
    // keep only letters/numbers/CJK to avoid emoji/punctuation differences
    const normalizeLoose = s => normalizeKey(s).replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
    const isSystemSpeaker = speakerName => {
      const raw = normalizeName(speakerName).replace(/[：:]/g, '').trim();
      if (!raw) return false;
      const key = normalizeLoose(raw);
      const lower = key.toLowerCase();
      return (
        key === '系统' ||
        key === '系统消息' ||
        key === '系统提示' ||
        lower === 'system' ||
        lower === 'systemmessage' ||
        lower === 'systemmsg'
      );
    };
    const isUserSpeakerName = speakerName => {
      const raw = normalizeName(speakerName).replace(/[：:]/g, '').trim();
      if (!raw) return false;
      const key = normalizeLoose(raw);
      const lower = key.toLowerCase();
      const userKey = normalizeLoose(userName);
      if (userName && (raw === userName || (userKey && key === userKey))) return true;
      return false;
    };
    const normalizeDialogueMessage = msg => {
      const payload =
        msg && typeof msg === 'object'
          ? {
              speaker: String(msg?.speaker || '').trim(),
              content: String(msg?.content || '').trim(),
              time: String(msg?.time || '').trim(),
            }
          : { speaker: '', content: String(msg || '').trim(), time: '' };
      if (!payload.speaker && payload.content) {
        const m = payload.content.match(/^([^\s:：]{1,12})[:：]\s*(.+)$/);
        if (m && isUserSpeakerName(m[1])) {
          payload.speaker = m[1];
          payload.content = m[2].trim();
        }
      }
      return payload;
    };
    const buildUserMessageFromAI = (content, time) => {
      const parsed = parseSpecialMessage(content);
      const meta = { ...(parsed.meta || {}), generatedByAssistant: true };
      return {
        role: 'user',
        type: 'text',
        ...parsed,
        name: userName,
        avatar: avatars.user,
        time: time || formatNowTime(),
        meta,
      };
    };
    const isSyntheticUserMessage = msg => msg?.role === 'user' && msg?.meta?.generatedByAssistant === true;
    const stripSystemMessagePrefix = content => {
      return String(content || '')
        .replace(/^系统消息[:：]?\s*/i, '')
        .trim();
    };
    const splitSystemNames = (segment = '') => {
      const cleaned = String(segment || '')
        .replace(/[。.!！？]+/g, '')
        .trim();
      if (!cleaned) return [];
      return cleaned
        .split(/[、，,]+/)
        .map(s => s.trim())
        .filter(Boolean);
    };
    const parseGroupSystemOps = content => {
      const text = stripSystemMessagePrefix(content).replace(/\s+/g, ' ').trim();
      if (!text) return [];
      const ops = [];
      const inviteNames = new Set();
      const inviteRe = /邀请(.+?)加入群聊/g;
      let m = null;
      while ((m = inviteRe.exec(text))) {
        splitSystemNames(m[1]).forEach(name => inviteNames.add(name));
      }
      if (inviteNames.size > 0) {
        ops.push({ type: 'invite', names: [...inviteNames] });
      }
      const removeNames = new Set();
      const removePatterns = [
        /将(.+?)(?:移出|移除|踢出)群聊/g,
        /把(.+?)(?:移出|移除|踢出)群聊/g,
        /(?:移出|移除|踢出)(.+?)(?:群聊|本群)/g,
      ];
      removePatterns.forEach(re => {
        let rm = null;
        while ((rm = re.exec(text))) {
          splitSystemNames(rm[1]).forEach(name => removeNames.add(name));
        }
      });
      if (removeNames.size > 0) {
        ops.push({ type: 'remove', names: [...removeNames] });
      }
      if (!text.includes('邀请')) {
        const joinNames = new Set();
        const joinRe = /(.+?)加入群聊/g;
        let jm = null;
        while ((jm = joinRe.exec(text))) {
          splitSystemNames(jm[1]).forEach(name => joinNames.add(name));
        }
        if (joinNames.size > 0) {
          ops.push({ type: 'join', names: [...joinNames] });
        }
      }
      return ops;
    };
    const updateGroupMembers = (groupId, nextMembers) => {
      const gid = String(groupId || '').trim();
      if (!gid) return false;
      const g = contactsStore.getContact(gid);
      if (!g) return false;
      const uniq = [...new Set((nextMembers || []).map(id => String(id || '').trim()).filter(Boolean))];
      contactsStore.upsertContact({ id: gid, members: uniq, isGroup: true });
      if (String(chatStore.getCurrent() || '') === gid && currentChatTitle) {
        currentChatTitle.innerHTML = renderSessionNameHtml(gid, contactsStore.getContact(gid));
      }
      return true;
    };
    const appendGroupSystemMessage = (groupId, content) => {
      const gid = String(groupId || '').trim();
      if (!gid) return;
      const parsed = {
        role: 'system',
        type: 'meta',
        content,
        name: '系统',
        time: formatNowTime(),
      };
      if (String(chatStore.getCurrent() || '') === gid) ui.addMessage(parsed);
      chatStore.appendMessage(parsed, gid);
      refreshChatAndContacts();
    };
    const scheduleGroupMemberJoin = (groupId, memberId, displayName, { announce = true, delayMs } = {}) => {
      const gid = String(groupId || '').trim();
      const mid = String(memberId || '').trim();
      if (!gid || !mid) return;
      const key = `${gid}::${mid}`;
      if (pendingGroupJoins.has(key)) return;
      pendingGroupJoins.add(key);
      const delay =
        Number.isFinite(delayMs) && delayMs >= 0 ? Math.trunc(delayMs) : 1200 + Math.floor(Math.random() * 2200);
      setTimeout(() => {
        pendingGroupJoins.delete(key);
        const g = contactsStore.getContact(gid);
        if (!g) return;
        const members = Array.isArray(g.members) ? g.members.map(String) : [];
        if (members.includes(mid)) return;
        members.push(mid);
        if (!updateGroupMembers(gid, members)) return;
        if (announce) appendGroupSystemMessage(gid, `系统消息：${displayName}加入群聊`);
      }, delay);
    };
    const maybeApplyGroupSystemOps = (content, groupId) => {
      const ops = parseGroupSystemOps(content);
      if (!ops.length) return;
      const g = contactsStore.getContact(groupId);
      if (!g) return;
      let members = Array.isArray(g.members) ? g.members.map(String) : [];
      const memberSet = new Set(members);
      const findMemberId = name => {
        const raw = normalizeName(name).replace(/^@/, '').trim();
        if (!raw) return '';
        const byId = contactsStore.getContact(raw);
        if (byId?.id) return byId.id;
        const byName = resolveContactByDisplayName(raw);
        return byName?.id || '';
      };
      ops.forEach(op => {
        const names = Array.isArray(op?.names) ? op.names : [];
        names.forEach(name => {
          const mid = findMemberId(name);
          if (!mid) return;
          const cname = contactsStore.getContact(mid)?.name || name || mid;
          if (op.type === 'invite') {
            if (memberSet.has(mid)) return;
            scheduleGroupMemberJoin(groupId, mid, cname, { announce: true });
          } else if (op.type === 'join') {
            if (memberSet.has(mid)) return;
            scheduleGroupMemberJoin(groupId, mid, cname, { announce: false, delayMs: 0 });
          } else if (op.type === 'remove') {
            if (!memberSet.has(mid)) return;
            const nextMembers = members.filter(id => String(id) !== String(mid));
            memberSet.delete(mid);
            members = nextMembers;
            updateGroupMembers(groupId, nextMembers);
            refreshChatAndContacts();
          }
        });
      });
    };
    const resolvePrivateChatTargetSessionId = otherName => {
      const other = normalizeName(otherName);
      if (!other) return sessionId;
      const currentContact = contactsStore.getContact(sessionId);
      const currentName = normalizeName(currentContact?.name || sessionId);
      const currentId = normalizeName(sessionId);
      if (other === currentName || other === currentId) return sessionId;

      // Prefer an existing contact with the same display name (avoid duplicates like "室友" vs internal id)
      try {
        const matches = (contactsStore.listContacts?.() || []).filter(c => normalizeName(c?.name || c?.id) === other);
        if (matches.length === 1) return matches[0].id;
      } catch {}

      // If otherName itself is an existing contact id, reuse it
      const byId = contactsStore.getContact(other);
      if (byId?.id) return byId.id;

      // Do NOT create a new chat on mismatch.
      // But in practice models may output alias/繁简体导致名字无法精确匹配。
      // 为避免“明明在当前聊天室生成却全部丢弃”，此处回退到当前 session。
      logger.debug('private_chat target name mismatch, fallback to current session', { other, currentName, sessionId });
      return sessionId;
    };

    const resolveGroupChatTargetSessionId = groupName => {
      const gname = normalizeName(groupName);
      if (!gname) return '';
      const currentContact = contactsStore.getContact(sessionId);
      const currentIsGroup = Boolean(currentContact?.isGroup) || String(sessionId || '').startsWith('group:');
      if (currentIsGroup) {
        const curName = normalizeName(currentContact?.name || sessionId);
        if (gname === curName || normalizeLoose(gname) === normalizeLoose(curName)) return sessionId;
      }
      const hit = contactsStore.findGroupIdByName?.(gname) || '';
      return hit;
    };

    const resolveContactByDisplayName = displayName => {
      const raw = normalizeName(displayName);
      if (!raw) return null;
      const key = normalizeLoose(raw);
      const list = contactsStore.listContacts?.() || [];
      const exact = list.find(c => normalizeName(c?.name || c?.id) === raw);
      if (exact) return exact;
      const fuzzy = list.find(c => normalizeLoose(c?.name || c?.id) === key);
      return fuzzy || null;
    };
    const resolveLooseGroupTagName = tagName => {
      const raw = normalizeName(tagName);
      if (!raw) return '';
      const currentContact = contactsStore.getContact(sessionId);
      const currentIsGroup = Boolean(currentContact?.isGroup) || String(sessionId || '').startsWith('group:');
      if (currentIsGroup) {
        const curName = normalizeName(currentContact?.name || sessionId);
        if (raw === curName || normalizeLoose(raw) === normalizeLoose(curName)) {
          return currentContact?.name || curName;
        }
      }
      let groupId = '';
      try {
        groupId = contactsStore.findGroupIdByName?.(raw) || '';
      } catch {}
      if (!groupId) {
        const groups = (contactsStore.listContacts?.() || []).filter(
          c => c && (c.isGroup || String(c.id || '').startsWith('group:')),
        );
        const exact = groups.find(c => normalizeName(c?.name || c?.id) === raw);
        const fuzzy = exact ? null : groups.find(c => normalizeLoose(c?.name || c?.id) === normalizeLoose(raw));
        groupId = exact?.id || fuzzy?.id || '';
      }
      if (!groupId) return '';
      const group = contactsStore.getContact(groupId);
      return group?.name || group?.id || raw;
    };
    const resolveLoosePrivateTagName = tagName => {
      const raw = normalizeName(tagName);
      if (!raw) return '';
      if (raw === userName) return '';
      const contact = resolveContactByDisplayName(raw);
      if (!contact || contact.isGroup) return '';
      return contact?.name || contact?.id || raw;
    };
    const createDialogueParser = () =>
      new DialogueStreamParser({
        userName,
        resolveLooseGroupTag: resolveLooseGroupTagName,
        resolveLoosePrivateTag: resolveLoosePrivateTagName,
      });
    const resolveMomentAuthorId = authorName => {
      const raw = normalizeName(authorName);
      if (!raw) return '';
      if (raw === userName) return 'user';
      // Common placeholders: treat as current chat character
      if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者') return sessionId;

      // If authorName matches current chat character display name, bind to current session
      const charLoose = normalizeLoose(characterName);
      const rawLoose = normalizeLoose(raw);
      if (
        rawLoose &&
        charLoose &&
        (rawLoose === charLoose || rawLoose.includes(charLoose) || charLoose.includes(rawLoose))
      ) {
        return sessionId;
      }

      // Author might be an existing contact id
      const byId = contactsStore.getContact(raw);
      if (byId?.id) return byId.id;

      const list = contactsStore.listContacts?.() || [];
      // Exact match
      const exact = list.find(c => normalizeName(c?.name) === raw);
      if (exact?.id) return exact.id;

      const key = normalizeLoose(raw);
      // Fuzzy (normalized)
      const fuzzy = list.find(c => normalizeLoose(c?.name) === key || normalizeLoose(c?.id) === key);
      if (fuzzy?.id) return fuzzy.id;

      // Substring heuristic (pick longest match)
      let best = null;
      let bestLen = 0;
      for (const c of list) {
        const cn = normalizeLoose(c?.name);
        if (!cn) continue;
        if (key.includes(cn) || cn.includes(key)) {
          const len = Math.min(cn.length, key.length);
          if (len > bestLen) {
            bestLen = len;
            best = c;
          }
        }
      }
      return best?.id || '';
    };
    const normalizeMomentAuthorDisplay = authorName => {
      const raw = normalizeName(authorName);
      if (!raw) return normalizeName(characterName) || '角色';
      if (raw === userName) return userName;
      if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者')
        return normalizeName(characterName) || raw;
      return raw;
    };
    const ingestMoments = (moments = []) => {
      const list = Array.isArray(moments) ? moments : [];
      const n = getContactCountN();
      return list.map(m => {
        const author = normalizeMomentAuthorDisplay(m?.author);
        const authorId = resolveMomentAuthorId(author);
        let authorAvatar = '';
        if (authorId === 'user') authorAvatar = avatars.user;
        else if (authorId) authorAvatar = resolveAvatarForContact(authorId, contactsStore.getContact(authorId));
        const stats = normalizeInitialMomentStats({ views: m?.views, likes: m?.likes }, n);
        return { ...(m || {}), ...stats, author, authorId, authorAvatar, originSessionId: sessionId };
      });
    };
    const extractSummaryBlock = text => {
      const raw = String(text ?? '');
      const re = /<details>\s*<summary>\s*摘要\s*<\/summary>\s*([\s\S]*?)<\/details>/gi;
      let m;
      let last = null;
      while ((m = re.exec(raw))) last = { index: m.index, full: m[0], inner: m[1] };
      if (!last) return { text: raw, summary: '' };
      const inner = String(last.inner || '');
      const plain = inner.replace(/<[^>]+>/g, ' ');
      // Pure Chinese requirement: drop latin letters; keep digits/punctuation.
      const summary = plain
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[A-Za-z]+/g, '')
        .trim();
      const stripped = (raw.slice(0, last.index) + raw.slice(last.index + last.full.length))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { text: stripped, summary };
    };
    const formatMemoryEditValue = (value, maxLen = 120) => {
      if (value === null || value === undefined) return '';
      let text = '';
      if (typeof value === 'string') text = value.trim();
      else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
      else {
        try {
          text = JSON.stringify(value);
        } catch {
          text = String(value);
        }
      }
      if (text.length > maxLen) return `${text.slice(0, maxLen)}…`;
      return text;
    };
    const resolveActionTableLabel = (action, tableById, planOrder) => {
      const explicit = String(action?.tableId || action?.tableName || '').trim();
      let tableId = explicit;
      if (!tableId) {
        const index = Number.isFinite(Number(action?.tableIndex)) ? Math.trunc(Number(action.tableIndex)) : null;
        if (index !== null && index >= 0 && index < planOrder.length) {
          tableId = String(planOrder[index] || '').trim();
        }
      }
      const tableName = tableId && tableById?.has(tableId) ? String(tableById.get(tableId)?.name || '').trim() : '';
      if (tableName && tableId) return `${tableName} (${tableId})`;
      if (tableId) return tableId;
      const idx = Number.isFinite(Number(action?.tableIndex)) ? Math.trunc(Number(action.tableIndex)) : null;
      if (idx !== null) return `table#${idx}`;
      return 'table';
    };
    const buildMemoryActionLine = (action, index, tableById, planOrder) => {
      const label = resolveActionTableLabel(action, tableById, planOrder);
      const actionType = String(action?.action || '').toLowerCase();
      const rowIndex = Number.isFinite(Number(action?.rowIndex)) ? Math.trunc(Number(action.rowIndex)) : null;
      const rowId = String(action?.rowId || '').trim();
      const data = action?.data && typeof action.data === 'object' ? action.data : null;
      let detail = '';
      if (actionType === 'delete') {
        detail = rowIndex !== null ? `row_index=${rowIndex}` : rowId ? `row_id=${rowId}` : '';
      } else if (actionType === 'insert') {
        detail = data ? formatMemoryEditValue(data) : '';
      } else if (actionType === 'update') {
        const target = rowIndex !== null ? `row_index=${rowIndex}` : rowId ? `row_id=${rowId}` : '';
        const payload = data ? formatMemoryEditValue(data) : '';
        detail = [target, payload].filter(Boolean).join(' ');
      }
      return `${index}. ${actionType || 'edit'} -> ${label}${detail ? `: ${detail}` : ''}`;
    };
    const buildMemoryConfirmText = (actions, tableById, planOrder, { title, maxLines } = {}) => {
      const lines = [];
      lines.push(title || '检测到记忆表格写入指令：');
      const limit = Number.isFinite(Number(maxLines)) ? Math.max(1, Math.trunc(Number(maxLines))) : 12;
      actions.slice(0, limit).forEach((action, idx) => {
        lines.push(buildMemoryActionLine(action, idx + 1, tableById, planOrder));
      });
      if (actions.length > limit) {
        lines.push(`... 还有 ${actions.length - limit} 条`);
      }
      lines.push('继续执行这些写表指令吗？');
      return lines.join('\n');
    };
    const confirmMemoryEditsIfNeeded = async actions => {
      const settings = appSettings.get();
      const confirmBefore = settings.memoryAutoConfirm === true;
      const stepByStep = settings.memoryAutoStepByStep === true;
      if (!confirmBefore && !stepByStep) return actions;
      let tableById = new Map();
      try {
        const templateInfo = await loadTemplateDefinition();
        const tables = Array.isArray(templateInfo?.template?.tables) ? templateInfo.template.tables : [];
        tables.forEach(table => {
          const id = String(table?.id || '').trim();
          if (!id) return;
          tableById.set(id, table);
        });
      } catch {}
      const planOrder = Array.isArray(window.appBridge?.lastMemoryPlan?.tableOrder)
        ? window.appBridge.lastMemoryPlan.tableOrder
        : [];
      if (stepByStep) {
        if (confirmBefore) {
          const ok = await appConfirm({
            title: '写表确认',
            message: buildMemoryConfirmText(actions, tableById, planOrder),
          });
          if (!ok) {
            window.toastr?.info?.('已取消写表执行');
            return [];
          }
        }
        const confirmed = [];
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const ok = await appConfirm({
            title: `写表确认（${i + 1}/${actions.length}）`,
            message: buildMemoryConfirmText([action], tableById, planOrder, {
              title: `写表确认（${i + 1}/${actions.length}）`,
              maxLines: 1,
            }),
          });
          if (!ok) {
            window.toastr?.info?.('已停止后续写表执行');
            break;
          }
          confirmed.push(action);
        }
        return confirmed;
      }
      const ok = await appConfirm({
        title: '写表确认',
        message: buildMemoryConfirmText(actions, tableById, planOrder),
      });
      if (!ok) {
        window.toastr?.info?.('已取消写表执行');
        return [];
      }
      return actions;
    };
    const normalizeMemoryCellValue = value => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const normalizeTableRowData = (data, columns) => {
      if (!data || typeof data !== 'object') return {};
      const colIdMap = new Map();
      const colNameMap = new Map();
      const colIndexMap = new Map();
      (columns || []).forEach((col, idx) => {
        const id = String(col?.id || '').trim();
        if (id) colIdMap.set(id.toLowerCase(), id);
        const name = String(col?.name || '').trim();
        if (name) colNameMap.set(name.toLowerCase(), id);
        colIndexMap.set(String(idx), id);
      });
      const out = {};
      for (const [rawKey, rawValue] of Object.entries(data)) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        const lower = key.toLowerCase();
        let colId = colIdMap.get(lower) || colNameMap.get(lower);
        if (!colId && /^\d+$/.test(key)) {
          colId = colIndexMap.get(key);
        }
        if (!colId) continue;
        const value = normalizeMemoryCellValue(rawValue);
        out[colId] = value;
      }
      return out;
    };
    const resolveDefaultTemplate = async () => {
      if (!memoryTemplateStore) return null;
      const list = await memoryTemplateStore.getTemplates({ is_default: true });
      if (Array.isArray(list) && list.length) return list[0];
      const fallback = await memoryTemplateStore.getTemplates({ id: 'default-v1' });
      if (Array.isArray(fallback) && fallback.length) return fallback[0];
      return null;
    };
    const loadTemplateDefinition = async () => {
      const record = await resolveDefaultTemplate();
      if (!record) return null;
      const schema = memoryTemplateStore?.toTemplateDefinition?.(record) || record?.schema || {};
      return { record, template: schema };
    };
    const buildTableMaps = template => {
      const tableById = new Map();
      const tableNameMap = new Map();
      const tableOrder = [];
      (template?.tables || []).forEach(table => {
        const id = String(table?.id || '').trim();
        if (!id) return;
        tableById.set(id, table);
        tableOrder.push(id);
        const name = String(table?.name || '').trim();
        if (name) tableNameMap.set(name.toLowerCase(), id);
      });
      return { tableById, tableNameMap, tableOrder };
    };
    const rowDataEquals = (a, b) => {
      const left = a && typeof a === 'object' ? a : {};
      const right = b && typeof b === 'object' ? b : {};
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        const lv = normalizeMemoryCellValue(left[key]);
        const rv = normalizeMemoryCellValue(right[key]);
        if (String(lv ?? '') !== String(rv ?? '')) return false;
      }
      return true;
    };
    const applyMemoryEdits = async ({ actions, sessionId, isGroup }) => {
      if (!Array.isArray(actions) || actions.length === 0) return null;
      if (!memoryTableStore || !memoryTemplateStore) return null;

      const plan = window.appBridge?.lastMemoryPlan || null;
      if (plan?.enabled === false) return null;
      if (plan?.targetId && String(plan.targetId) !== String(sessionId)) return null;

      let templateInfo = null;
      try {
        templateInfo = await loadTemplateDefinition();
      } catch {
        templateInfo = null;
      }
      if (!templateInfo?.record) return null;
      const templateId = String(templateInfo.record?.id || '').trim();
      const template = templateInfo.template || {};
      const { tableById, tableNameMap, tableOrder: templateOrder } = buildTableMaps(template);
      const planOrder = Array.isArray(plan?.tableOrder) ? plan.tableOrder : [];
      const tableOrder = planOrder.length ? planOrder : templateOrder;
      const rowIndexMap = plan?.rowIndexMap && typeof plan.rowIndexMap === 'object' ? plan.rowIndexMap : {};

      const useSharedGlobalScope = sharedMemory && !isGroup;
      let scopedRows = [];
      if (!useSharedGlobalScope) {
        scopedRows = isGroup
          ? await memoryTableStore.getMemories({ scope: 'group', group_id: sessionId, template_id: templateId })
          : await memoryTableStore.getMemories({ scope: 'contact', contact_id: sessionId, template_id: templateId });
      }
      const globalRows = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
      const allRows = [
        ...(Array.isArray(globalRows) ? globalRows : []),
        ...(Array.isArray(scopedRows) ? scopedRows : []),
      ];
      const rowsById = new Map();
      const rowsByTableScope = new Map();
      for (const row of allRows) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        rowsById.set(id, row);
        const tableId = String(row?.table_id || '').trim();
        if (!tableId) continue;
        const scopeKey = row?.contact_id ? 'contact' : row?.group_id ? 'group' : 'global';
        const key = `${tableId}:${scopeKey}`;
        if (!rowsByTableScope.has(key)) rowsByTableScope.set(key, []);
        rowsByTableScope.get(key).push(row);
      }

      const resolveTableId = action => {
        const rawId = String(action?.tableId || '').trim();
        if (rawId && tableById.has(rawId)) return rawId;
        const rawName = String(action?.tableName || '')
          .trim()
          .toLowerCase();
        if (rawName && tableNameMap.has(rawName)) return tableNameMap.get(rawName);
        const idxRaw = action?.tableIndex;
        const idx = Number.isFinite(Number(idxRaw)) ? Math.trunc(Number(idxRaw)) : null;
        if (idx !== null && idx >= 0 && idx < tableOrder.length) {
          const id = String(tableOrder[idx] || '').trim();
          if (id && tableById.has(id)) return id;
        }
        return '';
      };
      const resolveRowId = (action, tableId) => {
        const rowId = String(action?.rowId || '').trim();
        if (rowId) return rowId;
        const rowIndexRaw = action?.rowIndex;
        const rowIndex = Number.isFinite(Number(rowIndexRaw)) ? Math.trunc(Number(rowIndexRaw)) : null;
        if (rowIndex === null || rowIndex < 0) return '';
        const map = rowIndexMap?.[tableId];
        if (Array.isArray(map) && rowIndex < map.length) return String(map[rowIndex] || '').trim();
        return '';
      };
      const resolveRowIdByData = (tableId, scopeKey, data, table) => {
        if (!data || typeof data !== 'object') return '';
        const rows = rowsByTableScope.get(`${tableId}:${scopeKey}`) || [];
        if (!rows.length) return '';
        const normalize = value => String(normalizeMemoryCellValue(value ?? '')).trim();
        const candidates = [];
        const preferredKeys = ['name', 'time', 'title', 'id'];
        preferredKeys.forEach(key => {
          const v = normalize(data[key]);
          if (v) candidates.push({ key, value: v });
        });
        if (!candidates.length) {
          const firstColId = String(table?.columns?.[0]?.id || '').trim();
          const v = normalize(firstColId ? data[firstColId] : '');
          if (firstColId && v) candidates.push({ key: firstColId, value: v });
        }
        for (const candidate of candidates) {
          const matches = rows.filter(row => normalize(row?.row_data?.[candidate.key]) === candidate.value);
          if (matches.length === 1) return String(matches[0]?.id || '').trim();
          if (matches.length > 1) return '';
        }
        if (rows.length === 1) return String(rows[0]?.id || '').trim();
        return '';
      };
      const resolveScopeForTable = table => {
        if (useSharedGlobalScope) return { key: 'global', contactId: null, groupId: null };
        const scope = String(table?.scope || '')
          .trim()
          .toLowerCase();
        if (scope === 'global') return { key: 'global', contactId: null, groupId: null };
        if (scope === 'group') return { key: 'group', contactId: null, groupId: sessionId };
        if (scope === 'contact') return { key: 'contact', contactId: sessionId, groupId: null };
        return isGroup
          ? { key: 'group', contactId: null, groupId: sessionId }
          : { key: 'contact', contactId: sessionId, groupId: null };
      };

      const createInputs = [];
      let updated = 0;
      let deleted = 0;
      let skipped = 0;

      const queueInsert = (tableId, table, scopeKey, contactId, groupId, data, { allowDuplicate = false } = {}) => {
        const countKey = `${tableId}:${scopeKey}`;
        const maxRows = Number.isFinite(Number(table?.maxRows)) ? Math.max(0, Math.trunc(Number(table.maxRows))) : 0;
        const existingRows = rowsByTableScope.get(countKey) || [];
        if (maxRows && existingRows.length >= maxRows) {
          skipped += 1;
          return false;
        }
        if (!allowDuplicate) {
          const duplicate = existingRows.some(row => rowDataEquals(row?.row_data || {}, data));
          if (duplicate) {
            skipped += 1;
            return false;
          }
        }
        createInputs.push({
          template_id: templateId,
          table_id: tableId,
          contact_id: contactId,
          group_id: groupId,
          row_data: data,
          is_active: true,
        });
        existingRows.push({ row_data: data });
        rowsByTableScope.set(countKey, existingRows);
        return true;
      };

      const updateMode = normalizeMemoryUpdateMode(plan?.updateMode, 'full');
      const allowSummaryTables = updateMode === 'summary' || updateMode === 'full';
      const allowStandardTables = updateMode === 'standard' || updateMode === 'full';
      const buildRollbackSnapshot = () => {
        const tables = [];
        const seen = new Set();
        const collectRows = (tableId, scopeKey) => {
          const key = `${tableId}:${scopeKey}`;
          if (seen.has(key)) return;
          seen.add(key);
          const rows = rowsByTableScope.get(key) || [];
          tables.push({
            table_id: tableId,
            scope: scopeKey,
            rows: rows
              .map(row => ({
                id: String(row?.id || '').trim(),
                table_id: String(row?.table_id || '').trim(),
                template_id: row?.template_id || templateId,
                contact_id: row?.contact_id ?? null,
                group_id: row?.group_id ?? null,
                row_data: row?.row_data || {},
                is_active: Boolean(row?.is_active),
                is_pinned: Boolean(row?.is_pinned),
                priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
              }))
              .filter(row => row.id),
          });
        };
        actions.forEach(action => {
          const tableId = resolveTableId(action);
          if (!tableId) return;
          const table = tableById.get(tableId);
          if (!table) return;
          const tableScope = String(table?.scope || '')
            .trim()
            .toLowerCase();
          if (tableScope === 'group' && !isGroup) return;
          if (tableScope === 'contact' && isGroup) return;
          const effectiveScope = useSharedGlobalScope ? 'global' : (tableScope || (isGroup ? 'group' : 'contact'));
          const isSummaryTable = isSummaryTableId(tableId);
          if ((isSummaryTable && !allowSummaryTables) || (!isSummaryTable && !allowStandardTables)) return;
          const { key: scopeKey } = resolveScopeForTable(table);
          collectRows(tableId, scopeKey);
        });
        return tables.length ? { tables } : null;
      };
      const rollbackSnapshot = buildRollbackSnapshot();
      for (const action of actions) {
        const tableId = resolveTableId(action);
        if (!tableId) {
          skipped += 1;
          continue;
        }
        const table = tableById.get(tableId);
        if (!table) {
          skipped += 1;
          continue;
        }
        const tableScope = String(table?.scope || '')
          .trim()
          .toLowerCase();
        if (tableScope === 'group' && !isGroup) {
          skipped += 1;
          continue;
        }
        if (tableScope === 'contact' && isGroup) {
          skipped += 1;
          continue;
        }
        const effectiveScope = useSharedGlobalScope ? 'global' : (tableScope || (isGroup ? 'group' : 'contact'));
        const { key: scopeKey, contactId, groupId } = resolveScopeForTable(table);
        const isSummaryTable = isSummaryTableId(tableId);
        if ((isSummaryTable && !allowSummaryTables) || (!isSummaryTable && !allowStandardTables)) {
          skipped += 1;
          continue;
        }
        if (action.action === 'insert' || action.action === 'init') {
          const data = normalizeTableRowData(action.data, table.columns || []);
          if (!Object.keys(data).length) {
            skipped += 1;
            continue;
          }
          if (action.action === 'init') {
            const countKey = `${tableId}:${scopeKey}`;
            const existingRows = rowsByTableScope.get(countKey) || [];
            if (existingRows.length) {
              skipped += 1;
              continue;
            }
          }
          const allowDuplicate = isSummaryTable && action.action === 'insert';
          queueInsert(tableId, table, scopeKey, contactId, groupId, data, { allowDuplicate });
        } else if (action.action === 'update') {
          const data = normalizeTableRowData(action.data, table.columns || []);
          if (!Object.keys(data).length) {
            skipped += 1;
            continue;
          }
          if (isSummaryTable) {
            queueInsert(tableId, table, scopeKey, contactId, groupId, data, { allowDuplicate: true });
            continue;
          }
          let rowId = resolveRowId(action, tableId);
          if (!rowId) {
            // Best-effort fallback when row_index is missing or truncated from prompt.
            rowId = resolveRowIdByData(tableId, scopeKey, data, table);
          }
          if (!rowId) {
            const countKey = `${tableId}:${scopeKey}`;
            const existingRows = rowsByTableScope.get(countKey) || [];
            if (!existingRows.length) {
              queueInsert(tableId, table, scopeKey, contactId, groupId, data);
            } else {
              skipped += 1;
            }
            continue;
          }
          const row = rowsById.get(rowId);
          if (!row) {
            skipped += 1;
            continue;
          }
          if (String(row?.table_id || '') !== tableId) {
            skipped += 1;
            continue;
          }
          if (row?.is_pinned) {
            skipped += 1;
            continue;
          }
          const merged = { ...(row?.row_data || {}), ...data };
          if (rowDataEquals(row?.row_data || {}, merged)) {
            skipped += 1;
            continue;
          }
          await memoryTableStore.updateMemory({ id: rowId, row_data: merged });
          rowsById.set(rowId, { ...row, row_data: merged });
          updated += 1;
        } else if (action.action === 'delete') {
          const rowId = resolveRowId(action, tableId);
          if (!rowId) {
            skipped += 1;
            continue;
          }
          const row = rowsById.get(rowId);
          if (!row) {
            skipped += 1;
            continue;
          }
          if (String(row?.table_id || '') !== tableId) {
            skipped += 1;
            continue;
          }
          if (row?.is_pinned) {
            skipped += 1;
            continue;
          }
          await memoryTableStore.deleteMemory(rowId);
          rowsById.delete(rowId);
          {
            const rowScopeKey = row?.contact_id ? 'contact' : row?.group_id ? 'group' : 'global';
            const key = `${tableId}:${rowScopeKey}`;
            const list = rowsByTableScope.get(key) || [];
            rowsByTableScope.set(
              key,
              list.filter(item => String(item?.id || '') !== rowId),
            );
          }
          deleted += 1;
        }
      }

      let inserted = 0;
      if (createInputs.length) {
        try {
          inserted = await memoryTableStore.batchCreateMemories(createInputs);
        } catch {
          for (const input of createInputs) {
            try {
              await memoryTableStore.createMemory(input);
              inserted += 1;
            } catch {}
          }
        }
      }

      const changed = inserted + updated + deleted;
      if (rollbackSnapshot) {
        try {
          const prev = window.appBridge?.getLastMemoryUpdate?.(sessionId) || {};
          window.appBridge?.setLastMemoryUpdate?.(sessionId, {
            ...prev,
            rollback: rollbackSnapshot,
            rollbackAt: Date.now(),
          });
        } catch {}
      }
      if (changed > 0) {
        window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId, templateId } }));
        const parts = [];
        if (inserted) parts.push(`新增${inserted}`);
        if (updated) parts.push(`更新${updated}`);
        if (deleted) parts.push(`删除${deleted}`);
        window.toastr?.info?.(`记忆表格已更新：${parts.join(' · ')}`);
      } else if (skipped > 0) {
        logger.debug('memory auto extract skipped actions', { skipped });
      }
      return { inserted, updated, deleted, skipped };
    };
    const rollbackLastMemoryUpdateFromActions = async (sessionId, actions = []) => {
      if (!memoryTableStore || !memoryTemplateStore) return false;
      if (!Array.isArray(actions) || actions.length === 0) return false;
      let templateInfo = null;
      try {
        templateInfo = await loadTemplateDefinition();
      } catch {
        templateInfo = null;
      }
      if (!templateInfo?.record) return false;
      const templateId = String(templateInfo.record?.id || '').trim();
      if (!templateId) return false;
      const template = templateInfo.template || {};
      const { tableById, tableNameMap, tableOrder } = buildTableMaps(template);
      const isGroupScope = String(sessionId || '').startsWith('group:');
      const useSharedGlobalScope = sharedMemory && !isGroupScope;
      const resolveTableId = action => {
        const rawId = String(action?.tableId || '').trim();
        if (rawId && tableById.has(rawId)) return rawId;
        const rawName = String(action?.tableName || '')
          .trim()
          .toLowerCase();
        if (rawName && tableNameMap.has(rawName)) return tableNameMap.get(rawName);
        const idxRaw = action?.tableIndex;
        const idx = Number.isFinite(Number(idxRaw)) ? Math.trunc(Number(idxRaw)) : null;
        if (idx !== null && idx >= 0 && idx < tableOrder.length) {
          const id = String(tableOrder[idx] || '').trim();
          if (id && tableById.has(id)) return id;
        }
        return '';
      };
      const resolveScopeKey = table => {
        const scope = String(table?.scope || '')
          .trim()
          .toLowerCase();
        if (scope === 'global') return 'global';
        if (scope === 'group') return 'group';
        if (scope === 'contact') return useSharedGlobalScope ? 'global' : 'contact';
        return useSharedGlobalScope ? 'global' : '';
      };
      const scopeRowsCache = new Map();
      const getScopedRows = async scopeKey => {
        if (scopeRowsCache.has(scopeKey)) return scopeRowsCache.get(scopeKey);
        let rows = [];
        try {
          if (scopeKey === 'global') {
            rows = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
          } else if (scopeKey === 'group') {
            rows = await memoryTableStore.getMemories({ scope: 'group', group_id: sessionId, template_id: templateId });
          } else {
            rows = await memoryTableStore.getMemories({
              scope: 'contact',
              contact_id: sessionId,
              template_id: templateId,
            });
          }
        } catch {
          rows = [];
        }
        scopeRowsCache.set(scopeKey, rows);
        return rows;
      };
      const pickNewestRow = (rows = []) => {
        if (!rows.length) return null;
        const scored = rows.map((row, idx) => {
          const ts = Number(row?.updated_at || row?.created_at || 0);
          return { row, ts: Number.isFinite(ts) ? ts : 0, idx };
        });
        scored.sort((a, b) => b.ts - a.ts || b.idx - a.idx);
        return scored[0]?.row || null;
      };
      let changed = 0;
      for (const action of actions) {
        const tableId = resolveTableId(action);
        if (!tableId) continue;
        const table = tableById.get(tableId);
        if (!table) continue;
        const scopeKey = resolveScopeKey(table) || (useSharedGlobalScope ? 'global' : (isGroupScope ? 'group' : 'contact'));
        const currentRows = await getScopedRows(scopeKey);
        const scopedRows = (Array.isArray(currentRows) ? currentRows : []).filter(
          row => String(row?.table_id || '').trim() === tableId,
        );
        const data = normalizeTableRowData(action?.data || {}, table.columns || []);
        if (!Object.keys(data).length) continue;
        const isSummaryTable = isSummaryTableId(tableId);
        const actionType = String(action?.action || '').toLowerCase();
        const shouldRollbackInsert = actionType === 'insert' || (isSummaryTable && actionType === 'update');
        if (!shouldRollbackInsert) continue;
        const matches = scopedRows.filter(row => rowDataEquals(row?.row_data || {}, data));
        const target = pickNewestRow(matches);
        if (!target) continue;
        try {
          await memoryTableStore.deleteMemory(String(target.id || ''));
          changed += 1;
        } catch {}
      }
      if (changed > 0) {
        window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId, templateId } }));
        window.toastr?.info?.('已回滚上一轮记忆表格写入');
      }
      return changed > 0;
    };
    const rollbackLastMemoryUpdate = async sessionId => {
      if (!memoryTableStore || !memoryTemplateStore) return false;
      const entry = window.appBridge?.getLastMemoryUpdate?.(sessionId);
      const rollback = entry?.rollback;
      if (!rollback || !Array.isArray(rollback.tables) || !rollback.tables.length) {
        return rollbackLastMemoryUpdateFromActions(sessionId, entry?.actions || []);
      }
      let templateInfo = null;
      try {
        templateInfo = await loadTemplateDefinition();
      } catch {
        templateInfo = null;
      }
      const templateId = String(templateInfo?.record?.id || '').trim();
      if (!templateId) return false;
      let changed = 0;
      for (const tableSnap of rollback.tables) {
        const tableId = String(tableSnap?.table_id || '').trim();
        const scopeKey = String(tableSnap?.scope || '').trim();
        if (!tableId || !scopeKey) continue;
        let currentRows = [];
        try {
          if (scopeKey === 'global') {
            currentRows = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
          } else if (scopeKey === 'group') {
            currentRows = await memoryTableStore.getMemories({
              scope: 'group',
              group_id: sessionId,
              template_id: templateId,
            });
          } else {
            currentRows = await memoryTableStore.getMemories({
              scope: 'contact',
              contact_id: sessionId,
              template_id: templateId,
            });
          }
        } catch {
          currentRows = [];
        }
        const scopedCurrent = (Array.isArray(currentRows) ? currentRows : []).filter(
          row => String(row?.table_id || '').trim() === tableId,
        );
        const snapshotRows = Array.isArray(tableSnap?.rows) ? tableSnap.rows : [];
        const snapshotById = new Map(snapshotRows.map(row => [String(row?.id || '').trim(), row]));
        const currentById = new Map(scopedCurrent.map(row => [String(row?.id || '').trim(), row]));

        for (const row of scopedCurrent) {
          const id = String(row?.id || '').trim();
          if (!id) continue;
          if (!snapshotById.has(id)) {
            try {
              await memoryTableStore.deleteMemory(id);
              changed += 1;
            } catch {}
          }
        }

        for (const snap of snapshotRows) {
          const id = String(snap?.id || '').trim();
          if (!id) continue;
          const current = currentById.get(id);
          const payload = {
            row_data: snap?.row_data || {},
            is_active: Boolean(snap?.is_active),
            is_pinned: Boolean(snap?.is_pinned),
            priority: Number.isFinite(Number(snap?.priority)) ? Number(snap.priority) : 0,
          };
          if (current) {
            try {
              const sameData = rowDataEquals(current?.row_data || {}, payload.row_data || {});
              const sameActive = Boolean(current?.is_active) === payload.is_active;
              const samePinned = Boolean(current?.is_pinned) === payload.is_pinned;
              const samePriority = Number.isFinite(Number(current?.priority)) ? Number(current.priority) : 0;
              if (!sameData || !sameActive || !samePinned || samePriority !== payload.priority) {
                await memoryTableStore.updateMemory({ id, ...payload });
                changed += 1;
              }
            } catch {}
          } else {
            try {
              await memoryTableStore.createMemory({
                template_id: templateId,
                table_id: tableId,
                contact_id: snap?.contact_id ?? (scopeKey === 'contact' ? sessionId : null),
                group_id: snap?.group_id ?? (scopeKey === 'group' ? sessionId : null),
                ...payload,
              });
              changed += 1;
            } catch {}
          }
        }
      }
      if (changed > 0) {
        window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId, templateId } }));
        window.toastr?.info?.('已回滚上一轮记忆表格写入');
      }
      return changed > 0;
    };
    if (window.appBridge) {
      window.appBridge.rollbackLastMemoryUpdate = rollbackLastMemoryUpdate;
    }
    const buildRequestPromptText = messages => {
      if (!Array.isArray(messages)) return '';
      const describeMediaToken = raw => {
        const text = String(raw || '').trim();
        if (!text) return '';
        if (text.startsWith('data:image/')) {
          const mime = text.slice('data:'.length).split(';')[0].toLowerCase();
          if (mime.includes('gif')) return '[gif]';
          return '[图片]';
        }
        if (text.startsWith('data:audio/')) return '[语音]';
        return '';
      };
      const stringifyContent = content => {
        if (Array.isArray(content)) {
          const parts = content.map(part => {
            if (!part || typeof part !== 'object') return '';
            if (part.type === 'text') return String(part.text || '');
            if (part.type === 'image_url') {
              const url = String(part.image_url?.url || '').toLowerCase();
              if (url.startsWith('data:image/gif')) return '[gif]';
              return '[图片]';
            }
            if (part.type === 'input_audio') return '[语音]';
            return '';
          });
          return parts.filter(Boolean).join('\n');
        }
        const raw = String(content ?? '');
        return describeMediaToken(raw) || raw;
      };
      const parts = messages
        .map(m => {
          const role = String(m?.role || 'message');
          const content = stringifyContent(m?.content).trim();
          if (!content) return '';
          return `${role}:\n${content}`;
        })
        .filter(Boolean);
      return parts.join('\n\n');
    };
    const handleMemoryEditsFromRaw = async (raw, { sessionId, isGroup, force = false, requestPrompt } = {}) => {
      if (!force && !isMemoryAutoExtractInline()) {
        return { text: raw, actions: [] };
      }
      const parsed = extractTableEditBlocks(raw);
      try {
        const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
        const tableEditRaw = blocks.join('\n\n').trim();
        const lastEntry = window.appBridge?.getLastMemoryUpdate?.(sessionId);
        let promptText = typeof requestPrompt === 'string' ? requestPrompt : '';
        if (!promptText.trim()) {
          const inferred = buildRequestPromptText(window.appBridge?.lastRequest?.messages);
          if (inferred.trim()) promptText = inferred;
        }
        if (!promptText.trim() && lastEntry?.requestPrompt) {
          promptText = String(lastEntry.requestPrompt || '');
        }
        window.appBridge?.setLastMemoryUpdate?.(sessionId, {
          at: Date.now(),
          mode: force ? 'separate' : 'inline',
          raw: String(raw ?? ''),
          tableEditRaw,
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          requestPrompt: promptText,
        });
      } catch {}
      if (parsed.actions.length) {
        try {
          const confirmedActions = await confirmMemoryEditsIfNeeded(parsed.actions);
          if (confirmedActions.length) {
            await applyMemoryEdits({ actions: confirmedActions, sessionId, isGroup });
          }
        } catch (err) {
          logger.warn('apply memory edits failed', err);
        }
      }
      return parsed;
    };
    const canInitClient = cfg => {
      const c = cfg || {};
      const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
      const hasVertexSa =
        c.provider === 'vertexai' &&
        typeof c.vertexaiServiceAccount === 'string' &&
        c.vertexaiServiceAccount.trim().length > 0;
      return hasKey || hasVertexSa;
    };
    const buildMemoryUpdateHistoryText = sessionId => {
      const messages = chatStore.getMessages(sessionId) || [];
      const lines = [];
      const usable = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'));
      const settings = appSettings.get();
      const rawLimit = Math.trunc(Number(settings.memoryUpdateContextRounds));
      const limit = Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : 6;
      if (limit <= 0) return '';
      const rounds = [];
      let current = null;
      usable.forEach(m => {
        if (m?.status === 'pending' || m?.status === 'sending') return;
        if (m?.role === 'user') {
          current = { messages: [m] };
          rounds.push(current);
          return;
        }
        if (m?.role === 'assistant') {
          if (!current) {
            current = { messages: [] };
            rounds.push(current);
          }
          current.messages.push(m);
          return;
        }
        if (m?.role === 'system') {
          if (!current) return;
          current.messages.push(m);
        }
      });
      const selected = rounds.slice(-limit);
      selected.forEach(round => {
        (round.messages || []).forEach(m => {
          const name = String(m?.name || (m?.role === 'assistant' ? '助手' : m?.role === 'user' ? '用户' : '系统'));
          const rawText = String(m?.rawOriginal || m?.raw || m?.content || '');
          let clean = m?.role === 'assistant' ? stripTableEditBlocks(rawText) : rawText;
          if (m?.type === 'image' || rawText.startsWith('data:image')) clean = '[图片]';
          if (m?.type === 'audio' || rawText.startsWith('data:audio')) clean = '[语音]';
          if (m?.type === 'document') clean = `[文件] ${m?.content || ''}`.trim();
          const clipped = clean.length > 4000 ? `${clean.slice(0, 4000)}…` : clean;
          if (!clipped.trim()) return;
          lines.push(`${name}: ${clipped}`);
        });
      });
      return lines.join('\n');
    };
    const buildMemoryUpdatePlan = async (sessionId, isGroup, baseContext) => {
      const ctx = baseContext || {};
      const next = {
        ...(ctx || {}),
        session: { id: sessionId, isGroup },
        meta: {
          ...(ctx?.meta || {}),
          memoryStorageMode: 'table',
          memoryAutoExtract: true,
        },
        history: [],
      };
      if (!window.appBridge?.buildMemoryPromptPlan) return null;
      return window.appBridge.buildMemoryPromptPlan(next);
    };
    const resolveMemoryUpdateConfig = async () => {
      const settings = appSettings.get();
      const mode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
      if (mode !== 'profile') {
        await window.appBridge.config.load();
        return window.appBridge.config.get();
      }
      await memoryUpdateConfigManager.load();
      const profileId = String(settings.memoryUpdateProfileId || memoryUpdateConfigManager.getActiveProfileId() || '');
      if (!profileId) return null;
      const runtime = await memoryUpdateConfigManager.getRuntimeConfigByProfileId(profileId);
      return runtime;
    };
    const runMemoryUpdateAfterChat = async (sessionId, isGroup, baseContext) => {
      if (!isMemoryAutoExtractSeparate()) return;
      if (!sessionId) return;
      if (memoryUpdateRunning.has(sessionId)) return;
      memoryUpdateRunning.add(sessionId);
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        const plan = await buildMemoryUpdatePlan(sessionId, isGroup, baseContext);
        if (!plan?.enabled || !plan.promptText) return;
        const historyText = buildMemoryUpdateHistoryText(sessionId);
        if (!historyText.trim()) return;
        const config = await resolveMemoryUpdateConfig();
        if (!config || !canInitClient(config)) {
          logger.warn('memory update config missing or invalid');
          return;
        }
        const systemText = String(plan.promptText || '').trim();
        const userText = [
          '请根据以下聊天记录更新记忆表格。',
          '只输出 <tableEdit>...</tableEdit>，不要输出任何解释。',
          '',
          '<chat_history>',
          historyText,
          '</chat_history>',
        ].join('\n');
        const requestPrompt = ['system:', systemText, '', 'user:', userText].join('\n');
        const client = new LLMClient(config);
        const response = await client.chat([
          { role: 'system', content: systemText },
          { role: 'user', content: userText },
        ]);
        await handleMemoryEditsFromRaw(response, { sessionId, isGroup, force: true, requestPrompt });
      } catch (err) {
        logger.warn('memory update failed', err);
      } finally {
        memoryUpdateRunning.delete(sessionId);
      }
    };
    const buildAssistantMessageFromText = (rawText, { sessionId, time, name, avatar, showName, depth } = {}) => {
      const cleaned = sanitizeAssistantReplyText(rawText, userName);
      const reasoningParsed = extractReasoningFromContent(cleaned, { depth, strict: true });
      const parsed = parseSpecialMessage(reasoningParsed.content || '');
      const meta = { ...(parsed.meta || {}) };
      if (showName) meta.showName = true;
      if (reasoningParsed.reasoning) {
        meta.reasoning = reasoningParsed.reasoning;
        meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
      }
      const next = {
        role: 'assistant',
        ...parsed,
        name: name || '助手',
        avatar: avatar || getAssistantAvatarForSession(sessionId),
        time: time || formatNowTime(),
      };
      if (Object.keys(meta).length) next.meta = meta;
      return next;
    };
    const emitPluginAfterReceive = (message, targetSessionId) => {
      if (!message || message.role !== 'assistant') return;
      if (pluginRuntime) {
        const payload = { message, sessionId: targetSessionId };
        pluginRuntime.dispatchEvent('message.after_receive', payload).catch(err => {
          logger.warn('plugin message.after_receive failed', err);
        });
      }
      const useGlobal = isSharedVariableSession(targetSessionId);
      variableRuleEngine?.handleAfterReceive?.({ sessionId: targetSessionId, message, useGlobalVariables: useGlobal }).catch(err => {
        logger.warn('variable rules after_receive failed', err);
      });
    };
    const sanitizeThinkingForProtocolParse = text => {
      const raw = String(text ?? '');
      // More tolerant fallback: if model echoed "<content>" inside (possibly unclosed) thinking,
      // we drop everything before the last </thinking> or </think> then parse the remaining tail once.
      const lower = raw.toLowerCase();
      const closeThinking = '</thinking>';
      const closeThink = '</think>';
      const i1 = lower.lastIndexOf(closeThinking);
      const i2 = lower.lastIndexOf(closeThink);
      const idx = Math.max(i1, i2);
      if (idx === -1) return raw;
      const cut = idx + (idx === i1 ? closeThinking.length : closeThink.length);
      return raw.slice(cut);
    };
    const normalizeMiPhoneMarkers = text => {
      const raw = String(text ?? '');
      if (!raw) return raw;
      return raw
        .replace(/&lt;\s*\/?\s*MiPhone_(start|end)\s*\/?\s*&gt;/gi, (_, token) => `MiPhone_${token}`)
        .replace(/<\s*\/?\s*MiPhone_(start|end)\s*\/?\s*>/gi, (_, token) => `MiPhone_${token}`);
    };
    const extractMiPhoneBlock = text => {
      const raw = String(text ?? '');
      const startRe = /<\s*MiPhone_start\s*>|MiPhone_start/i;
      const endRe = /<\s*MiPhone_end\s*>|MiPhone_end/i;
      const start = startRe.exec(raw);
      if (!start) return '';
      const afterStart = raw.slice(start.index + start[0].length);
      const end = endRe.exec(afterStart);
      if (!end) return raw.slice(start.index);
      const endIdx = start.index + start[0].length + end.index + end[0].length;
      return raw.slice(start.index, endIdx);
    };

    const buildHistoryForLLM = pendingUserText => {
      const all = chatStore.getMessages(sessionId) || [];
      const convPos = new Map();
      all.forEach((m, idx) => {
        if (m && (m.role === 'user' || m.role === 'assistant')) convPos.set(idx, convPos.size);
      });
      const total = convPos.size;
      const getDepthForIndex = idx => (convPos.has(idx) ? total - 1 - convPos.get(idx) : undefined);
      const isPromptImageUrl = value => {
        const raw = String(value || '').trim();
        if (!raw) return false;
        if (raw.startsWith('data:image/')) return true;
        if (/^https?:\/\//i.test(raw)) return true;
        return false;
      };
      const resolveImageAttachment = msg => {
        if (!msg || typeof msg !== 'object') return '';
        if (isAttachmentExpired(msg.meta)) return '';
        if (msg.type === 'image' && typeof msg.content === 'string') {
          const raw = String(msg.content || '').trim();
          if (!raw || raw === '[binary omitted]' || raw === '[图片]') return '';
          return isPromptImageUrl(raw) ? raw : '';
        }
        const raw = typeof msg.content === 'string' ? msg.content.trim() : '';
        if (isPromptImageUrl(raw)) return raw;
        return '';
      };
      const resolveCreativeHistorySummary = msg => {
        const direct = String(msg?.meta?.summary || '').trim();
        if (direct) return direct;
        try {
          const compacted = chatStore.getCompactedSummary?.(sessionId);
          const compactedText = String(compacted?.text || '').trim();
          if (compactedText) return compactedText;
        } catch {}
        try {
          const list = chatStore.getSummaries?.(sessionId) || [];
          const last = list[list.length - 1];
          return String(typeof last === 'string' ? last : last?.text || '').trim();
        } catch {}
        return '';
      };
      let history = all
        .filter(m => m && m.status !== 'pending' && m.status !== 'sending')
        .filter(m => {
          if (!m || typeof m.content !== 'string') return false;
          if (m.role === 'user' || m.role === 'assistant') return true;
          return isGroupChat && m.role === 'system';
        })
        .map((m, idx) => {
          const depth = getDepthForIndex(idx);
          const isCreativeReply = m?.role === 'assistant' && Boolean(m?.meta?.renderRich);
          if (isGroupChat && m.role === 'system') {
            const raw = String(m.content || '').trim();
            if (!raw) return null;
            const cleaned = raw.replace(/^系统消息[:：]?\s*/i, '').trim();
            const systemLine = `系统消息（我们能解析的这种）：${cleaned || raw}`;
            return {
              role: 'assistant',
              content: systemLine,
              name: '系统',
              __creative: false,
            };
          }
          let content = typeof m.raw === 'string' ? m.raw : m.content;
          const reasoning = m.role === 'assistant' && typeof m?.meta?.reasoning === 'string' ? m.meta.reasoning : '';
          const imageUrl = resolveImageAttachment(m);
          if (imageUrl) {
            const out = {
              role: m.role,
              content: '[图片]',
              name: typeof m.name === 'string' ? m.name : '',
              __creative: isCreativeReply,
              __reasoning: reasoning,
            };
            if (m.role === 'user') {
              out.__mediaKind = 'image';
              out.__mediaUrl = imageUrl;
            }
            return out;
          }
          if (m.type === 'image') {
            return {
              role: m.role,
              content: '[图片]',
              name: typeof m.name === 'string' ? m.name : '',
              __creative: isCreativeReply,
              __reasoning: reasoning,
            };
          }
          if (m.type === 'audio' || (typeof content === 'string' && content.startsWith('data:audio'))) {
            return {
              role: m.role,
              content: '[语音]',
              name: typeof m.name === 'string' ? m.name : '',
              __creative: isCreativeReply,
              __reasoning: reasoning,
            };
          }
          if (m.type === 'document') {
            return {
              role: m.role,
              content: `[文件] ${m.content || ''}`.trim(),
              name: typeof m.name === 'string' ? m.name : '',
              __creative: isCreativeReply,
              __reasoning: reasoning,
            };
          }
          if (creativeMode && (m.role === 'assistant' || m.role === 'user')) {
            const plain = resolveMessagePlainText(m, {
              depth,
              preferRawSource: isCreativeReply,
            });
            if (plain) {
              content = plain;
            }
          } else if (m.role === 'assistant' && m?.meta?.renderRich) {
            const summary = resolveCreativeHistorySummary(m);
            if (!summary) return null;
            content = summary;
          } else {
            const key = resolveStickerKeywordForMessage(m);
            if (key) content = buildStickerToken(key);
          }
          if (!String(content || '').trim()) return null;
          return {
            role: m.role,
            content,
            name: typeof m.name === 'string' ? m.name : '',
            __creative: isCreativeReply,
            __reasoning: reasoning,
          };
        })
        .filter(Boolean);
      const last = history[history.length - 1];
      if (
        pendingUserText &&
        last?.role === 'user' &&
        String(last.content || '').trim() === String(pendingUserText).trim()
      ) {
        history.pop();
      }
      // Limit outgoing history to the latest 50 messages to reduce distraction/tokens.
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }
      try {
        const openaiPreset = window?.appBridge?.presets?.getActive?.('openai') || {};
        const maxContext = Number(openaiPreset?.openai_max_context);
        const maxOut = Number(openaiPreset?.openai_max_tokens);
        const ctxTokens = Number.isFinite(maxContext) ? Math.max(0, Math.trunc(maxContext)) : 0;
        const outTokens = Number.isFinite(maxOut) ? Math.max(0, Math.trunc(maxOut)) : 0;
        const inputBudgetTokens = Math.max(2000, ctxTokens ? ctxTokens - outTokens - 512 : 8000);
        const maxChars = Math.min(140_000, Math.max(30_000, inputBudgetTokens * 4));

        const capPerMessage = 40_000;
        for (const m of history) {
          if (m && typeof m.content === 'string' && m.content.length > capPerMessage) {
            m.content = `${m.content.slice(0, capPerMessage)}…`;
          }
        }

        let total = 0;
        for (const m of history) total += typeof m?.content === 'string' ? m.content.length : 0;
        while (history.length > 1 && total > maxChars) {
          const dropped = history.shift();
          total -= typeof dropped?.content === 'string' ? dropped.content.length : 0;
        }
      } catch {}
      if (creativeMode) {
        const rawLimit = Number(appSettings.get().creativeHistoryMax);
        const creativeLimit = Number.isFinite(rawLimit) ? Math.max(0, Math.trunc(rawLimit)) : 3;
        const creativeIdx = [];
        history.forEach((m, idx) => {
          if (m?.__creative) creativeIdx.push(idx);
        });
        if (creativeLimit <= 0) {
          history = history.filter(m => !m?.__creative);
        } else if (creativeIdx.length > creativeLimit) {
          const keep = new Set(creativeIdx.slice(-creativeLimit));
          history = history.filter((m, idx) => !m?.__creative || keep.has(idx));
        }
      }
      try {
        const settings = appSettings.get();
        const preset = getReasoningPreset();
        const addToPrompts = settings.reasoningAddToPrompts === true;
        const prefixRaw = String(preset?.prefix ?? '');
        const suffixRaw = String(preset?.suffix ?? '');
        const sepRaw = String(preset?.separator ?? '');
          if (addToPrompts && (prefixRaw || suffixRaw || sepRaw)) {
          const maxAdditions = Number.isFinite(Number(settings.reasoningMaxAdditions))
            ? Math.max(0, Math.trunc(Number(settings.reasoningMaxAdditions)))
            : 1;
          if (maxAdditions > 0) {
            const applyMacros = val => {
              try {
                return window.appBridge.processTextMacros(String(val ?? ''), { sessionId, useGlobalVariables: sharedVariables });
              } catch {
                return String(val ?? '');
              }
            };
            const prefix = applyMacros(prefixRaw);
            const suffix = applyMacros(suffixRaw);
            const separator = applyMacros(sepRaw);
            let added = 0;
            for (let i = history.length - 1; i >= 0; i--) {
              if (added >= maxAdditions) break;
              const msg = history[i];
              if (!msg || msg.role !== 'assistant') continue;
              const reasoning = String(msg.__reasoning || '').trim();
              if (!reasoning) continue;
              const block = `${prefix}${reasoning}${suffix}${separator}`;
              msg.content = `${block}${msg.content || ''}`;
              added += 1;
            }
          }
        }
      } catch {}
      history = history.map(m => {
        if (!m || typeof m !== 'object') return m;
        if (!('__creative' in m) && !('__reasoning' in m)) return m;
        const { __creative, __reasoning, ...rest } = m;
        return rest;
      });
      return history;
    };
    let disableSummaryForThis = false;
    const attachmentParts = hasAttachments ? buildAttachmentParts(attachmentQueue) : [];
    const llmContext = pendingUserText => {
      const settings = appSettings.get();
      const memoryInjectPosition = String(settings.memoryInjectPosition || 'template').toLowerCase();
      const memoryInjectDepthRaw = Math.trunc(Number(settings.memoryInjectDepth));
      const memoryInjectDepth = Number.isFinite(memoryInjectDepthRaw) ? Math.max(0, memoryInjectDepthRaw) : 4;
      return {
        user: {
          name: userName,
          persona: activePersona.description || '',
          personaPosition: activePersona.position,
          personaDepth: activePersona.depth,
          personaRole: activePersona.role,
        },
        character: { name: characterName },
        session: { id: sessionId, isGroup: isGroupChat, name: characterName },
        meta: {
          // Keep summary prompt on; creative mode restricts chat guide to summary-only.
          disableSummary: Boolean(disableSummaryForThis),
          skipInputRegex: Boolean(skipInputRegex),
          chatGuideMode: creativeMode ? 'summary-only' : 'full',
          disableChatGuide: false,
          disableScenarioHint: Boolean(creativeMode),
          disableMomentSummary: Boolean(creativeMode),
          disablePhoneFormat: Boolean(creativeMode),
          uiMode,
          useGlobalVariables: Boolean(sharedVariables),
          sharedMemory: Boolean(sharedMemory),
          memoryStorageMode: getMemoryStorageMode(),
          memoryAutoExtract: isMemoryAutoExtractInline(),
          memoryInjectPosition,
          memoryInjectDepth,
          userAttachmentParts: attachmentParts,
        },
        group: isGroupChat
          ? {
              id: sessionId,
              name: characterName,
              members: groupMembers.slice(),
              memberNames: groupMembers.map(mid => contactsStore.getContact(mid)?.name || mid),
            }
          : null,
        history: buildHistoryForLLM(pendingUserText),
      };
    };
    try {
      window.appBridge.setContextBuilder?.(llmContext);
    } catch {}

    // slash command support
    if (text.startsWith('/')) {
      const handled = runCommand(text, { chatStore, ui, sessionPanel, worldPanel, appBridge: window.appBridge });
      if (pluginRuntime) {
        pluginRuntime.dispatchEvent('command.parsed', {
          text,
          handled: Boolean(handled),
          sessionId,
        }).catch(err => logger.warn('plugin command.parsed failed', err));
      }
      if (handled) {
        ui.clearInput();
        return true;
      }
    }

    if (!window.appBridge.isConfigured()) {
      ui.showErrorBanner('未配置 API，请先填写 Base URL / Key / 模型');
      window.toastr?.warning('请先配置 API 信息', '未配置');
      configPanel.show();
      return false;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      ui.showErrorBanner('当前离线，请连接网络后再试');
      window.toastr?.warning('离线状态，无法发送');
      return false;
    }

    let attachmentMessages = [];
    let attachmentPrimaryId = '';
    if (hasAttachments) {
      attachmentMessages = buildAttachmentMessages(attachmentQueue, { name: userName, avatar: avatars.user });
      clearComposerAttachments();
      attachmentMessages.forEach(msg => {
        ui.addMessage(msg);
        chatStore.appendMessage(msg, sessionId);
      });
      attachmentPrimaryId = attachmentMessages[0]?.id || '';
      const attachmentById = new Map(
        attachmentQueue.filter(item => item && typeof item === 'object').map(item => [String(item.id || ''), item]),
      );
      attachmentMessages.forEach(msg => {
        if (msg?.type !== 'image') return;
        const attachment = attachmentById.get(String(msg?.meta?.attachmentId || ''));
        if (!attachment) return;
        persistImageAttachmentMessage(msg, attachment, sessionId);
      });
    }
    let appendedUserOutput = attachmentMessages.length > 0;
    const hasUserText = Boolean(String(text || '').trim());

    // 只有在没有 pending 消息时，才创建新的用户消息气泡
    let userMsg = null;
    if (!pendingMessagesToConfirm || pendingMessagesToConfirm.length === 0) {
      if (!suppressUserMessage && hasUserText) {
        const stickerKey = parseStickerToken(text);
        if (stickerKey) {
          userMsg = {
            role: 'user',
            type: 'sticker',
            content: stickerKey,
            raw: text,
            name: userName,
            avatar: avatars.user,
            time: formatNowTime(),
          };
        } else {
          const storedUser = window.appBridge.applyInputStoredRegex(text, { isEdit: false });
          const displayUser = window.appBridge.applyInputDisplayRegex(storedUser, { isEdit: false, depth: 0 });
          userMsg = {
            role: 'user',
            type: 'text',
            content: displayUser,
            raw: storedUser,
            name: userName,
            avatar: avatars.user,
            time: formatNowTime(),
          };
        }
        ui.addMessage(userMsg);
        const savedUser = chatStore.appendMessage(userMsg, sessionId);
        if (pluginRuntime) {
          pluginRuntime.dispatchEvent('message.after_send', { message: savedUser || userMsg, sessionId }).catch(err => {
            logger.warn('plugin message.after_send failed', err);
          });
        }
        appendedUserOutput = true;
      }
      const primaryId = userMsg?.id || existingUserMessageId || attachmentPrimaryId || null;
      activeGeneration = {
        sessionId,
        userMsgId: primaryId,
        streamCtrl: null,
        cancelled: false,
      };
      if (appendedUserOutput) refreshChatAndContacts();
      if (!suppressUserMessage && appendedUserOutput) ui.clearInput();
    } else {
      // 有 pending 消息时，使用第一条 pending 消息的 ID
      activeGeneration = { sessionId, userMsgId: pendingMessagesToConfirm[0]?.id, streamCtrl: null, cancelled: false };
      if (attachmentMessages.length) refreshChatAndContacts();
      if (!suppressUserMessage && attachmentMessages.length) ui.clearInput();
    }
    ui.setSendingState(true);

    const config = window.appBridge.config.get();

    let streamCtrl = null;
    let sendSucceeded = false;
    let suppressErrorUI = false;
    try {
      if (config.stream) {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const sysp = window.appBridge?.presets?.getActive?.('sysprompt') || {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = !creativeMode && (momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled));
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = !isSummaryMemoryEnabled();

        if (creativeMode) {
          // 创意写作模式：完整长文输出，不解析线上格式
          if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar);
          const stream = await window.appBridge.generate(text, llmContext(text));
          let full = '';
          streamCtrl = null;
          for await (const chunk of stream) {
            if (activeGeneration?.cancelled) break;
            full += chunk;
            if (!streamCtrl) {
              if (isSessionActive(sessionId)) {
                ui.hideTyping();
                streamCtrl = ui.startAssistantStream({
                  avatar: assistantAvatar,
                  name: '助手',
                  time: formatNowTime(),
                  typing: false,
                });
                if (activeGeneration && activeGeneration.sessionId === sessionId)
                  activeGeneration.streamCtrl = streamCtrl;
              }
            }
            const streamText = isMemoryAutoExtractInline() ? stripTableEditBlocks(full) : full;
            if (streamCtrl) streamCtrl.update(streamText);
          }
          if (activeGeneration?.cancelled) return;
          if (isSessionActive(sessionId)) ui.hideTyping();
          if (!streamCtrl && isSessionActive(sessionId)) {
            streamCtrl = ui.startAssistantStream({
              avatar: assistantAvatar,
              name: '助手',
              time: formatNowTime(),
              typing: false,
            });
            if (activeGeneration && activeGeneration.sessionId === sessionId) activeGeneration.streamCtrl = streamCtrl;
            const streamText = isMemoryAutoExtractInline() ? stripTableEditBlocks(full) : full;
            streamCtrl.update(streamText);
          }
          chatStore.setLastRawResponse(full, sessionId);
          const memoryParsed = await handleMemoryEditsFromRaw(full, { sessionId, isGroup: isGroupChat });
          let stripped = memoryParsed.text;
          let summary = '';
          if (isSummaryMemoryEnabled()) {
            const parsedSummary = extractSummaryBlock(full);
            stripped = parsedSummary.text;
            summary = parsedSummary.summary;
            if (summary) {
              try {
                chatStore.addSummary(summary, sessionId);
              } catch {}
              try {
                requestSummaryCompaction(sessionId);
              } catch {}
            }
          }
          const rawSource = normalizeCreativeLineBreaks(stripped);
          const reasoningParsed = extractReasoningFromContent(rawSource, { depth: 0, strict: true });
          const finalSource = normalizeCreativeLineBreaks(reasoningParsed.content || '');
          let stored = finalSource;
          let display = finalSource;
          try {
            stored = normalizeCreativeLineBreaks(window.appBridge.applyOutputStoredRegex(finalSource, { depth: 0 }));
            display = normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 }));
            if (streamCtrl) streamCtrl.update(display);
          } catch {}
          const meta = { renderRich: true };
          if (summary) meta.summary = summary;
          if (reasoningParsed.reasoning) {
            meta.reasoning = reasoningParsed.reasoning;
            meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
          }
          const parsed = {
            role: 'assistant',
            type: 'text',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            id: streamCtrl?.id,
            rawOriginal: full,
            rawSource: finalSource,
            raw: stored,
            content: display,
            meta,
          };
          if (streamCtrl) {
            streamCtrl.finish(parsed);
          } else if (isSessionActive(sessionId)) {
            ui.addMessage(parsed);
          }
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
            emitPluginAfterReceive(saved, sessionId);
          }
          refreshChatAndContacts();
          sendSucceeded = true;
        } else if (protocolEnabled) {
          // 对话模式（流式）：不逐字显示 AI 原文；只在捕获到完整的“有效标签”后输出解析结果
          if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar);
          const parser = createDialogueParser();
          const stream = await window.appBridge.generate(text, llmContext(text));
          let fullRaw = '';
          let didAnything = false;
          let mutatedMoments = false;
          const summarySessionIds = new Set([sessionId]);
          for await (const chunk of stream) {
            if (activeGeneration?.cancelled) break;
            fullRaw += chunk;
            const events = parser.push(chunk);
            for (const ev of events) {
              if (ev.type === 'moments') {
                try {
                  momentsStore.addMany(ingestMoments(ev.moments || []));
                  mutatedMoments = true;
                  didAnything = true;
                  if (activePage === 'moments') momentsPanel.render();
                } catch {}
                continue;
              }
              if (ev.type === 'moment_reply') {
                try {
                  const mid = String(ev.momentId || '').trim();
                  if (!mid) return;
                  momentsStore.addComments(mid, ev.comments || []);
                  mutatedMoments = true;
                  didAnything = true;
                  if (activePage === 'moments') momentsPanel.render();
                } catch {}
                continue;
              }
              if (ev.type === 'group_chat') {
                if (isSessionActive(sessionId)) ui.hideTyping();
                const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                if (!targetGroupId) {
                  window.toastr?.warning?.('对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                  continue;
                }
                summarySessionIds.add(targetGroupId);
                (ev.messages || []).forEach(m => {
                  const speaker = normalizeName(m?.speaker);
                  const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                  if (isSystemSpeaker(speaker)) {
                    const parsed = {
                      role: 'system',
                      type: 'meta',
                      content: sanitizeAssistantReplyText(content, userName),
                      name: '系统',
                      time: m?.time || formatNowTime(),
                    };
                    if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    emitPluginAfterReceive(saved, targetGroupId);
                    maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                    return;
                  }
                  const isMe = isUserSpeakerName(speaker);
                  if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                  const role = isMe ? 'user' : 'assistant';
                  const c = isMe ? null : resolveContactByDisplayName(speaker);
                  const parsed =
                    role === 'assistant'
                      ? buildAssistantMessageFromText(content, {
                          sessionId: targetGroupId,
                          time: m?.time || formatNowTime(),
                          name: speaker || '成员',
                          avatar: resolveAvatarForContact(c?.id || speaker, c),
                          showName: true,
                          depth: 0,
                        })
                      : buildUserMessageFromAI(content, m?.time || formatNowTime());
                  if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                  const saved = chatStore.appendMessage(parsed, targetGroupId);
                  if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                  emitPluginAfterReceive(saved, targetGroupId);
                });
                didAnything = true;
                refreshChatAndContacts();
                if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar);
                continue;
              }
              if (ev.type !== 'private_chat') continue;
              if (isSessionActive(sessionId)) ui.hideTyping();

              // 默认路由到当前 session；若标签指向其他私聊，则创建/写入对应会话（后续群聊/动态会扩展）
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回复格式错误：私聊标签未匹配当前联系人，已丢弃');
                continue;
              }
              summarySessionIds.add(targetSessionId);

              ev.messages.forEach(msgText => {
                const { speaker, content, time } = normalizeDialogueMessage(msgText);
                if (!content) return;
                if (userEchoGuard.shouldDrop(content, speaker)) return;
                const isMe = isUserSpeakerName(speaker);
                const parsed = isMe
                  ? buildUserMessageFromAI(content, time || formatNowTime())
                  : buildAssistantMessageFromText(content, {
                      sessionId: targetSessionId,
                      time: time || formatNowTime(),
                      depth: 0,
                    });
                if (isSessionActive(targetSessionId)) {
                  ui.addMessage(parsed);
                }
                const saved = chatStore.appendMessage(parsed, targetSessionId);
                if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                emitPluginAfterReceive(saved, targetSessionId);
              });
              didAnything = true;
              refreshChatAndContacts();

              // Continue waiting animation until stream ends / next tag arrives
              if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar);
            }
          }
          if (activeGeneration?.cancelled) return;
          if (isSessionActive(sessionId)) ui.hideTyping();
          chatStore.setLastRawResponse(fullRaw, sessionId);
          if (isSummaryMemoryEnabled()) {
            const { summary: protocolSummary } = extractSummaryBlock(fullRaw);
            if (protocolSummary) {
              try {
                for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
              } catch {}
              try {
                for (const sid of summarySessionIds) requestSummaryCompaction(sid);
              } catch {}
            }
          }
          await handleMemoryEditsFromRaw(fullRaw, { sessionId, isGroup: isGroupChat });
          if (mutatedMoments) {
            try {
              await momentsStore.flush();
            } catch {}
          }
          refreshChatAndContacts();
          if (!didAnything) {
            // Fallback: if <thinking>/<think> contains literal "<content>", first-pass parsing may start too early.
            // Retry once by stripping complete thinking blocks, then parsing again.
            try {
              const retryText = sanitizeThinkingForProtocolParse(fullRaw);
              if (retryText && retryText !== fullRaw) {
                const retryParser = createDialogueParser();
                const retryEvents = retryParser.push(retryText);
                retryEvents.forEach(ev => {
                  if (ev?.type === 'moments') {
                    try {
                      momentsStore.addMany(ingestMoments(ev.moments || []));
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    return;
                  }
                  if (ev?.type === 'moment_reply') {
                    try {
                      const mid = String(ev.momentId || '').trim();
                      if (!mid) return;
                      momentsStore.addComments(mid, ev.comments || []);
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    return;
                  }
                  if (ev?.type === 'group_chat') {
                    const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                    if (!targetGroupId) return;
                    summarySessionIds.add(targetGroupId);
                    (ev.messages || []).forEach(m => {
                      const speaker = normalizeName(m?.speaker);
                      const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                      if (isSystemSpeaker(speaker)) {
                        const parsed = {
                          role: 'system',
                          type: 'meta',
                          content: sanitizeAssistantReplyText(content, userName),
                          name: '系统',
                          time: m?.time || formatNowTime(),
                        };
                        if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetGroupId);
                        emitPluginAfterReceive(saved, targetGroupId);
                        maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                        return;
                      }
                      const isMe = isUserSpeakerName(speaker);
                      if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                      const role = isMe ? 'user' : 'assistant';
                      const c = isMe ? null : resolveContactByDisplayName(speaker);
                      const parsed =
                        role === 'assistant'
                          ? buildAssistantMessageFromText(content, {
                              sessionId: targetGroupId,
                              time: m?.time || formatNowTime(),
                              name: speaker || '成员',
                              avatar: resolveAvatarForContact(c?.id || speaker, c),
                              showName: true,
                              depth: 0,
                            })
                          : buildUserMessageFromAI(content, m?.time || formatNowTime());
                      if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetGroupId);
                    });
                    didAnything = true;
                    refreshChatAndContacts();
                    return;
                  }
                  if (ev?.type === 'private_chat') {
                    const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                    if (!targetSessionId) return;
                    summarySessionIds.add(targetSessionId);
                    (ev.messages || []).forEach(msgText => {
                      const { speaker, content, time } = normalizeDialogueMessage(msgText);
                      if (!content) return;
                      if (userEchoGuard.shouldDrop(content, speaker)) return;
                      const isMe = isUserSpeakerName(speaker);
                      const parsed = isMe
                        ? buildUserMessageFromAI(content, time || formatNowTime())
                        : buildAssistantMessageFromText(content, {
                            sessionId: targetSessionId,
                            time: time || formatNowTime(),
                            depth: 0,
                          });
                      if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetSessionId);
                      if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetSessionId);
                    });
                    didAnything = true;
                    refreshChatAndContacts();
                  }
                });
                if (mutatedMoments) {
                  try {
                    await momentsStore.flush();
                  } catch {}
                }
                refreshChatAndContacts();
              }
            } catch {}
            if (!didAnything) {
              try {
                const baseText = sanitizeThinkingForProtocolParse(fullRaw);
                const miPhoneText = normalizeMiPhoneMarkers(baseText);
                const miPhoneBlock = extractMiPhoneBlock(miPhoneText);
                if (miPhoneBlock) {
                  const retryParser = createDialogueParser();
                  const retryEvents = retryParser.push(miPhoneBlock);
                  retryEvents.forEach(ev => {
                    if (ev?.type === 'moments') {
                      try {
                        momentsStore.addMany(ingestMoments(ev.moments || []));
                        mutatedMoments = true;
                        didAnything = true;
                        if (activePage === 'moments') momentsPanel.render();
                      } catch {}
                      return;
                    }
                    if (ev?.type === 'moment_reply') {
                      try {
                        const mid = String(ev.momentId || '').trim();
                        if (!mid) return;
                        momentsStore.addComments(mid, ev.comments || []);
                        mutatedMoments = true;
                        didAnything = true;
                        if (activePage === 'moments') momentsPanel.render();
                      } catch {}
                      return;
                    }
                    if (ev?.type === 'group_chat') {
                      const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                      if (!targetGroupId) return;
                      summarySessionIds.add(targetGroupId);
                      (ev.messages || []).forEach(m => {
                        const speaker = normalizeName(m?.speaker);
                        const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                        if (isSystemSpeaker(speaker)) {
                          const parsed = {
                            role: 'system',
                            type: 'meta',
                            content: sanitizeAssistantReplyText(content, userName),
                            name: '系统',
                            time: m?.time || formatNowTime(),
                        };
                        if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                          const saved = chatStore.appendMessage(parsed, targetGroupId);
                          emitPluginAfterReceive(saved, targetGroupId);
                          maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                          return;
                        }
                        const isMe = isUserSpeakerName(speaker);
                        if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                        const role = isMe ? 'user' : 'assistant';
                        const c = isMe ? null : resolveContactByDisplayName(speaker);
                        const parsed =
                          role === 'assistant'
                            ? buildAssistantMessageFromText(content, {
                                sessionId: targetGroupId,
                                time: m?.time || formatNowTime(),
                                name: speaker || '成员',
                                avatar: resolveAvatarForContact(c?.id || speaker, c),
                                showName: true,
                                depth: 0,
                              })
                            : buildUserMessageFromAI(content, m?.time || formatNowTime());
                        if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetGroupId);
                        if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                        emitPluginAfterReceive(saved, targetGroupId);
                      });
                      didAnything = true;
                      refreshChatAndContacts();
                      return;
                    }
                    if (ev?.type === 'private_chat') {
                      const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                      if (!targetSessionId) return;
                      summarySessionIds.add(targetSessionId);
                      (ev.messages || []).forEach(msgText => {
                        const { speaker, content, time } = normalizeDialogueMessage(msgText);
                        if (!content) return;
                        if (userEchoGuard.shouldDrop(content, speaker)) return;
                        const isMe = isUserSpeakerName(speaker);
                        const parsed = isMe
                          ? buildUserMessageFromAI(content, time || formatNowTime())
                          : buildAssistantMessageFromText(content, {
                              sessionId: targetSessionId,
                              time: time || formatNowTime(),
                              depth: 0,
                            });
                        if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetSessionId);
                        if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                        emitPluginAfterReceive(saved, targetSessionId);
                      });
                      didAnything = true;
                      refreshChatAndContacts();
                    }
                  });
                  if (mutatedMoments) {
                    try {
                      await momentsStore.flush();
                    } catch {}
                  }
                  refreshChatAndContacts();
                }
              } catch {}
            }
            if (!didAnything) {
              window.toastr?.warning?.('未解析到有效对话标签，已丢弃（可在“三 > 原始回复”查看）');
            }
          }
          sendSucceeded = true;
        } else {
          // 兼容旧逻辑（流式逐字）
          streamCtrl = isSessionActive(sessionId)
            ? ui.startAssistantStream({
                avatar: assistantAvatar,
                name: '助手',
                time: formatNowTime(),
                typing: true,
              })
            : null;
          if (streamCtrl && activeGeneration && activeGeneration.sessionId === sessionId) {
            activeGeneration.streamCtrl = streamCtrl;
          }
          const stream = await window.appBridge.generate(text, llmContext(text));
          let full = '';
          for await (const chunk of stream) {
            if (activeGeneration?.cancelled) break;
            full += chunk;
            const streamText = isMemoryAutoExtractInline() ? stripTableEditBlocks(full) : full;
            if (streamCtrl) streamCtrl.update(streamText);
          }
          if (activeGeneration?.cancelled) return;
          chatStore.setLastRawResponse(full, sessionId);
          const memoryParsed = await handleMemoryEditsFromRaw(full, { sessionId, isGroup: isGroupChat });
          let stripped = memoryParsed.text;
          if (isSummaryMemoryEnabled()) {
            const parsedSummary = extractSummaryBlock(full);
            stripped = parsedSummary.text;
            if (parsedSummary.summary) {
              try {
                chatStore.addSummary(parsedSummary.summary, sessionId);
              } catch {}
            }
          }
          let stored = sanitizeAssistantReplyText(stripped, userName);
          const reasoningParsed = extractReasoningFromContent(stored, { depth: 0, strict: true });
          stored = reasoningParsed.content || '';
          let display = stored;
          const meta = {};
          if (reasoningParsed.reasoning) {
            meta.reasoning = reasoningParsed.reasoning;
            meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
          }
          // === 创意写作模式===
          // try {
          //     stored = window.appBridge.applyOutputStoredRegex(full);
          //     display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
          //     streamCtrl.update(display);
          // } catch {}
          const parsed = {
            role: 'assistant',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            id: streamCtrl?.id,
            rawOriginal: full,
            raw: stored,
            ...parseSpecialMessage(display),
            meta: Object.keys(meta).length ? meta : undefined,
          };
          if (streamCtrl) {
            streamCtrl.finish(parsed);
          } else if (isSessionActive(sessionId)) {
            ui.addMessage(parsed);
          }
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
            emitPluginAfterReceive(saved, sessionId);
          }
          refreshChatAndContacts();
          sendSucceeded = true;
        }
      } else {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const sysp = window.appBridge?.presets?.getActive?.('sysprompt') || {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = !creativeMode && (momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled));
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = !isSummaryMemoryEnabled();

        if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar);
        const resultRaw = await window.appBridge.generate(text, llmContext(text));
        sendSucceeded = true;
        if (isSessionActive(sessionId)) ui.hideTyping();
        chatStore.setLastRawResponse(resultRaw, sessionId);
        let stripped = resultRaw;
        if (!protocolEnabled) {
          const memoryParsed = await handleMemoryEditsFromRaw(resultRaw, { sessionId, isGroup: isGroupChat });
          stripped = memoryParsed.text;
        }
        let protocolSummary = '';
        if (isSummaryMemoryEnabled()) {
          const parsedSummary = extractSummaryBlock(resultRaw);
          stripped = parsedSummary.text;
          protocolSummary = parsedSummary.summary;
        }
        const summarySessionIds = new Set([sessionId]);
        if (creativeMode) {
          if (protocolSummary) {
            try {
              chatStore.addSummary(protocolSummary, sessionId);
            } catch {}
            try {
              requestSummaryCompaction(sessionId);
            } catch {}
          }
          const rawSource = normalizeCreativeLineBreaks(stripped);
          const reasoningParsed = extractReasoningFromContent(rawSource, { depth: 0, strict: true });
          const finalSource = normalizeCreativeLineBreaks(reasoningParsed.content || '');
          let stored = finalSource;
          let display = finalSource;
          try {
            stored = normalizeCreativeLineBreaks(window.appBridge.applyOutputStoredRegex(finalSource, { depth: 0 }));
            display = normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 }));
          } catch {}
          const meta = { renderRich: true };
          if (protocolSummary) meta.summary = protocolSummary;
          if (reasoningParsed.reasoning) {
            meta.reasoning = reasoningParsed.reasoning;
            meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
          }
          const parsed = {
            role: 'assistant',
            type: 'text',
            name: '助手',
            avatar: assistantAvatar,
            time: formatNowTime(),
            rawOriginal: resultRaw,
            rawSource: finalSource,
            raw: stored,
            content: display,
            meta,
          };
          if (isSessionActive(sessionId)) ui.addMessage(parsed);
          {
            const saved = chatStore.appendMessage(parsed, sessionId);
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
            emitPluginAfterReceive(saved, sessionId);
          }
          refreshChatAndContacts();
          return;
        }
        if (protocolEnabled) {
          const parser = createDialogueParser();
          const events = parser.push(resultRaw);
          let didAnything = false;
          let mutatedMoments = false;
          handleMemoryEditsFromRaw(resultRaw, { sessionId, isGroup: isGroupChat }).catch(() => {});
          events.forEach(ev => {
            if (ev?.type === 'moments') {
              momentsStore.addMany(ingestMoments(ev.moments || []));
              didAnything = true;
              mutatedMoments = true;
              return;
            }
            if (ev?.type === 'moment_reply') {
              const mid = String(ev.momentId || '').trim();
              if (!mid) return;
              momentsStore.addComments(mid, ev.comments || []);
              didAnything = true;
              mutatedMoments = true;
              return;
            }
            if (ev?.type === 'group_chat') {
              const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
              if (!targetGroupId) {
                window.toastr?.warning?.('对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                return;
              }
              summarySessionIds.add(targetGroupId);
              (ev.messages || []).forEach(m => {
                const speaker = normalizeName(m?.speaker);
                const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                if (isSystemSpeaker(speaker)) {
                  const parsed = {
                    role: 'system',
                    type: 'meta',
                    content: sanitizeAssistantReplyText(content, userName),
                    name: '系统',
                    time: m?.time || formatNowTime(),
                  };
                  if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                  const saved = chatStore.appendMessage(parsed, targetGroupId);
                  emitPluginAfterReceive(saved, targetGroupId);
                  maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                  didAnything = true;
                  return;
                }
                const isMe = isUserSpeakerName(speaker);
                if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                const role = isMe ? 'user' : 'assistant';
                const c = isMe ? null : resolveContactByDisplayName(speaker);
                const parsed =
                  role === 'assistant'
                    ? buildAssistantMessageFromText(content, {
                        sessionId: targetGroupId,
                        time: m?.time || formatNowTime(),
                        name: speaker || '成员',
                        avatar: resolveAvatarForContact(c?.id || speaker, c),
                        showName: true,
                        depth: 0,
                      })
                    : buildUserMessageFromAI(content, m?.time || formatNowTime());
                if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                const saved = chatStore.appendMessage(parsed, targetGroupId);
                if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                emitPluginAfterReceive(saved, targetGroupId);
                didAnything = true;
              });
              return;
            }
            if (ev?.type === 'private_chat') {
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回复格式错误：私聊标签未匹配当前联系人，已丢弃');
                return;
              }
              summarySessionIds.add(targetSessionId);
              (ev.messages || []).forEach(msgText => {
                const { speaker, content, time } = normalizeDialogueMessage(msgText);
                if (!content) return;
                if (userEchoGuard.shouldDrop(content, speaker)) return;
                const isMe = isUserSpeakerName(speaker);
                const parsed = isMe
                  ? buildUserMessageFromAI(content, time || formatNowTime())
                  : buildAssistantMessageFromText(content, {
                      sessionId: targetSessionId,
                      time: time || formatNowTime(),
                      depth: 0,
                    });
                if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                const saved = chatStore.appendMessage(parsed, targetSessionId);
                if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                emitPluginAfterReceive(saved, targetSessionId);
                didAnything = true;
              });
            }
          });
          if (didAnything) {
            if (protocolSummary) {
              try {
                for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
              } catch {}
              try {
                for (const sid of summarySessionIds) requestSummaryCompaction(sid);
              } catch {}
            }
            refreshChatAndContacts();
            if (activePage === 'moments') momentsPanel.render();
            if (mutatedMoments) {
              try {
                await momentsStore.flush();
              } catch {}
            }
            return;
          }
          // Fallback: strip complete <thinking>/<think> blocks then parse once more.
          try {
            const retryText = sanitizeThinkingForProtocolParse(resultRaw);
            if (retryText && retryText !== resultRaw) {
              const retryParser = createDialogueParser();
              const retryEvents = retryParser.push(retryText);
              retryEvents.forEach(ev => {
                if (ev?.type === 'moments') {
                  momentsStore.addMany(ingestMoments(ev.moments || []));
                  didAnything = true;
                  mutatedMoments = true;
                  return;
                }
                if (ev?.type === 'moment_reply') {
                  const mid = String(ev.momentId || '').trim();
                  if (!mid) return;
                  momentsStore.addComments(mid, ev.comments || []);
                  didAnything = true;
                  mutatedMoments = true;
                  return;
                }
                if (ev?.type === 'group_chat') {
                  const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                  if (!targetGroupId) return;
                  summarySessionIds.add(targetGroupId);
                  (ev.messages || []).forEach(m => {
                    const speaker = normalizeName(m?.speaker);
                    const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                    if (isSystemSpeaker(speaker)) {
                      const parsed = {
                        role: 'system',
                        type: 'meta',
                        content: sanitizeAssistantReplyText(content, userName),
                        name: '系统',
                        time: m?.time || formatNowTime(),
                      };
                      if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      emitPluginAfterReceive(saved, targetGroupId);
                      maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                      didAnything = true;
                      return;
                    }
                    const isMe = isUserSpeakerName(speaker);
                    if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                    const role = isMe ? 'user' : 'assistant';
                    const c = isMe ? null : resolveContactByDisplayName(speaker);
                    const parsed =
                      role === 'assistant'
                        ? buildAssistantMessageFromText(content, {
                            sessionId: targetGroupId,
                            time: m?.time || formatNowTime(),
                            name: speaker || '成员',
                            avatar: resolveAvatarForContact(c?.id || speaker, c),
                            showName: true,
                            depth: 0,
                          })
                        : buildUserMessageFromAI(content, m?.time || formatNowTime());
                    if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetGroupId);
                    didAnything = true;
                  });
                  return;
                }
                if (ev?.type === 'private_chat') {
                  const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                  if (!targetSessionId) return;
                  summarySessionIds.add(targetSessionId);
                  (ev.messages || []).forEach(msgText => {
                    const { speaker, content, time } = normalizeDialogueMessage(msgText);
                    if (!content) return;
                    if (userEchoGuard.shouldDrop(content, speaker)) return;
                    const isMe = isUserSpeakerName(speaker);
                    const parsed = isMe
                      ? buildUserMessageFromAI(content, time || formatNowTime())
                      : buildAssistantMessageFromText(content, {
                          sessionId: targetSessionId,
                          time: time || formatNowTime(),
                          depth: 0,
                        });
                    if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                    didAnything = true;
                  });
                }
              });
            }
          } catch {}
          if (!didAnything) {
            try {
              const baseText = sanitizeThinkingForProtocolParse(resultRaw);
              const miPhoneText = normalizeMiPhoneMarkers(baseText);
              const miPhoneBlock = extractMiPhoneBlock(miPhoneText);
              if (miPhoneBlock) {
                const retryParser = createDialogueParser();
                const retryEvents = retryParser.push(miPhoneBlock);
                retryEvents.forEach(ev => {
                  if (ev?.type === 'moments') {
                    momentsStore.addMany(ingestMoments(ev.moments || []));
                    didAnything = true;
                    mutatedMoments = true;
                    return;
                  }
                  if (ev?.type === 'moment_reply') {
                    const mid = String(ev.momentId || '').trim();
                    if (!mid) return;
                    momentsStore.addComments(mid, ev.comments || []);
                    didAnything = true;
                    mutatedMoments = true;
                    return;
                  }
                  if (ev?.type === 'group_chat') {
                    const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                    if (!targetGroupId) return;
                    summarySessionIds.add(targetGroupId);
                    (ev.messages || []).forEach(m => {
                      const speaker = normalizeName(m?.speaker);
                      const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                      if (isSystemSpeaker(speaker)) {
                        const parsed = {
                          role: 'system',
                          type: 'meta',
                          content: sanitizeAssistantReplyText(content, userName),
                          name: '系统',
                          time: m?.time || formatNowTime(),
                        };
                        if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetGroupId);
                        emitPluginAfterReceive(saved, targetGroupId);
                        maybeApplyGroupSystemOps(parsed.content, targetGroupId);
                        didAnything = true;
                        return;
                      }
                      const isMe = isUserSpeakerName(speaker);
                      if (isMe && userEchoGuard.shouldDrop(content, speaker)) return;
                      const role = isMe ? 'user' : 'assistant';
                      const c = isMe ? null : resolveContactByDisplayName(speaker);
                      const parsed =
                        role === 'assistant'
                          ? buildAssistantMessageFromText(content, {
                              sessionId: targetGroupId,
                              time: m?.time || formatNowTime(),
                              name: speaker || '成员',
                              avatar: resolveAvatarForContact(c?.id || speaker, c),
                              showName: true,
                              depth: 0,
                            })
                          : buildUserMessageFromAI(content, m?.time || formatNowTime());
                      if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetGroupId);
                      didAnything = true;
                    });
                    return;
                  }
                  if (ev?.type === 'private_chat') {
                    const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                    if (!targetSessionId) return;
                    summarySessionIds.add(targetSessionId);
                    (ev.messages || []).forEach(msgText => {
                      const { speaker, content, time } = normalizeDialogueMessage(msgText);
                      if (!content) return;
                      if (userEchoGuard.shouldDrop(content, speaker)) return;
                      const isMe = isUserSpeakerName(speaker);
                      const parsed = isMe
                        ? buildUserMessageFromAI(content, time || formatNowTime())
                        : buildAssistantMessageFromText(content, {
                            sessionId: targetSessionId,
                            time: time || formatNowTime(),
                            depth: 0,
                          });
                    if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                    didAnything = true;
                  });
                  }
                });
              }
            } catch {}
          }
          if (didAnything) {
            if (protocolSummary) {
              try {
                for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
              } catch {}
              try {
                for (const sid of summarySessionIds) requestSummaryCompaction(sid);
              } catch {}
            }
            refreshChatAndContacts();
            if (activePage === 'moments') momentsPanel.render();
            if (mutatedMoments) {
              try {
                await momentsStore.flush();
              } catch {}
            }
            return;
          }
          window.toastr?.warning?.('未解析到有效对话标签，已丢弃（可在“三 > 原始回复”查看）');
          return;
        }
        if (protocolSummary) {
          try {
            for (const sid of summarySessionIds) chatStore.addSummary(protocolSummary, sid);
          } catch {}
          try {
            for (const sid of summarySessionIds) requestSummaryCompaction(sid);
          } catch {}
        }
        // === 创意写作模式===
        // const stored = window.appBridge.applyOutputStoredRegex(resultRaw);
        // const display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
        const summary = protocolSummary;
        if (summary) {
          try {
            chatStore.addSummary(summary, sessionId);
          } catch {}
          try {
            requestSummaryCompaction(sessionId);
          } catch {}
        }
        const cleaned = sanitizeAssistantReplyText(stripped, userName);
        const reasoningParsed = extractReasoningFromContent(cleaned, { depth: 0, strict: true });
        const stored = reasoningParsed.content || '';
        const display = stored;
        const meta = {};
        if (reasoningParsed.reasoning) {
          meta.reasoning = reasoningParsed.reasoning;
          meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
        }
        const parsed = {
          role: 'assistant',
          name: '助手',
          avatar: assistantAvatar,
          time: formatNowTime(),
          rawOriginal: resultRaw,
          raw: stored,
          ...parseSpecialMessage(display),
          meta: Object.keys(meta).length ? meta : undefined,
        };
        if (isSessionActive(sessionId)) ui.addMessage(parsed);
        {
          const saved = chatStore.appendMessage(parsed, sessionId);
          autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
          emitPluginAfterReceive(saved, sessionId);
        }
        refreshChatAndContacts();
        sendSucceeded = true;
      }
    } catch (error) {
      streamCtrl?.cancel?.();
      if (isSessionActive(sessionId)) ui.hideTyping();
      if (error?.cancelled || (activeGeneration?.cancelled && String(error?.name || '') === 'AbortError')) {
        suppressErrorUI = true;
      }
      if (suppressErrorUI) return;
      logger.error('发送失败', error, { status: error?.status, response: error?.response });
      ui.showErrorBanner(error.message || '发送失败，请检查网络或 API 设置', {
        label: '重试',
        handler: () => handleSend(),
      });
      window.toastr?.error(error.message || '发送失败', '错误');
    } finally {
      if (sendSucceeded) {
        if (pendingMessagesToConfirm && pendingMessagesToConfirm.length > 0) {
          finalizePendingMessages(sessionId, pendingMessagesToConfirm);
        }
        movePendingFromHistoryToQueue(sessionId);
        refreshChatAndContacts();
        runMemoryUpdateAfterChat(sessionId, isGroupChat, llmContext('')).catch(() => {});
      }
      updatePendingFloat(sessionId);
      ui.setSendingState(false);
      activeGeneration = null;
      return sendSucceeded;
    }
  };

  const sendMessageFromPlugin = async (content, options = {}) => {
    const text = String(content ?? '');
    const opts = options && typeof options === 'object' ? options : {};
    const role = String(opts.role || 'user').toLowerCase();
    const silent = Boolean(opts.silent);
    const skipInputRegex = Boolean(opts.skipInputRegex);
    const sessionId = chatStore.getCurrent();
    if (!sessionId) return null;
    const contact = contactsStore.getContact(sessionId);
    const characterName =
      contact?.name || (sessionId.startsWith('group:') ? sessionId.replace(/^group:/, '') : sessionId) || 'assistant';
    const activePersona = getEffectivePersona(sessionId);
    const userName = activePersona.name || '我';
    const now = formatNowTime();

    if (role !== 'user' || silent) {
      const isSystem = role === 'system';
      const isAssistant = role === 'assistant';
      const isUser = role === 'user';
      let display = text;
      let stored = text;
      if (!isSystem && !isAssistant) {
        stored = skipInputRegex
          ? text
          : window.appBridge.applyInputStoredRegex(text, { isEdit: false });
        display = skipInputRegex
          ? text
          : window.appBridge.applyInputDisplayRegex(stored, { isEdit: false, depth: 0 });
      }
      const msg = {
        role,
        type: isSystem ? 'meta' : 'text',
        content: display,
        raw: stored,
        name: isSystem ? '系统' : (isAssistant ? '助手' : userName),
        avatar: isAssistant ? getAssistantAvatarForSession(sessionId) : avatars.user,
        time: now,
      };
      if (isSessionActive(sessionId)) ui.addMessage(msg);
      const saved = chatStore.appendMessage(msg, sessionId);
      refreshChatAndContacts();
      if (isUser && pluginRuntime) {
        pluginRuntime.dispatchEvent('message.after_send', { message: saved || msg, sessionId }).catch(err => {
          logger.warn('plugin message.after_send failed', err);
        });
      }
      if (isAssistant) emitPluginAfterReceive(saved, sessionId);
      return saved;
    }

    if (!text.trim()) return null;
    await handleSend(null, { overrideText: text, ignorePending: true, skipInputRegex });
    const list = chatStore.getMessages(sessionId) || [];
    const lastUser = [...list].reverse().find(m => m && m.role === 'user');
    return lastUser || null;
  };
  window.appBridge.sendMessageFromPlugin = sendMessageFromPlugin;

  // 使用新的分离模式：Enter 缓存，发送按钮真正发送
  ui.onSendWithMode({
    onEnter: handleEnter,
    onSendButton: handleSend,
  });

  // Long-press send button to switch mode
  (() => {
    const sendBtn = document.getElementById('send-button');
    if (!sendBtn) return;
    let pressTimer = null;
    let pressTriggered = false;
    let suppressNextSend = false;

    const popover = document.createElement('div');
    popover.className = 'send-mode-popover';
    popover.style.display = 'none';
    document.body.appendChild(popover);

    const hidePopover = () => {
      popover.style.display = 'none';
    };
    const showPopover = () => {
      const targetMode = sendMode === 'creative' ? 'chat' : 'creative';
      popover.textContent = targetMode === 'creative' ? '创意写作模式' : '聊天对话模式';
      const rect = sendBtn.getBoundingClientRect();
      popover.style.display = 'block';
      popover.style.visibility = 'hidden';
      popover.style.top = '0';
      popover.style.left = '0';
      const height = popover.offsetHeight || 32;
      const top = Math.max(12, rect.top - height - 8);
      const left = rect.left + rect.width / 2;
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.transform = 'translateX(-50%)';
      popover.style.visibility = 'visible';
    };

    popover.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (uiMode === 'rp') {
        window.toastr?.info?.('RP 模式固定为创意写作');
        hidePopover();
        return;
      }
      const next = sendMode === 'creative' ? 'chat' : 'creative';
      setSendMode(next);
      hidePopover();
    });

    const clearTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    sendBtn.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (uiMode === 'rp') return;
      pressTriggered = false;
      clearTimer();
      pressTimer = setTimeout(() => {
        pressTriggered = true;
        suppressNextSend = true;
        showPopover();
      }, 420);
    });

    sendBtn.addEventListener('pointerup', () => {
      clearTimer();
    });
    sendBtn.addEventListener('pointerleave', clearTimer);
    sendBtn.addEventListener('pointercancel', clearTimer);

    document.addEventListener('pointerdown', e => {
      if (popover.style.display === 'none') return;
      if (popover.contains(e.target) || sendBtn.contains(e.target)) return;
      hidePopover();
    });

    ui.setSendClickGuard(() => {
      if (!suppressNextSend) return false;
      suppressNextSend = false;
      return true;
    });

    applySendModeUI();
  })();

  ui.onInputChange(text => {
    chatStore.setDraft(text, chatStore.getCurrent());
    updateStickerPreview(text);
  });
  ui.onMessageAction(async (action, message, payload) => {
    const sessionId = chatStore.getCurrent();
    const isSyntheticUser = m => m?.role === 'user' && m?.meta?.generatedByAssistant === true;
    const regenerateFromUserIndex = async (userIdx, { allowEmpty = false } = {}) => {
      const msgs = chatStore.getMessages(sessionId);
      const prevUser = msgs[userIdx];
      if (!prevUser || prevUser.role !== 'user' || isSyntheticUser(prevUser)) return;
      if (prevUser.status === 'pending' || prevUser.status === 'sending') {
        window.toastr?.warning('发送中的消息无法重生成');
        return;
      }
      let nextUserIdx = -1;
      for (let i = userIdx + 1; i < msgs.length; i++) {
        if (
          msgs[i]?.role === 'user' &&
          !isSyntheticUser(msgs[i]) &&
          msgs[i]?.status !== 'pending' &&
          msgs[i]?.status !== 'sending'
        ) {
          nextUserIdx = i;
          break;
        }
      }
      if (nextUserIdx !== -1) {
        window.toastr?.warning('只能重生成最新一轮回复');
        return;
      }
      const roundMessages = msgs.slice(userIdx + 1, nextUserIdx === -1 ? msgs.length : nextUserIdx);
      const regenMessages = roundMessages.filter(m => m?.role === 'assistant' || isSyntheticUser(m));
      if (!regenMessages.length && !allowEmpty) {
        window.toastr?.warning('未找到可重生成的 AI 回复');
        return;
      }
      if (regenMessages.length) {
        regenMessages.forEach(m => {
          chatStore.deleteMessage(m.id, sessionId);
          ui.removeMessage(m.id);
        });
        refreshChatAndContacts();
      }
      chatStore.removeLastSummary?.(sessionId);
      const settings = appSettings.get();
      const memoryMode = String(settings.memoryStorageMode || 'table').toLowerCase();
      if (memoryMode === 'table') {
        try {
          logger.debug('memory rollback: start', { sessionId, messageId: prevUser?.id || '' });
          const rollbackFn = window.appBridge?.rollbackLastMemoryUpdate;
          if (typeof rollbackFn === 'function') {
            const rolled = await rollbackFn(sessionId);
            logger.debug('memory rollback: done', { sessionId, messageId: prevUser?.id || '', rolled });
          } else {
            logger.warn('memory rollback: missing handler', { sessionId, messageId: prevUser?.id || '' });
          }
        } catch (err) {
          logger.warn('rollback memory update failed', err);
        }
      }
      const resendText = getMessageSendText(prevUser);
      if (!String(resendText || '').trim()) {
        window.toastr?.warning('未找到对应的用户消息内容');
        return;
      }
      await handleSend(null, {
        overrideText: resendText,
        ignorePending: true,
        suppressUserMessage: true,
        skipInputRegex: true,
        existingUserMessageId: prevUser?.id || '',
        includeAttachments: false,
      });
    };

    // 处理"发送到这里"
    if (action === 'send-to-here' && message.status === 'pending') {
      await handleSend(message.id);
      return;
    }
    if (action === 'view-code') {
      let raw = typeof message?.rawOriginal === 'string' ? message.rawOriginal : '';
      if (!raw.trim()) {
        raw = (await chatStore.loadRawOriginal?.(message, sessionId)) || '';
      }
      if (!raw.trim()) {
        raw = message?.rawSource ?? message?.raw_source ?? message?.source ?? message?.raw ?? message?.content ?? '';
      }
      ui.openCodeViewer({ message, text: String(raw || '') });
      return true;
    }
    if (action === 'copy-text') {
      let text = '';
      if (message?.role === 'assistant' && message?.meta?.renderRich) {
        text = resolveMessagePlainText(message, { depth: 0, preferRawSource: true });
      }
      if (!String(text || '').trim() && message?.meta?.renderRich) {
        try {
          text = ui.getBubbleCopyText(payload?.wrapper);
        } catch {}
      }
      if (!String(text || '').trim()) {
        text = message?.content || '';
      }
      if (!String(text || '').trim()) {
        const loaded = await chatStore.loadRawOriginal?.(message, sessionId);
        text =
          loaded ||
          message?.rawSource ||
          message?.raw_source ||
          message?.rawOriginal ||
          message?.raw ||
          message?.content ||
          '';
      }
      const ok = await ui.copyToClipboard(text);
      ok ? window.toastr?.success?.('已复制') : window.toastr?.warning?.('复制失败');
      return true;
    }
    if (action === 'download') {
      await downloadChatAttachment(message);
      return true;
    }

    if (action === 'delete-selected') {
      const ids = Array.isArray(payload?.ids) ? payload.ids.map(String).filter(Boolean) : [];
      if (!ids.length) return;
      ids.forEach(id => {
        chatStore.deleteMessage(id, sessionId);
        ui.removeMessage(id);
      });
      refreshChatAndContacts();
      return;
    }
    if (action === 'retract' && message.role === 'user') {
      const pending =
        activeGeneration && activeGeneration.sessionId === sessionId && activeGeneration.userMsgId === message.id;
      if (pending) {
        try {
          activeGeneration.cancelled = true;
        } catch {}
        try {
          window.appBridge.cancelCurrentGeneration('retract');
        } catch {}
        try {
          activeGeneration.streamCtrl?.cancel?.();
        } catch {}
        try {
          ui.hideTyping?.();
        } catch {}
        try {
          ui.setSendingState(false);
        } catch {}
      }
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      refreshChatAndContacts();
      return;
    }
    if (action === 'delete') {
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      refreshChatAndContacts();
      return;
    }
    if (action === 'edit-assistant-raw' && message.role === 'assistant') {
      const next = String(payload?.text ?? '');
      // === 创意写作模式===
      // const stored = window.appBridge.applyOutputStoredRegex(next, { isEdit: true });
      // const display = window.appBridge.applyOutputDisplayRegex(stored, { isEdit: true, depth: 0 });
      const stored = next;
      const display = next;
      const updater = {
        rawOriginal: next,
        rawSource: normalizeCreativeLineBreaks(next),
        raw: stored,
        ...parseSpecialMessage(display),
      };
      const updated = chatStore.updateMessage(message.id, updater, sessionId);
      if (updated) {
        ui.updateMessage(message.id, updated);
        refreshChatAndContacts();
      }
      return;
    }
    if (action === 'edit-confirm' && message.role === 'user') {
      const newText = String(payload?.text ?? '');
      if (!newText) return;
      const stored = window.appBridge.applyInputStoredRegex(newText, { isEdit: true });
      const display = window.appBridge.applyInputDisplayRegex(stored, { isEdit: true, depth: 0 });
      const updated = chatStore.updateMessage(
        message.id,
        { content: display, raw: stored, time: formatNowTime() },
        sessionId,
      );
      if (updated) {
        ui.updateMessage(message.id, {
          ...updated,
          role: 'user',
          type: 'text',
          avatar: avatars.user,
          name: getEffectivePersona(sessionId)?.name || '我',
        });
        refreshChatAndContacts();
      }
      return;
    }
    if (action === 'edit' && message.role === 'user') {
      // 已由 UI 层接管 startInlineEdit，此处保留旧逻辑备份或直接移除
      return;
    }
    if (action === 'regenerate' && message.role === 'assistant') {
      const msgs = chatStore.getMessages(sessionId);
      const idx = msgs.findIndex(m => m.id === message.id);
      if (idx === -1) return;
      let prevUserIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (
          msgs[i]?.role === 'user' &&
          !isSyntheticUser(msgs[i]) &&
          msgs[i]?.status !== 'pending' &&
          msgs[i]?.status !== 'sending'
        ) {
          prevUserIdx = i;
          break;
        }
      }
      if (prevUserIdx === -1) {
        window.toastr?.warning('未找到对应的用户消息，无法重生成');
        return;
      }
      await regenerateFromUserIndex(prevUserIdx, { allowEmpty: false });
      return;
    }
    if (action === 'regenerate' && message.role === 'user') {
      const msgs = chatStore.getMessages(sessionId);
      const idx = msgs.findIndex(m => m.id === message.id);
      if (idx === -1) return;
      await regenerateFromUserIndex(idx, { allowEmpty: true });
      return;
    }
  });
  const rerenderCurrentSession = async () => {
    try {
      const id = chatStore.getCurrent();
      const msgs = await chatStore.ensureRecentMessagesLoaded(id);
      ui.clearMessages();
      const PAGE = 90;
      const start = Math.max(0, msgs.length - PAGE);
      ui.preloadHistory(decorateMessagesForDisplay(msgs.slice(start), { sessionId: id }));
      chatRenderState.set(id, { start });
      refreshChatAndContacts();
    } catch {}
  };

  window.addEventListener('worldinfo-changed', () => {
    updateWorldIndicator();
    rerenderCurrentSession();
  });
  window.addEventListener('memory-table-push', ev => {
    const detail = ev?.detail || {};
    const sessionId = String(detail.sessionId || '').trim();
    const content = String(detail.content || '').trim();
    if (!sessionId || !content) return;
    const msg = {
      role: 'assistant',
      type: 'text',
      name: '助手',
      avatar: getAssistantAvatarForSession(sessionId),
      time: formatNowTime(),
      content,
      meta: { renderRich: true, kind: 'memory-table-push' },
    };
    if (String(chatStore.getCurrent() || '') === sessionId) {
      ui.addMessage(msg);
    }
    const saved = chatStore.appendMessage(msg, sessionId);
    autoMarkReadIfActive(sessionId, saved?.id || msg?.id || '');
    refreshChatAndContacts();
  });
  window.addEventListener('preset-changed', async () => {
    try {
      await window.appBridge?.syncPresetRegexBindings?.();
    } catch {}
    rerenderCurrentSession();
  });
  window.addEventListener('regex-changed', () => {
    rerenderCurrentSession();
  });
  window.addEventListener('session-panel-closed', (event) => {
    if (event?.detail?.jumpToContacts) {
      switchPage('contacts');
    }
  });
  window.addEventListener('session-changed', async e => {
    const id = e.detail?.id;
    if (id) {
      window.appBridge.setActiveSession(id);
      const c = contactsStore.getContact(id);
      if (currentChatTitle) currentChatTitle.innerHTML = renderSessionNameHtml(id, c);
      syncUserPersonaUI(id);
      const msgs = await chatStore.ensureRecentMessagesLoaded(id);
      const draft = chatStore.getDraft(id);
      ui.clearMessages();
      {
        const PAGE = 90;
        const start = Math.max(0, msgs.length - PAGE);
        ui.preloadHistory(decorateMessagesForDisplay(msgs.slice(start), { sessionId: id }));
        chatRenderState.set(id, { start });
      }
      ui.setInputText(draft || '');
      ui.setSessionLabel(id);
      refreshChatAndContacts();
    }
  });

  try {
    await restoreUiState();
  } catch {}
  if (!activePage) activePage = 'chat';
  if (!pages[activePage]) activePage = 'chat';
  if (!pages[activePage]?.classList.contains('active')) switchPage(activePage || 'chat');
  uiLog('boot: after restore', {
    activePage,
    sessionId: chatStore.getCurrent(),
    inChatRoom: chatRoom ? !chatRoom.classList.contains('hidden') : false,
  });
  updateWorldIndicator();
  refreshChatAndContacts();
  applyUiModeUI();
  if (initialUiMode === 'rp') {
    enterRpMode({ captureSocial: false });
  }
  uiStateArmed = true;
  try {
    saveUiState();
  } catch {}

  // If stores hydrate later (e.g. after a WebView reload / offline resume), refresh UI without jumping to defaults.
  window.addEventListener('store-hydrated', async ev => {
    const store = String(ev?.detail?.store || '').trim();
    if (!store) return;
    if (store !== 'chat' && store !== 'contacts') return;
    uiLog('store-hydrated', { store });
    try {
      refreshChatAndContacts();
    } catch {}
    try {
      // If we are stuck on an empty/default session due to early hydration miss, restore the last UI state again.
      const cur = String(chatStore.getCurrent() || '').trim();
      const raw = (() => {
        try {
          return sessionStorage.getItem(UI_STATE_KEY);
        } catch {}
        try {
          return localStorage.getItem(UI_STATE_KEY);
        } catch {}
        return '';
      })();
      const want = raw ? String(JSON.parse(raw)?.sessionId || '').trim() : '';
      uiLog('store-hydrated: check restore', { cur, want, curKnown: chatStore.hasSession?.(cur) });
      if (want && want !== cur && (cur === 'default' || !chatStore.hasSession?.(cur))) {
        await restoreUiState();
      }
    } catch {}
  });

  // Lifecycle diagnostics (helps confirm whether this is a real WebView reload/process restart)
  try {
    window.addEventListener('pageshow', e => uiLog('pageshow', { persisted: Boolean(e?.persisted) }));
    window.addEventListener('pagehide', e => uiLog('pagehide', { persisted: Boolean(e?.persisted) }));
    document.addEventListener('visibilitychange', () => uiLog('visibilitychange', { state: document.visibilityState }));
    window.addEventListener('beforeunload', () => uiLog('beforeunload'));
    window.addEventListener('unload', () => uiLog('unload'));
    window.addEventListener('error', e => {
      const err = e?.error;
      uiLog('window.error', {
        msg: String(e?.message || err?.message || err || ''),
        file: e?.filename,
        line: e?.lineno,
        col: e?.colno,
        stack: err?.stack || '',
      });
    });
    window.addEventListener('unhandledrejection', e =>
      uiLog('unhandledrejection', {
        reason: String(e?.reason?.message || e?.reason || ''),
        stack: e?.reason?.stack || '',
      }),
    );
  } catch {}

  async function handleDocumentFile(file) {
    if (!file) {
      window.toastr?.warning?.('未选择文档');
      return;
    }
    const name = String(file?.name || '').trim() || '文件';
    const mime = String(file?.type || '').trim();
    const size = Number(file?.size || 0);
    const sizeLabel = formatFileSize(size);
    let text = '';
    let textTruncated = false;
    let supported = false;
    let localPath = '';
    let localBytes = 0;
    try {
      const extracted = await extractDocumentText(file);
      text = extracted.text || '';
      textTruncated = Boolean(extracted.truncated);
      supported = Boolean(extracted.supported);
    } catch {}
    if (!supported && mime) {
      window.toastr?.info?.('该文件类型暂不支持解析，将仅发送文件信息');
    }
    try {
      const sessionId = String(chatStore.getCurrent() || '').trim();
      const base64 = await readFileAsBase64(file);
      if (sessionId && base64) {
        const resp = await safeInvoke('save_attachment_bytes', {
          sessionId,
          base64,
          fileName: name,
        });
        localPath = String(resp?.path || '').trim();
        localBytes = Number(resp?.bytes || 0) || 0;
      }
    } catch {}
    addComposerAttachment({
      kind: 'document',
      name,
      mime,
      size,
      sizeLabel,
      text,
      textTruncated,
      localPath,
      localBytes,
      originalName: name,
    });
  }

  function handleSticker(tag) {
    const sessionId = chatStore.getCurrent();
    bumpStickerUsage(tag);
    const msg = {
      role: 'user',
      type: 'sticker',
      content: tag,
      name: getEffectivePersona(sessionId)?.name || '我',
      avatar: avatars.user,
      time: formatNowTime(),
    };
    ui.addMessage(msg);
    chatStore.appendMessage(msg, sessionId);
  }

  function handleImage(url, name = '') {
    const resolved = String(url || '').trim();
    if (!resolved) return;
    addComposerAttachment({
      kind: 'image',
      url: resolved,
      name: String(name || '').trim(),
    });
  }

  function handleMusicFile(dataUrl, name = '本地音频') {
    const sessionId = chatStore.getCurrent();
    const msg = {
      role: 'user',
      type: 'music',
      content: name,
      meta: { artist: '本地', url: dataUrl },
      name: getEffectivePersona(sessionId)?.name || '我',
      avatar: avatars.user,
      time: formatNowTime(),
    };
    ui.addMessage(msg);
    chatStore.appendMessage(msg, sessionId);
  }

  function updateWorldIndicator() {
    const globalId = window.appBridge?.globalWorldId || '';
    const currentIds = Array.isArray(window.appBridge?.currentWorldIds)
      ? window.appBridge.currentWorldIds
      : (window.appBridge?.currentWorldId ? [window.appBridge.currentWorldId] : []);
    const currentLabel = (() => {
      if (!currentIds.length) return '';
      if (currentIds.length <= 2) return currentIds.join(' + ');
      return `${currentIds[0]} + ${currentIds[1]} + ...`;
    })();
    const label = globalId && currentLabel
      ? `全局:${globalId} / 会话:${currentLabel}`
      : globalId || currentLabel || '未启用';
    worldIndicator.setName(label);
  }

  /* ---------------- 聊天设置功能 ---------------- */
  const ORIGINAL_CHAT_DEFAULTS = {
    bubbleColor: '#c9c9c9',
    textColor: '#1F2937',
  };
  const getGlobalChatDefaults = () => {
    const settings = appSettings.get();
    const bubble = String(settings.chatDefaultBubbleColor || '').trim() || ORIGINAL_CHAT_DEFAULTS.bubbleColor;
    const text = String(settings.chatDefaultTextColor || '').trim() || ORIGINAL_CHAT_DEFAULTS.textColor;
    return { bubbleColor: bubble, textColor: text };
  };

  const getChatSettingDefaults = () => {
    const globalDefaults = getGlobalChatDefaults();
    return { ...globalDefaults, wallpaper: null };
  };

  const wallpaperState = {
    mode: 'keep',
    sessionId: '',
    fileName: '',
    fileType: '',
    fileDataUrl: '',
    file: null,
    previewUrl: '',
    zoom: 1,
    rotate: 0,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    dirtyTransform: false,
    saveOriginal: false,
    initial: null,
    current: null,
    dragging: false,
    dragStart: null,
  };

  const getConvertFileSrc = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
  };

  const resolveWallpaperUrl = wallpaper => {
    if (!wallpaper) return '';
    if (wallpaper.url) return String(wallpaper.url || '').trim();
    if (wallpaper.dataUrl) return String(wallpaper.dataUrl || '').trim();
    if (wallpaper.path) {
      const convert = getConvertFileSrc();
      const raw = String(wallpaper.path || '').trim();
      if (!raw) return '';
      return typeof convert === 'function' ? convert(raw) : raw;
    }
    return '';
  };

  const ensureChatWallpaperLayer = () => {
    if (!chatRoom) return null;
    let layer = chatRoom.querySelector('.chat-wallpaper-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'chat-wallpaper-layer is-hidden';
      const img = document.createElement('img');
      img.className = 'chat-wallpaper-image';
      img.alt = '';
      layer.appendChild(img);
      chatRoom.insertBefore(layer, chatRoom.firstChild);
    }
    return { layer, img: layer.querySelector('img') };
  };

  let activeWallpaperMeta = null;
  let activeWallpaperUrl = '';
  const WALLPAPER_IDLE_TIMEOUT_MS = 120000;
  let wallpaperIdleTimer = null;
  let lastWallpaperActivityAt = 0;

  const hasActiveWallpaper = () => {
    if (!activeWallpaperUrl || !chatRoom) return false;
    const layer = chatRoom.querySelector('.chat-wallpaper-layer');
    if (!layer || layer.classList.contains('is-hidden')) return false;
    return true;
  };

  const clearWallpaperIdle = () => {
    if (!chatRoom) return;
    chatRoom.classList.remove('wallpaper-idle');
  };

  const scheduleWallpaperIdle = () => {
    if (wallpaperIdleTimer) clearTimeout(wallpaperIdleTimer);
    wallpaperIdleTimer = null;
    if (!isChatRoomVisible() || !hasActiveWallpaper()) {
      clearWallpaperIdle();
      return;
    }
    wallpaperIdleTimer = setTimeout(() => {
      if (!isChatRoomVisible() || !hasActiveWallpaper()) return;
      chatRoom?.classList.add('wallpaper-idle');
    }, WALLPAPER_IDLE_TIMEOUT_MS);
  };

  const registerWallpaperActivity = ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastWallpaperActivityAt < 200) return;
    lastWallpaperActivityAt = now;
    if (!isChatRoomVisible()) return;
    if (chatRoom?.classList.contains('wallpaper-idle')) {
      chatRoom.classList.remove('wallpaper-idle');
    }
    scheduleWallpaperIdle();
  };

  const applyWallpaperTransform = (imgEl, containerEl, meta) => {
    if (!imgEl || !containerEl || !meta) return;
    const rect = containerEl.getBoundingClientRect();
    const cw = rect.width || containerEl.clientWidth || 0;
    const ch = rect.height || containerEl.clientHeight || 0;
    const iw = Number(meta.width || imgEl.naturalWidth || 0);
    const ih = Number(meta.height || imgEl.naturalHeight || 0);
    if (!cw || !ch || !iw || !ih) return;
    const baseScale = Math.max(cw / iw, ch / ih);
    const zoom = Number(meta.zoom || 1);
    const rotate = Number(meta.rotate || 0);
    const offsetX = Number(meta.offsetX || 0) * cw;
    const offsetY = Number(meta.offsetY || 0) * ch;
    imgEl.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${rotate}deg) scale(${
      baseScale * zoom
    })`;
  };

  const applyWallpaperToChatRoom = settings => {
    if (!chatRoom) return;
    const layerInfo = ensureChatWallpaperLayer();
    if (!layerInfo) return;
    const { layer, img } = layerInfo;
    const meta = settings?.wallpaper || null;
    const url = resolveWallpaperUrl(meta);
    activeWallpaperMeta = meta;
    activeWallpaperUrl = url;
    if (!url || !img) {
      layer?.classList.add('is-hidden');
      if (img) img.removeAttribute('src');
      scheduleWallpaperIdle();
      return;
    }
    layer?.classList.remove('is-hidden');
    if (img.src !== url) img.src = url;
    img.onload = () => applyWallpaperTransform(img, chatRoom, meta);
    if (img.complete) applyWallpaperTransform(img, chatRoom, meta);
    scheduleWallpaperIdle();
  };

  window.addEventListener('resize', () => {
    if (!activeWallpaperMeta) return;
    const layerInfo = ensureChatWallpaperLayer();
    if (!layerInfo?.img) return;
    if (activeWallpaperUrl && layerInfo.img.src !== activeWallpaperUrl) {
      layerInfo.img.src = activeWallpaperUrl;
    }
    applyWallpaperTransform(layerInfo.img, chatRoom, activeWallpaperMeta);
  });

  const normalizeChatSettings = raw => {
    const base = { ...getChatSettingDefaults(), ...(raw || {}) };
    if (raw?.wallpaper && typeof raw.wallpaper === 'object') {
      base.wallpaper = { ...raw.wallpaper };
      return base;
    }
    const legacy = String(raw?.chatBg || '').trim();
    if (legacy) {
      base.wallpaper = {
        url: legacy,
        zoom: 1,
        rotate: 0,
        offsetX: 0,
        offsetY: 0,
      };
      return base;
    }
    base.wallpaper = null;
    return base;
  };

  const syncWallpaperPreviewAspect = () => {
    if (!wallpaperPreview) return;
    const rect = chatRoom?.getBoundingClientRect?.() || { width: 360, height: 640 };
    const w = Math.max(1, Math.round(rect.width || 360));
    const h = Math.max(1, Math.round(rect.height || 640));
    wallpaperPreview.style.setProperty('--wallpaper-aspect', `${w} / ${h}`);
  };

  const updateWallpaperStatus = text => {
    if (!chatWallpaperStatus) return;
    chatWallpaperStatus.textContent = text || '未设置壁纸';
  };

  const applyWallpaperPreviewTransform = () => {
    if (!wallpaperPreview || !wallpaperPreviewImage) return;
    if (!wallpaperState.previewUrl) return;
    const rect = wallpaperPreview.getBoundingClientRect();
    const cw = rect.width || 0;
    const ch = rect.height || 0;
    const iw = wallpaperState.width || wallpaperPreviewImage.naturalWidth || 0;
    const ih = wallpaperState.height || wallpaperPreviewImage.naturalHeight || 0;
    if (!cw || !ch || !iw || !ih) return;
    const baseScale = Math.max(cw / iw, ch / ih);
    const offsetX = wallpaperState.offsetX * cw;
    const offsetY = wallpaperState.offsetY * ch;
    const scale = baseScale * wallpaperState.zoom;
    wallpaperPreviewImage.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${wallpaperState.rotate}deg) scale(${scale})`;
  };

  const setWallpaperPreviewSource = (url, name = '') => {
    if (!wallpaperPreviewImage) return;
    wallpaperState.previewUrl = url || '';
    wallpaperPreviewImage.src = url || '';
    wallpaperPreviewImage.style.opacity = url ? '1' : '0';
    wallpaperPreview?.classList.toggle('has-image', Boolean(url));
    updateWallpaperStatus(url ? name || '已设置壁纸' : '未设置壁纸');
    if (!url) {
      wallpaperPreviewImage.style.transform = 'translate(-50%, -50%)';
      wallpaperState.width = 0;
      wallpaperState.height = 0;
      return;
    }
    wallpaperPreviewImage.onload = () => {
      wallpaperState.width = wallpaperPreviewImage.naturalWidth || 0;
      wallpaperState.height = wallpaperPreviewImage.naturalHeight || 0;
      applyWallpaperPreviewTransform();
    };
    if (wallpaperPreviewImage.complete) {
      wallpaperState.width = wallpaperPreviewImage.naturalWidth || 0;
      wallpaperState.height = wallpaperPreviewImage.naturalHeight || 0;
      applyWallpaperPreviewTransform();
    }
  };

  const resetWallpaperState = (next = {}) => {
    wallpaperState.mode = next.mode || 'keep';
    wallpaperState.fileName = next.fileName || '';
    wallpaperState.fileType = next.fileType || '';
    wallpaperState.fileDataUrl = next.fileDataUrl || '';
    wallpaperState.file = next.file || null;
    wallpaperState.previewUrl = next.previewUrl || '';
    wallpaperState.zoom = Number(next.zoom || 1);
    wallpaperState.rotate = Number(next.rotate || 0);
    wallpaperState.offsetX = Number(next.offsetX || 0);
    wallpaperState.offsetY = Number(next.offsetY || 0);
    wallpaperState.width = Number(next.width || 0);
    wallpaperState.height = Number(next.height || 0);
    wallpaperState.dirtyTransform = Boolean(next.dirtyTransform);
    wallpaperState.saveOriginal = Boolean(next.saveOriginal);
    wallpaperState.current = next.current || null;
    wallpaperState.initial = next.initial || null;
  };

  const loadWallpaperEditor = (sessionId, settings) => {
    wallpaperState.sessionId = sessionId;
    const current = settings?.wallpaper || null;
    const url = resolveWallpaperUrl(current);
    const init = {
      mode: 'keep',
      fileName: '',
      fileDataUrl: '',
      previewUrl: url,
      zoom: Number(current?.zoom || 1),
      rotate: Number(current?.rotate || 0),
      offsetX: Number(current?.offsetX || 0),
      offsetY: Number(current?.offsetY || 0),
      width: Number(current?.width || 0),
      height: Number(current?.height || 0),
      dirtyTransform: false,
      current,
    };
    init.initial = { ...init };
    resetWallpaperState(init);
    if (wallpaperSaveOriginal) wallpaperSaveOriginal.checked = Boolean(wallpaperState.saveOriginal);
    if (wallpaperZoomInput) wallpaperZoomInput.value = String(wallpaperState.zoom || 1);
    if (wallpaperRotateInput) wallpaperRotateInput.value = String(wallpaperState.rotate || 0);
    setWallpaperPreviewSource(url, current?.name || '');
  };

  const markWallpaperDirty = () => {
    wallpaperState.dirtyTransform = true;
  };

  const handleWallpaperDragStart = event => {
    if (!wallpaperPreview || !wallpaperPreviewImage || !wallpaperState.previewUrl) return;
    wallpaperState.dragging = true;
    wallpaperState.dragStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: wallpaperState.offsetX,
      offsetY: wallpaperState.offsetY,
    };
    wallpaperPreview.classList.add('is-dragging');
    wallpaperPreview.setPointerCapture?.(event.pointerId);
  };

  const handleWallpaperDragMove = event => {
    if (!wallpaperState.dragging || !wallpaperPreview) return;
    const rect = wallpaperPreview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - wallpaperState.dragStart.x) / rect.width;
    const dy = (event.clientY - wallpaperState.dragStart.y) / rect.height;
    wallpaperState.offsetX = wallpaperState.dragStart.offsetX + dx;
    wallpaperState.offsetY = wallpaperState.dragStart.offsetY + dy;
    markWallpaperDirty();
    applyWallpaperPreviewTransform();
  };

  const handleWallpaperDragEnd = event => {
    if (!wallpaperState.dragging) return;
    wallpaperState.dragging = false;
    wallpaperPreview?.classList.remove('is-dragging');
    wallpaperPreview?.releasePointerCapture?.(event.pointerId);
  };

  const loadImageFromDataUrl = dataUrl =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('wallpaper image load failed'));
      img.src = dataUrl;
    });

  const shrinkWallpaperDataUrl = async (dataUrl, { maxSize = 2048, quality = 0.85 } = {}) => {
    if (!dataUrl || !String(dataUrl).startsWith('data:')) return { dataUrl, width: 0, height: 0 };
    const img = await loadImageFromDataUrl(dataUrl);
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (!iw || !ih) return { dataUrl, width: iw, height: ih };
    const scale = Math.min(1, maxSize / Math.max(iw, ih));
    if (scale >= 0.999) return { dataUrl, width: iw, height: ih };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl, width: iw, height: ih };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const output = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl: output, width: canvas.width, height: canvas.height };
  };

  const pickWallpaperFile = async file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result || '');
      let dataUrl = rawDataUrl;
      const shouldCompress = !wallpaperSaveOriginal?.checked;

      if (shouldCompress) {
        try {
          const scaled = await shrinkWallpaperDataUrl(rawDataUrl);
          if (scaled?.dataUrl) dataUrl = scaled.dataUrl;
        } catch (err) {
          logger.warn('壁纸压缩失败，使用原图', err);
        }
      } else {
        logger.info('保存原图模式：跳过压缩');
      }

      const init = {
        mode: 'new',
        fileName: file.name || 'wallpaper',
        fileType: file.type || '',
        fileDataUrl: dataUrl,
        file,
        previewUrl: dataUrl,
        zoom: 1,
        rotate: 0,
        offsetX: 0,
        offsetY: 0,
        dirtyTransform: true,
        current: null,
        saveOriginal: !shouldCompress,
      };
      init.initial = { ...init };
      resetWallpaperState(init);
      if (wallpaperZoomInput) wallpaperZoomInput.value = '1';
      if (wallpaperRotateInput) wallpaperRotateInput.value = '0';
      setWallpaperPreviewSource(dataUrl, file.name || '');
    };
    reader.onerror = () => {
      window.toastr?.error?.('读取壁纸失败');
    };
    reader.readAsDataURL(file);
  };

  const updateWallpaperControls = () => {
    if (wallpaperZoomInput) wallpaperZoomInput.value = String(wallpaperState.zoom || 1);
    if (wallpaperRotateInput) wallpaperRotateInput.value = String(wallpaperState.rotate || 0);
    applyWallpaperPreviewTransform();
  };

  const clearWallpaperSelection = () => {
    resetWallpaperState({
      mode: 'clear',
      fileName: '',
      fileType: '',
      fileDataUrl: '',
      file: null,
      previewUrl: '',
      zoom: 1,
      rotate: 0,
      offsetX: 0,
      offsetY: 0,
      dirtyTransform: true,
      current: null,
      saveOriginal: Boolean(wallpaperSaveOriginal?.checked),
    });
    if (wallpaperZoomInput) wallpaperZoomInput.value = '1';
    if (wallpaperRotateInput) wallpaperRotateInput.value = '0';
    setWallpaperPreviewSource('', '');
  };

  const restoreWallpaperInitial = () => {
    if (!wallpaperState.initial) return;
    const init = wallpaperState.initial;
    resetWallpaperState(init);
    updateWallpaperControls();
    setWallpaperPreviewSource(init.previewUrl, init.current?.name || '');
  };

  function applyChatSettings(sessionId, settings) {
    if (!chatRoom) return;
    const currentId = String(chatStore.getCurrent() || '');
    const sid = String(sessionId || '');
    if (!sid || sid !== currentId) return;
    chatRoom.dataset.session = sid;
    if (settings?.bubbleColor) {
      chatRoom.style.setProperty('--chat-bubble-color', settings.bubbleColor);
    } else {
      chatRoom.style.removeProperty('--chat-bubble-color');
    }
    if (settings?.textColor) {
      chatRoom.style.setProperty('--chat-text-color', settings.textColor);
    } else {
      chatRoom.style.removeProperty('--chat-text-color');
    }
    applyUserBubbleColor(sessionId);
    applyWallpaperToChatRoom(settings);
  }

  const saveWallpaperChunked = async (sessionId, dataUrl, fileName, previousPath) => {
    const parts = dataUrl.split(',');
    if (parts.length !== 2) throw new Error('Invalid data URL');
    const base64Data = parts[1];
    const mimeMatch = parts[0].match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    // 分块传输（每块 400KB）
    const chunkSize = 400 * 1024;
    const chunks = [];
    for (let i = 0; i < base64Data.length; i += chunkSize) {
      chunks.push(base64Data.slice(i, i + chunkSize));
    }

    logger.info(`壁纸分块传输: ${chunks.length} 块, 总大小 ${(base64Data.length / 1024).toFixed(1)}KB`);

    return await safeInvoke('save_wallpaper_chunked', {
      sessionId,
      chunks,
      fileName,
      mimeType,
      previousPath: previousPath || '',
    });
  };

  const readFileChunkAsBase64 = (file, start, end) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('read chunk failed'));
      reader.readAsDataURL(file.slice(start, end));
    });

  const saveWallpaperStreamed = async ({ sessionId, file, fileName, mimeType, previousPath }) => {
    if (!file) throw new Error('wallpaper file missing');
    const startResp = await safeInvoke('save_wallpaper_stream_start', {
      sessionId,
      fileName: fileName || '',
      mimeType: mimeType || '',
      previousPath: previousPath || '',
    });
    const uploadId = startResp?.upload_id;
    if (!uploadId) throw new Error('invalid wallpaper upload id');
    const chunkSize = 256 * 1024;
    const total = file.size || 0;
    if (!total) throw new Error('wallpaper file size invalid');
    for (let offset = 0; offset < total; offset += chunkSize) {
      const chunk = await readFileChunkAsBase64(file, offset, Math.min(total, offset + chunkSize));
      await safeInvoke('save_wallpaper_stream_chunk', {
        uploadId,
        chunk,
      });
    }
    return await safeInvoke('save_wallpaper_stream_finish', { uploadId });
  };

  const persistWallpaperIfNeeded = async (sessionId, baseSettings) => {
    const existing = baseSettings?.wallpaper || null;
    if (wallpaperState.mode === 'clear') {
      if (existing?.path) {
        safeInvoke('delete_wallpaper', {
          sessionId,
          path: existing.path,
        }).catch(err => {
          logger.warn('清理壁纸文件失败', err);
        });
      }
      return { cleared: true };
    }
    if (wallpaperState.mode === 'new') {
      if (!wallpaperState.fileDataUrl) return {};
      try {
        const fileRef = wallpaperState.file;
        const canStream = fileRef && typeof fileRef.slice === 'function' && Number.isFinite(fileRef.size);
        const useStream = wallpaperState.saveOriginal && canStream;
        const useChunked = !useStream && wallpaperState.fileDataUrl.length > 2 * 1024 * 1024;
        let resp;

        if (useStream) {
          logger.info('使用流式方式保存壁纸');
          resp = await saveWallpaperStreamed({
            sessionId,
            file: fileRef,
            fileName: wallpaperState.fileName || '',
            mimeType: wallpaperState.fileType || fileRef?.type || '',
            previousPath: existing?.path || '',
          });
        } else if (useChunked) {
          logger.info('使用分块传输保存壁纸');
          resp = await saveWallpaperChunked(
            sessionId,
            wallpaperState.fileDataUrl,
            wallpaperState.fileName || '',
            existing?.path || '',
          );
        } else {
          if (wallpaperState.saveOriginal && !useStream) {
            logger.warn('保存原图失败：缺少文件句柄，回退到 dataUrl');
          }
          logger.info('使用标准方式保存壁纸');
          resp = await safeInvoke('save_wallpaper', {
            sessionId,
            dataUrl: wallpaperState.fileDataUrl,
            fileName: wallpaperState.fileName || '',
            previousPath: existing?.path || '',
          });
        }

        if (resp?.path) {
          logger.info(`壁纸保存成功: ${resp.path}, ${(resp.bytes / 1024).toFixed(1)}KB`);
          return {
            wallpaper: {
              path: resp.path,
              name: wallpaperState.fileName || '',
              zoom: wallpaperState.zoom,
              rotate: wallpaperState.rotate,
              offsetX: wallpaperState.offsetX,
              offsetY: wallpaperState.offsetY,
              width: wallpaperState.width,
              height: wallpaperState.height,
              updatedAt: Date.now(),
            },
          };
        }
      } catch (err) {
        const message = String(err?.message || err || '').trim();
        logger.warn('保存壁纸失败', err);
        window.toastr?.warning?.(`壁纸保存失败: ${message || '未知错误'}`);
      }
      if (!wallpaperState.saveOriginal) {
        window.toastr?.warning?.('壁纸保存失败，当前壁纸仅本次有效');
      }
      return {
        wallpaper: {
          url: wallpaperState.fileDataUrl,
          name: wallpaperState.fileName || '',
          zoom: wallpaperState.zoom,
          rotate: wallpaperState.rotate,
          offsetX: wallpaperState.offsetX,
          offsetY: wallpaperState.offsetY,
          width: wallpaperState.width,
          height: wallpaperState.height,
          updatedAt: Date.now(),
          transient: true,
        },
      };
    }
    if (existing) {
      if (!wallpaperState.dirtyTransform) return { wallpaper: existing };
      return {
        wallpaper: {
          ...existing,
          zoom: wallpaperState.zoom,
          rotate: wallpaperState.rotate,
          offsetX: wallpaperState.offsetX,
          offsetY: wallpaperState.offsetY,
          width: wallpaperState.width || existing.width,
          height: wallpaperState.height || existing.height,
          updatedAt: Date.now(),
        },
      };
    }
    return {};
  };

  const getChatSettingScope = () => {
    const picked = chatSettingScopeRadios.find(r => r.checked);
    const value = String(picked?.value || 'current').trim();
    return value === 'all' ? 'all' : 'current';
  };

  const setChatSettingScope = (value = 'current') => {
    const target = value === 'all' ? 'all' : 'current';
    chatSettingScopeRadios.forEach(radio => {
      radio.checked = radio.value === target;
    });
  };

  function openChatSettings() {
    const sessionId = chatStore.getCurrent();
    syncWallpaperPreviewAspect();
    loadChatSettings(sessionId);
    chatSettingsOverlay.style.display = 'block';
    chatSettingsModal.style.display = 'block';
    requestAnimationFrame(() => applyWallpaperPreviewTransform());
    hideMenus();
  }

  function closeChatSettings() {
    chatSettingsOverlay.style.display = 'none';
    chatSettingsModal.style.display = 'none';
  }

  function loadChatSettings(sessionId) {
    const raw = chatStore.getSessionSettings(sessionId) || {};
    const settings = normalizeChatSettings(raw);
    setChatSettingScope('current');
    bubbleColorInput.value = settings.bubbleColor;
    bubbleColorPicker.value = settings.bubbleColor;
    textColorInput.value = settings.textColor;
    textColorPicker.value = settings.textColor;
    updatePreview(settings.bubbleColor, settings.textColor);
    loadWallpaperEditor(sessionId, settings);
  }

  async function saveChatSettings() {
    const sessionId = chatStore.getCurrent();
    const scope = getChatSettingScope();
    const base = normalizeChatSettings(chatStore.getSessionSettings(sessionId) || {});
    const settings = {
      ...base,
      bubbleColor: bubbleColorInput.value,
      textColor: textColorInput.value,
    };

    const wallpaperResult = await persistWallpaperIfNeeded(sessionId, base);
    if (wallpaperResult?.cleared) {
      settings.wallpaper = null;
      delete settings.chatBg;
    } else if (wallpaperResult?.wallpaper) {
      settings.wallpaper = wallpaperResult.wallpaper;
      delete settings.chatBg;
    }

    chatStore.setSessionSettings(sessionId, settings);
    if (scope === 'all') {
      appSettings.update({
        chatDefaultBubbleColor: settings.bubbleColor,
        chatDefaultTextColor: settings.textColor,
      });
      const sessionIds = chatStore.listSessions();
      sessionIds.forEach(sid => {
        if (sid === sessionId) return;
        const existing = normalizeChatSettings(chatStore.getSessionSettings(sid) || {});
        const next = {
          ...existing,
          bubbleColor: settings.bubbleColor,
          textColor: settings.textColor,
        };
        chatStore.setSessionSettings(sid, next);
      });
    }
    applyChatSettings(sessionId, settings);
    window.toastr?.success('设置已保存');
    closeChatSettings();
  }

  function updatePreview(bubbleColor, textColor) {
    chatSettingPreview.style.backgroundColor = bubbleColor;
    const span = chatSettingPreview.querySelector('span');
    if (span) span.style.color = textColor;
    const previewBubble = wallpaperPreview?.querySelector('.wallpaper-preview-bubble');
    if (previewBubble) {
      previewBubble.style.backgroundColor = bubbleColor;
      previewBubble.style.color = textColor;
    }
  }

  function randomChatSettings() {
    const randomColor = () =>
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
    const bubble = randomColor();
    const text = randomColor();

    bubbleColorInput.value = bubble;
    bubbleColorPicker.value = bubble;
    textColorInput.value = text;
    textColorPicker.value = text;

    updatePreview(bubble, text);
  }

  // Event listeners for chat settings
  closeChatSettingsBtn?.addEventListener('click', closeChatSettings);
  chatSettingsOverlay?.addEventListener('click', closeChatSettings);
  cancelSettingBtn?.addEventListener('click', closeChatSettings);
  saveSettingBtn?.addEventListener('click', () => {
    void saveChatSettings();
  });
  randomSettingBtn?.addEventListener('click', randomChatSettings);
  restoreSettingBtn?.addEventListener('click', () => {
    bubbleColorInput.value = ORIGINAL_CHAT_DEFAULTS.bubbleColor;
    bubbleColorPicker.value = ORIGINAL_CHAT_DEFAULTS.bubbleColor;
    textColorInput.value = ORIGINAL_CHAT_DEFAULTS.textColor;
    textColorPicker.value = ORIGINAL_CHAT_DEFAULTS.textColor;
    updatePreview(ORIGINAL_CHAT_DEFAULTS.bubbleColor, ORIGINAL_CHAT_DEFAULTS.textColor);
  });

  bubbleColorPicker?.addEventListener('input', e => {
    const color = e.target.value;
    bubbleColorInput.value = color;
    updatePreview(color, textColorInput.value);
  });

  bubbleColorInput?.addEventListener('input', e => {
    const color = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      bubbleColorPicker.value = color;
      updatePreview(color, textColorInput.value);
    }
  });

  textColorPicker?.addEventListener('input', e => {
    const color = e.target.value;
    textColorInput.value = color;
    updatePreview(bubbleColorInput.value, color);
  });

  textColorInput?.addEventListener('input', e => {
    const color = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      textColorPicker.value = color;
      updatePreview(bubbleColorInput.value, color);
    }
  });

  chatWallpaperDrop?.addEventListener('click', () => {
    chatWallpaperFile?.click();
  });

  chatWallpaperDrop?.addEventListener('dragover', e => {
    e.preventDefault();
    chatWallpaperDrop.classList.add('is-dragover');
  });

  chatWallpaperDrop?.addEventListener('dragleave', () => {
    chatWallpaperDrop.classList.remove('is-dragover');
  });

  chatWallpaperDrop?.addEventListener('drop', e => {
    e.preventDefault();
    chatWallpaperDrop.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) pickWallpaperFile(file);
  });

  chatWallpaperFile?.addEventListener('change', e => {
    const file = e.target?.files?.[0];
    if (file) pickWallpaperFile(file);
    if (chatWallpaperFile) chatWallpaperFile.value = '';
  });

  wallpaperSaveOriginal?.addEventListener('change', e => {
    wallpaperState.saveOriginal = Boolean(e.target?.checked);
  });

  wallpaperPreview?.addEventListener('pointerdown', handleWallpaperDragStart);
  wallpaperPreview?.addEventListener('pointermove', handleWallpaperDragMove);
  wallpaperPreview?.addEventListener('pointerup', handleWallpaperDragEnd);
  wallpaperPreview?.addEventListener('pointerleave', handleWallpaperDragEnd);

  wallpaperZoomInput?.addEventListener('input', e => {
    wallpaperState.zoom = Number(e.target?.value || 1);
    markWallpaperDirty();
    applyWallpaperPreviewTransform();
  });

  wallpaperRotateInput?.addEventListener('input', e => {
    wallpaperState.rotate = Number(e.target?.value || 0);
    markWallpaperDirty();
    applyWallpaperPreviewTransform();
  });

  wallpaperFitBtn?.addEventListener('click', () => {
    wallpaperState.zoom = 1;
    wallpaperState.rotate = 0;
    wallpaperState.offsetX = 0;
    wallpaperState.offsetY = 0;
    markWallpaperDirty();
    updateWallpaperControls();
  });

  wallpaperResetBtn?.addEventListener('click', () => {
    restoreWallpaperInitial();
  });

  wallpaperClearBtn?.addEventListener('click', () => {
    clearWallpaperSelection();
  });

  const wallpaperActivityHandler = () => {
    registerWallpaperActivity();
  };

  document.addEventListener('pointerdown', wallpaperActivityHandler, { passive: true });
  document.addEventListener('mousemove', wallpaperActivityHandler, { passive: true });
  document.addEventListener('touchstart', wallpaperActivityHandler, { passive: true });
  document.addEventListener('wheel', wallpaperActivityHandler, { passive: true });
  document.addEventListener('keydown', () => {
    registerWallpaperActivity({ force: true });
  });

  // Load settings for current session on startup
  try {
    const sessionId = chatStore.getCurrent();
    const settings = normalizeChatSettings(chatStore.getSessionSettings(sessionId) || {});
    if (settings) {
      applyChatSettings(sessionId, settings);
    }
  } catch (error) {
    logger.warn('加载会话设置失败', error);
  }

  chatSettingsReady = true;
  if (pendingChatSettingsSessionId) {
    try {
      const sid = pendingChatSettingsSessionId;
      pendingChatSettingsSessionId = '';
      const settings = normalizeChatSettings(chatStore.getSessionSettings(sid) || {});
      applyChatSettings(sid, settings);
    } catch (err) {
      logger.warn('应用延迟聊天设置失败', err);
    }
  }

  logger.info('✅ Chat UI 初始化完成');
};

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(err => reportFatalError(err, 'App init failed'));
});
