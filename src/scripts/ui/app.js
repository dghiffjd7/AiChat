import { LLMClient } from '../api/client.js';
import { isDeepSeekApiRequest } from '../api/providers/deepseek-compat.js';
import { extractTableEditBlocks, stripTableEditBlocks } from '../memory/memory-edit-parser.js';
import { isSummaryTableId, normalizeMemoryUpdateMode } from '../memory/memory-prompt-utils.js';
import {
  buildMemoryTimelineLabel,
  computeNextMemoryRowSortOrder,
  extractMemoryTimelineRound,
  getMemoryRowSortOrder,
  isTimelineMemoryTableId,
  sortMemoryRowsForSnapshot,
} from '../memory/memory-row-order.js';
import { getMemoryContextType, resolveMemorySessionMode, tableMatchesMemoryContext } from '../memory/memory-context-utils.js';
import { appSettings } from '../storage/app-settings.js';
import { renderTemplateTextAsync, templateSettings } from '../plugins/template-engine.js';
import { ScriptRuntime } from '../plugins/script-runtime.js';
import { ChatStore } from '../storage/chat-store.js';
import { ConfigManager } from '../storage/config.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { GroupStore } from '../storage/group-store.js';
import { MemoryTableStore } from '../storage/memory-table-store.js';
import { MemorySnapshotStore } from '../storage/memory-snapshot-store.js';
import { MemoryTemplateStore } from '../storage/memory-template-store.js';
import { MomentSummaryStore } from '../storage/moment-summary-store.js';
import { MomentsStore } from '../storage/moments-store.js';
import { PersonaStore } from '../storage/persona-store.js';
import { PluginStore } from '../storage/plugin-store.js';
import { RpSessionStore } from '../storage/rp-session-store.js';
import { TurnCheckpointStore, collectCheckpointSnapshotIds } from '../storage/turn-checkpoint-store.js';
import { UserStore } from '../storage/user-store.js';
import { stickerPackStore } from '../storage/sticker-pack-store.js';
import { normalizeScopeId } from '../storage/store-scope.js';
import { avatarDataUrlFromFile, compressImageDataUrl, isGifFile } from '../utils/image.js';
import { getCharacterCardBoundUserId as readCharacterCardBoundUserId, getCharacterCardDisplayName, getCharacterCardSource } from '../utils/character-card-display.js';
import { logger } from '../utils/logger.js';
import { buildNameWithBadgesHtml, escapeHtml, getContactBadges } from '../utils/name-badges.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { normalizeCharacterCard } from '../utils/character-card.js';
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
import { CreativeStreamProcessor } from './chat/creative-stream-processor.js';
import { DialogueStreamParser } from './chat/dialogue-stream-parser.js';
import {
  SELF_REACTION_ACTOR,
  buildReplyTargetSnapshot,
  getMessagePreviewText,
  normalizeReplyTarget,
  normalizeReactionEntries,
  toggleReactionActor,
} from './chat/message-interaction-utils.js';
import { parseSpecialMessage } from './chat/message-parser.js';
import { runCommand, getCommandList } from './command-runner.js';
import { ConfigPanel } from './config-panel.js';
import { ContactDragManager } from './contact-drag-manager.js';
import { ContactGroupRenderer } from './contact-group-renderer.js';
import { ScriptPanel } from './script-panel.js';
import { ContactSettingsPanel } from './contact-settings-panel.js';
import { ExtensionsPanel } from './extensions-panel.js';
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
import { SessionConfigPanel } from './session-config-panel.js';
import { SessionPanel } from './session-panel.js';
import { StickerPicker } from './sticker-picker.js';
import { UserPanel } from './user-panel.js';
import { VariablePanel } from './variable-panel.js';
import {
  buildVariableContext,
  decodeJsonPointer,
  deleteValueAtPath,
  getValueAtPath,
  normalizeVariablePathInput,
  normalizeVariablePathParts,
  resolveExistingVariablePath,
  setValueAtPath,
  stripKnownVariableRootPrefix,
  toVariablePath,
} from '../variables/variable-path-utils.js';
import { VariableRuleEngine } from '../variables/variable-rule-engine.js';
import { StageManager } from '../variables/stage-manager.js';
import { StageTimeline } from './stage-timeline.js';
import { WorldPanel } from './world-panel.js';
import { WorldInfoIndicator } from './worldinfo-indicator.js';
import { buildRoleWorldBindingsImpl } from './world-role-binding-utils.js';
import { appConfirm, appChoice } from './app-confirm.js';
import { PluginRuntime } from '../plugins/plugin-runtime.js';
import { themeManager } from './theme-manager.js';
import { getDefaultAppIcon } from '../utils/default-icon.js';

let appRuntimeReady = false;
let lastRuntimeNoticeKey = '';
let lastRuntimeNoticeAt = 0;

if (window.toastr) {
  const _origToastr = { error: window.toastr.error, warning: window.toastr.warning, success: window.toastr.success, info: window.toastr.info };
  const _guard = (fn) => function (...args) {
    if (appSettings.get().toastEnabled === false) return;
    return fn.apply(this, args);
  };
  window.toastr.error = _guard(_origToastr.error);
  window.toastr.warning = _guard(_origToastr.warning);
  window.toastr.success = _guard(_origToastr.success);
  window.toastr.info = _guard(_origToastr.info);
}

const getRuntimeErrorMessage = (err) => {
  if (err?.message) return String(err.message);
  return String(err || 'unknown error');
};

const reportFatalError = (err, label = 'App init failed') => {
  try {
    const msg = getRuntimeErrorMessage(err);
    logger.error(label, msg, err);
    let overlay = document.getElementById('chatapp-fatal-error-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'chatapp-fatal-error-overlay';
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
      document.body.appendChild(overlay);
    }
    overlay.textContent = `${label}: ${msg}`;
  } catch {}
};

const reportRuntimeToast = (err, label = 'Runtime error') => {
  try {
    const msg = getRuntimeErrorMessage(err);
    logger.error(label, msg, err);
    const noticeKey = `${label}::${msg}`;
    const now = Date.now();
    if (noticeKey === lastRuntimeNoticeKey && (now - lastRuntimeNoticeAt) < 4000) return;
    lastRuntimeNoticeKey = noticeKey;
    lastRuntimeNoticeAt = now;
    if (window.toastr?.error) {
      window.toastr.error(msg, label);
      return;
    }
    let banner = document.getElementById('chatapp-runtime-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'chatapp-runtime-error-banner';
      banner.style.cssText = `
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 18px;
        z-index: 39999;
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(15,23,42,0.94);
        color: #f8fafc;
        border: 1px solid rgba(248,250,252,0.14);
        box-shadow: 0 12px 30px rgba(15,23,42,0.28);
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      `;
      document.body.appendChild(banner);
    }
    banner.textContent = `${label}: ${msg}`;
    clearTimeout(window.__chatappRuntimeBannerTimer);
    window.__chatappRuntimeBannerTimer = setTimeout(() => {
      try { banner?.remove(); } catch {}
    }, 6000);
  } catch {}
};

const reportGlobalRuntimeIssue = (err, label = 'Runtime error') => {
  if (appRuntimeReady) {
    reportRuntimeToast(err, label);
    return;
  }
  reportFatalError(err, label);
};

try {
  localStorage.removeItem('chatapp_renderer_lifecycle_v1');
  localStorage.removeItem('chatapp_rich_script_guard_v1');
} catch {}

const isIgnorableRuntimeNoise = (value = '') => {
  const msg = String(value || '');
  if (!msg) return false;
  return /resizeobserver loop (limit exceeded|completed with (?:undelivered|delivered) notifications)/i.test(msg);
};

window.addEventListener('error', (event) => {
  if (!event) return;
  const msg = String(event?.message || event?.error?.message || event?.error || '');
  if (isIgnorableRuntimeNoise(msg)) return;
  reportGlobalRuntimeIssue(event.error || event.message || 'unknown error', 'Runtime error');
});

window.addEventListener('unhandledrejection', (event) => {
  if (!event) return;
  const msg = String(event?.reason?.message || event?.reason || '');
  if (isIgnorableRuntimeNoise(msg)) return;
  reportGlobalRuntimeIssue(event.reason || 'unhandled rejection', 'Unhandled rejection');
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
  const isMemoryEnabled = () => appSettings.get().memoryEnabled !== false;
  const getMemoryStorageMode = () => {
    if (!isMemoryEnabled()) return 'off';
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
  let stageManager = null;
  let stageTimeline = null;
  const configPanel = new ConfigPanel();
  const chatConfigManager = new ConfigManager();
  const imageConfigManager = new ConfigManager({ scope: 'image' });
  const memoryUpdateConfigManager = new ConfigManager();
  const memoryUpdateRunning = new Set();
  const memoryUpdateAbortControllers = new Map();
  const memoryUpdateQueues = new Map();
  const memoryFillSessionCounters = new Map();
  const generalSettingsPanel = new GeneralSettingsPanel();
  const sessionConfigPanel = new SessionConfigPanel();
  const pluginStore = new PluginStore();
  const pluginRuntime =
    typeof Worker === 'undefined' ? null : new PluginRuntime(pluginStore);
  const scriptStore = window.appBridge?.scriptStore || null;
  const scriptRuntime =
    typeof Worker === 'undefined' || !scriptStore ? null : new ScriptRuntime(scriptStore);
  const pluginUiManager = new PluginUiManager();
  const templatePromptedSessions = new Set();
  const scriptPromptedSessions = new Set();
  if (!pluginRuntime) {
    logger.warn('plugin runtime disabled (Worker unsupported)');
  }
  if (!scriptRuntime) {
    logger.warn('script runtime disabled (Worker unsupported or store missing)');
  }
  const presetPanel = new PresetPanel();
  const regexPanel = new RegexPanel();
  const pluginPanel = new PluginPanel({ store: pluginStore, runtime: pluginRuntime });
  const chatStore = new ChatStore();
  window.appBridge.setChatStore(chatStore);
  const variableRuleEngine = new VariableRuleEngine({ chatStore, appBridge: window.appBridge });
  window.appBridge.variableRuleEngine = variableRuleEngine;
  window.appBridge.runVariableRules = (sessionId, ruleId) => variableRuleEngine.runManual(sessionId, ruleId);
  stageManager = new StageManager({ chatStore, appBridge: window.appBridge });
  window.appBridge.stageManager = stageManager;
  const promptInjectionQueue = new Map();
  const normalizePromptBlock = (input = {}) => {
    const raw = String(input?.content ?? input?.prompt ?? '').trim();
    if (!raw) return null;
    const roleRaw = String(input?.role || 'system').trim().toLowerCase();
    const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
    const position = String(input?.position || '').trim();
    return { content: raw, role, position };
  };
  const queuePromptInjection = (sessionId, block) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    if (!sid) return false;
    const normalized = normalizePromptBlock(block);
    if (!normalized) return false;
    const list = promptInjectionQueue.get(sid) || [];
    list.push(normalized);
    promptInjectionQueue.set(sid, list);
    return true;
  };
  const peekPromptInjections = (sessionId) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    if (!sid) return [];
    const list = promptInjectionQueue.get(sid) || [];
    return list.slice();
  };
  const consumePromptInjections = (sessionId) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    if (!sid) return [];
    const list = promptInjectionQueue.get(sid) || [];
    promptInjectionQueue.delete(sid);
    return list.slice();
  };
  window.appBridge.queuePromptInjection = queuePromptInjection;
  window.appBridge.peekPromptInjections = peekPromptInjections;
  window.appBridge.consumePromptInjections = consumePromptInjections;
  window.appBridge.notify = (message, level = 'info') => {
    const text = String(message || '').trim();
    if (!text) return false;
    const style = String(level || 'info').trim().toLowerCase();
    const fn = window?.toastr?.[style] || window?.toastr?.info;
    fn?.(text);
    return true;
  };
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
      if (scriptRuntime) {
        scriptRuntime.dispatchEvent('variable.changed', {
          name: String(name || ''),
          oldValue,
          newValue,
          sessionId: sid || null,
          scope,
        }).catch(err => logger.warn('script variable.changed failed', err));
      }
      try {
        window.dispatchEvent(new CustomEvent('chatapp-variable-changed', {
          detail: { name: String(name || ''), oldValue, newValue, sessionId: sid || null, scope },
        }));
      } catch {}
    };
    const emitVariableSchemaChanged = (name, sessionId) => {
      const sid = String(sessionId || chatStore.getCurrent() || '').trim();
      if (!sid) return;
      try {
        window.dispatchEvent(new CustomEvent('chatapp-variable-schema-changed', {
          detail: { name: String(name || ''), sessionId: sid },
        }));
      } catch {}
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
        if (ok) emitVariableSchemaChanged(name, sid);
        return ok;
      };
    }
    if (typeof chatStore.deleteVariableSchema === 'function') {
      const originalDeleteVariableSchema = chatStore.deleteVariableSchema.bind(chatStore);
      chatStore.deleteVariableSchema = (key, id = chatStore.getCurrent()) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const name = String(key || '').trim();
        const ok = originalDeleteVariableSchema(name, sid);
        if (ok) emitVariableSchemaChanged(name, sid);
        return ok;
      };
    }
    if (typeof chatStore.clearVariableSchemas === 'function') {
      const originalClearVariableSchemas = chatStore.clearVariableSchemas.bind(chatStore);
      chatStore.clearVariableSchemas = (id = chatStore.getCurrent()) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const ok = originalClearVariableSchemas(sid);
        if (ok) emitVariableSchemaChanged('', sid);
        return ok;
      };
    }
    const emitStageSchemaChanged = (sessionId) => {
      const sid = String(sessionId || chatStore.getCurrent() || '').trim();
      if (!sid) return;
      try {
        window.dispatchEvent(new CustomEvent('chatapp-stage-schema-changed', {
          detail: { sessionId: sid },
        }));
      } catch {}
    };
    if (typeof chatStore.setStageSchema === 'function') {
      const originalSetStageSchema = chatStore.setStageSchema.bind(chatStore);
      chatStore.setStageSchema = (schema, id = chatStore.getCurrent()) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const ok = originalSetStageSchema(schema, sid);
        if (ok) emitStageSchemaChanged(sid);
        return ok;
      };
    }
    if (typeof chatStore.clearStageSchema === 'function') {
      const originalClearStageSchema = chatStore.clearStageSchema.bind(chatStore);
      chatStore.clearStageSchema = (id = chatStore.getCurrent()) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const ok = originalClearStageSchema(sid);
        if (ok) emitStageSchemaChanged(sid);
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
  if (scriptRuntime) {
    scriptRuntime.setContext({ bridge: window.appBridge, chatStore, contactsStore, presets: window.appBridge?.presets });
    window.appBridge.setScriptRuntime?.(scriptRuntime);
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
  const memorySnapshotStore = new MemorySnapshotStore();
  try {
    window.appBridge.memorySnapshotStore = memorySnapshotStore;
  } catch {}
  const memoryTemplateStore = new MemoryTemplateStore();
  try {
    window.appBridge.setMemoryTemplateStore?.(memoryTemplateStore);
  } catch {}
  const turnCheckpointStore = new TurnCheckpointStore();
  try {
    window.appBridge.turnCheckpointStore = turnCheckpointStore;
  } catch {}
  const memoryTemplatePanel = new MemoryTemplatePanel({
    templateStore: memoryTemplateStore,
    memoryStore: memoryTableStore,
  });
  const personaStore = new PersonaStore();
  const userStore = new UserStore();
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
  const scriptPanel = new ScriptPanel({ store: scriptStore, personaStore, presetStore: window.appBridge?.presets });
  presetPanel.setRuntimeContext({
    chatStore,
    contactsStore,
    personaStore,
    getUiMode: () => (uiMode === 'rp' ? 'rp' : 'chat'),
  });
  sessionConfigPanel.setRuntimeContext({
    chatStore,
    contactsStore,
    personaStore,
    getUiMode: () => (uiMode === 'rp' ? 'rp' : 'chat'),
  });
  await personaStore.ready;
  await userStore.ready;
  if (userStore.createdFromEmpty) {
    try {
      const currentCard = personaStore.getActive?.() || null;
      const source = getCharacterCardSource(currentCard);
      const nextPatch = {
        description: String(currentCard?.description || ''),
        position: currentCard?.position,
        depth: currentCard?.depth,
        role: currentCard?.role,
        userBubbleColor: currentCard?.userBubbleColor,
      };
      if (source?.type !== 'character_card') {
        nextPatch.name = String(currentCard?.name || '').trim() || '我';
        nextPatch.avatar = String(currentCard?.avatar || '').trim();
      }
      await userStore.update(userStore.getActive?.()?.id || 'default', nextPatch);
    } catch (err) {
      logger.warn('hydrate default user from legacy persona failed', err);
    }
  }
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
      memorySnapshotStore.setScope?.(initialScopeKey),
      turnCheckpointStore.setScope?.(initialScopeKey),
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
  generalSettingsPanel.setExternalActions({
    openSession: () => sessionPanel.show(),
    openMemoryTemplates: () => memoryTemplatePanel.show(),
    openConfig: (options = {}) => configPanel.show({ tab: 'chat', ...(options || {}) }),
  });
  const extensionsPanel = new ExtensionsPanel({
    regexPanel,
    scriptPanel,
    pluginPanel,
  });
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
    user: getDefaultAppIcon(),
    assistant: getDefaultAppIcon(),
  };

  const UI_MODE_KEY = 'chat_ui_mode_v1';
  const LEGACY_SEND_MODE_KEY = 'chat_send_mode_v1';
  let uiMode = 'chat';
  let lastChatState = { activePage: 'chat', sessionId: '', inChatRoom: false };
  const clearLegacySendModeState = () => {
    try {
      localStorage.removeItem(LEGACY_SEND_MODE_KEY);
    } catch {}
    const btn = document.getElementById('send-button');
    if (!btn) return;
    btn.classList.remove('is-creative');
    delete btn.dataset.mode;
  };
  clearLegacySendModeState();
  try {
    window.appBridge.getRpSessionIdForActivePersona = () => getRpSessionId(activePersonaId);
    window.appBridge.getRpSessionIdForSession = (sessionId = '') => {
      const sid = String(sessionId || chatStore.getCurrent() || '').trim();
      return getRpSessionId(getEffectivePersona(sid)?.id || activePersonaId);
    };
    window.appBridge.getActivePersonaId = () => String(activePersonaId || '').trim();
    window.appBridge.getLastChatSessionId = () => String(lastChatState?.sessionId || '').trim();
    window.appBridge.getLastSocialSessionId = () => String(lastChatState?.sessionId || '').trim();
    window.appBridge.getRpCharacterNameForSession = (sessionId = '') => {
      const sid = String(sessionId || getRpSessionId(activePersonaId) || '').trim();
      const persona = getEffectivePersona(sid) || {};
      const source = persona?.source && typeof persona.source === 'object' ? persona.source : {};
      const sourceName = String(source?.characterName || source?.cardName || '').trim();
      if (source?.type === 'character_card' && sourceName) return sourceName;
      return String(persona?.name || '').trim() || '角色';
    };
  } catch {}
  try {
    sessionPanel.getChatSessionId = () => String(lastChatState?.sessionId || '').trim();
    sessionPanel.getSocialSessionId = sessionPanel.getChatSessionId;
  } catch {}
  const loadUiMode = () => {
    try {
      const raw = localStorage.getItem(UI_MODE_KEY);
      return raw === 'rp' ? 'rp' : 'chat';
    } catch {
      return 'chat';
    }
  };
  const persistUiMode = () => {
    try {
      localStorage.setItem(UI_MODE_KEY, uiMode);
    } catch {}
  };

  const getActiveUserProfile = () => userStore.getActive?.() || { id: 'default', name: '我', avatar: '', description: '' };
  const getActiveUserName = () => String(getActiveUserProfile()?.name || '').trim() || '我';
  const getActiveUserAvatar = () => String(getActiveUserProfile()?.avatar || '').trim() || getDefaultAppIcon();
  const getCharacterCardName = (card = null, fallback = '角色') => getCharacterCardDisplayName(card, fallback);
  const getBoundUserIdForCharacterCard = (card = null) => readCharacterCardBoundUserId(card);

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
  const syncBoundUserForCharacterCard = async (card = personaStore.getActive?.()) => {
    const userId = String(getBoundUserIdForCharacterCard(card) || '').trim();
    if (!userId) return false;
    if (String(userStore.getActive?.()?.id || '') === userId) return true;
    const ok = await userStore.setActive(userId);
    if (ok) syncUserPersonaUI(chatStore.getCurrent());
    return ok;
  };
  const buildRoleWorldBindingsForSession = (sessionId = chatStore.getCurrent(), options = {}) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    const activePersona = personaStore.getActive?.() || null;
    const effectivePersona = sid ? getEffectivePersona(sid) : activePersona;
    return buildRoleWorldBindingsImpl({
      personas: personaStore.getAll?.() || [],
      activePersonaId: activePersona?.id || '',
      effectivePersonaId: effectivePersona?.id || activePersona?.id || '',
      includeAll: options?.includeAll === true,
      includeEmpty: options?.includeEmpty === true,
    });
  };
  const emitRoleWorldBindingsChanged = (detail = {}) => {
    try {
      window.appBridge?.syncWorldRegexBindings?.();
    } catch {}
    try {
      window.appBridge?.emitWorldInfoChanged?.({ roleWorldChanged: true, ...(detail || {}) });
    } catch {}
  };
  const updatePersonaRoleWorldBinding = async (personaId, { worldbookId, worldbookEnabled } = {}) => {
    const pid = String(personaId || '').trim();
    if (!pid) return false;
    const persona = personaStore.get(pid);
    if (!persona) return false;
    const source = persona?.source && typeof persona.source === 'object' ? { ...persona.source } : {};
    if (worldbookId !== undefined) source.worldbookId = String(worldbookId || '').trim();
    if (worldbookEnabled !== undefined) source.worldbookEnabled = Boolean(worldbookEnabled);
    if (!String(source.worldbookId || '').trim()) {
      source.worldbookId = '';
      if (worldbookEnabled === undefined) source.worldbookEnabled = true;
    }
    await personaStore.update(pid, { source });
    emitRoleWorldBindingsChanged({ personaId: pid, worldbookId: String(source.worldbookId || '').trim() });
    return true;
  };
  try {
    if (window.appBridge) {
      window.appBridge.setRoleWorldResolver?.((sessionId, options = {}) => buildRoleWorldBindingsForSession(sessionId, options));
      window.appBridge.assignRoleWorldToPersona = async (personaId, worldId, { enabled = true } = {}) => {
        return updatePersonaRoleWorldBinding(personaId, {
          worldbookId: worldId,
          worldbookEnabled: enabled,
        });
      };
      window.appBridge.clearRoleWorldForPersona = async (personaId) => {
        return updatePersonaRoleWorldBinding(personaId, {
          worldbookId: '',
          worldbookEnabled: true,
        });
      };
      window.appBridge.setRoleWorldEnabled = async (personaId, enabled) => {
        return updatePersonaRoleWorldBinding(personaId, {
          worldbookEnabled: enabled !== false,
        });
      };
      window.appBridge.setWorldLifecycleHandler?.(async (event = {}) => {
        const type = String(event?.type || '').trim();
        const from = String(event?.from || '').trim();
        const to = String(event?.to || '').trim();
        const targetWorldId = String(event?.worldId || '').trim();
        const personas = personaStore.getAll?.() || [];
        let changed = false;
        for (const persona of personas) {
          const pid = String(persona?.id || '').trim();
          const source = persona?.source && typeof persona.source === 'object' ? { ...persona.source } : null;
          const currentWorldId = String(source?.worldbookId || '').trim();
          if (!pid || !source || !currentWorldId) continue;
          if (type === 'rename' && currentWorldId === from && to) {
            source.worldbookId = to;
            await personaStore.update(pid, { source });
            changed = true;
            continue;
          }
          if (type === 'delete' && currentWorldId === targetWorldId) {
            source.worldbookId = '';
            source.worldbookEnabled = true;
            await personaStore.update(pid, { source });
            changed = true;
          }
        }
        if (changed) emitRoleWorldBindingsChanged({ lifecycleType: type });
        return changed;
      });
    }
  } catch {}
  if (scriptRuntime) {
    scriptRuntime.setContext({ getEffectivePersona });
    scriptRuntime.syncContext?.().catch(() => {});
  }

  const isSharedVariableSession = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    if (isRpSessionId(sid)) return false;
    const settings = chatStore.getSessionSettings?.(sid) || {};
    if (typeof settings.sharedVariables === 'boolean') return settings.sharedVariables;
    return false;
  };

  const isSharedMemorySession = (_sessionId = chatStore.getCurrent()) => {
    // Legacy compatibility only: session memory no longer promotes contact tables into persona-global scope.
    return false;
  };
  try {
    if (window.appBridge) {
      window.appBridge.isSharedVariableSession = isSharedVariableSession;
      window.appBridge.isSharedMemorySession = isSharedMemorySession;
    }
  } catch {}

  const buildMvuVarsPayload = (sessionId, { useGlobal } = {}) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    if (!sid) return null;
    const localVars = chatStore.listVariables?.(sid) || {};
    const globalVars = chatStore.listGlobalVariables?.() || {};
    const shared = typeof useGlobal === 'boolean' ? useGlobal : isSharedVariableSession(sid);
    const baseVars = shared ? globalVars : localVars;
    return buildVariableContext({ baseVars, globalVars, localVars }).variableContext;
  };

  const shouldEmitMvuEvent = (name) => Boolean(scriptRuntime?.hasListener?.(name));

  const emitMvuEvent = (eventName, payload) => {
    if (!scriptRuntime) return;
    scriptRuntime.dispatchEvent(eventName, payload, { allowMutate: false })
      .catch(err => logger.warn('script mvu event failed', eventName, err));
  };

  const emitMvuInitialized = (sessionId, messageIndex = 0, { useGlobal } = {}) => {
    if (!shouldEmitMvuEvent('mag_variable_initialized')) return false;
    const vars = buildMvuVarsPayload(sessionId, { useGlobal });
    if (!vars) return false;
    const scope = useGlobal ? 'global' : 'chat';
    emitMvuEvent('mag_variable_initialized', { scope, variables: vars, args: [vars, messageIndex] });
    return true;
  };

  const emitMvuUpdateStarted = (sessionId, updates, { useGlobal } = {}) => {
    if (!shouldEmitMvuEvent('mag_variable_update_started')) return false;
    const scope = useGlobal ? 'global' : 'chat';
    const payload = { scope, updates: updates || {} };
    emitMvuEvent('mag_variable_update_started', { ...payload, args: [payload] });
    return true;
  };

  const emitMvuUpdateEnded = (sessionId, { useGlobal } = {}) => {
    const vars = buildMvuVarsPayload(sessionId, { useGlobal });
    if (!vars) return false;
    const scope = useGlobal ? 'global' : 'chat';
    const payload = { scope, variables: vars };
    if (shouldEmitMvuEvent('mag_variable_update_ended')) {
      emitMvuEvent('mag_variable_update_ended', { ...payload, args: [vars] });
    }
    if (shouldEmitMvuEvent('mag_variable_update_ended_for_zod')) {
      emitMvuEvent('mag_variable_update_ended_for_zod', { ...payload, args: [vars] });
    }
    return true;
  };

  const applyMvuSchemaDefaults = (sessionId, { reason = '' } = {}) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    if (!sid) return false;
    const schemas = chatStore.listVariableSchemas?.(sid) || {};
    const keys = Object.keys(schemas);
    if (!keys.length) return false;
    const useGlobal = isSharedVariableSession(sid);
    const vars = useGlobal ? (chatStore.listGlobalVariables?.() || {}) : (chatStore.listVariables?.(sid) || {});
    const hasNestedValue = (key) => getValueAtPath(vars, key) !== undefined;
    const updates = {};
    keys.forEach((name) => {
      const key = String(name || '').trim();
      if (!key) return;
      const schema = schemas[key];
      if (!schema || schema.default === undefined) return;
      if (hasNestedValue(key)) return;
      updates[key] = schema.default;
    });
    const updateKeys = Object.keys(updates);
    if (!updateKeys.length) return false;
    updateKeys.forEach((key) => {
      const value = updates[key];
      if (useGlobal) {
        chatStore.setGlobalVariable?.(key, value);
      } else {
        chatStore.setVariable?.(key, value, sid);
        if (chatStore.getInitialVariable?.(key, sid) === undefined) {
          chatStore.setInitialVariable?.(key, value, sid);
        }
      }
    });
    emitMvuInitialized(sid, 0, { useGlobal });
    if (reason) {
      logger.info(`[MVU] defaults applied=${updateKeys.length} reason=${reason} session=${sid}`);
    }
    return true;
  };

  const DEFAULT_USER_BUBBLE_COLOR = '#E8F0FE';

  const normalizeHexColor = (value, fallback) => {
    const raw = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(raw) ? raw : fallback;
  };

  const hashPersonaToken = (input = '') => {
    const raw = String(input || '').trim() || 'default';
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 131 + raw.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
  };

  const getPersonaAccent = (persona = null) => {
    const token = String(persona?.id || persona?.name || 'default').trim() || 'default';
    const hash = hashPersonaToken(token);
    const hue = hash % 360;
    const saturation = 72;
    const lightness = 48;
    return {
      color: `hsl(${hue} ${saturation}% ${lightness}%)`,
      soft: `hsl(${hue} ${saturation}% ${lightness}% / 0.14)`,
    };
  };

  const getUserBubbleColor = (sessionId = chatStore.getCurrent()) => {
    const user = getActiveUserProfile();
    return normalizeHexColor(user?.userBubbleColor, DEFAULT_USER_BUBBLE_COLOR);
  };

  const applyUserBubbleColor = (sessionId = chatStore.getCurrent()) => {
    if (!chatRoom) return;
    const currentId = String(chatStore.getCurrent() || '');
    const sid = String(sessionId || '');
    if (!sid || sid !== currentId) return;
    chatRoom.style.setProperty('--chat-user-bubble-color', getUserBubbleColor(sessionId));
  };

  const syncUserPersonaUI = (sessionId = chatStore.getCurrent()) => {
    const user = getActiveUserProfile();
    const url = getActiveUserAvatar();
    const name = getActiveUserName();
    const accent = getPersonaAccent(user);
    avatars.user = url;
    document.querySelectorAll('.user-avatar-btn').forEach(btn => {
      btn.dataset.personaAccent = '1';
      btn.style.setProperty('--persona-accent', accent.color);
      btn.style.setProperty('--persona-accent-soft', accent.soft);
      btn.title = `当前用户：${name}`;
      const img = btn.querySelector('img');
      if (img) img.src = url;
    });
    document.querySelectorAll('.user-nickname').forEach(el => {
      el.textContent = name;
      el.dataset.personaAccent = '1';
      el.style.setProperty('--persona-accent', accent.color);
      el.style.setProperty('--persona-accent-soft', accent.soft);
      el.title = `当前用户：${name}`;
    });
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
      memorySnapshotStore.setScope?.(nextKey),
      turnCheckpointStore.setScope?.(nextKey),
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
    applyMvuSchemaDefaults(sid, { reason: 'persona' });
    const rpSessionId = getRpSessionId(pid);
    if (chatStore.hasSession?.(rpSessionId)) {
      applyMvuSchemaDefaults(rpSessionId, { reason: 'persona_rp' });
    }
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
    if (uiMode === 'rp') {
      refreshRpToolbar(getRpSessionId(pid));
    }
    return true;
  };

  const personaPanel = new PersonaPanel({
    personaStore,
    userStore,
    chatStore,
    contactsStore,
    rpSessionStore,
    getSessionId: () => chatStore.getCurrent(),
    onPersonaChanged: async () => {
      await applyPersonaScope({ personaId: personaStore.getActive?.()?.id });
      await syncBoundUserForCharacterCard(personaStore.getActive?.());
      syncUserPersonaUI(chatStore.getCurrent());
      refreshChatAndContacts();
    },
  });
  const userPanel = new UserPanel({
    userStore,
    personaStore,
    onUserChanged: async (detail = {}) => {
      if (detail?.affectsActiveCharacter) {
        await syncBoundUserForCharacterCard(personaStore.getActive?.());
      }
      syncUserPersonaUI(chatStore.getCurrent());
      refreshChatAndContacts();
    },
  });
  const switchPersona = async (personaIdOrName) => {
    const raw = String(personaIdOrName || '').trim();
    if (!raw) return false;
    let target = personaStore.get(raw);
    if (!target) {
      const list = personaStore.getAll?.() || [];
      const lower = raw.toLowerCase();
      target = list.find(p => String(p?.name || '').trim().toLowerCase() === lower);
    }
    if (!target) return false;
    if (String(personaStore.getActive?.()?.id || '') === String(target.id || '')) {
      await syncBoundUserForCharacterCard(target);
      syncUserPersonaUI(chatStore.getCurrent());
      return true;
    }
    const ok = await personaStore.setActive(target.id);
    if (!ok) return false;
    await applyPersonaScope({ personaId: target.id });
    await syncBoundUserForCharacterCard(target);
    syncUserPersonaUI(chatStore.getCurrent());
    refreshChatAndContacts();
    return true;
  };
  window.appBridge.switchPersona = switchPersona;
  const switchUserProfile = async (userIdOrName) => {
    const raw = String(userIdOrName || '').trim();
    if (!raw) return false;
    let target = userStore.get(raw);
    if (!target) {
      const list = userStore.getAll?.() || [];
      const lower = raw.toLowerCase();
      target = list.find(user => String(user?.name || '').trim().toLowerCase() === lower);
    }
    if (!target) return false;
    if (String(userStore.getActive?.()?.id || '') === String(target.id || '')) return true;
    const ok = await userStore.setActive(target.id);
    if (!ok) return false;
    syncUserPersonaUI(chatStore.getCurrent());
    refreshChatAndContacts();
    return true;
  };
  window.appBridge.switchUserProfile = switchUserProfile;
  // Initial sync
  await syncBoundUserForCharacterCard(personaStore.getActive?.());
  syncUserPersonaUI(chatStore.getCurrent());

  window.addEventListener('app-settings-changed', async ev => {
    const key = String(ev?.detail?.key || '').trim();
    if (!key) return;
    if (key === 'personaBindContacts') {
      await applyPersonaScope({ personaId: personaStore.getActive?.()?.id, force: true });
      refreshChatAndContacts({ immediate: true });
      return;
    }
    if (key === 'memoryStorageMode' || key === 'memoryEnabled') {
      refreshChatAndContacts({ immediate: true });
    }
    if (key === 'uiThemePresetId') {
      avatars.user = getActiveUserAvatar();
      avatars.assistant = getDefaultAppIcon();
      syncUserPersonaUI();
    }
  });

  const variablePanel = new VariablePanel({
    chatStore,
    getSessionId: () => chatStore.getCurrent(),
    getVariableScope: sid => (isSharedVariableSession(sid) ? 'global' : 'session'),
  });
  const patchDebugUiRegistry = (mutator) => {
    try {
      if (!window.appBridge || typeof mutator !== 'function') return;
      if (!window.appBridge.debugUiRegistry || typeof window.appBridge.debugUiRegistry !== 'object') {
        window.appBridge.debugUiRegistry = { panels: {}, stores: {}, actions: {} };
      }
      const registry = window.appBridge.debugUiRegistry;
      if (!registry.panels || typeof registry.panels !== 'object') registry.panels = {};
      if (!registry.stores || typeof registry.stores !== 'object') registry.stores = {};
      if (!registry.actions || typeof registry.actions !== 'object') registry.actions = {};
      mutator(registry);
    } catch {}
  };
  try {
    patchDebugUiRegistry((registry) => {
      Object.assign(registry, {
        panels: {
          configPanel,
          generalSettingsPanel,
          presetPanel,
          regexPanel,
          pluginPanel,
          memoryTemplatePanel,
          worldPanel,
          scriptPanel,
          sessionPanel,
          regexSessionPanel,
          contactSettingsPanel,
          groupCreatePanel,
          groupSettingsPanel,
          groupPanel,
          personaPanel,
          userPanel,
          variablePanel,
          extensionsPanel,
          stickerPicker,
        },
        stores: {
          chatStore,
          contactsStore,
          memoryTableStore,
          memoryTemplateStore,
          personaStore,
          userStore,
          groupStore,
          rpSessionStore,
          momentSummaryStore,
          pluginStore,
          scriptStore,
        },
        actions: {
          ...(registry.actions || {}),
        },
      });
    });
  } catch {}

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
    userAvatar: userStore.getActive()?.avatar || avatars.user,
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
              return normalizeMomentRecordForStore(
                { ...(mm || {}), ...stats, originSessionId },
                { regexMode: 'output', depth: 0 },
              );
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
            const saved = momentsStore.addComments(
              mid,
              normalizeMomentCommentsForStore(patched, { regexMode: 'output', depth: 0 }),
            );
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
              const userDisplayName = getActiveUserName();
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
        const userProfile = getActiveUserProfile();
        const uName = String(userProfile?.name || '').trim() || '我';
        const ctx = {
          user: {
            name: uName,
            persona: String(userProfile?.description || ''),
            personaPosition: userProfile?.position,
            personaDepth: userProfile?.depth,
            personaRole: userProfile?.role,
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
  patchDebugUiRegistry((registry) => {
    registry.panels.momentSummaryPanel = momentSummaryPanel;
  });

  const formatTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatSearchTime = ts => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
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
  const getEffectivePresetUiMode = () => (uiMode === 'rp' ? 'rp' : 'chat');
  try {
    window.appBridge.getUiModeContext = getEffectivePresetUiMode;
  } catch {}
  const getPresetContext = () => ({
    sessionId: String(chatStore.getCurrent?.() || '').trim(),
    uiMode: getEffectivePresetUiMode(),
  });
  const getOpenAIPreset = () => {
    try {
      return window.appBridge?.presets?.getResolvedActive?.('openai', getPresetContext())?.preset || {};
    } catch {
      return {};
    }
  };
  const canUseDeepSeekPrefixCompletion = () => {
    const cfg = window.appBridge?.config?.get?.() || {};
    if (String(cfg?.provider || '').trim().toLowerCase() === 'custom') return false;
    return isDeepSeekApiRequest({
      provider: cfg?.provider,
      model: cfg?.model,
      baseUrl: cfg?.baseUrl,
    });
  };
  const canUseDeepSeekContinuePrefill = () => {
    const preset = getOpenAIPreset();
    return canUseDeepSeekPrefixCompletion() && preset?.continue_prefill === true;
  };
  const getActiveSwipeBranch = (message) => {
    const swipes = Array.isArray(message?.meta?.swipes) ? message.meta.swipes : null;
    if (!swipes?.length) return null;
    const rawIndex = Math.trunc(Number(message?.meta?.activeSwipe));
    const index = Number.isFinite(rawIndex) ? Math.min(Math.max(0, rawIndex), swipes.length - 1) : swipes.length - 1;
    return swipes[index] || null;
  };
  const getAssistantContinuationSource = (message) => {
    const branch = getActiveSwipeBranch(message);
    const raw = branch?.raw ?? message?.raw ?? message?.rawSource ?? message?.content ?? '';
    return String(raw ?? '');
  };
  const getLastContinuableAssistantMessage = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const messages = chatStore.getMessages(sid) || [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg || msg.role !== 'assistant') continue;
      if (msg.status === 'pending' || msg.status === 'sending') continue;
      return msg;
    }
    return null;
  };
  const getReasoningPreset = () => {
    try {
      return window.appBridge?.presets?.getResolvedActive?.('reasoning', getPresetContext())?.preset || {};
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
  const extractStreamingReasoningFromContent = (content, { depth, final = false } = {}) => {
    const raw = normalizeCreativeLineBreaks(content);
    const parsed = extractReasoningFromContent(raw, { depth, strict: false });
    if (parsed.reasoning || final) return parsed;
    const settings = appSettings.get();
    if (settings.reasoningAutoParse !== true) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const preset = getReasoningPreset();
    const prefix = String(preset?.prefix ?? '');
    const suffix = String(preset?.suffix ?? '');
    if (!prefix || !suffix) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const start = raw.indexOf(prefix);
    if (start < 0) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const bodyStart = start + prefix.length;
    const suffixIndex = raw.indexOf(suffix, bodyStart);
    if (suffixIndex >= 0) {
      return extractReasoningFromContent(raw, { depth, strict: false });
    }
    const reasoningRaw = raw.slice(bodyStart).trim();
    const visible = raw.slice(0, start).replace(/\n{3,}/g, '\n\n').trimEnd();
    if (!reasoningRaw) {
      return { content: visible, reasoning: '', reasoningDisplay: '' };
    }
    const { stored, display } = applyReasoningRegex(reasoningRaw, { depth });
    return {
      content: visible,
      reasoning: stored,
      reasoningDisplay: display,
    };
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

  const normalizeSpeakerName = speakerName =>
    String(speakerName || '')
      .trim()
      .replace(/[：:]/g, '')
      .trim();

  const isSystemSpeakerLabel = speakerName => {
    const raw = normalizeSpeakerName(speakerName);
    if (!raw) return false;
    const key = normalizeLooseName(raw);
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

  const isActiveUserSpeakerName = speakerName => {
    const raw = normalizeSpeakerName(speakerName);
    if (!raw) return false;
    const user = normalizeSpeakerName(getActiveUserName());
    if (!user) return false;
    if (raw === user) return true;
    return normalizeLooseName(raw) === normalizeLooseName(user);
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

  const resolveGroupSpeakerContact = (speakerName, groupSessionId = '', contactHint = null) => {
    try {
      const speaker = String(speakerName || '').trim();
      if (!speaker || isActiveUserSpeakerName(speaker) || isSystemSpeakerLabel(speaker) || speaker === '助手') return null;
      const speakerKey = normalizeLooseName(speaker);
      const sid = String(groupSessionId || '').trim();
      const group = sid ? contactsStore.getContact(sid) : null;
      const memberContacts = Array.isArray(group?.members)
        ? group.members.map(mid => contactsStore.getContact(mid)).filter(Boolean)
        : [];
      const hinted = contactHint && typeof contactHint === 'object' && contactHint.isGroup !== true ? contactHint : null;
      const contact =
        memberContacts.find(c => c && c.isGroup !== true && String(c?.name || c?.id || '').trim() === speaker) ||
        memberContacts.find(c => c && c.isGroup !== true && normalizeLooseName(c?.name || c?.id) === speakerKey) ||
        hinted ||
        (() => {
          const globalMatch = resolveContactByDisplayName(speaker);
          return globalMatch && globalMatch.isGroup !== true ? globalMatch : null;
        })() ||
        (() => {
          const direct = contactsStore.getContact(speaker);
          return direct && direct.isGroup !== true ? direct : null;
        })() ||
        null;
      return contact || null;
    } catch {
      return null;
    }
  };

  const resolveGroupSpeakerAvatar = (speakerName, groupSessionId = '', contactHint = null) => {
    try {
      const speaker = String(speakerName || '').trim();
      if (!speaker || isActiveUserSpeakerName(speaker) || isSystemSpeakerLabel(speaker) || speaker === '助手') return '';
      const contact = resolveGroupSpeakerContact(speaker, groupSessionId, contactHint);
      if (contact) return resolveAvatarForContact(contact.id, contact);
      return resolveAvatarForContact(speaker, {
        id: speaker,
        name: speaker,
        isGroup: false,
        avatar: '',
      });
    } catch {
      return '';
    }
  };

  const resolveGroupSpeakerRenderAvatar = (speakerName, groupSessionId = '', speakerContactId = '') => {
    try {
      const speaker = String(speakerName || '').trim();
      if (!speaker || isActiveUserSpeakerName(speaker) || isSystemSpeakerLabel(speaker) || speaker === '助手') return '';
      const hintedId = String(speakerContactId || '').trim();
      const hinted =
        hintedId && !String(hintedId).startsWith('group:')
          ? contactsStore.getContact(hintedId)
          : null;
      const avatar = resolveGroupSpeakerAvatar(speaker, groupSessionId, hinted);
      if (avatar) return avatar;
      return resolveAvatarForContact(hintedId || speaker, hinted || {
        id: speaker,
        name: speaker,
        isGroup: false,
        avatar: '',
      });
    } catch {
      return '';
    }
  };

  /** 获取群组已读选项 */
  const getGroupReadOptions = (sessionId) => {
    if (!sessionId || !sessionId.startsWith('group:')) return {};
    const group = contactsStore.getContact(sessionId);
    // members 列表不含用户自己，直接使用 length
    const count = Array.isArray(group?.members) ? group.members.length : 0;
    return count > 0 ? { groupMemberCount: count } : {};
  };

  /** AI 回复到达时：快进送达序列（确保已读已显示） */
  const fastForwardDelivery = (sessionId) => {
    ui.fastForwardDeliverySequence(getGroupReadOptions(sessionId));
  };

  /**
   * 启动完整送达时序：✔ 已送出 → 已读 → typing dots
   * 替代直接调用 showTyping，用于每次发送的初始调用
   */
  const startDeliveryAndTyping = (sessionId, avatarUrl) => {
    const typingOpts = getGroupTypingMembers(sessionId) || {};
    const readOpts = getGroupReadOptions(sessionId);
    ui.startDeliverySequence(avatarUrl, typingOpts, readOpts);
  };

  /** 获取群聊成员列表用于多人输入指示器 */
  const getGroupTypingMembers = (sessionId) => {
    if (!sessionId || !sessionId.startsWith('group:')) return null;
    const group = contactsStore.getContact(sessionId);
    if (!group || !Array.isArray(group.members) || group.members.length === 0) return null;
    const members = group.members
      .map(mid => {
        const c = contactsStore.getContact(mid);
        if (!c || c.isGroup) return null;
        const avatar = resolveAvatarForContact(mid, c);
        return { name: c.name || c.id, avatar: avatar || '' };
      })
      .filter(Boolean);
    return members.length > 0 ? { groupMembers: members } : null;
  };

  const summarizeDebugValue = (value, { max = 160 } = {}) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return `[data-url len=${raw.length}]`;
    if (raw.length > max) return `${raw.slice(0, max)}... [len=${raw.length}]`;
    return raw;
  };

  const buildDebugContactSnapshot = (contact, fallbackId = '') => {
    const c = contact && typeof contact === 'object' ? contact : null;
    const id = String(c?.id || fallbackId || '').trim();
    return {
      id,
      name: String(c?.name || id || '').trim(),
      isGroup: Boolean(c?.isGroup) || id.startsWith('group:'),
      avatar: summarizeDebugValue(c?.avatar || ''),
      avatarLen: String(c?.avatar || '').trim().length,
      members: Array.isArray(c?.members) ? c.members.map(v => String(v || '').trim()).filter(Boolean) : [],
      description: summarizeDebugValue(c?.description || '', { max: 120 }),
      updatedAt: Number(c?.updatedAt || 0) || 0,
      addedAt: Number(c?.addedAt || 0) || 0,
    };
  };

  const buildGroupAvatarDebugSnapshot = async (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || chatStore.getCurrent() || '').trim();
    const sessionContact = sid ? contactsStore.getContact(sid) : null;
    const isGroupSession = sid.startsWith('group:') || Boolean(sessionContact?.isGroup);
    const activePersona = personaStore.getActive?.() || null;
    const personas = Array.isArray(personaStore.getAll?.()) ? personaStore.getAll() : [];
    const scopeCandidates = Array.from(
      new Set(
        [
          'default',
          normalizeScopeId(activePersonaScopeKey || ''),
          normalizeScopeId(chatStore.scopeId || ''),
          normalizeScopeId(contactsStore.scopeId || ''),
          normalizeScopeId(groupStore.scopeId || ''),
          ...personas.map(p => normalizeScopeId(getPersonaScopeKey(p?.id) || p?.id || '')),
        ].filter(Boolean),
      ),
    );
    let persistedScopes = [];
    try {
      const payload = await safeInvoke('list_contacts_by_scopes', {
        scopes: scopeCandidates,
        limitPerScope: 400,
      });
      const entries = Array.isArray(payload) ? payload : [];
      persistedScopes = entries.map(entry => {
        const scopeId = String(entry?.scopeId || entry?.scope || '').trim() || 'default';
        const contacts = Array.isArray(entry?.contacts) ? entry.contacts : [];
        const byId = sid ? contacts.find(c => String(c?.id || '').trim() === sid) : null;
        const byName =
          !byId && sessionContact?.name
            ? contacts.find(c => String(c?.name || '').trim() === String(sessionContact?.name || '').trim())
            : null;
        return {
          scopeId,
          contactCount: contacts.length,
          hitById: byId ? buildDebugContactSnapshot(byId, sid) : null,
          hitByName: byName ? buildDebugContactSnapshot(byName, String(byName?.id || '')) : null,
        };
      });
    } catch (err) {
      persistedScopes = [
        {
          scopeId: 'error',
          contactCount: 0,
          error: String(err?.message || err || ''),
        },
      ];
    }

    const currentMembers = Array.isArray(sessionContact?.members) ? sessionContact.members : [];
    const currentGroupMembers = currentMembers.map(memberId => {
      const contact = contactsStore.getContact(memberId);
      return {
        memberId: String(memberId || '').trim(),
        exists: Boolean(contact),
        contact: buildDebugContactSnapshot(contact, memberId),
        renderAvatar: summarizeDebugValue(resolveAvatarForContact(memberId, contact)),
      };
    });

    const messages = sid ? chatStore.getMessages(sid) || [] : [];
    const recentMessages = messages.slice(-12).map((message, index) => {
      const role = String(message?.role || '').trim();
      const name = String(message?.name || '').trim();
      const speakerContactId = String(message?.meta?.speakerContactId || '').trim();
      const speakerContact = speakerContactId ? contactsStore.getContact(speakerContactId) : null;
      const resolvedSpeakerContact =
        isGroupSession && role === 'assistant' ? resolveGroupSpeakerContact(name, sid, speakerContact) : null;
      const resolvedSpeakerAvatar =
        isGroupSession && role === 'assistant' ? resolveGroupSpeakerRenderAvatar(name, sid, speakerContactId) : '';
      return {
        index: messages.length - Math.min(messages.length, 12) + index,
        id: String(message?.id || '').trim(),
        role,
        type: String(message?.type || '').trim() || 'text',
        name,
        content: summarizeDebugValue(message?.content || message?.raw || '', { max: 120 }),
        messageAvatar: summarizeDebugValue(message?.avatar || ''),
        metaSpeakerContactId: speakerContactId,
        resolvedSpeakerContactId: String(resolvedSpeakerContact?.id || '').trim(),
        resolvedSpeakerContactName: String(resolvedSpeakerContact?.name || '').trim(),
        resolvedSpeakerAvatar: summarizeDebugValue(resolvedSpeakerAvatar),
        resolvedFinalAvatar: summarizeDebugValue(resolveAvatarForMessage(message, sid)),
      };
    });

    return {
      at: new Date().toISOString(),
      activePersonaId: String(activePersonaId || '').trim(),
      activePersonaStoreId: String(activePersona?.id || '').trim(),
      activePersonaName: String(activePersona?.name || '').trim(),
      personaBindContacts: appSettings.get().personaBindContacts !== false,
      activePersonaScopeKey: String(activePersonaScopeKey || '').trim() || 'default',
      storeScopes: {
        chat: String(chatStore.scopeId || '').trim() || 'default',
        contacts: String(contactsStore.scopeId || '').trim() || 'default',
        groups: String(groupStore.scopeId || '').trim() || 'default',
        moments: String(momentsStore.scopeId || '').trim() || 'default',
      },
      session: {
        id: sid,
        existsInChatStore: sid ? Boolean(chatStore.hasSession?.(sid)) : false,
        sessionCount: chatStore.listSessions?.().length || 0,
        currentContact: buildDebugContactSnapshot(sessionContact, sid),
        isGroupSession,
      },
      currentGroupMembers,
      persistedScopes,
      recentMessages,
    };
  };

  const resolveAvatarForMessage = (message, sessionId) => {
    try {
      if (!message || typeof message !== 'object') return '';
      if (message.role === 'user') return avatars.user;

      // Group chats: prefer per-speaker avatar when possible.
      const sid = String(sessionId || '').trim();
      const isGroup = sid.startsWith('group:') || Boolean(contactsStore.getContact(sid)?.isGroup);
      if (isGroup && message.role === 'assistant') {
        const speakerContactId = String(message?.meta?.speakerContactId || '').trim();
        const speakerAvatar = resolveGroupSpeakerRenderAvatar(message.name, sid, speakerContactId);
        if (speakerAvatar) return speakerAvatar;
        return '';
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
      const sid = String(sessionId || '').trim();
      const base = typeof m.raw === 'string' ? m.raw : typeof m.content === 'string' ? m.content : '';
      if (!base) return m;
      const avatar = resolveAvatarForMessage(m, sessionId) || m.avatar || '';
      const j = convPos.has(i) ? convPos.get(i) : null;
      const depth = j === null ? undefined : total - 1 - j;
      const rawSource =
        typeof m.rawSource === 'string' ? m.rawSource : typeof m.raw_source === 'string' ? m.raw_source : '';
      const creativeSource = rawSource ? normalizeCreativeLineBreaks(rawSource) : '';
      const creativeBase = creativeSource || base;
      const isRpSession = sessionId && isRpSessionId(sessionId);
      let meta = m?.meta && typeof m.meta === 'object' ? { ...m.meta } : m?.meta;
      if (isRpSession && m.role === 'assistant' && (m.type === 'text' || !m.type)) {
        if (!meta || typeof meta !== 'object') {
          meta = { renderRich: true };
        } else if (meta.renderRich !== true) {
          meta.renderRich = true;
        }
      }
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
              sessionId: sid,
              meta,
            };
          }
          return {
            ...m,
            avatar,
            content: normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(creativeBase, { depth })),
            status: m.status,
            sessionId: sid,
            meta,
          };
        }
        let display = base;
        try {
          display = window.appBridge.applyOutputDisplayRegex(base, { depth });
        } catch {}
        return { ...m, avatar, content: display, status: m.status, sessionId: sid, meta }; // 保留 status 字段
      }
      if (m.role === 'user' && (m.type === 'text' || !m.type)) {
        return {
          ...m,
          avatar,
          content: window.appBridge.applyInputDisplayRegex(base, { depth }),
          status: m.status,
          sessionId: sid,
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
            sessionId: sid,
            meta: expiredMeta,
          };
        }
        if (localPath && (!content || content === '[binary omitted]')) {
          const localUrl = resolveLocalAttachmentUrl(localPath);
          if (localUrl) {
            return { ...m, avatar, content: localUrl, status: m.status, sessionId: sid, meta };
          }
        }
      }
      return { ...m, avatar, status: m.status, sessionId: sid, meta }; // 保留 status 字段
    });
  };

  ui.messageDecorator = (message, { previous } = {}) => {
    if (!message || typeof message !== 'object') return message;
    const sid =
      String(message?.sessionId || '').trim() ||
      String(previous?.sessionId || '').trim() ||
      String(chatStore.getCurrent() || '').trim();
    if (!sid) return message;
    const [decorated] = decorateMessagesForDisplay([{ ...message, sessionId: sid }], { sessionId: sid });
    return decorated || { ...message, sessionId: sid };
  };

  try {
    window.appBridge.getGroupAvatarDebugSnapshot = async (sessionId = '') => {
      return await buildGroupAvatarDebugSnapshot(sessionId);
    };
  } catch {}

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
    return getMessagePreviewText(msg, { maxLength: 32, fallback: '...' });
  };

  const formatSessionName = (sessionId, contact) => {
    const id = String(sessionId || '');
    const c = contact || contactsStore.getContact(id);
    if (isRpSessionId(id)) {
      let bridgedName = '';
      try {
        bridgedName = String(window.appBridge?.getRpCharacterNameForSession?.(id) || '').trim();
        if (bridgedName && bridgedName !== '角色') return bridgedName;
      } catch {}
      try {
        const personaId = id.slice(RP_SESSION_PREFIX.length);
        const persona = personaStore.get?.(personaId) || getEffectivePersona(id) || {};
        const source = persona?.source && typeof persona.source === 'object' ? persona.source : {};
        const sourceName = String(source?.characterName || source?.cardName || '').trim();
        if (sourceName) return sourceName;
        const personaName = String(persona?.name || '').trim();
        if (personaName) return personaName;
      } catch {}
      if (bridgedName) return bridgedName;
      return '角色';
    }
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
  const isStickerAllowed = () => uiMode !== 'rp';

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

  const draftReplyTargets = new Map();

  const resolveMessageDisplayName = (message, sessionId = chatStore.getCurrent()) => {
    if (!message || typeof message !== 'object') return '';
    if (message.role === 'user') return getActiveUserName();
    const sid = String(sessionId || '').trim();
    const msgName = String(message.name || '').trim();
    // 如果消息有具体名字（非通用占位符），直接使用
    if (message.role === 'assistant' && msgName && msgName !== '助手') return msgName;
    // 否则从联系人获取真实名字
    const contact = contactsStore.getContact(sid);
    if (contact?.name) return String(contact.name || '').trim();
    return msgName || '对方';
  };

  const getReplyTargetForSession = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    return normalizeReplyTarget(draftReplyTargets.get(sid));
  };

  const syncReplyTargetComposer = (sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    ui.setReplyTarget(sid ? getReplyTargetForSession(sid) : null);
  };

  const setReplyTargetForSession = (sessionId = chatStore.getCurrent(), target = null) => {
    const sid = String(sessionId || '').trim();
    if (!sid) {
      ui.setReplyTarget(null);
      return null;
    }
    const next = normalizeReplyTarget(target);
    if (next) draftReplyTargets.set(sid, next);
    else draftReplyTargets.delete(sid);
    if (String(chatStore.getCurrent() || '').trim() === sid) {
      ui.setReplyTarget(next);
    }
    return next;
  };

  const clearReplyTargetForSession = (sessionId = chatStore.getCurrent()) => {
    setReplyTargetForSession(sessionId, null);
  };

  const buildChatReplyTargetFromMessage = (message, sessionId = chatStore.getCurrent()) => {
    const sid = String(sessionId || '').trim();
    const author = resolveMessageDisplayName(message, sid);
    const avatar = resolveAvatarForMessage(message, sid) || String(message?.avatar || '').trim();
    return buildReplyTargetSnapshot(message, { author, avatar, sessionId: sid });
  };

  const attachReplyTargetToMessage = (message, replyTarget) => {
    const msg = message && typeof message === 'object' ? message : null;
    const nextReply = normalizeReplyTarget(replyTarget);
    if (!msg || !nextReply) return msg;
    const meta = msg.meta && typeof msg.meta === 'object' ? { ...msg.meta } : {};
    meta.replyTo = nextReply;
    return { ...msg, meta };
  };

  const buildOutgoingReplyContexts = (messages = []) => {
    const list = Array.isArray(messages) ? messages : [];
    return list
      .map((message) => {
        const replyTo = normalizeReplyTarget(message?.meta?.replyTo);
        if (!replyTo) return null;
        return {
          userMessage: getMessagePreviewText(message, { maxLength: 80, fallback: '[消息]' }),
          replyTo,
        };
      })
      .filter(Boolean);
  };

  const buildReplyPromptHint = (contexts = []) => {
    const list = Array.isArray(contexts) ? contexts.filter(Boolean) : [];
    if (!list.length) return '';
    const toReplyHintLine = (item) =>
      `${item.userMessage || '[消息]'}（回复了${item.replyTo.author || '消息'}：${item.replyTo.content || '...'}）`;
    if (list.length === 1) {
      return toReplyHintLine(list[0]);
    }
    return list.map((item, index) => `${index + 1}. ${toReplyHintLine(item)}`).join('；');
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
        ensureStickerPackManager().show(packId);
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
      url: getDefaultAppIcon(),
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
        btn.style.color = 'var(--app-text-inverse)';
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
    if (!isStickerAllowed()) {
      stickerPreview.el.classList.remove('is-active');
      chatRoom?.classList.remove('sticker-preview-active');
      stickerPreview.list.innerHTML = '';
      return;
    }
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
    scheduleModeSwitchSync();
  };

  const setStickerPanelOpen = open => {
    if (!stickerPanel?.el || !chatRoom) return;
    if (open && !isStickerAllowed()) return;
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
    scheduleModeSwitchSync();
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
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-state-icon">💬</div><div>还没有对话</div><div style="font-size:12px;">试试添加一个好友开始聊天</div>';
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
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      // 蓝点：显示 pending 消息数量
      const pendingCount = getPendingCountForSession(id);
      const pendingBadge =
        pendingCount > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#199AFF; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${pendingCount}</span>`
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
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
          : '';

      // 蓝点：显示 pending 消息数量
      const pendingCount = getPendingCountForSession(id);
      const pendingBadge =
        pendingCount > 0
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#199AFF; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${pendingCount}</span>`
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
      empty.style.cssText = 'padding:12px 6px; color:var(--app-text-muted); font-size:13px;';
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
      empty.style.cssText = 'padding:12px 6px; color:var(--app-text-muted); font-size:13px;';
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
          ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
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
    contactsStore.ensureFromSessions(socialSessions, {
      defaultAvatar: FEATHER_DEFAULT,
      includeGroups: false,
    });
    renderChatList();
    renderGroupsList();
    renderContactsUngrouped();
    if (contactsSearch.term && String(contactsSearch.term).trim()) {
      try {
        applyContactsSearchFilter();
      } catch {}
    }
    try {
      updateChatContentSearchVisibility();
    } catch {}
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
  window.addEventListener('contacts-updated', () => refreshChatAndContacts({ immediate: true }));

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

  /* ---------------- 聊天内容搜索（聊天室内容 -> 会话结果 -> 消息结果） ---------------- */
  const chatContentSearch = {
    term: '',
    timeout: null,
    loading: false,
    searchToken: 0,
    detailSessionId: '',
    rootResults: [],
    preparedSessions: new Set(),
    cache: new Map(),
  };

  const normalizeSearchText = value =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();

  const renderHighlightedSearchTextHtml = (text, term) => {
    const source = String(text || '');
    const query = normalizeSearchText(term);
    if (!query) return escapeHtml(source);
    const re = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return source
      .split(re)
      .map((part, index) => (index % 2 ? `<span class="search-highlight">${escapeHtml(part)}</span>` : escapeHtml(part)))
      .join('');
  };

  const buildSearchSnippet = (text, term, { radius = 24, fallbackLength = 56 } = {}) => {
    const source = normalizeSearchText(text);
    const query = normalizeSearchText(term);
    if (!source) return '';
    if (!query) return source.slice(0, fallbackLength);
    const lower = source.toLowerCase();
    const queryLower = query.toLowerCase();
    const hitIndex = lower.indexOf(queryLower);
    if (hitIndex === -1) return source.slice(0, fallbackLength);
    let start = Math.max(0, hitIndex - radius);
    let end = Math.min(source.length, hitIndex + query.length + radius);
    if (start > 0) {
      const nextSpace = source.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace < hitIndex) start = nextSpace + 1;
    }
    if (end < source.length) {
      const prevSpace = source.lastIndexOf(' ', end);
      if (prevSpace !== -1 && prevSpace > hitIndex + query.length) end = prevSpace;
    }
    return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  };

  const waitForNextFrame = () =>
    new Promise(resolve => {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
          window.requestAnimationFrame(() => resolve());
          return;
        }
      } catch {}
      setTimeout(resolve, 16);
    });

  const resolveChatSearchSpeakerName = (message, sessionId) => {
    if (!message || typeof message !== 'object') return '';
    if (message.role === 'user') return getActiveUserName();
    const explicit = String(message.name || '').trim();
    if (explicit && explicit !== '助手') return explicit;
    const contact = contactsStore.getContact(sessionId);
    return formatSessionName(sessionId, contact) || '助手';
  };

  const buildChatContentSearchEntry = (sessionId, message) => {
    if (!message || typeof message !== 'object') return null;
    if (!message.id || (message.role !== 'user' && message.role !== 'assistant')) return null;
    const text = normalizeSearchText(resolveMessagePlainText(message));
    if (!text) return null;
    return {
      sessionId,
      messageId: String(message.id || ''),
      role: message.role,
      timestamp: Number(message.timestamp || 0),
      text,
      textLower: text.toLowerCase(),
      message,
    };
  };

  const renderChatContentSearchRoot = () => {
    if (!chatSearchRootEl) return;
    const term = normalizeSearchText(chatContentSearch.term);
    if (!term) {
      chatSearchRootEl.innerHTML = '';
      return;
    }
    if (chatContentSearch.loading) {
      chatSearchRootEl.innerHTML = `<div class="chat-search-empty chat-search-loading">正在搜索聊天记录...</div>`;
      return;
    }
    const totalHits = chatContentSearch.rootResults.reduce((sum, item) => sum + (Number(item?.count || 0) || 0), 0);
    if (!chatContentSearch.rootResults.length) {
      chatSearchRootEl.innerHTML = `<div class="chat-search-empty">未找到包含“${escapeHtml(term)}”的聊天内容</div>`;
      return;
    }
    const summary = `<div class="chat-search-summary">在 ${chatContentSearch.rootResults.length} 个聊天室中找到 ${totalHits} 条消息</div>`;
    const items = chatContentSearch.rootResults
      .map(result => {
        const latest = result.latestMatch || {};
        const speaker = resolveChatSearchSpeakerName(latest.message, result.sessionId);
        const snippet = buildSearchSnippet(latest.text, term);
        return `
          <div class="chat-list-item chat-search-session-item" data-search-session="${escapeHtml(result.sessionId)}">
            <img src="${result.avatar}" alt="" class="chat-item-avatar">
            <div class="chat-item-content">
              <div class="chat-item-header">
                <div class="chat-item-name">${result.sessionNameHtml}</div>
                <div class="chat-search-count-pill">${result.count}</div>
              </div>
              <div class="chat-search-session-meta">
                <span>${escapeHtml(speaker || '未知发送者')}</span>
                <span>${escapeHtml(formatSearchTime(latest.timestamp))}</span>
              </div>
              <div class="chat-search-session-preview">${renderHighlightedSearchTextHtml(snippet, term)}</div>
            </div>
          </div>
        `;
      })
      .join('');
    chatSearchRootEl.innerHTML = `${summary}${items}`;
  };

  const renderChatContentSearchDetail = sessionId => {
    if (!chatSearchDetailEl) return;
    const sid = String(sessionId || chatContentSearch.detailSessionId || '').trim();
    if (!sid) {
      chatSearchDetailEl.innerHTML = '';
      return;
    }
    const result = chatContentSearch.rootResults.find(item => item.sessionId === sid);
    if (!result) {
      chatContentSearch.detailSessionId = '';
      chatSearchDetailEl.innerHTML = '';
      renderChatContentSearchRoot();
      updateChatContentSearchVisibility();
      return;
    }
    const term = normalizeSearchText(chatContentSearch.term);
    const items = [...(result.matches || [])]
      .sort((a, b) => (Number(b.timestamp || 0) || 0) - (Number(a.timestamp || 0) || 0))
      .map(match => {
        const speaker = resolveChatSearchSpeakerName(match.message, sid);
        const avatar =
          match.message?.role === 'user'
            ? getActiveUserAvatar()
            : resolveAvatarForMessage(match.message, sid) || resolveAvatarForContact(sid, contactsStore.getContact(sid));
        const snippet = buildSearchSnippet(match.text, term, { radius: 34, fallbackLength: 78 });
        return `
          <div
            class="chat-list-item chat-search-message-item"
            data-session="${escapeHtml(sid)}"
            data-message-id="${escapeHtml(match.messageId)}"
          >
            <img src="${avatar}" alt="" class="chat-item-avatar">
            <div class="chat-item-content">
              <div class="chat-search-message-head">
                <div class="chat-search-message-name">${escapeHtml(speaker || '未知发送者')}</div>
                <div class="chat-search-message-time">${escapeHtml(formatSearchTime(match.timestamp))}</div>
              </div>
              <div class="chat-search-message-text">${renderHighlightedSearchTextHtml(snippet, term)}</div>
            </div>
          </div>
        `;
      })
      .join('');
    chatSearchDetailEl.innerHTML = `
      <div class="chat-search-detail-head">
        <button type="button" class="chat-search-detail-back" data-chat-search-back="1">‹</button>
        <div class="chat-search-detail-copy">
          <div class="chat-search-detail-title">${result.sessionNameHtml}</div>
          <div class="chat-search-detail-note">共找到 ${result.count} 条命中消息</div>
        </div>
      </div>
      ${items || '<div class="chat-search-empty">当前聊天室没有可跳转的命中消息</div>'}
    `;
  };

  const updateChatContentSearchVisibility = () => {
    const hasTerm = normalizeSearchText(chatContentSearch.term).length > 0;
    const showDetail = hasTerm && Boolean(chatContentSearch.detailSessionId);
    const showRoot = hasTerm && !showDetail;
    if (chatList) chatList.classList.toggle('hidden', hasTerm);
    if (chatSearchRootEl) chatSearchRootEl.hidden = !showRoot;
    if (chatSearchDetailEl) chatSearchDetailEl.hidden = !showDetail;
  };

  const ensureChatContentSearchSessionPrepared = async (sessionId, token) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    if (chatContentSearch.preparedSessions.has(sid)) return true;
    await chatStore.ensureRecentMessagesLoaded(sid);
    if (chatContentSearch.searchToken !== token) return false;
    let guard = 0;
    while (chatStore.hasOlderMessages?.(sid) && guard < 256) {
      const older = await chatStore.loadOlderMessages(sid, '', { partCount: 8 });
      if (chatContentSearch.searchToken !== token) return false;
      if (!older.length) break;
      guard += 1;
    }
    if (chatContentSearch.searchToken !== token) return false;
    chatContentSearch.preparedSessions.add(sid);
    return true;
  };

  const getChatContentSearchEntries = async (sessionId, token) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const prepared = await ensureChatContentSearchSessionPrepared(sid, token);
    if (!prepared) return null;
    const messages = chatStore.getMessages(sid) || [];
    const fingerprint = `${messages.length}:${messages[0]?.id || ''}:${messages[messages.length - 1]?.id || ''}`;
    const cached = chatContentSearch.cache.get(sid);
    if (cached?.fingerprint === fingerprint) return cached.entries;
    const entries = messages.map(msg => buildChatContentSearchEntry(sid, msg)).filter(Boolean);
    chatContentSearch.cache.set(sid, { fingerprint, entries });
    return entries;
  };

  const runChatContentSearch = async nextTerm => {
    const term = normalizeSearchText(nextTerm);
    const token = ++chatContentSearch.searchToken;
    chatContentSearch.term = term;
    chatContentSearch.detailSessionId = '';
    if (!term) {
      chatContentSearch.loading = false;
      chatContentSearch.rootResults = [];
      if (chatSearchRootEl) chatSearchRootEl.innerHTML = '';
      if (chatSearchDetailEl) chatSearchDetailEl.innerHTML = '';
      updateChatContentSearchVisibility();
      return;
    }

    chatContentSearch.loading = true;
    chatContentSearch.rootResults = [];
    renderChatContentSearchRoot();
    updateChatContentSearchVisibility();

    const query = term.toLowerCase();
    const sessionIds = chatStore
      .listSessions()
      .filter(id => !isRpSessionId(id))
      .filter(id => chatStore.hasMessages?.(id) || (chatStore.getMessages(id) || []).some(isConversationMessage));
    const results = [];

    for (const sessionId of sessionIds) {
      if (chatContentSearch.searchToken !== token) return;
      const entries = await getChatContentSearchEntries(sessionId, token);
      if (!entries) return;
      const matches = entries.filter(entry => entry.textLower.includes(query));
      if (!matches.length) continue;
      const contact = contactsStore.getContact(sessionId);
      results.push({
        sessionId,
        sessionName: formatSessionName(sessionId, contact),
        sessionNameHtml: renderSessionNameHtml(sessionId, contact),
        avatar: resolveAvatarForContact(sessionId, contact),
        count: matches.length,
        latestMatch: matches[matches.length - 1],
        matches,
      });
    }

    if (chatContentSearch.searchToken !== token) return;
    results.sort((a, b) => (Number(b.latestMatch?.timestamp || 0) || 0) - (Number(a.latestMatch?.timestamp || 0) || 0));
    chatContentSearch.loading = false;
    chatContentSearch.rootResults = results;
    renderChatContentSearchRoot();
    updateChatContentSearchVisibility();
  };

  const openChatContentSearchDetail = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    chatContentSearch.detailSessionId = sid;
    renderChatContentSearchDetail(sid);
    updateChatContentSearchVisibility();
    try {
      chatSearchDetailEl.scrollTop = 0;
    } catch {}
  };

  const ensureMessageVisibleInCurrentChat = async (sessionId, messageId, keyword = '') => {
    const sid = String(sessionId || '').trim();
    const mid = String(messageId || '').trim();
    if (!sid || !mid) return false;
    const focusOpts = {
      keyword,
      kind: keyword ? 'search' : 'anchor',
      dismissOnScroll: true,
    };
    if (ui.scrollToMessage(mid, focusOpts)) return true;
    await waitForNextFrame();
    if (ui.scrollToMessage(mid, focusOpts)) return true;

    const PAGE = 90;
    let guard = 0;
    while (guard < 256) {
      guard += 1;
      const state = chatRenderState.get(sid) || { start: 0 };
      const start = Number.isFinite(state.start) ? state.start : 0;
      const messages = chatStore.getMessages(sid) || [];

      if (start > 0) {
        const nextStart = Math.max(0, start - PAGE);
        const chunk = messages.slice(nextStart, start);
        if (chunk.length) {
          ui.prependHistory(decorateMessagesForDisplay(chunk, { sessionId: sid }));
          chatRenderState.set(sid, { start: nextStart });
          chatStore.prefetchRawOriginalsForMessages?.(chunk, sid).catch(() => {});
          await waitForNextFrame();
          if (ui.scrollToMessage(mid, focusOpts)) return true;
          continue;
        }
        chatRenderState.set(sid, { start: 0 });
      }

      if (!chatStore.hasOlderMessages?.(sid)) break;
      const older = await chatStore.loadOlderMessages(sid, '', { partCount: 1 });
      if (!older.length) break;
      ui.prependHistory(decorateMessagesForDisplay(older, { sessionId: sid }));
      chatRenderState.set(sid, { start: 0 });
      chatStore.prefetchRawOriginalsForMessages?.(older, sid).catch(() => {});
      await waitForNextFrame();
      if (ui.scrollToMessage(mid, focusOpts)) return true;
    }

    return ui.scrollToMessage(mid, focusOpts);
  };

  const initChatContentSearch = () => {
    if (!chatContentSearchInput || !chatSearchClearBtn || !chatSearchBox) return;
    if (chatContentSearchInput.hasAttribute('data-initialized')) return;

    const setActiveUi = active => {
      chatSearchBox.classList.toggle('is-active', Boolean(active));
    };

    const update = (nextTerm, { immediate = false } = {}) => {
      const term = String(nextTerm || '');
      const has = normalizeSearchText(term).length > 0;
      chatSearchClearBtn.style.display = has ? 'block' : 'none';
      setActiveUi(has);
      if (chatContentSearch.timeout) clearTimeout(chatContentSearch.timeout);
      const run = () => {
        runChatContentSearch(term).catch(err => {
          chatContentSearch.loading = false;
          logger.warn('聊天内容搜索失败', err);
          renderChatContentSearchRoot();
          updateChatContentSearchVisibility();
        });
      };
      if (immediate) run();
      else chatContentSearch.timeout = setTimeout(run, 260);
    };

    chatContentSearchInput.addEventListener('input', e => update(e.target.value));
    chatContentSearchInput.addEventListener('focus', () => chatSearchBox.classList.add('is-focus'));
    chatContentSearchInput.addEventListener('blur', () => chatSearchBox.classList.remove('is-focus'));
    chatContentSearchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        chatContentSearchInput.value = '';
        update('', { immediate: true });
      }
    });
    chatSearchClearBtn.addEventListener('click', () => {
      chatContentSearchInput.value = '';
      update('', { immediate: true });
      chatContentSearchInput.focus();
    });
    chatSearchRootEl?.addEventListener('click', e => {
      const item = e.target.closest('[data-search-session]');
      if (!item) return;
      openChatContentSearchDetail(item.getAttribute('data-search-session') || '');
    });
    chatSearchDetailEl?.addEventListener('click', async e => {
      const backBtn = e.target.closest('[data-chat-search-back]');
      if (backBtn) {
        chatContentSearch.detailSessionId = '';
        updateChatContentSearchVisibility();
        return;
      }
      const item = e.target.closest('[data-message-id][data-session]');
      if (!item) return;
      const sid = item.getAttribute('data-session') || '';
      const mid = item.getAttribute('data-message-id') || '';
      const contact = contactsStore.getContact(sid);
      switchPage('chat');
      const enterResult = await enterChatRoom(sid, formatSessionName(sid, contact), 'chat', {
        suppressInitialAutoScroll: true,
        jumpTargetMessageId: mid,
        jumpKeyword: chatContentSearch.term,
        jumpKind: 'search',
      });
      const jumped =
        enterResult?.jumpedToTarget === true
          ? true
          : await ensureMessageVisibleInCurrentChat(sid, mid, chatContentSearch.term);
      if (!jumped) window.toastr?.warning?.('未能定位到对应消息');
    });

    chatContentSearchInput.setAttribute('data-initialized', 'true');
    updateChatContentSearchVisibility();
  };

  /* ---------------- 底部导航（聊天/联系人/动态） ---------------- */
  const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
  const modeSwitch = document.getElementById('mode-switch');
  const modeSwitchBtn = modeSwitch ? modeSwitch.querySelector('button') : null;
  let syncModeSwitchPosition = () => {};
  let scheduleModeSwitchSync = () => {};
  const MODE_SWITCH_POS_KEY = 'phone_mode_switch_pos_v1';
  let modeSwitchPinned = false;
  let modeSwitchPos = null;
  let modeSwitchSuppressClick = false;
  let modeSwitchDimTimer = null;
  const MODE_SWITCH_DIM_DELAY = 30_000;
  const loadModeSwitchPos = () => {
    try {
      const raw = localStorage.getItem(MODE_SWITCH_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const xRatio = Number(parsed.xRatio);
      const yRatio = Number(parsed.yRatio);
      if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) return null;
      return { xRatio, yRatio };
    } catch {
      return null;
    }
  };
  const saveModeSwitchPos = () => {
    try {
      if (!modeSwitchPos) return;
      localStorage.setItem(MODE_SWITCH_POS_KEY, JSON.stringify(modeSwitchPos));
    } catch {}
  };
  const setModeSwitchOpacityDuration = ms => {
    if (!modeSwitch) return;
    const val = Number(ms);
    if (!Number.isFinite(val)) return;
    modeSwitch.style.setProperty('--mode-switch-opacity-duration', `${val}ms`);
  };
  const setModeSwitchDim = (dim, { durationMs } = {}) => {
    if (!modeSwitch) return;
    if (typeof durationMs === 'number') setModeSwitchOpacityDuration(durationMs);
    modeSwitch.style.opacity = '';
    modeSwitch.classList.toggle('is-dim', Boolean(dim));
  };
  const scheduleModeSwitchDim = () => {
    if (!modeSwitch) return;
    if (modeSwitchDimTimer) clearTimeout(modeSwitchDimTimer);
    modeSwitchDimTimer = setTimeout(() => {
      setModeSwitchDim(true, { durationMs: 1400 });
    }, MODE_SWITCH_DIM_DELAY);
  };
  const wakeModeSwitch = () => {
    setModeSwitchDim(false, { durationMs: 180 });
    scheduleModeSwitchDim();
  };
  const applyUiModeUI = () => {
    if (document?.body) document.body.dataset.uiMode = uiMode;
    ui.hideScrollDateBadge?.({ immediate: true });
    if (modeSwitch) modeSwitch.dataset.mode = uiMode;
    if (modeSwitchBtn) {
      const isRp = uiMode === 'rp';
      modeSwitchBtn.setAttribute('aria-pressed', isRp ? 'true' : 'false');
      modeSwitchBtn.setAttribute('aria-label', isRp ? '切换到社交' : '切换到创意写作');
      modeSwitchBtn.setAttribute('title', isRp ? '切换到社交' : '切换到创意写作');
    }
    scheduleModeSwitchSync();
  };
  const initialUiMode = loadUiMode();
  const pages = {
    chat: document.getElementById('chat-page'),
    contacts: document.getElementById('contacts-page'),
    moments: document.getElementById('moments-page'),
  };
  const chatList = document.getElementById('chat-list');
  const chatSearchRootEl = document.getElementById('chat-search-root');
  const chatSearchDetailEl = document.getElementById('chat-search-detail');
  const chatContentSearchInput = document.getElementById('chat_content_search_input');
  const chatSearchClearBtn = document.getElementById('chat_search_clear_btn');
  const chatSearchBox = document.getElementById('chat_search_box');
  chatRoom = document.getElementById('chat-room');
  const rpToolbar = document.getElementById('rp-toolbar');
  const rpGreetingTrigger = document.getElementById('rp-greeting-trigger');
  const rpGreetingName = document.getElementById('rp-greeting-name');
  const rpGreetingOverlay = document.getElementById('rp-greeting-overlay');
  const rpGreetingSheet = document.getElementById('rp-greeting-sheet');
  const rpGreetingSheetList = document.getElementById('rp-greeting-sheet-list');
  const rpGreetingSheetReset = document.getElementById('rp-greeting-sheet-reset');
  const chatScroll = document.getElementById('chat-scroll');
  const composerInput = document.getElementById('composer-input');
  const chatInputContainer = document.querySelector('.chat-input-container');
  const blurComposerInput = () => {
    try {
      const active = document.activeElement;
      if (active && typeof active.blur === 'function' && (active === composerInput || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        active.blur();
      }
    } catch {}
  };
  if (chatRoom && chatScroll) {
    stageTimeline = new StageTimeline({ stageManager });
    stageTimeline.mount({ container: chatRoom, before: chatScroll });
  }
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
    scheduleModeSwitchSync();
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

  // Slash command menu (type "/" in composer)
  (() => {
    if (!composerInput) return;
    const menu = document.createElement('div');
    menu.className = 'slash-command-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);

    let items = [];
    let selectedIndex = 0;
    let lastQuery = '';

    const hideMenu = () => {
      menu.style.display = 'none';
      lastQuery = '';
    };

    const getQuery = () => {
      const value = String(composerInput.value || '');
      const pos = Number.isFinite(Number(composerInput.selectionStart))
        ? composerInput.selectionStart
        : value.length;
      const before = value.slice(0, pos);
      const match = before.match(/^(\/[^\s]*)$/);
      if (!match) return null;
      const token = match[1] || '';
      if (!token.startsWith('/')) return null;
      return { token, start: 0, end: token.length };
    };

    const filterCommands = (token) => {
      const query = String(token || '').toLowerCase();
      const list = getCommandList();
      if (!query || query === '/') return list;
      return list.filter(item => String(item.key || '').toLowerCase().startsWith(query));
    };

    const renderMenu = () => {
      if (!items.length) {
        hideMenu();
        return;
      }
      menu.innerHTML = items
        .map((item, idx) => {
          const key = String(item.key || '');
          const desc = String(item.desc || '');
          const active = idx === selectedIndex ? ' is-active' : '';
          return `
            <div class="slash-command-item${active}" data-index="${idx}">
              <div class="slash-command-key">${key}</div>
              <div class="slash-command-desc">${desc}</div>
            </div>
          `;
        })
        .join('');
      menu.style.display = 'block';
      menu.style.visibility = 'hidden';
      const rect = composerInput.getBoundingClientRect();
      menu.style.left = `${Math.round(rect.left)}px`;
      menu.style.minWidth = `${Math.round(rect.width)}px`;
      const height = menu.offsetHeight || 0;
      let top = rect.top - height - 8;
      if (top < 8) top = rect.bottom + 8;
      menu.style.top = `${Math.round(top)}px`;
      menu.style.visibility = 'visible';
    };

    const updateMenu = () => {
      const query = getQuery();
      if (!query) {
        hideMenu();
        return;
      }
      const nextItems = filterCommands(query.token);
      if (!nextItems.length) {
        hideMenu();
        return;
      }
      if (lastQuery !== query.token) {
        selectedIndex = 0;
        lastQuery = query.token;
      }
      items = nextItems;
      if (selectedIndex >= items.length) selectedIndex = 0;
      renderMenu();
    };

    const applySelection = (index) => {
      const item = items[index];
      if (!item) return;
      const value = String(composerInput.value || '');
      const pos = Number.isFinite(Number(composerInput.selectionStart))
        ? composerInput.selectionStart
        : value.length;
      const before = value.slice(0, pos);
      const after = value.slice(pos);
      const match = before.match(/^(\/[^\s]*)$/);
      if (!match) return;
      const token = match[1] || '';
      const start = 0;
      const nextValue = item.key + ' ' + after;
      composerInput.value = nextValue;
      const nextPos = start + String(item.key).length + 1;
      composerInput.setSelectionRange(nextPos, nextPos);
      composerInput.dispatchEvent(new Event('input', { bubbles: true }));
      hideMenu();
      composerInput.focus();
    };

    const updateActiveItem = () => {
      const list = menu.querySelectorAll('.slash-command-item');
      list.forEach((el, idx) => {
        if (idx === selectedIndex) el.classList.add('is-active');
        else el.classList.remove('is-active');
      });
      const active = list[selectedIndex];
      if (active?.scrollIntoView) {
        active.scrollIntoView({ block: 'nearest' });
      }
    };

    composerInput.addEventListener('input', () => updateMenu());
    composerInput.addEventListener('keydown', (e) => {
      if (menu.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateActiveItem();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateActiveItem();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySelection(selectedIndex);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideMenu();
      }
    });
    composerInput.addEventListener('blur', () => {
      setTimeout(() => hideMenu(), 80);
    });

    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const item = e.target?.closest?.('.slash-command-item');
      if (!item) return;
      const idx = Number(item.getAttribute('data-index'));
      if (Number.isFinite(idx)) applySelection(idx);
    });

    document.addEventListener('pointerdown', e => {
      if (menu.style.display === 'none') return;
      if (menu.contains(e.target) || composerInput.contains(e.target)) return;
      hideMenu();
    });
    window.addEventListener('resize', () => {
      if (menu.style.display !== 'none') renderMenu();
    });
  })();

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
  const createStickerAiModal = () => {
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
  };
  let stickerAiModal = null;
  const ensureStickerAiModal = () => {
    if (!stickerAiModal) stickerAiModal = createStickerAiModal();
    return stickerAiModal;
  };
  const createStickerPackManager = () => {
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
  };
  let stickerPackManager = null;
  const ensureStickerPackManager = () => {
    if (!stickerPackManager) stickerPackManager = createStickerPackManager();
    return stickerPackManager;
  };
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
      ensureStickerAiModal().show({ packId });
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
  const pickSavedUiState = async () => {
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
  const applyRestoredSessionShell = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const known = chatStore.hasSession?.(sid) || contactsStore.getContact(sid);
    if (!known) return false;
    chatStore.switchSession(sid);
    window.appBridge.setActiveSession(sid);
    syncUserPersonaUI(sid);
    try {
      const contact = contactsStore.getContact(sid);
      if (currentChatTitle) currentChatTitle.innerHTML = renderSessionNameHtml(sid, contact);
    } catch {}
    try {
      const draft = chatStore.getDraft(sid);
      ui.setInputText(draft || '');
    } catch {}
    syncReplyTargetComposer(sid);
    ui.setSessionLabel(sid);
    return true;
  };
  const restoreUiState = async () => {
    try {
      const s = await pickSavedUiState();
      if (!s) {
        uiLog('restoreUiState: no saved state');
        return false;
      }
      const page = String(s?.activePage || '').trim();
      const sid = String(s?.sessionId || '').trim();
      const inChatRoom = Boolean(s?.inChatRoom);
      uiLog('restoreUiState: picked', { page, sid, inChatRoom, at: s?.at || 0 });
      if (page && pages[page]) switchPage(page);
      const sidKnown = applyRestoredSessionShell(sid);
      if (sid && !sidKnown) {
        uiLog('restoreUiState: sid not yet known (skip switchSession)', { sid });
      }
      return true;
    } catch {
      return false;
    }
  };
  const pageOrder = { chat: 0, contacts: 1, moments: 2 };
  const pageNames = ['chat', 'contacts', 'moments'];
  const switchPage = (name, options) => {
    const prev = activePage;
    if (prev === name) return;
    const animate = (!options || options.animate !== false) && !document.body.dataset.reducedMotion;
    const dir = (pageOrder[name] ?? 0) > (pageOrder[prev] ?? 0) ? 'forward' : 'backward';
    activePage = name;
    navBtns.forEach(t => t.classList.toggle('active', t.dataset.page === name));

    const oldEl = pages[prev];
    const newEl = pages[name];

    Object.values(pages).forEach(p => {
      if (p) { p.classList.remove('page-exiting'); delete p.dataset.pageDir; }
    });

    if (oldEl && newEl && animate) {
      oldEl.classList.remove('active');
      oldEl.classList.add('page-exiting');
      oldEl.dataset.pageDir = dir;
      newEl.classList.add('active');
      newEl.dataset.pageDir = dir;

      const cleanupOld = () => {
        oldEl.classList.remove('page-exiting');
        delete oldEl.dataset.pageDir;
      };
      const cleanupNew = () => { delete newEl.dataset.pageDir; };
      oldEl.addEventListener('animationend', cleanupOld, { once: true });
      newEl.addEventListener('animationend', cleanupNew, { once: true });
      setTimeout(cleanupOld, 350);
      setTimeout(cleanupNew, 350);
    } else {
      Object.entries(pages).forEach(([k, el]) => {
        if (el) el.classList.toggle('active', k === name);
      });
    }

    if (name !== 'chat') {
      chatRoom?.classList.add('hidden');
      chatList?.classList.remove('hidden');
    }
    if (name === 'moments') {
      try {
        momentsPanel.render();
      } catch {}
    }
    if (name === 'chat') {
      try {
        updateChatContentSearchVisibility();
      } catch {}
    }
    if (uiStateArmed) saveUiState();
    uiLog('switchPage', { activePage });
    scheduleModeSwitchSync();
  };
  patchDebugUiRegistry((registry) => {
    registry.actions.switchPage = switchPage;
  });

  const readCssVarPx = (name, fallback) => {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      const val = parseFloat(String(raw || '').trim());
      return Number.isFinite(val) ? val : fallback;
    } catch {
      return fallback;
    }
  };

  let modeSwitchSize = 26;
  let modeSwitchSlot = 10;
  const refreshModeSwitchMetrics = () => {
    modeSwitchSize = readCssVarPx('--mode-switch-size', modeSwitchSize);
    modeSwitchSlot = readCssVarPx('--mode-switch-slot', modeSwitchSlot);
  };
  const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
  let _safeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  const _refreshSafeAreaInsets = () => {
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
        'padding-top:env(safe-area-inset-top,0px);' +
        'padding-bottom:env(safe-area-inset-bottom,0px);' +
        'padding-left:env(safe-area-inset-left,0px);' +
        'padding-right:env(safe-area-inset-right,0px);';
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      _safeInsets = {
        top: parseFloat(cs.paddingTop) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
        right: parseFloat(cs.paddingRight) || 0,
      };
      probe.remove();
    } catch {}
  };
  _refreshSafeAreaInsets();
  window.addEventListener('resize', _refreshSafeAreaInsets);
  const getViewportSize = () => {
    try {
      const w = window.innerWidth || document.documentElement.clientWidth || 0;
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      return { w, h };
    } catch {
      return { w: 0, h: 0 };
    }
  };
  const normalizeModeSwitchPos = (x, y) => {
    const { w, h } = getViewportSize();
    if (!w || !h) return null;
    return { xRatio: x / w, yRatio: y / h };
  };
  const resolvePinnedModeSwitchPos = () => {
    if (!modeSwitchPos) return null;
    const { w, h } = getViewportSize();
    if (!w || !h) return null;
    const base = 8 + modeSwitchSize / 2;
    const x = clamp(modeSwitchPos.xRatio * w, base + _safeInsets.left, w - base - _safeInsets.right);
    const y = clamp(modeSwitchPos.yRatio * h, base + _safeInsets.top, h - base - _safeInsets.bottom);
    return { x, y };
  };

  const resolveModeSwitchAnchor = () => {
    if (document?.body?.classList.contains('chat-room-active') || uiMode === 'rp') {
      return { rect: chatInputContainer?.getBoundingClientRect?.(), mode: 'input' };
    }
    const bottomNav = document.querySelector('.bottom-nav');
    const contactsBtn = bottomNav?.querySelector?.('.nav-btn[data-page="contacts"]');
    return {
      rect: (contactsBtn || bottomNav)?.getBoundingClientRect?.(),
      mode: 'dock',
      dockRect: bottomNav?.getBoundingClientRect?.(),
    };
  };

  syncModeSwitchPosition = () => {
    if (!modeSwitch) return;
    refreshModeSwitchMetrics();
    if (modeSwitchPinned && modeSwitchPos) {
      const pinned = resolvePinnedModeSwitchPos();
      if (pinned) {
        modeSwitch.style.left = `${Math.round(pinned.x)}px`;
        modeSwitch.style.top = `${Math.round(pinned.y)}px`;
        modeSwitch.style.pointerEvents = 'auto';
        modeSwitch.classList.remove('is-hidden');
        return;
      }
      modeSwitchPinned = false;
    }
    const { rect, mode, dockRect } = resolveModeSwitchAnchor();
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
      modeSwitch.classList.add('is-hidden');
      modeSwitch.style.pointerEvents = 'none';
      return;
    }
    const x = rect.left + rect.width / 2;
    let y = rect.top - 8 - modeSwitchSize / 2;
    if (mode === 'dock') {
      const baseTop = dockRect?.top ?? rect.top;
      y = baseTop - modeSwitchSlot - modeSwitchSize / 2;
    }
    modeSwitch.style.left = `${Math.round(x)}px`;
    modeSwitch.style.top = `${Math.round(y)}px`;
    modeSwitch.style.pointerEvents = 'auto';
    modeSwitch.classList.remove('is-hidden');
  };

  scheduleModeSwitchSync = () => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(syncModeSwitchPosition);
    } else {
      setTimeout(syncModeSwitchPosition, 0);
    }
  };

  if (modeSwitch) {
    const stored = loadModeSwitchPos();
    if (stored) {
      modeSwitchPos = stored;
      modeSwitchPinned = true;
    }
    setModeSwitchDim(true, { durationMs: 0 });
    scheduleModeSwitchDim();
  }
  scheduleModeSwitchSync();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleModeSwitchSync);
  }
  let navLastTap = { page: '', time: 0 };
  navBtns.forEach(btn => btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    const now = Date.now();
    if (page === navLastTap.page && page === activePage && now - navLastTap.time < 350) {
      const scrollTargets = {
        chat: document.getElementById('chat-list'),
        contacts: document.querySelector('.contacts-list'),
        moments: document.getElementById('moments-list'),
      };
      scrollTargets[page]?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    navLastTap = { page, time: now };
    switchPage(page);
  }));

  // 页面滑动切换手势
  {
    const appEl = document.getElementById('app');
    let swipeStartX = 0, swipeStartY = 0, swipeLocked = false;
    const SWIPE_THRESHOLD = 60;
    const isInChatRoom = () => chatRoom && !chatRoom.classList.contains('hidden');
    appEl?.addEventListener('touchstart', e => {
      if (isInChatRoom() || uiMode === 'rp') return;
      if (e.target?.closest?.('#mode-switch')) { swipeLocked = true; return; }
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
      swipeLocked = false;
    }, { passive: true });
    appEl?.addEventListener('touchend', e => {
      if (isInChatRoom() || uiMode === 'rp' || swipeLocked) return;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      const dy = e.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
      const idx = pageOrder[activePage] ?? 0;
      if (dx < 0 && idx < pageNames.length - 1) {
        switchPage(pageNames[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        switchPage(pageNames[idx - 1]);
      }
    }, { passive: true });
    appEl?.addEventListener('touchmove', e => {
      if (swipeLocked) return;
      const dy = Math.abs(e.touches[0].clientY - swipeStartY);
      const dx = Math.abs(e.touches[0].clientX - swipeStartX);
      if (dy > 10 && dy > dx) swipeLocked = true;
    }, { passive: true });
  }

  // 搜索框初始化（联系人页 / 聊天内容搜索）
  initContactSearch();
  initChatContentSearch();

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
    scheduleModeSwitchSync();
  });

  if (window.visualViewport && chatRoom) {
    let _vvPatchActive = false;
    const _applyVVPatch = () => {
      const vv = window.visualViewport;
      const fullH = window.innerHeight;
      const vvH = Math.max(0, Math.round(Number(vv?.height) || 0));
      const vvTop = Math.max(0, Math.round(Number(vv?.offsetTop) || 0));
      const diff = fullH - vvH;
      if (diff > 50 || vvTop > 0) {
        chatRoom.style.top = `${vvTop}px`;
        chatRoom.style.bottom = 'auto';
        chatRoom.style.height = `${vvH}px`;
        _vvPatchActive = true;
        requestAnimationFrame(() => {
          chatScroll?.scrollTo?.({ top: chatScroll.scrollHeight, behavior: 'instant' });
        });
      } else if (_vvPatchActive) {
        chatRoom.style.top = '';
        chatRoom.style.bottom = '';
        chatRoom.style.height = '';
        _vvPatchActive = false;
      }
    };
    window.visualViewport.addEventListener('resize', _applyVVPatch);
    window.visualViewport.addEventListener('scroll', _applyVVPatch);
  }

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
                background: var(--app-surface-card);
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                    <div style="font-weight:900;">原始回复</div>
                    <div id="raw-reply-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="raw-reply-copy" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="raw-reply-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
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
  patchDebugUiRegistry((registry) => {
    registry.actions.showRawReplyModal = (text = '', meta = '') => rawReplyModal.show(text, meta);
    registry.actions.hideRawReplyModal = () => rawReplyModal.hide();
  });

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
    let apiContentEl = null;
    let metaEl = null;
    let locateBtn = null;
    let locateHandler = null;
    let tabPromptBtn = null;
    let tabApiBtn = null;
    let promptView = null;
    let apiView = null;
    let activeTab = 'prompt';
    let apiPlainText = '';

    const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const truncateBase64 = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, (match) => {
        const ci = match.indexOf(',');
        if (ci < 0) return match;
        return `${match.slice(0, ci + 1)}...(${match.length - ci - 1} chars)`;
      });
    };

    const stringifyContent = (content) => {
      if (content === null || content === undefined) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map(p => {
          if (!p || typeof p !== 'object') return '';
          if (p.type === 'text') return String(p.text || '');
          if (p.type === 'image_url') {
            const u = String(p.image_url?.url || '');
            return u.startsWith('data:') ? '[image: base64]' : `[image: ${u}]`;
          }
          if (p.type === 'input_audio') return '[audio]';
          try { return JSON.stringify(p); } catch { return '[content_part]'; }
        }).filter(Boolean).join('\n');
      }
      try { return JSON.stringify(content, null, 2); } catch { return String(content); }
    };

    const fmtVal = (val) => {
      const S = { str: '#f1fa8c', num: '#bd93f9', bool: '#ff5555', muted: '#6272a4', label: '#ff79c6', val: '#f8f8f2' };
      if (val === null || val === undefined) return { h: `<span style="color:${S.muted}">null</span>`, p: 'null' };
      if (typeof val === 'boolean') return { h: `<span style="color:${S.bool}">${val}</span>`, p: String(val) };
      if (typeof val === 'number') return { h: `<span style="color:${S.num}">${val}</span>`, p: String(val) };
      if (typeof val === 'string') return { h: `<span style="color:${S.str}">"${escHtml(val)}"</span>`, p: `"${val}"` };
      if (typeof val === 'object') {
        try {
          const j = JSON.stringify(val, null, 2);
          return { h: `<span style="color:${S.muted}">${escHtml(j)}</span>`, p: j };
        } catch { return { h: `<span style="color:${S.muted}">[object]</span>`, p: '[object]' }; }
      }
      return { h: `<span style="color:${S.val}">${escHtml(String(val))}</span>`, p: String(val) };
    };

    const buildApiPayloadHtml = (req) => {
      if (!req) return { html: '', plain: '' };
      const sec = 'margin:0 0 2px 0; padding:8px 12px; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:12px; line-height:1.5;';
      const lbl = 'color:#ff79c6; font-weight:bold;';
      const mt = 'color:#6272a4;';
      const sv = 'color:#f8f8f2;';
      const ss = 'color:#f1fa8c;';
      const sb = 'color:#ff5555;';
      const rc = { system: '#ff79c6', user: '#50fa7b', assistant: '#8be9fd', tool: '#ffb86c' };
      const parts = [], plain = [];
      const at = req.at ? new Date(req.at).toLocaleString('zh-CN', { hour12: false }) : 'N/A';

      let h = `<div style="${sec} background:#0f0f23; border-bottom:1px solid #282a36;">`;
      h += `<span style="${mt}">// Request at ${escHtml(at)}</span><br>`;
      h += `<span style="${lbl}">provider</span><span style="${mt}">: </span><span style="${ss}">"${escHtml(req.provider || '')}"</span><br>`;
      h += `<span style="${lbl}">model</span><span style="${mt}">: </span><span style="${ss}">"${escHtml(req.model || '')}"</span><br>`;
      if (req.baseUrl) h += `<span style="${lbl}">base_url</span><span style="${mt}">: </span><span style="${ss}">"${escHtml(req.baseUrl)}"</span><br>`;
      h += `<span style="${lbl}">stream</span><span style="${mt}">: </span><span style="${sb}">${req.stream ? 'true' : 'false'}</span></div>`;
      parts.push(h);
      let hp = `// Request at ${at}\nprovider: "${req.provider || ''}"\nmodel: "${req.model || ''}"`;
      if (req.baseUrl) hp += `\nbase_url: "${req.baseUrl}"`;
      hp += `\nstream: ${req.stream}`;
      plain.push(hp);

      const allParams = { ...(req.options || {}), ...(req.requestOptions || {}) };
      const skip = new Set(['signal', 'nativeRequestId']);
      const entries = Object.entries(allParams).filter(([k, v]) => v !== undefined && !skip.has(k));
      if (entries.length) {
        let ph = `<div style="${sec} background:#1a1a2e; border-bottom:1px solid #282a36;"><span style="${mt}">// Generation Parameters</span><br>`;
        let pp = '// Generation Parameters';
        for (const [k, v] of entries) {
          const f = fmtVal(v);
          ph += `<span style="${lbl}">${escHtml(k)}</span><span style="${mt}">: </span>${f.h}<br>`;
          pp += `\n${k}: ${f.p}`;
        }
        ph += '</div>';
        parts.push(ph);
        plain.push(pp);
      }

      const msgs = Array.isArray(req.messages) ? req.messages : [];
      if (msgs.length) {
        let mh = `<div style="${sec} background:#1a1a2e;"><span style="${mt}">// Messages (${msgs.length})</span><br><br>`;
        let mp = `// Messages (${msgs.length})`;
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          const role = String(m?.role || 'unknown');
          const color = rc[role] || '#f8f8f2';
          const txt = truncateBase64(stringifyContent(m?.content));
          mh += `<div style="margin-bottom:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px; border-left:3px solid ${color};">`;
          mh += `<div style="margin-bottom:4px;"><span style="color:${color}; font-weight:bold;">[${escHtml(role)}]</span> <span style="${mt}">#${i}</span></div>`;
          mh += `<div style="${sv} white-space:pre-wrap; word-break:break-all;">${escHtml(txt)}</div></div>`;
          mp += `\n\n[${role}] #${i}\n${txt}`;
        }
        mh += '</div>';
        parts.push(mh);
        plain.push(mp);
      }

      if (req.responsePrefix) {
        let rh = `<div style="${sec} background:#1a1a2e; border-top:1px solid #282a36;">`;
        rh += `<span style="${mt}">// Response Prefix</span><br><span style="${ss}">"${escHtml(truncateBase64(req.responsePrefix))}"</span></div>`;
        parts.push(rh);
        plain.push(`// Response Prefix\n"${req.responsePrefix}"`);
      }

      return { html: parts.join(''), plain: plain.join('\n\n') };
    };

    const switchTab = (tab) => {
      activeTab = tab;
      if (!promptView || !apiView || !tabPromptBtn || !tabApiBtn) return;
      const active = 'font-weight:700; opacity:1; border-bottom:2px solid var(--app-text-primary, #333);';
      const inactive = 'font-weight:400; opacity:0.6; border-bottom:2px solid transparent;';
      if (tab === 'prompt') {
        promptView.style.display = '';
        apiView.style.display = 'none';
        tabPromptBtn.style.cssText = tabPromptBtn.style.cssText.replace(/font-weight:[^;]+;/, '').replace(/opacity:[^;]+;/, '').replace(/border-bottom:[^;]+;/, '') + active;
        tabApiBtn.style.cssText = tabApiBtn.style.cssText.replace(/font-weight:[^;]+;/, '').replace(/opacity:[^;]+;/, '').replace(/border-bottom:[^;]+;/, '') + inactive;
        if (locateBtn) locateBtn.style.display = '';
      } else {
        promptView.style.display = 'none';
        apiView.style.display = '';
        tabApiBtn.style.cssText = tabApiBtn.style.cssText.replace(/font-weight:[^;]+;/, '').replace(/opacity:[^;]+;/, '').replace(/border-bottom:[^;]+;/, '') + active;
        tabPromptBtn.style.cssText = tabPromptBtn.style.cssText.replace(/font-weight:[^;]+;/, '').replace(/opacity:[^;]+;/, '').replace(/border-bottom:[^;]+;/, '') + inactive;
        if (locateBtn) locateBtn.style.display = 'none';
        refreshApiView();
      }
    };

    const refreshApiView = () => {
      const req = window.appBridge?.lastRequest;
      if (!req) {
        if (apiContentEl) apiContentEl.innerHTML = '<div style="padding:20px; color:#6272a4; font-family:monospace; font-size:13px; text-align:center;">暂无 API 请求记录<br><span style="font-size:11px;">请先发送一次消息</span></div>';
        apiPlainText = '';
        return;
      }
      const { html, plain } = buildApiPayloadHtml(req);
      if (apiContentEl) apiContentEl.innerHTML = html;
      apiPlainText = plain;
    };

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
                background: var(--app-surface-card);
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                    <div style="font-weight:900;">本次请求</div>
                    <div id="prompt-preview-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="prompt-preview-copy" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">复制</button>
                    <button id="prompt-preview-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div id="prompt-preview-tabs" style="display:flex; align-items:center; gap:0; background:#f3f4f6; border-bottom:1px solid var(--app-border-default); padding:0 12px;">
                    <button id="prompt-tab-api" type="button" style="padding:8px 16px; background:none; border:none; border-bottom:2px solid var(--app-text-primary, #333); font-size:13px; font-weight:700; cursor:pointer; color:var(--app-text-primary, #333); opacity:1;">请求参数</button>
                    <button id="prompt-tab-prompt" type="button" style="padding:8px 16px; background:none; border:none; border-bottom:2px solid transparent; font-size:13px; font-weight:400; cursor:pointer; color:var(--app-text-primary, #333); opacity:0.6;">完整 Prompt</button>
                    <button id="prompt-preview-locate" style="margin-left:auto; border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:5px 10px; font-size:12px; cursor:pointer; display:none;">定位世界书</button>
                </div>
                <div id="prompt-view-api" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; background:#1a1a2e;"></div>
                <div id="prompt-view-prompt" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px; display:none;">
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
      apiContentEl = panel.querySelector('#prompt-view-api');
      metaEl = panel.querySelector('#prompt-preview-meta');
      locateBtn = panel.querySelector('#prompt-preview-locate');
      promptView = panel.querySelector('#prompt-view-prompt');
      apiView = panel.querySelector('#prompt-view-api');
      tabPromptBtn = panel.querySelector('#prompt-tab-prompt');
      tabApiBtn = panel.querySelector('#prompt-tab-api');

      tabPromptBtn?.addEventListener('click', () => switchTab('prompt'));
      tabApiBtn?.addEventListener('click', () => switchTab('api'));

      locateBtn?.addEventListener('click', async () => {
        if (typeof locateHandler !== 'function') {
          window.toastr?.info?.('本次请求没有可定位的世界书条目');
          return;
        }
        try {
          await locateHandler();
        } catch (err) {
          logger.warn('open world debug locator failed', err);
          window.toastr?.error?.('打开世界书定位失败');
        }
      });
      panel.querySelector('#prompt-preview-close')?.addEventListener('click', hide);
      panel.querySelector('#prompt-preview-copy')?.addEventListener('click', async () => {
        const text = activeTab === 'api' ? apiPlainText : String(textarea?.value || '');
        if (!text) {
          window.toastr?.warning?.('暂无内容可复制');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          window.toastr?.success?.('已复制');
        } catch {
          try {
            if (activeTab === 'prompt' && textarea) {
              textarea.select();
              document.execCommand?.('copy');
            } else {
              const ta = document.createElement('textarea');
              ta.value = text;
              ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
              ta.setAttribute('readonly', 'true');
              document.body.appendChild(ta);
              ta.select();
              document.execCommand?.('copy');
              ta.remove();
            }
            window.toastr?.success?.('已复制');
          } catch {
            window.toastr?.error?.('复制失败');
          }
        }
      });
    };

    const show = (text, meta = '', { onLocate = null, initialTab = 'api' } = {}) => {
      ensure();
      if (!overlay || !panel || !textarea) return;
      locateHandler = typeof onLocate === 'function' ? onLocate : null;
      if (locateBtn) {
        locateBtn.disabled = typeof locateHandler !== 'function';
        locateBtn.style.opacity = locateBtn.disabled ? '0.6' : '1';
        locateBtn.style.cursor = locateBtn.disabled ? 'not-allowed' : 'pointer';
      }
      textarea.value = String(text || '');
      if (metaEl) metaEl.textContent = meta || '';
      overlay.style.display = 'block';
      switchTab(initialTab);
    };

    const hide = () => {
      if (!overlay) return;
      overlay.style.display = 'none';
      locateHandler = null;
    };

    return { show, hide };
  })();
  patchDebugUiRegistry((registry) => {
    registry.actions.showPromptPreviewModal = (text = '', meta = '', options = {}) => promptPreviewModal.show(text, meta, options);
    registry.actions.hidePromptPreviewModal = () => promptPreviewModal.hide();
  });

  const worldDebugLocatorModal = (() => {
    let overlay = null;
    let panel = null;
    let listEl = null;
    let metaEl = null;
    let candidates = [];
    let onSelect = null;

    const ensure = () => {
      if (panel) return;
      overlay = document.createElement('div');
      overlay.id = 'world-debug-locator-overlay';
      overlay.style.cssText = `
                display:none; position:fixed; inset:0;
                background: rgba(0,0,0,0.38);
                z-index: 22010;
                padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
                box-sizing: border-box;
            `;

      panel = document.createElement('div');
      panel.id = 'world-debug-locator-panel';
      panel.style.cssText = `
                width: 100%;
                max-width: 680px;
                height: min(78vh, 760px);
                margin: 0 auto;
                background: var(--app-surface-card);
                border-radius: 14px;
                overflow: hidden;
                display:flex;
                flex-direction:column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());
      panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                    <div style="font-weight:900;">定位世界书</div>
                    <div id="world-debug-locator-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <button id="world-debug-locator-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
                </div>
                <div style="padding:10px 12px; font-size:12px; color:var(--app-text-muted); border-bottom:1px solid #eef2f7;">选择一条记录可直接打开对应世界书并定位到条目/分页。</div>
                <div id="world-debug-locator-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px; display:flex; flex-direction:column; gap:8px;"></div>
            `;

      overlay.appendChild(panel);
      overlay.addEventListener('click', () => hide());
      document.body.appendChild(overlay);

      listEl = panel.querySelector('#world-debug-locator-list');
      metaEl = panel.querySelector('#world-debug-locator-meta');
      panel.querySelector('#world-debug-locator-close')?.addEventListener('click', hide);
      listEl?.addEventListener('click', async (event) => {
        const btn = event.target?.closest?.('button[data-index]');
        if (!btn) return;
        const index = Number(btn.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index >= candidates.length) return;
        const item = candidates[index];
        if (!item || typeof onSelect !== 'function') return;
        try {
          await onSelect(item);
          hide();
        } catch (err) {
          logger.warn('world debug locate failed', err);
          window.toastr?.error?.('定位失败');
        }
      });
    };

    const show = (items = [], { meta = '', onChoose = null } = {}) => {
      ensure();
      candidates = Array.isArray(items) ? items : [];
      onSelect = typeof onChoose === 'function' ? onChoose : null;
      if (metaEl) metaEl.textContent = String(meta || '');
      if (listEl) {
        listEl.innerHTML = '';
        if (!candidates.length) {
          const empty = document.createElement('div');
          empty.style.cssText = 'padding:14px 12px; color:var(--app-text-muted); border:1px dashed var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle);';
          empty.textContent = '本次请求没有可定位的世界书记录。';
          listEl.appendChild(empty);
        } else {
          candidates.forEach((item, index) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.dataset.index = String(index);
            row.style.cssText = 'text-align:left; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); padding:10px 12px; cursor:pointer; display:flex; flex-direction:column; gap:6px;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:13px; font-weight:700; color:var(--app-text-primary);';
            title.textContent = `${item.title || '未命名条目'} (${item.sourceKindLabel || '未知来源'})`;
            const metaLine = document.createElement('div');
            metaLine.style.cssText = 'font-size:12px; color:var(--app-text-secondary);';
            const blockId = String(item.blockId || 'legacy').trim() || 'legacy';
            const blockTitle = String(item.blockTitle || '').trim();
            const blockLabel = blockTitle && blockTitle !== blockId ? `${blockId} (${blockTitle})` : blockId;
            metaLine.textContent = `${item.worldId} / ${item.entryId} / ${blockLabel}`;
            const extra = document.createElement('div');
            extra.style.cssText = 'font-size:12px; color:var(--app-text-muted);';
            extra.textContent = `${item.sectionLabel || '命中记录'} · ${item.positionLabel || '默认 Prompt'} · ${item.role || 'system'}`;
            row.appendChild(title);
            row.appendChild(metaLine);
            row.appendChild(extra);
            listEl.appendChild(row);
          });
        }
      }
      if (overlay) overlay.style.display = 'block';
    };

    const hide = () => {
      if (!overlay) return;
      overlay.style.display = 'none';
      candidates = [];
      onSelect = null;
    };

    return { show, hide };
  })();
  patchDebugUiRegistry((registry) => {
    registry.actions.showWorldDebugLocatorModal = (items = [], options = {}) => worldDebugLocatorModal.show(items, options);
    registry.actions.hideWorldDebugLocatorModal = () => worldDebugLocatorModal.hide();
  });

  const buildWorldDebugLocatorCandidates = (worldDebug = null) => {
    if (!worldDebug || typeof worldDebug !== 'object') return [];
    const sourceKindLabel = {
      builtin: '内置',
      global: '全局',
      role: '角色',
      session: '会话',
    };
    const sections = [
      { key: 'injectedEntries', label: '实际注入' },
      { key: 'templateEntries', label: '模板注入' },
      { key: 'initialVariableEntries', label: '仅变量初始化' },
      { key: 'trimmedEntries', label: '预算裁剪' },
      { key: 'mergedEntries', label: '合并后条目' },
    ];
    const seen = new Set();
    const out = [];
    sections.forEach((section) => {
      const list = Array.isArray(worldDebug?.[section.key]) ? worldDebug[section.key] : [];
      list.forEach((entry) => {
        const worldId = String(entry?.worldId || '').trim();
        const entryId = String(entry?.entryId || '').trim();
        if (!worldId || !entryId) return;
        const blockId = String(entry?.blockId || 'legacy').trim() || 'legacy';
        const blockTitle = String(entry?.blockTitle || '').trim();
        const focusNodeId = String(entry?.focusNodeId || '').trim();
        const key = `${worldId}::${entryId}::${blockId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          key,
          sectionLabel: section.label,
          worldId,
          entryId,
          blockId,
          blockTitle,
          focusNodeId,
          title: String(entry?.title || '').trim() || entryId,
          sourceKind: String(entry?.sourceKind || '').trim() || 'session',
          sourceKindLabel: sourceKindLabel[String(entry?.sourceKind || '').trim()] || String(entry?.sourceKind || '').trim() || '未知',
          positionLabel: String(entry?.positionLabel || '').trim() || '默认 Prompt',
          role: String(entry?.role || 'system').trim() || 'system',
        });
      });
    });
    return out;
  };

  const formatPromptWorldDebug = (worldDebug) => {
    if (!worldDebug || typeof worldDebug !== 'object') return '';
    const listOf = (value) => Array.isArray(value) ? value : [];
    const previewOf = (entry) => String(entry?.contentPreview || '').trim();
    const entryLabel = (entry) => {
      const title = String(entry?.title || '').trim();
      const worldId = String(entry?.worldId || '').trim() || 'unknown';
      const entryId = String(entry?.entryId || '').trim() || 'unknown';
      const blockId = String(entry?.blockId || '').trim() || 'legacy';
      const blockTitle = String(entry?.blockTitle || '').trim();
      const blockLabel = blockTitle && blockTitle !== blockId ? `${blockTitle}(${blockId})` : blockId;
      return `${title} [${worldId} / ${entryId} / ${blockLabel}]`;
    };
    const sourceLabelMap = {
      builtin: '内置',
      global: '全局',
      role: '角色',
      session: '会话',
    };
    const sectionLines = [];
    const pushSection = (title, rows) => {
      const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
      if (!list.length) return;
      sectionLines.push(title);
      sectionLines.push(...list);
    };
    const renderEntryRows = (entries, {
      includePosition = false,
      includeTags = false,
      emptyText = '',
    } = {}) => {
      const list = listOf(entries);
      if (!list.length) return emptyText ? [`- ${emptyText}`] : [];
      return list.map((entry) => {
        const src = sourceLabelMap[String(entry?.sourceKind || '').trim()] || String(entry?.sourceKind || '').trim() || '未知';
        const parts = [
          `- ${src}`,
          entryLabel(entry),
          `${String(entry?.role || 'system')}`,
        ];
        if (includePosition) {
          const pos = String(entry?.positionLabel || '').trim() || '默认 Prompt';
          const depth = Number.isFinite(Number(entry?.depth)) ? Number(entry.depth) : 0;
          parts.push(pos);
          if (depth > 0) parts.push(`depth=${depth}`);
        }
        if (includeTags) {
          const tags = listOf(entry?.tags)
            .map((tag) => {
              const stage = String(tag?.stage || '').trim();
              const type = String(tag?.type || '').trim();
              const mode = String(tag?.mode || '').trim();
              const index = Number.isFinite(Number(tag?.index)) ? `:${Number(tag.index)}` : '';
              const pattern = String(tag?.pattern || '').trim();
              if (type === 'regex' && pattern) return `${stage}:${type}:${pattern}`;
              return `${stage}:${type}${index}${mode ? `:${mode}` : ''}`;
            })
            .filter(Boolean);
          if (tags.length) parts.push(tags.join(', '));
        }
        const preview = previewOf(entry);
        return `${parts.join(' | ')}${preview ? ` | ${preview}` : ''}`;
      });
    };

    const builtinEntries = listOf(worldDebug?.builtinEntries);
    const globalEntries = listOf(worldDebug?.globalEntries);
    const roleEntries = listOf(worldDebug?.roleEntries);
    const sessionEntries = listOf(worldDebug?.sessionEntries);
    const injectedEntries = listOf(worldDebug?.injectedEntries);
    const templateEntries = listOf(worldDebug?.templateEntries);
    const initialVariableEntries = listOf(worldDebug?.initialVariableEntries);
    const trimmedEntries = listOf(worldDebug?.trimmedEntries);
    const mergedEntries = listOf(worldDebug?.mergedEntries);

    const budgetTokens = Number.isFinite(Number(worldDebug?.budgetTokens)) ? Number(worldDebug.budgetTokens) : null;
    const usedTokens = Number.isFinite(Number(worldDebug?.usedTokens)) ? Number(worldDebug.usedTokens) : 0;
    const strategy = String(worldDebug?.insertionStrategy || '').trim() || 'role_first';
    const variableStrategyRaw = String(worldDebug?.variableDefineStrategy || '').trim();
    const variableStrategy = (() => {
      if (variableStrategyRaw === 'first_hit') return 'first_hit（命中后建立）';
      if (variableStrategyRaw === 'off') return 'off（关闭自动建立）';
      return 'legacy_eager（请求前建立）';
    })();

    const header = [
      '[世界书调试]',
      `- 插入策略: ${strategy}`,
      `- 变量自动建立: ${variableStrategy}`,
      `- 激活命中: 内置 ${builtinEntries.length} / 全局 ${globalEntries.length} / 角色 ${roleEntries.length} / 会话 ${sessionEntries.length}`,
      `- 合并后条目: ${mergedEntries.length}（预算前）`,
      `- 实际注入: 普通 ${injectedEntries.length} / 模板 ${templateEntries.length} / 仅变量初始化 ${initialVariableEntries.length}`,
      budgetTokens != null
        ? `- 预算: ${usedTokens}/${budgetTokens} tokens${worldDebug?.overflowed ? `，裁掉 ${trimmedEntries.length} 条` : ''}`
        : '- 预算: 未限制',
    ];

    pushSection('激活条目', [
      ...renderEntryRows(builtinEntries, { emptyText: '无内置命中' }),
      ...renderEntryRows(globalEntries, { emptyText: '无全局命中' }),
      ...renderEntryRows(roleEntries, { emptyText: '无角色命中' }),
      ...renderEntryRows(sessionEntries, { emptyText: '无会话命中' }),
    ]);
    pushSection('合并后（预算前）', renderEntryRows(mergedEntries, { includePosition: true, emptyText: '无合并条目' }));
    pushSection('实际注入', renderEntryRows(injectedEntries, { includePosition: true, emptyText: '无普通注入内容' }));
    pushSection('模板注入', renderEntryRows(templateEntries, { includePosition: true, includeTags: true, emptyText: '无模板注入内容' }));
    pushSection('仅变量初始化', renderEntryRows(initialVariableEntries, { emptyText: '无 InitialVariables 条目' }));
    pushSection('预算裁掉', renderEntryRows(trimmedEntries, { includePosition: true, emptyText: '无预算裁剪' }));

    return [...header, '', ...sectionLines].join('\n').trim();
  };

  const showPromptPreview = () => {
    try {
      const sid = chatStore.getCurrent();
      const contact = contactsStore.getContact(sid);
      const name = contact?.name || sid;
      const req = window.appBridge?.lastRequest;
      const msgs = Array.isArray(req?.messages) ? req.messages : null;
      if (!msgs || !msgs.length) {
        window.toastr?.warning?.('暂无本次 Prompt 记录（请先发送一次）');
        return;
      }
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
      const body =
        typeof buildRequestPromptText === 'function'
          ? buildRequestPromptText(msgs)
          : msgs
              .map(m => String(m?.content ?? ''))
              .filter(t => t.trim().length > 0)
              .join('\n\n');
      const worldDebug = req?.worldDebug && typeof req.worldDebug === 'object' ? req.worldDebug : null;
      const worldDebugText = formatPromptWorldDebug(worldDebug);
      const locateCandidates = buildWorldDebugLocatorCandidates(worldDebug);
      const meta = `${name}${at ? ` · ${at}` : ''}`;
      promptPreviewModal.show(
        [head, worldDebugText, body].filter(Boolean).join('\n\n').trim(),
        meta,
        {
          onLocate: locateCandidates.length
            ? async () => {
                worldDebugLocatorModal.show(locateCandidates, {
                  meta: `${meta} · ${locateCandidates.length} 条可定位记录`,
                  onChoose: async (item) => {
                    promptPreviewModal.hide();
                    const worldId = String(item?.worldId || '').trim();
                    if (!worldId) return;
                    await worldPanel.openEditor(worldId, {
                      entryId: String(item?.entryId || '').trim(),
                      blockId: String(item?.blockId || '').trim(),
                      nodeId: String(item?.focusNodeId || '').trim(),
                    });
                  },
                });
              }
            : null,
        },
      );
    } catch (err) {
      logger.warn('prompt preview failed', err);
      window.toastr?.error?.('打开本次 Prompt 失败');
    }
  };
  if (window.appBridge) {
    window.appBridge.showPromptPreview = showPromptPreview;
  }

  /* ---------------- 头像设置菜单 ---------------- */
  const settingsMenu = document.getElementById('settings-menu');
  const quickMenu = document.getElementById('quick-menu');
  const PERSONA_SWITCHER_TAB_KEY = 'persona_switcher_tab_v2';
  const normalizePersonaSwitcherTab = (value = '') => {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'character' ? 'character' : 'user';
  };
  let personaSwitcherTab = (() => {
    try {
      return normalizePersonaSwitcherTab(localStorage.getItem(PERSONA_SWITCHER_TAB_KEY));
    } catch {
      return 'user';
    }
  })();
  const persistPersonaSwitcherTab = () => {
    try {
      localStorage.setItem(PERSONA_SWITCHER_TAB_KEY, normalizePersonaSwitcherTab(personaSwitcherTab));
    } catch {}
  };
  // 顶部头像/＋按钮在「消息」与「联系人」页共用同样外观
  const avatarBtns = document.querySelectorAll('.qq-message-topbar .user-avatar-btn');
  const settingsBtns = document.querySelectorAll('.qq-message-topbar .user-settings-btn');
  const plusBtns = document.querySelectorAll('.qq-message-topbar .topbar-plus-btn');
  const chatMenuBtn = document.getElementById('chat-menu-btn');
  const chatroomMenu = document.getElementById('chatroom-menu');
  const rpChatroomMenu = document.getElementById('rp-chatroom-menu');
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
  const personaSwitcherMenu = (() => {
    const menu = document.createElement('div');
    menu.id = 'persona-switcher-menu';
    menu.className = 'sheet hidden persona-switcher-menu';
    menu.addEventListener('click', async e => {
      e.stopPropagation();
      const tabBtn = e?.target?.closest?.('button[data-action="switcher-tab"]');
      if (tabBtn) {
        personaSwitcherTab = normalizePersonaSwitcherTab(tabBtn.dataset.tab);
        persistPersonaSwitcherTab();
        renderPersonaSwitcher();
        if (lastPersonaAnchor) positionSheet(menu, lastPersonaAnchor, 0, 4, false);
        return;
      }
      const manageUsersBtn = e?.target?.closest?.('button[data-action="manage-users"]');
      if (manageUsersBtn) {
        hideMenus();
        userPanel.show();
        return;
      }
      const manageCardsBtn = e?.target?.closest?.('button[data-action="manage-cards"]');
      if (manageCardsBtn) {
        hideMenus();
        personaPanel.show();
        return;
      }
      const userBtn = e?.target?.closest?.('button[data-user-id]');
      if (userBtn) {
        const userId = String(userBtn.dataset.userId || '').trim();
        if (!userId) return;
        hideMenus();
        await switchUserProfile(userId);
        return;
      }
      const itemBtn = e?.target?.closest?.('button[data-persona-id]');
      if (!itemBtn) return;
      const personaId = String(itemBtn.dataset.personaId || '').trim();
      if (!personaId) return;
      hideMenus();
      await switchPersona(personaId);
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
    personaSwitcherMenu?.classList.add('hidden');
    settingsMenu?.classList.add('hidden');
    quickMenu?.classList.add('hidden');
    chatroomMenu?.classList.add('hidden');
    rpChatroomMenu?.classList.add('hidden');
    momentsMenu?.classList.add('hidden');
    document.getElementById('chat-title-menu')?.classList.add('hidden');
    const gd = document.getElementById('group-management-dropdown');
    if (gd) gd.style.display = 'none';
    pendingFloatMenu?.classList.add('hidden');
    rpGreetingOverlay?.classList.add('hidden');
    rpGreetingSheet?.classList.add('hidden');
  };
  patchDebugUiRegistry((registry) => {
    registry.actions.hideMenus = hideMenus;
  });

  const positionSheet = (menuEl, anchorEl, offsetX = 0, offsetY = 0, alignRight = false) => {
    if (!menuEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewportPad = 12;
    const wasHidden = menuEl.classList.contains('hidden');
    const prevVisibility = menuEl.style.visibility;
    if (wasHidden) {
      menuEl.classList.remove('hidden');
      menuEl.style.visibility = 'hidden';
    }
    const menuWidth = menuEl.offsetWidth || 180;
    const menuHeight = menuEl.offsetHeight || 120;
    let top = rect.bottom + 1 + offsetY;
    const maxTop = Math.max(viewportPad, window.innerHeight - menuHeight - viewportPad);
    if (top > maxTop) {
      top = rect.top - menuHeight - 8 + offsetY;
    }
    top = Math.min(Math.max(viewportPad, top), maxTop);
    let left = alignRight ? (rect.right - menuWidth + offsetX) : (rect.left + offsetX);
    const maxLeft = Math.max(viewportPad, window.innerWidth - menuWidth - viewportPad);
    left = Math.min(Math.max(viewportPad, left), maxLeft);
    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;
    menuEl.style.right = 'auto';
    if (wasHidden) {
      menuEl.classList.add('hidden');
      menuEl.style.visibility = prevVisibility;
    }
  };

  let lastSettingsAnchor = null;
  let lastPersonaAnchor = null;
  let lastQuickAnchor = null;
  let lastMomentsAnchor = null;

  const toggleSheetAt = (menuEl, anchorEl, { alignRight = false, kind = 'generic' } = {}) => {
    if (!menuEl || !anchorEl) return;
    const isVisible = !menuEl.classList.contains('hidden');
    const lastAnchor =
      kind === 'persona'
        ? lastPersonaAnchor
        : kind === 'settings'
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
    if (kind === 'persona') lastPersonaAnchor = anchorEl;
    if (kind === 'settings') lastSettingsAnchor = anchorEl;
    if (kind === 'quick') lastQuickAnchor = anchorEl;
    if (kind === 'moments') lastMomentsAnchor = anchorEl;
  };

  const renderPersonaSwitcher = () => {
    if (!personaSwitcherMenu) return;
    const sessionId = String(chatStore.getCurrent() || '').trim();
    const activeTab = normalizePersonaSwitcherTab(personaSwitcherTab);
    const tabsHtml = `
      <div class="persona-switcher-tabs">
        <button type="button" data-action="switcher-tab" data-tab="user" class="${activeTab === 'user' ? 'is-active' : ''}">用户</button>
        <button type="button" data-action="switcher-tab" data-tab="character" class="${activeTab === 'character' ? 'is-active' : ''}">角色卡</button>
      </div>
    `;

    if (activeTab === 'user') {
      const activeUser = getActiveUserProfile();
      const users = Array.isArray(userStore.getAll?.()) ? userStore.getAll() : [];
      const currentAccent = getPersonaAccent(activeUser);
      const currentAvatar = escapeHtml(getActiveUserAvatar());
      const currentName = escapeHtml(getActiveUserName());
      const items = users.map(user => {
        const userId = String(user?.id || '').trim();
        if (!userId) return '';
        if (userId === String(activeUser?.id || '').trim()) return '';
        const accent = getPersonaAccent(user);
        const avatar = escapeHtml(String(user?.avatar || '').trim() || getDefaultAppIcon());
        const name = escapeHtml(String(user?.name || '').trim() || '我');
        return `
          <button
            type="button"
            class="persona-switcher-item"
            data-user-id="${escapeHtml(userId)}"
          >
            <div class="persona-switcher-avatar" style="--persona-accent:${accent.color}; --persona-accent-soft:${accent.soft};">
              <img src="${avatar}" alt="">
            </div>
            <div class="persona-switcher-meta">
              <span class="persona-switcher-name" style="--persona-accent:${accent.color}; --persona-accent-soft:${accent.soft};">${name}</span>
              <div class="persona-switcher-subtitle">${escapeHtml(String(user?.description || '').trim() || '点击切换用户')}</div>
            </div>
          </button>
        `;
      }).filter(Boolean).join('');

      personaSwitcherMenu.innerHTML = `
        ${tabsHtml}
        <div class="persona-switcher-current">
          <div class="persona-switcher-avatar" style="--persona-accent:${currentAccent.color}; --persona-accent-soft:${currentAccent.soft};">
            <img src="${currentAvatar}" alt="">
          </div>
          <div class="persona-switcher-meta">
            <span class="persona-switcher-name" style="--persona-accent:${currentAccent.color}; --persona-accent-soft:${currentAccent.soft};">${currentName}</span>
            <div class="persona-switcher-subtitle">当前用户</div>
          </div>
        </div>
        <div class="persona-switcher-list">
          ${items || '<div class="persona-switcher-subtitle" style="padding: 8px 4px;">暂无其他用户</div>'}
        </div>
        <div class="persona-switcher-actions">
          <button type="button" data-action="manage-users">管理用户</button>
        </div>
      `;
      return;
    }

    const activePersona = personaStore.getActive?.() || null;
    const effectivePersona = getEffectivePersona(sessionId);
    const lockPersonaId = String(chatStore.getPersonaLock?.(sessionId) || '').trim();
    const personas = Array.isArray(personaStore.getAll?.()) ? personaStore.getAll() : [];
    const currentAccent = getPersonaAccent(effectivePersona);
    const currentAvatar = escapeHtml(String(effectivePersona?.avatar || '').trim() || getDefaultAppIcon());
    const currentName = escapeHtml(getCharacterCardName(effectivePersona, '角色卡'));
    const currentSub = lockPersonaId
      ? '当前会话使用此角色卡'
      : '当前全局角色卡';
    const items = personas.map(persona => {
      const personaId = String(persona?.id || '').trim();
      if (!personaId) return '';
      if (personaId === String(effectivePersona?.id || '').trim()) return '';
      const accent = getPersonaAccent(persona);
      const avatar = escapeHtml(String(persona?.avatar || '').trim() || getDefaultAppIcon());
      const name = escapeHtml(getCharacterCardName(persona, personaId));
      const isActive = personaId === String(activePersona?.id || '').trim();
      const isLocked = personaId === lockPersonaId;
      const boundUserId = getBoundUserIdForCharacterCard(persona);
      const boundUser = boundUserId ? userStore.get?.(boundUserId) : null;
      const tags = [];
      if (isActive) tags.push('<span class="persona-switcher-tag">全局</span>');
      if (isLocked) tags.push('<span class="persona-switcher-tag is-lock">🔒 已锁定</span>');
      if (boundUser) tags.push(`<span class="persona-switcher-tag">绑定 ${escapeHtml(String(boundUser?.name || '').trim() || '用户')}</span>`);
      return `
        <button
          type="button"
          class="persona-switcher-item${isActive ? ' is-active' : ''}"
          data-persona-id="${escapeHtml(personaId)}"
        >
          <div class="persona-switcher-avatar" style="--persona-accent:${accent.color}; --persona-accent-soft:${accent.soft};">
            <img src="${avatar}" alt="">
          </div>
          <div class="persona-switcher-meta">
            <span class="persona-switcher-name" style="--persona-accent:${accent.color}; --persona-accent-soft:${accent.soft};">${name}</span>
            <div class="persona-switcher-tags">${tags.join('')}</div>
          </div>
          ${isActive ? '<span class="persona-switcher-check">✓</span>' : ''}
        </button>
      `;
    }).filter(Boolean).join('');

    personaSwitcherMenu.innerHTML = `
      ${tabsHtml}
      <div class="persona-switcher-current">
        <div class="persona-switcher-avatar" style="--persona-accent:${currentAccent.color}; --persona-accent-soft:${currentAccent.soft};">
          <img src="${currentAvatar}" alt="">
        </div>
        <div class="persona-switcher-meta">
          <span class="persona-switcher-name" style="--persona-accent:${currentAccent.color}; --persona-accent-soft:${currentAccent.soft};">${currentName}</span>
          <div class="persona-switcher-subtitle">${currentSub}</div>
        </div>
      </div>
      <div class="persona-switcher-list">
        ${items || '<div class="persona-switcher-subtitle" style="padding: 8px 4px;">暂无其他角色卡</div>'}
      </div>
      <div class="persona-switcher-actions">
        <button type="button" data-action="manage-cards">管理角色卡</button>
      </div>
    `;
  };

  avatarBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      renderPersonaSwitcher();
      toggleSheetAt(personaSwitcherMenu, btn, { kind: 'persona' });
    });
  });

  settingsBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSheetAt(settingsMenu, btn, { alignRight: true, kind: 'settings' });
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
    const menu = uiMode === 'rp' ? rpChatroomMenu : chatroomMenu;
    if (!menu) return;
    positionSheet(menu, chatMenuBtn, 0, 4, true);
    menu.classList.toggle('hidden');
    settingsMenu?.classList.add('hidden');
    quickMenu?.classList.add('hidden');
  });
  document.addEventListener('click', hideMenus);

  settingsMenu?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'settings') generalSettingsPanel.show();
      if (action === 'preset') presetPanel.show();
      if (action === 'world-global') worldPanel.show({ scope: 'global' });
      if (action === 'extensions') extensionsPanel.show();
      if (action === 'config') configPanel.show();
      if (action === 'session-config') sessionConfigPanel.show();
      hideMenus();
    });
  });
  const bindChatroomMenuActions = (menuEl) => {
    menuEl?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'world') worldPanel.show();
        if (action === 'regex') regexSessionPanel.show();
        if (action === 'vars') {
          blurComposerInput();
          variablePanel.show();
        }
        if (action === 'chat-settings') openChatSettings();
        if (action === 'prompt-preview') {
          showPromptPreview();
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
  };
  bindChatroomMenuActions(chatroomMenu);
  bindChatroomMenuActions(rpChatroomMenu);

  // Chat title menu (click current title)
  const chatTitleMenu = document.getElementById('chat-title-menu');
  const currentChatTitle = document.getElementById('current-chat-title');

  const ensureGroupDropdown = () => {
    let el = document.getElementById('group-management-dropdown');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'group-management-dropdown';
    el.className = 'group-management-dropdown';
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
            <div class="group-dd-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); border-radius:12px 12px 0 0;">
                <div class="group-dd-title" style="font-weight:900; color:var(--app-text-primary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <button id="group-dd-session-config" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer; font-size:14px;">📋</button>
                    <button id="group-dd-settings" class="group-dd-settings" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;">⚙</button>
                </div>
            </div>
            <div class="group-dd-list" style="padding:8px 0;">
                ${
                  members
                    .map(mid => {
                      const c = contactsStore.getContact(mid);
                      const name = c?.name || mid;
                      const avatar = resolveAvatarForContact(mid, c);
                      return `
                        <button class="group-dd-member" data-mid="${mid}" style="width:100%; display:flex; align-items:center; gap:10px; padding:10px 12px; border:none; background:transparent; cursor:pointer; text-align:left;">
                            <img src="${avatar}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                            <div class="group-dd-member-meta" style="flex:1; min-width:0;">
                                <div class="group-dd-member-name" style="font-weight:700; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                                <div class="group-dd-member-sub" style="color:var(--app-text-muted); font-size:12px;">点击进入私聊</div>
                            </div>
                        </button>
                    `;
                    })
                    .join('') || `<div class="group-dd-empty" style="color:var(--app-text-muted); font-size:13px; padding:10px 12px;">暂无成员</div>`
                }
            </div>
        `;

    positionSheet(el, anchorEl, 0, 6, false);
    el.style.display = 'block';

    el.querySelector('#group-dd-session-config')?.addEventListener('click', () => {
      el.style.display = 'none';
      sessionConfigPanel.show({ sessionId: chatStore.getCurrent() });
    });
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
        switchPage('chat', { animate: false });
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
      if (action === 'session-config') sessionConfigPanel.show({ sessionId: chatStore.getCurrent() });
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

  const enterChatRoom = async (sessionId, sessionName, originPage = activePage, options = {}) => {
    const suppressInitialAutoScroll = options?.suppressInitialAutoScroll === true;
    const jumpTargetMessageId = String(options?.jumpTargetMessageId || '').trim();
    const jumpKeyword = String(options?.jumpKeyword || '').trim();
    const jumpKind = String(options?.jumpKind || (jumpKeyword ? 'search' : 'anchor')).trim() || 'anchor';
    chatOriginPage = originPage || 'chat';
    chatList?.classList.add('hidden');
    chatRoom?.classList.remove('hidden');
    pages.chat?.classList.add('chat-room-active');
    document.body?.classList.add('chat-room-active');
    chatInputGapTweak = 0;
    setStickerPanelOpen(false);
    scheduleModeSwitchSync();
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
    const isGroupSession = Boolean(contact?.isGroup) || String(sessionId || '').startsWith('group:');
    // 切换会话
    chatStore.switchSession(sessionId);
    stageManager?.setSession?.(sessionId);
    stageTimeline?.setSession?.(sessionId);
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
    hydrateTurnCheckpointsFromLoadedMessages(sessionId, { onlyMissing: true }).catch(err => {
      logger.warn('hydrate turn checkpoints from loaded messages failed', err);
    });
    const currentArchiveId = getCurrentArchiveIdForSession(sessionId);
    const restoreOnEnter = currentArchiveId
      ? restoreArchivePointerForLoadedThread(sessionId, {
          refreshBaselineWhenNoTail: true,
          source: 'enter_chat_room_archive',
        })
      : restoreMemoryFromCurrentTailAssistant(sessionId, {
          refreshBaselineWhenNoTail: true,
          source: 'enter_chat_room',
        });
    Promise.resolve(restoreOnEnter).catch(err => {
      logger.warn('restore tail assistant memory state on enter failed', err);
    });
    chatStore.prefetchRawOriginals?.(sessionId).catch(() => {});
    // Keep a render cursor so we can lazy-load earlier messages when scrolling up.
    chatRenderState.set(sessionId, { start });
    const jumpTargetNow = () => {
      if (!jumpTargetMessageId) return false;
      return ui.scrollToMessage(jumpTargetMessageId, {
        keyword: jumpKeyword,
        kind: jumpKind,
        dismissOnScroll: true,
      });
    };
    const jumpedToTarget = jumpTargetNow();

    const jumpToUnread = () => {
      if (dividerId && ui.scrollToMessage(dividerId, { kind: 'unread', dismissOnScroll: true })) return true;
      if (firstUnreadId) return ui.scrollToMessage(firstUnreadId, { kind: 'unread', dismissOnScroll: true });
      return false;
    };
    if (jumpedToTarget) {
      try {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(syncChatBottomGap);
        } else {
          setTimeout(syncChatBottomGap, 0);
        }
      } catch {
        setTimeout(syncChatBottomGap, 0);
      }
    } else if (suppressInitialAutoScroll) {
      try {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(syncChatBottomGap);
        } else {
          setTimeout(syncChatBottomGap, 0);
        }
      } catch {
        setTimeout(syncChatBottomGap, 0);
      }
    } else if (dividerId || firstUnreadId) {
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
    syncReplyTargetComposer(sessionId);
    ui.setSessionLabel(sessionId);
    if (uiStateArmed) saveUiState();
    updatePendingFloat(sessionId);
    if (activeGeneration && !activeGeneration.cancelled && activeGeneration.sessionId === sessionId) {
      let reattached = false;
      const hasStreamText = String(activeGeneration.streamText || '').trim().length > 0;
      if (hasStreamText && typeof activeGeneration.reattachStream === 'function') {
        try {
          reattached = activeGeneration.reattachStream() === true;
        } catch (err) {
          logger.warn('assistant stream reattach failed', err);
        }
      }
      if (!reattached) ui.showTyping(getAssistantAvatarForSession(sessionId), getGroupTypingMembers(sessionId) || {});
    }
    uiLog('enterChatRoom', { sessionId, originPage: chatOriginPage });
    return { jumpedToTarget };
  };

  const exitChatRoom = (options) => {
    chatRoom?.classList.add('hidden');
    chatList?.classList.remove('hidden');
    pages.chat?.classList.remove('chat-room-active');
    document.body?.classList.remove('chat-room-active');
    stageTimeline?.render?.('');
    setStickerPanelOpen(false);
    setActionPanelOpen(false);
    ui.setReplyTarget(null);
    scheduleModeSwitchSync();
    scheduleWallpaperIdle();

    // 恢复显示消息界面顶部和底部导航栏
    const messageTopbar = document.getElementById('message-topbar');
    const bottomNav = document.querySelector('.bottom-nav');
    if (messageTopbar) messageTopbar.style.display = '';
    if (bottomNav) bottomNav.style.display = '';
    updateChatContentSearchVisibility();

    if (chatOriginPage && chatOriginPage !== 'chat') {
      switchPage(chatOriginPage, { ...options, animate: false });
    }
    chatOriginPage = 'chat';
    updatePendingFloat();
    if (uiStateArmed) saveUiState();
    uiLog('exitChatRoom', { activePage, sessionId: chatStore.getCurrent() });
  };
  patchDebugUiRegistry((registry) => {
    registry.actions.enterChatRoom = enterChatRoom;
    registry.actions.exitChatRoom = exitChatRoom;
  });

  const rpCharacterNameCache = new Map();
  const getRpCharacterName = (persona = null) => {
    const p = persona || personaStore.getActive?.() || {};
    const source = p?.source && typeof p.source === 'object' ? p.source : {};
    const sourceName = String(source?.characterName || source?.cardName || '').trim();
    if (source?.type === 'character_card' && sourceName) return sourceName;
    if (source?.type === 'character_card' && p?.id && rpCharacterNameCache.has(p.id)) {
      return rpCharacterNameCache.get(p.id);
    }
    const name = String(p?.name || '').trim();
    return name || '角色';
  };
  const hydrateRpCharacterNameFromCard = async (persona = null) => {
    const p = persona || personaStore.getActive?.() || {};
    const pid = String(p?.id || '').trim();
    if (!pid) return '';
    const source = p?.source && typeof p.source === 'object' ? p.source : {};
    if (source.type !== 'character_card') return '';
    const existing = String(source?.characterName || '').trim();
    if (existing) {
      rpCharacterNameCache.set(pid, existing);
      return existing;
    }
    const cached = rpCharacterNameCache.get(pid);
    if (cached) return cached;
    const raw = await window.appBridge?.loadPersonaCard?.(pid);
    if (!raw || raw._tooLarge) return '';
    let normalized = raw;
    try {
      normalized = normalizeCharacterCard(raw);
    } catch {}
    const name = String(normalized?.name || raw?.name || raw?.data?.name || '').trim();
    if (!name) return '';
    rpCharacterNameCache.set(pid, name);
    try {
      await personaStore.update?.(pid, { source: { ...source, characterName: name } });
    } catch {}
    if (uiMode === 'rp') {
      const rpSessionId = getRpSessionId(pid);
      if (String(chatStore.getCurrent() || '') === rpSessionId && currentChatTitle) {
        currentChatTitle.textContent = name;
      }
    }
    return name;
  };

  const getRpTitle = () => {
    const name = getRpCharacterName();
    return name || '创意写作';
  };
  const getPromptUserName = (sessionId = chatStore.getCurrent()) => {
    const name = String(getActiveUserProfile()?.name || '').trim();
    return name || '我';
  };

  const getRpGreetings = () => rpSessionStore.getGreetings?.() || [];
  const previewLogText = (value, maxLen = 120) => {
    const raw = String(value || '');
    if (!raw) return '';
    const oneLine = raw.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= maxLen) return oneLine;
    return `${oneLine.slice(0, maxLen)}...`;
  };
  const logRpGreetingDebug = (stage, fields = {}) => {
    try {
      const detail = Object.entries(fields)
        .map(([key, value]) => `${key}=${String(value ?? '')}`)
        .join(' ');
      logger.info(`[rp-greeting] ${stage}${detail ? ` ${detail}` : ''}`);
    } catch {}
  };
  const hasRpConversation = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const messages = chatStore.getMessages(sid) || [];
    return messages.some(m => m?.role === 'user');
  };
  const ensureRpGreetingActive = () => {
    const list = getRpGreetings();
    if (!list.length) return null;
    const activeId = String(rpSessionStore.getActiveGreetingId?.() || '').trim();
    const found = activeId ? list.find(item => String(item?.id || '') === activeId) : null;
    if (found) return found;
    const first = list[0] || null;
    const nextId = first?.id || '';
    if (nextId) rpSessionStore.setActiveGreeting?.(nextId);
    return first;
  };

  const renderRpToolbar = () => {
    if (!rpGreetingName) return;
    const list = getRpGreetings();
    if (!list.length) {
      rpGreetingName.textContent = '无开场白';
      if (rpGreetingTrigger) rpGreetingTrigger.disabled = true;
      return;
    }
    const active = ensureRpGreetingActive();
    const idx = list.findIndex(g => String(g?.id || '') === String(active?.id || ''));
    rpGreetingName.textContent = active?.title || `开场白 ${idx >= 0 ? idx + 1 : 1}`;
    if (rpGreetingTrigger) rpGreetingTrigger.disabled = false;
  };

  const refreshRpToolbar = (sessionId = getRpSessionId(activePersonaId)) => {
    if (!rpToolbar) return;
    if (uiMode !== 'rp') {
      rpToolbar.style.display = 'none';
      return;
    }
    rpToolbar.style.display = '';
    renderRpToolbar();
    const list = getRpGreetings();
    const locked = hasRpConversation(sessionId);
    if (rpGreetingTrigger) {
      rpGreetingTrigger.disabled = !list.length || locked;
    }
  };

  const openRpGreetingSheet = () => {
    if (!rpGreetingSheet || !rpGreetingSheetList) return;
    const list = getRpGreetings();
    const activeId = String(rpSessionStore.getActiveGreetingId?.() || '').trim();
    const sessionId = getRpSessionId(activePersonaId);
    const locked = hasRpConversation(sessionId);
    rpGreetingSheetList.innerHTML = '';
    list.forEach((g, idx) => {
      const id = String(g?.id || '').trim();
      const isActive = id === activeId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rp-greeting-sheet-item' + (isActive ? ' active' : '');
      if (locked) btn.disabled = true;
      const check = document.createElement('span');
      check.className = 'rp-greeting-sheet-item-check';
      check.textContent = isActive ? '✓' : '';
      const text = document.createElement('span');
      text.className = 'rp-greeting-sheet-item-text';
      text.textContent = g?.title || `开场白 ${idx + 1}`;
      btn.appendChild(check);
      btn.appendChild(text);
      btn.addEventListener('click', async () => {
        if (locked || isActive) { closeRpGreetingSheet(); return; }
        closeRpGreetingSheet();
        await setRpGreeting(id, sessionId);
      });
      rpGreetingSheetList.appendChild(btn);
    });
    if (rpGreetingSheetReset) rpGreetingSheetReset.style.display = locked ? '' : 'none';
    rpGreetingOverlay?.classList.remove('hidden');
    rpGreetingSheet.classList.remove('hidden');
  };

  const closeRpGreetingSheet = () => {
    rpGreetingOverlay?.classList.add('hidden');
    rpGreetingSheet?.classList.add('hidden');
  };

  const getRpGreetingState = (sessionId = getRpSessionId(activePersonaId)) => {
    const sid = String(sessionId || '').trim();
    const list = getRpGreetings()
      .map(item => ({
        id: String(item?.id || '').trim(),
        title: String(item?.title || '').trim(),
      }))
      .filter(item => item.id);
    return {
      sessionId: sid,
      greetings: list,
      activeId: String(rpSessionStore.getActiveGreetingId?.() || '').trim(),
      locked: hasRpConversation(sid),
    };
  };

  const setRpGreeting = async (nextId, sessionId = getRpSessionId(activePersonaId)) => {
    const sid = String(sessionId || '').trim();
    const targetId = String(nextId || '').trim();
    if (!sid || !targetId) return false;
    if (hasRpConversation(sid)) {
      window.toastr?.info?.('已有互动，无法切换开场白');
      refreshRpToolbar(sid);
      return false;
    }
    const prevId = String(rpSessionStore.getActiveGreetingId?.() || '').trim();
    if (targetId === prevId) return true;
    blurComposerInput();
    rpSessionStore.setActiveGreeting?.(targetId);
    await resetRpHistory(sid);
    return true;
  };

  try {
    if (window.appBridge) {
      window.appBridge.getRpGreetingState = getRpGreetingState;
      window.appBridge.setRpGreeting = setRpGreeting;
    }
  } catch {}

  const buildRpGreetingMessage = (greeting, sessionId) => {
    const isPlainObject = (val) => (
      val && typeof val === 'object' && !Array.isArray(val)
    );
    const deepEqual = (a, b) => {
      if (Object.is(a, b)) return true;
      if (typeof a !== typeof b) return false;
      if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => deepEqual(v, b[i]));
      }
      if (isPlainObject(a)) {
        if (!isPlainObject(b)) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(k => deepEqual(a[k], b[k]));
      }
      return false;
    };
    const stripCodeFence = (text) => {
      const raw = String(text || '').trim();
      if (!raw) return '';
      const withoutStart = raw.replace(/^```[a-z0-9_-]*\s*/i, '');
      return withoutStart.replace(/```\s*$/i, '').trim();
    };
    const safeJsonParse = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };
    const parseLooseJson = (text) => {
      let raw = String(text || '').trim();
      if (!raw) return null;
      raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      raw = raw.replace(/(^|[^\\])\/\/.*$/gm, '$1');
      raw = raw.replace(/,\s*([}\]])/g, '$1');
      raw = raw.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":');
      raw = raw.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_m, body) => {
        const cleaned = String(body || '').replace(/\\"/g, '"').replace(/"/g, '\\"');
        return `"${cleaned}"`;
      });
      return safeJsonParse(raw);
    };
    const parseYamlScalar = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return '';
      if (text === 'null' || text === '~') return null;
      if (text === 'true') return true;
      if (text === 'false') return false;
      if (/^[+-]?\d+(\.\d+)?$/.test(text)) return Number(text);
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
      }
      if (text.startsWith('{') || text.startsWith('[')) {
        const parsed = parseLooseJson(text);
        if (parsed !== null) return parsed;
      }
      return text;
    };
    const parseSimpleYaml = (text) => {
      const lines = String(text || '').replace(/\t/g, '  ').split(/\r?\n/);
      const root = {};
      const stack = [{ indent: -1, container: root, parent: null, key: null }];
      const parseKeyValue = (line) => {
        const idx = line.indexOf(':');
        if (idx < 0) return null;
        const key = line.slice(0, idx).trim();
        if (!key) return null;
        const rest = line.slice(idx + 1).trim();
        return { key, value: rest, hasValue: rest.length > 0 };
      };
      for (const rawLine of lines) {
        const line = String(rawLine || '');
        if (!line.trim()) continue;
        if (/^\s*#/.test(line)) continue;
        const indent = line.match(/^ */)?.[0]?.length ?? 0;
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
          stack.pop();
        }
        const ctx = stack[stack.length - 1];
        const trimmed = line.trim();
        if (trimmed.startsWith('- ')) {
          const itemRaw = trimmed.slice(2).trim();
          if (!Array.isArray(ctx.container)) {
            if (ctx.parent && ctx.key) {
              const nextArr = [];
              ctx.parent[ctx.key] = nextArr;
              ctx.container = nextArr;
            } else {
              return null;
            }
          }
          if (!itemRaw) {
            const obj = {};
            ctx.container.push(obj);
            stack.push({ indent, container: obj, parent: ctx.container, key: String(ctx.container.length - 1) });
            continue;
          }
          const kv = parseKeyValue(itemRaw);
          if (kv) {
            const obj = {};
            if (kv.hasValue) {
              obj[kv.key] = parseYamlScalar(kv.value);
            } else {
              obj[kv.key] = {};
              stack.push({ indent, container: obj[kv.key], parent: obj, key: kv.key });
            }
            ctx.container.push(obj);
            continue;
          }
          ctx.container.push(parseYamlScalar(itemRaw));
          continue;
        }
        const kv = parseKeyValue(trimmed);
        if (!kv) continue;
        if (!isPlainObject(ctx.container)) {
          return null;
        }
        if (kv.hasValue) {
          ctx.container[kv.key] = parseYamlScalar(kv.value);
        } else {
          ctx.container[kv.key] = {};
          stack.push({ indent, container: ctx.container[kv.key], parent: ctx.container, key: kv.key });
        }
      }
      return root;
    };
    const extractStatData = (payload) => {
      if (!payload || typeof payload !== 'object') return null;
      if (payload.stat_data && typeof payload.stat_data === 'object') return payload.stat_data;
      if (payload.mvu_data && typeof payload.mvu_data === 'object') {
        const nested = payload.mvu_data.stat_data || payload.mvu_data.statData;
        if (nested && typeof nested === 'object') return nested;
      }
      if (payload.data && typeof payload.data === 'object') {
        const nested = payload.data.stat_data || payload.data.statData;
        if (nested && typeof nested === 'object') return nested;
      }
      return null;
    };
    const mergeDeep = (base, override) => {
      const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
      if (!override || typeof override !== 'object') return out;
      Object.entries(override).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          out[key] = value.slice();
        } else if (isPlainObject(value) && isPlainObject(out[key])) {
          out[key] = mergeDeep(out[key], value);
        } else {
          out[key] = value;
        }
      });
      return out;
    };
    const parseInitVarPayload = (text) => {
      const raw = stripCodeFence(text);
      if (!raw) return null;
      const direct = safeJsonParse(raw);
      if (direct && typeof direct === 'object') return direct;
      const loose = parseLooseJson(raw);
      if (loose && typeof loose === 'object') return loose;
      const yaml = parseSimpleYaml(raw);
      if (yaml && typeof yaml === 'object') return yaml;
      return null;
    };
    const extractInitVarBlocks = (text, sid, macroContext = {}) => {
      const raw = String(text || '');
      const blocks = [];
      const re = /<(initvar)>(?:\s*```.*)?([\s\S]*?)(?:```\s*)?<\/\1>/gim;
      const cleaned = raw.replace(re, (_m, _tag, body) => {
        if (body) blocks.push(body);
        return '';
      });
      if (!blocks.length) return { text: raw, data: null, blockCount: 0 };
      let merged = null;
      blocks.forEach((block) => {
        const processed = window.appBridge?.processTextMacros
          ? window.appBridge.processTextMacros(String(block || ''), { sessionId: sid, uiMode, ...macroContext })
          : String(block || '');
        const parsed = parseInitVarPayload(processed);
        const data = extractStatData(parsed) || parsed;
        if (data && typeof data === 'object') {
          merged = mergeDeep(merged || {}, data);
        }
      });
      if (!merged || !Object.keys(merged).length) return { text: raw, data: null, blockCount: blocks.length };
      const nextText = cleaned.replace(/\n{3,}/g, '\n\n').trim();
      return { text: nextText, data: merged, blockCount: blocks.length };
    };
    const normalizeInitVarData = (data, sid, meta) => {
      const log = meta && typeof meta === 'object' ? meta : null;
      if (!data || typeof data !== 'object') return null;
      const schemaMap = chatStore.listVariableSchemas?.(sid) || {};
      const schemaKeys = Object.keys(schemaMap);
      if (log) {
        log.rawKeys = Object.keys(data || {}).map(key => String(key || '').trim()).filter(Boolean);
        log.schemaKeys = schemaKeys.slice();
        log.mappedPath = [];
        log.mappedLeaf = [];
        log.unmatched = [];
        log.noSchema = false;
      }
      if (!schemaKeys.length) {
        if (log) log.noSchema = true;
        return data;
      }
      const leafIndex = {};
      schemaKeys.forEach((key) => {
        const name = String(key || '').trim();
        if (!name) return;
        const leaf = name.split('.').pop() || name;
        if (!leafIndex[leaf]) leafIndex[leaf] = [];
        leafIndex[leaf].push(name);
      });
      const out = {};
      schemaKeys.forEach((key) => {
        const name = String(key || '').trim();
        if (!name) return;
        const hit = getValueAtPath(data, name);
        if (hit !== undefined) {
          out[name] = hit;
          if (log) log.mappedPath.push(name);
        }
      });
      Object.entries(data || {}).forEach(([key, value]) => {
        const name = String(key || '').trim();
        if (!name) return;
        if (Object.prototype.hasOwnProperty.call(out, name)) return;
        if (schemaMap[name]) return;
        const candidates = leafIndex[name] || [];
        if (candidates.length === 1 && !Object.prototype.hasOwnProperty.call(out, candidates[0])) {
          out[candidates[0]] = value;
          if (log) log.mappedLeaf.push({ from: name, to: candidates[0] });
          return;
        }
        out[name] = value;
        if (log) log.unmatched.push(name);
      });
      if (log) {
        log.normalizedKeys = Object.keys(out);
        log.missingSchema = schemaKeys.filter(key => !Object.prototype.hasOwnProperty.call(out, key));
        log.unmatchedNested = [];
        const collectNested = (prefix, obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 2) return;
          Object.keys(obj).forEach((child) => {
            const name = String(child || '').trim();
            if (!name) return;
            const path = prefix ? `${prefix}.${name}` : name;
            log.unmatchedNested.push(path);
            collectNested(path, obj[child], depth + 1);
          });
        };
        (log.unmatched || []).forEach((name) => {
          const val = data[name];
          collectNested(name, val, 0);
        });
      }
      return out;
    };

    const applyInitVarToSession = (data, sid, { preferInit = false, source = '' } = {}) => {
      if (!data || typeof data !== 'object') return false;
      const sessionId = String(sid || '').trim();
      if (!sessionId) return false;
      const meta = {};
      const normalized = normalizeInitVarData(data, sessionId, meta) || {};
      if (logger?.info) {
        const rawKeys = meta.rawKeys || Object.keys(data || {});
        const normalizedKeys = meta.normalizedKeys || Object.keys(normalized || {});
        const mappedLeaf = Array.isArray(meta.mappedLeaf) ? meta.mappedLeaf : [];
        const unmatched = Array.isArray(meta.unmatched) ? meta.unmatched : [];
        const missingSchema = Array.isArray(meta.missingSchema) ? meta.missingSchema : [];
        const unmatchedNested = Array.isArray(meta.unmatchedNested) ? meta.unmatchedNested : [];
        logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} raw=${rawKeys.length} normalized=${normalizedKeys.length} schema=${(meta.schemaKeys || []).length} mappedLeaf=${mappedLeaf.length} unmatched=${unmatched.length}`);
        if (meta.noSchema) logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} no schema detected, using raw keys`);
        if (mappedLeaf.length) {
          const pairs = mappedLeaf.map(item => `${item.from}->${item.to}`).join(', ');
          logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} leaf mapped: ${pairs}`);
        }
        if (unmatched.length) logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} unmatched: ${unmatched.join(', ')}`);
        if (missingSchema.length) {
          const sample = missingSchema.slice(0, 12).join(', ');
          logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} missing schema keys (${missingSchema.length}): ${sample}`);
        }
        if (unmatchedNested.length) {
          const sample = unmatchedNested.slice(0, 20).join(', ');
          logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} nested keys under unmatched: ${sample}`);
        }
      }
      const existing = chatStore.listVariables(sessionId) || {};
      const hasExisting = Object.keys(existing).length > 0;
      let merged = {};
      const mergedUpdates = {};
      if (!hasExisting) {
        merged = normalized;
      } else if (!preferInit) {
        merged = mergeDeep(normalized, existing);
      } else {
        merged = { ...existing };
        Object.entries(normalized).forEach(([key, value]) => {
          const name = String(key || '').trim();
          if (!name) return;
          if (!Object.prototype.hasOwnProperty.call(existing, name)) {
            merged[name] = value;
            mergedUpdates[name] = value;
            return;
          }
          const initial = chatStore.getInitialVariable?.(name, sessionId);
          if (initial !== undefined && !deepEqual(existing[name], initial)) {
            return; // user changed; keep existing
          }
          merged[name] = value;
          mergedUpdates[name] = value;
        });
      }
      let changed = false;
      Object.entries(merged).forEach(([key, value]) => {
        const name = String(key || '').trim();
        if (!name) return;
        if (hasExisting && deepEqual(existing[name], value)) return;
        chatStore.setVariable(name, value, sessionId);
        if (chatStore.getInitialVariable(name, sessionId) === undefined) {
          chatStore.setInitialVariable(name, value, sessionId);
        }
        changed = true;
      });
      if (preferInit && hasExisting && logger?.info) {
        const applied = Object.keys(mergedUpdates);
        if (applied.length) {
          logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} applied=${applied.length} (respecting user changes)`);
        } else {
          logger.info(`[initvar] session=${sessionId} source=${source || 'unknown'} applied=0 (all keys already set or user-changed)`);
        }
      }
      return changed;
    };
    const extractInitVarFromWorldbooks = (sid, macroContext = {}) => {
      const app = window.appBridge;
      const ids = new Set();
      const globalId = String(app?.globalWorldId || '').trim();
      if (globalId) ids.add(globalId);
      const sessionIds = Array.isArray(app?.getWorldIdsForSession?.(sid))
        ? app.getWorldIdsForSession(sid)
        : Array.isArray(app?.currentWorldIds)
          ? app.currentWorldIds
          : [];
      sessionIds.forEach((id) => {
        const name = String(id || '').trim();
        if (name) ids.add(name);
      });
      if (!ids.size) return null;
      let merged = null;
      ids.forEach((id) => {
        const world = app?.worldStore?.load?.(id);
        const entries = Array.isArray(world?.entries) ? world.entries : [];
        entries.forEach((entry) => {
          const tag = String(entry?.comment || entry?.title || entry?.name || '').toLowerCase();
          if (!tag.includes('[initvar]')) return;
          let body = String(entry?.content || '');
          const fenced = body.trim().match(/```.*\n([\s\S]*?)\n```/m);
          if (fenced && fenced[1]) body = fenced[1];
          const processed = app?.processTextMacros
            ? app.processTextMacros(body, { sessionId: sid, uiMode, ...macroContext })
            : body;
          const parsed = parseInitVarPayload(processed);
          const data = extractStatData(parsed) || parsed;
          if (data && typeof data === 'object') {
            merged = mergeDeep(merged || {}, data);
          }
        });
      });
      if (!merged || !Object.keys(merged).length) return null;
      return merged;
    };

    const greetingId = String(greeting?.id || '').trim();
    const content = String(greeting?.content || '').trim();
    const assistantName = String(getRpCharacterName() || '角色');
    const promptUserName = getPromptUserName(sessionId);
    const macroContext = { user: promptUserName, char: assistantName };
    logRpGreetingDebug('build-start', {
      session: sessionId,
      greetingId: greetingId || 'none',
      rawLen: content.length,
    });
    const initVarResult = extractInitVarBlocks(content, sessionId, macroContext);
    const baseContent = String(initVarResult.text || '').trim();
    const macroContent = window.appBridge?.processTextMacros
      ? String(window.appBridge.processTextMacros(baseContent, {
          sessionId,
          uiMode,
          ...macroContext,
        }) || '').trim()
      : baseContent;
    logRpGreetingDebug('build-after-initvar', {
      session: sessionId,
      greetingId: greetingId || 'none',
      initBlocks: Number(initVarResult.blockCount || 0),
      baseLen: macroContent.length,
      hasInitVar: initVarResult.data ? 1 : 0,
    });
    if (initVarResult.data) {
      applyInitVarToSession(initVarResult.data, sessionId, { preferInit: true, source: 'greeting' });
    }
    const worldInitVars = extractInitVarFromWorldbooks(sessionId, macroContext);
    logRpGreetingDebug('build-world-initvar', {
      session: sessionId,
      greetingId: greetingId || 'none',
      hasWorldInitVar: worldInitVars ? 1 : 0,
    });
    if (worldInitVars) {
      applyInitVarToSession(worldInitVars, sessionId, { preferInit: true, source: 'worldbook' });
    }
    if (!macroContent) {
      logRpGreetingDebug('build-empty-after-initvar', {
        session: sessionId,
        greetingId: greetingId || 'none',
      });
      return { message: null, initVarData: initVarResult.data || worldInitVars || null };
    }
    let stored = macroContent;
    let display = macroContent;
    try {
      stored = window.appBridge.applyOutputStoredRegex(macroContent, { depth: 0 });
      display = window.appBridge.applyOutputDisplayRegex(stored, { depth: 0 });
    } catch (err) {
      logger.warn('[rp-greeting] regex-apply-failed', err);
    }
    const parsed = parseSpecialMessage(display);
    logRpGreetingDebug('build-parse', {
      session: sessionId,
      greetingId: greetingId || 'none',
      parsedType: parsed?.type || 'unknown',
      displayLen: String(display || '').length,
      storedLen: String(stored || '').length,
      parsedLen: String(parsed?.content || '').length,
      storedPreview: previewLogText(stored, 90),
      displayPreview: previewLogText(display, 90),
    });
    const meta = { ...(parsed.meta || {}), isGreeting: true, renderRich: true };
    return {
      message: {
        role: 'assistant',
        ...parsed,
        raw: stored,
        sessionId,
        name: assistantName,
        avatar: getAssistantAvatarForSession(sessionId),
        time: formatNowTime(),
        meta,
      },
      initVarData: initVarResult.data || worldInitVars || null,
    };
  };

  const seedRpGreetingIfNeeded = async (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    try {
      await chatStore.ensureRecentMessagesLoaded?.(sid);
    } catch {}
    const messages = chatStore.getMessages(sid) || [];
    if (messages.some(isConversationMessage)) {
      logRpGreetingDebug('seed-skip-has-conversation', { session: sid, msgCount: messages.length });
      return false;
    }
    const greeting = ensureRpGreetingActive();
    const result = buildRpGreetingMessage(greeting, sid);
    const msg = result?.message || null;
    if (!msg) {
      logRpGreetingDebug('seed-no-message', {
        session: sid,
        hasInitVar: result?.initVarData ? 1 : 0,
      });
      return Boolean(result?.initVarData);
    }
    const savedMsg = chatStore.appendMessage(msg, sid);
    logRpGreetingDebug('seed-appended', {
      session: sid,
      messageId: savedMsg?.id || msg?.id || '',
      type: savedMsg?.type || msg?.type || 'text',
      contentLen: String(savedMsg?.content || msg?.content || '').length,
      renderRich: (savedMsg?.meta?.renderRich || msg?.meta?.renderRich) ? 1 : 0,
    });
    if (String(chatStore.getCurrent() || '') === sid) ui.addMessage(savedMsg || msg);
    refreshRpToolbar(sid);
    return true;
  };

  const resetRpHistory = async (sessionId, { keepInput = false } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    chatStore.clear(sid);
    ui.clearMessages();
    chatRenderState.set(sid, { start: 0 });
    await seedRpGreetingIfNeeded(sid);
    if (!keepInput) ui.clearInput({ focus: false });
    refreshChatAndContacts();
    updatePendingFloat(sid);
    refreshRpToolbar(sid);
  };

  if (!chatStore.__rpGreetingWrapped) {
    chatStore.__rpGreetingWrapped = true;
    const originalAppendMessage = chatStore.appendMessage.bind(chatStore);
    chatStore.appendMessage = (message, id = chatStore.getCurrent()) => {
      const sid = String(id || chatStore.getCurrent() || '').trim();
      const saved = originalAppendMessage(message, sid);
      if (saved && sid && isRpSessionId(sid)) {
        if (saved.role === 'user' || (saved.role === 'assistant' && !saved?.meta?.isGreeting)) {
          refreshRpToolbar(sid);
        }
      }
      return saved;
    };
    if (typeof chatStore.startNewChat === 'function') {
      const originalStartNewChat = chatStore.startNewChat.bind(chatStore);
      chatStore.startNewChat = (id = chatStore.getCurrent(), archiveName = '', options = {}) => {
        const sid = String(id || chatStore.getCurrent() || '').trim();
        const result = originalStartNewChat(id, archiveName, options);
        if (sid && isRpSessionId(sid)) {
          seedRpGreetingIfNeeded(sid).catch(() => {});
          refreshRpToolbar(sid);
        }
        return result;
      };
    }
  }

  const enterRpMode = async ({ captureSocial = true } = {}) => {
    if (uiMode === 'rp') return;
    if (captureSocial) {
      lastChatState = {
        activePage,
        sessionId: chatStore.getCurrent(),
        inChatRoom: isChatRoomVisible(),
      };
    }
    uiMode = 'rp';
    try { navigator.vibrate?.(10); } catch {}
    persistUiMode();
    applyUiModeUI();
    try {
      await rpSessionStore?.ready;
    } catch {}
    setStickerPanelOpen(false);
    setActionPanelOpen(false);
    if (activePage !== 'chat') {
      switchPage('chat', { animate: false });
    }
    const rpSessionId = getRpSessionId(activePersonaId);
    if (typeof chatStore._ensureSession === 'function') {
      chatStore._ensureSession(rpSessionId);
      const settings = chatStore.getSessionSettings?.(rpSessionId) || {};
      chatStore.setSessionSettings?.(rpSessionId, { ...settings, sharedVariables: true, sharedMemory: false });
      chatStore._persist?.();
    }
    applyMvuSchemaDefaults(rpSessionId, { reason: 'rp_enter' });
    await enterChatRoom(rpSessionId, getRpTitle(), 'chat');
    if (currentChatTitle) currentChatTitle.textContent = getRpTitle();
    try {
      await hydrateRpCharacterNameFromCard(personaStore.getActive?.());
    } catch {}
    await seedRpGreetingIfNeeded(rpSessionId);
    refreshRpToolbar(rpSessionId);
    if (backToListBtn) backToListBtn.style.display = 'none';
  };

  const exitRpMode = () => {
    if (uiMode !== 'rp') return;
    uiMode = 'chat';
    try { navigator.vibrate?.(10); } catch {}
    persistUiMode();
    applyUiModeUI();
    if (rpToolbar) rpToolbar.style.display = 'none';
    if (backToListBtn) backToListBtn.style.display = '';

    const restorePage = lastChatState.activePage || 'chat';
    const restoreSession = String(lastChatState.sessionId || '').trim();
    const restoreInRoom = Boolean(lastChatState.inChatRoom);

    chatOriginPage = restorePage;
    exitChatRoom({ animate: false });

    if (restoreInRoom && restoreSession) {
      const c = contactsStore.getContact(restoreSession);
      switchPage(restorePage, { animate: false });
      enterChatRoom(restoreSession, c?.name || restoreSession, restorePage);
    } else {
      switchPage(restorePage, { animate: false });
    }
  };

  backToListBtn?.addEventListener('click', () => {
    if (uiMode === 'rp') {
      exitRpMode();
      return;
    }
    exitChatRoom();
  });

  let modeSwitchBounceRAF = null;
  let maidBounceCount = 0;
  let maidBounceLastTime = 0;
  const MAID_TUMBLE_SRC = 'assets/media/maid-tumble.webp';
  const MAID_W = 102;
  const MAID_H = 114;
  const MAID_DURATION = 3900;

  const spawnMaidTumble = (sx, sy, ballVx, ballVy) => {
    const img = document.createElement('img');
    img.src = MAID_TUMBLE_SRC;
    img.style.cssText = `position:fixed; width:${MAID_W}px; height:${MAID_H}px; z-index:26100; pointer-events:none; object-fit:contain; image-rendering:auto;`;
    document.body.appendChild(img);

    let mx = sx - MAID_W / 2;
    let my = sy - MAID_H / 2;
    let mvx = ballVx * 0.5 + (Math.random() - 0.5) * 6;
    let mvy = ballVy * 0.5 - 3;
    let angle = 0;
    const GRAVITY = 0.35;
    const BOUNCE_E = 0.45;
    const DRAG = 0.993;
    const startTime = performance.now();

    img.style.left = `${Math.round(mx)}px`;
    img.style.top = `${Math.round(my)}px`;

    let fadeStarted = false;
    const step = () => {
      const elapsed = performance.now() - startTime;
      if (!fadeStarted && elapsed > MAID_DURATION - 300) {
        fadeStarted = true;
        img.style.transition = 'opacity 0.3s ease';
        img.style.opacity = '0';
        setTimeout(() => img.remove(), 350);
      }
      if (elapsed > MAID_DURATION) return;
      const { w, h } = getViewportSize();
      mvx *= DRAG;
      mvy = mvy * DRAG + GRAVITY;
      mx += mvx;
      my += mvy;

      if (mx < 0) { mx = 0; mvx = -mvx * BOUNCE_E; }
      else if (mx + MAID_W > w) { mx = w - MAID_W; mvx = -mvx * BOUNCE_E; }
      if (my < 0) { my = 0; mvy = -mvy * BOUNCE_E; }
      else if (my + MAID_H > h) { my = h - MAID_H; mvy = -mvy * BOUNCE_E; }

      img.style.left = `${Math.round(mx)}px`;
      img.style.top = `${Math.round(my)}px`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const cancelModeSwitchBounce = () => {
    if (modeSwitchBounceRAF) {
      cancelAnimationFrame(modeSwitchBounceRAF);
      modeSwitchBounceRAF = null;
    }
    modeSwitch?.classList.remove('is-bouncing');
  };
  const animateModeSwitchBounce = (startX, startY, vx, vy) => {
    if (!modeSwitch) return;
    const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReduced) {
      modeSwitchPinned = true;
      saveModeSwitchPos();
      return;
    }
    cancelModeSwitchBounce();

    const now = performance.now();
    if (now - maidBounceLastTime > 5000) maidBounceCount = 0;
    maidBounceLastTime = now;
    maidBounceCount++;
    if (maidBounceCount >= 6) {
      maidBounceCount = 0;
      spawnMaidTumble(startX, startY, vx, vy);
    }
    modeSwitch.classList.add('is-bouncing');
    const BOUNCE_ELASTICITY = 0.7;
    const AIR_FRICTION = 0.992;
    const MIN_VELOCITY = 0.8;
    let x = startX;
    let y = startY;
    const step = () => {
      const { w, h } = getViewportSize();
      if (!w || !h) { modeSwitchBounceRAF = null; modeSwitch.classList.remove('is-bouncing'); return; }
      const halfSize = modeSwitchSize / 2;
      const minX = halfSize + _safeInsets.left;
      const maxX = w - halfSize - _safeInsets.right;
      const minY = halfSize + _safeInsets.top;
      const maxY = h - halfSize - _safeInsets.bottom;
      vx *= AIR_FRICTION;
      vy *= AIR_FRICTION;
      x += vx;
      y += vy;
      let hitBound = false;
      if (x < minX) { x = minX; vx = -vx * BOUNCE_ELASTICITY; hitBound = true; }
      else if (x > maxX) { x = maxX; vx = -vx * BOUNCE_ELASTICITY; hitBound = true; }
      if (y < minY) { y = minY; vy = -vy * BOUNCE_ELASTICITY; hitBound = true; }
      else if (y > maxY) { y = maxY; vy = -vy * BOUNCE_ELASTICITY; hitBound = true; }
      if (hitBound) {
        try { navigator.vibrate?.(15); } catch {}
      }
      modeSwitch.style.left = `${Math.round(x)}px`;
      modeSwitch.style.top = `${Math.round(y)}px`;
      modeSwitchPos = normalizeModeSwitchPos(x, y);
      if (Math.hypot(vx, vy) < MIN_VELOCITY) {
        modeSwitchBounceRAF = null;
        modeSwitch.classList.remove('is-bouncing');
        modeSwitchPinned = true;
        saveModeSwitchPos();
        modeSwitch.classList.add('is-settling');
        setTimeout(() => modeSwitch.classList.remove('is-settling'), 250);
        return;
      }
      modeSwitchBounceRAF = requestAnimationFrame(step);
    };
    modeSwitchBounceRAF = requestAnimationFrame(step);
  };

  const startModeSwitchDrag = event => {
    if (!modeSwitch || !modeSwitchBtn) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancelModeSwitchBounce();
    wakeModeSwitch();
    const rect = modeSwitch.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    modeSwitchDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      moved: false,
      prevX: originX,
      prevY: originY,
      prevTime: performance.now(),
      lastX: originX,
      lastY: originY,
      lastTime: performance.now(),
    };
    modeSwitch.classList.add('is-dragging');
    modeSwitchBtn.setPointerCapture?.(event.pointerId);
  };
  const updateModeSwitchDrag = event => {
    if (!modeSwitchDrag || !modeSwitch) return;
    if (event.pointerId !== modeSwitchDrag.pointerId) return;
    const dx = event.clientX - modeSwitchDrag.startX;
    const dy = event.clientY - modeSwitchDrag.startY;
    if (!modeSwitchDrag.moved && Math.hypot(dx, dy) > 4) modeSwitchDrag.moved = true;
    const { w, h } = getViewportSize();
    if (!w || !h) return;
    const base = 8 + modeSwitchSize / 2;
    const x = clamp(modeSwitchDrag.originX + dx, base + _safeInsets.left, w - base - _safeInsets.right);
    const y = clamp(modeSwitchDrag.originY + dy, base + _safeInsets.top, h - base - _safeInsets.bottom);
    modeSwitch.style.left = `${Math.round(x)}px`;
    modeSwitch.style.top = `${Math.round(y)}px`;
    modeSwitch.style.pointerEvents = 'auto';
    modeSwitchPinned = true;
    modeSwitchPos = normalizeModeSwitchPos(x, y);
    modeSwitchDrag.prevX = modeSwitchDrag.lastX;
    modeSwitchDrag.prevY = modeSwitchDrag.lastY;
    modeSwitchDrag.prevTime = modeSwitchDrag.lastTime;
    modeSwitchDrag.lastX = x;
    modeSwitchDrag.lastY = y;
    modeSwitchDrag.lastTime = performance.now();
  };
  const endModeSwitchDrag = event => {
    if (!modeSwitchDrag || !modeSwitch) return;
    if (event.pointerId !== modeSwitchDrag.pointerId) return;
    modeSwitchBtn?.releasePointerCapture?.(event.pointerId);
    modeSwitch.classList.remove('is-dragging');
    if (modeSwitchDrag.moved) {
      modeSwitchSuppressClick = true;
      const dt = Math.max(1, modeSwitchDrag.lastTime - modeSwitchDrag.prevTime);
      const vx = (modeSwitchDrag.lastX - modeSwitchDrag.prevX) / dt * 16;
      const vy = (modeSwitchDrag.lastY - modeSwitchDrag.prevY) / dt * 16;
      const speed = Math.hypot(vx, vy);
      if (speed > 8) {
        animateModeSwitchBounce(modeSwitchDrag.lastX, modeSwitchDrag.lastY, vx, vy);
      } else {
        saveModeSwitchPos();
        modeSwitch.classList.add('is-settling');
        setTimeout(() => modeSwitch.classList.remove('is-settling'), 250);
      }
      setTimeout(() => {
        modeSwitchSuppressClick = false;
      }, 220);
    }
    modeSwitchDrag = null;
    wakeModeSwitch();
    if (!modeSwitchBounceRAF) scheduleModeSwitchSync();
  };
  let modeSwitchDrag = null;
  modeSwitchBtn?.addEventListener('pointerdown', startModeSwitchDrag);
  modeSwitchBtn?.addEventListener('pointermove', updateModeSwitchDrag);
  modeSwitchBtn?.addEventListener('pointerup', endModeSwitchDrag);
  modeSwitchBtn?.addEventListener('pointercancel', endModeSwitchDrag);
  modeSwitchBtn?.addEventListener('click', () => {
    if (modeSwitchSuppressClick) return;
    wakeModeSwitch();
    if (uiMode === 'rp') {
      exitRpMode();
    } else {
      enterRpMode();
    }
  });

  rpGreetingTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (rpGreetingSheet?.classList.contains('hidden')) {
      openRpGreetingSheet();
    } else {
      closeRpGreetingSheet();
    }
  });

  rpGreetingOverlay?.addEventListener('click', () => closeRpGreetingSheet());

  rpGreetingSheetReset?.addEventListener('click', async () => {
    if (uiMode !== 'rp') return;
    closeRpGreetingSheet();
    const ok = await appConfirm({
      title: '重置创意写作剧情',
      message: '将清空当前创意写作历史并重新插入开场白，是否继续？',
      confirmText: '重置',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    await resetRpHistory(getRpSessionId(activePersonaId));
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
    switchPage('chat', { animate: false });
    enterChatRoom(id, name, origin);
  });

  const contactsGroupsEl = document.getElementById('contacts-groups-list');
  contactsGroupsEl?.addEventListener('click', e => {
    const item = e.target.closest('.contact-item');
    if (!item || !item.dataset.session) return;
    const id = item.dataset.session;
    const name = item.dataset.name || id;
    const origin = activePage;
    switchPage('chat', { animate: false });
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
          name: getActiveUserName(),
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
        name: getActiveUserName(),
        avatar: avatars.user,
        time: formatNowTime(),
      };
      ui.addMessage(msg);
      chatStore.appendMessage(msg);
    },
    sticker: async () => {
      if (!isStickerAllowed()) {
        window.toastr?.info?.('RP界面不支持贴图');
        return;
      }
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

  // @Mention: resolve group members for mention dropdown
  ui.setMentionMemberResolver(() => {
    const sid = chatStore.getCurrent();
    if (!sid || !sid.startsWith('group:')) return [];
    const group = contactsStore.getContact(sid);
    if (!group || !Array.isArray(group.members)) return [];
    return group.members
      .map(mid => {
        const c = contactsStore.getContact(mid);
        if (!c || c.isGroup) return null;
        const avatar = resolveAvatarForContact(mid, c);
        return { id: c.id, name: c.name || c.id, avatar: avatar || '' };
      })
      .filter(Boolean);
  });

  // 已读状态持久化到 store
  ui.onDeliveryTextChange((msgId, text) => {
    const sid = chatStore.getCurrent();
    if (!sid) return;
    const msgs = chatStore.getMessages(sid);
    const msg = msgs.find(m => String(m?.id || '') === msgId);
    if (!msg) return;
    if (!msg.meta) msg.meta = {};
    msg.meta.deliveryText = text;
  });

  const cloneSwipePlainObject = value => {
    if (value === null || value === undefined) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value && typeof value === 'object' ? { ...value } : value;
    }
  };
  const cloneSwipeMemoryUpdateEntry = entry => {
    if (!entry || typeof entry !== 'object') return null;
    const cloned = cloneSwipePlainObject(entry) || {};
    const clip = (value, max = 20000) => {
      const text = typeof value === 'string' ? value : '';
      if (!text) return '';
      return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
    };
    return {
      at: cloned.at || 0,
      mode: cloned.mode,
      sessionId: cloned.sessionId,
      tableEditRaw: clip(cloned.tableEditRaw),
      raw: clip(cloned.raw),
      requestPrompt: clip(cloned.requestPrompt),
      actions: Array.isArray(cloned.actions) ? cloneSwipePlainObject(cloned.actions) : [],
      rollback: cloned.rollback ? cloneSwipePlainObject(cloned.rollback) : null,
      rollbackAt: cloned.rollbackAt || 0,
    };
  };
  let activeSwipeMemoryStateKey = '';
  const getSwipeMemoryStateKey = (sessionId, msgId, index) => {
    const sid = String(sessionId || '').trim();
    const mid = String(msgId || '').trim();
    const idx = Math.trunc(Number(index));
    if (!sid || !mid || !Number.isFinite(idx) || idx < 0) return '';
    return `${sid}:${mid}:${idx}`;
  };
  const markActiveSwipeMemoryState = (sessionId, msgId, index) => {
    activeSwipeMemoryStateKey = getSwipeMemoryStateKey(sessionId, msgId, index);
  };
  const canPersistOutgoingSwipeMemoryState = (sessionId, msgId, index, branch) => {
    const key = getSwipeMemoryStateKey(sessionId, msgId, index);
    if (!key) return false;
    if (activeSwipeMemoryStateKey === key) return true;
    // Avoid overwriting an existing branch snapshot when the table state was not
    // explicitly applied from that branch in this runtime.
    return !branch?.memoryTableSnapshot;
  };
  const resolveSwipeMemoryTemplateId = async () => {
    if (!memoryTemplateStore) return '';
    try {
      const list = await memoryTemplateStore.getTemplates({ is_default: true });
      if (Array.isArray(list) && list.length) return String(list[0]?.id || '').trim();
    } catch {}
    try {
      const fallback = await memoryTemplateStore.getTemplates({ id: 'default-v1' });
      if (Array.isArray(fallback) && fallback.length) return String(fallback[0]?.id || '').trim();
    } catch {}
    return '';
  };
  const buildSwipeMemoryTableSnapshot = async (sessionId, { isGroup } = {}) => {
    if (getMemoryStorageMode() !== 'table') return null;
    if (!memoryTableStore?.getMemories || !memoryTemplateStore) return null;
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const templateId = await resolveSwipeMemoryTemplateId();
    if (!templateId) return null;
    const groupScope = Boolean(isGroup);
    let rows = [];
    try {
      rows = await memoryTableStore.getMemories({
        scope: groupScope ? 'group' : 'contact',
        group_id: groupScope ? sid : undefined,
        contact_id: groupScope ? undefined : sid,
        template_id: templateId,
      });
    } catch {
      rows = [];
    }
    const picked = sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
      .map(row => {
        const tableId = String(row?.table_id || '').trim();
        if (!tableId) return null;
        return {
          id: String(row?.id || '').trim(),
          template_id: String(row?.template_id || templateId).trim() || templateId,
          table_id: tableId,
          contact_id: groupScope ? null : sid,
          group_id: groupScope ? sid : null,
          row_data: cloneSwipePlainObject(row?.row_data || {}),
          is_active: row?.is_active !== false,
          is_pinned: Boolean(row?.is_pinned),
          priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
          sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
        };
      })
      .filter(Boolean);
    return {
      templateId,
      scope: groupScope ? 'group' : 'contact',
      rows: picked,
      capturedAt: Date.now(),
    };
  };
  const applySwipeMemoryTableSnapshot = async (sessionId, snapshot, { isGroup } = {}) => {
    if (getMemoryStorageMode() !== 'table') return false;
    if (!snapshot || !memoryTableStore?.getMemories) return false;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const groupScope = Boolean(isGroup);
    const templateId = String(snapshot?.templateId || '').trim() || await resolveSwipeMemoryTemplateId();
    if (!templateId) return false;
    let existing = [];
    try {
      existing = await memoryTableStore.getMemories({
        scope: groupScope ? 'group' : 'contact',
        group_id: groupScope ? sid : undefined,
        contact_id: groupScope ? undefined : sid,
        template_id: templateId,
      });
    } catch {
      existing = [];
    }
    const ids = (Array.isArray(existing) ? existing : [])
      .map(row => String(row?.id || '').trim())
      .filter(Boolean);
    if (ids.length) {
      try {
        await memoryTableStore.batchDeleteMemories?.(ids);
      } catch {
        for (const id of ids) {
          try {
            await memoryTableStore.deleteMemory?.(id);
          } catch {}
        }
      }
    }
    const inputs = sortMemoryRowsForSnapshot(Array.isArray(snapshot?.rows) ? snapshot.rows : [])
      .map(row => {
        const tableId = String(row?.table_id || '').trim();
        if (!tableId) return null;
        return {
          id: row?.id ? String(row.id) : undefined,
          template_id: templateId,
          table_id: tableId,
          contact_id: groupScope ? null : sid,
          group_id: groupScope ? sid : null,
          row_data: cloneSwipePlainObject(row?.row_data || {}),
          is_active: row?.is_active !== false,
          is_pinned: Boolean(row?.is_pinned),
          priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
          sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
        };
      })
      .filter(Boolean);
    if (inputs.length) {
      try {
        await memoryTableStore.batchCreateMemories?.(inputs);
      } catch {
        for (const input of inputs) {
          try {
            await memoryTableStore.createMemory?.(input);
          } catch {}
        }
      }
    }
    window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId: sid, templateId } }));
    return true;
  };
  const persistSwipeBranchMemoryState = async (branches, index, sessionId, { isGroup } = {}) => {
    if (getMemoryStorageMode() !== 'table') return false;
    if (!Array.isArray(branches) || index < 0 || index >= branches.length) return false;
    const branch = branches[index] && typeof branches[index] === 'object' ? branches[index] : null;
    if (!branch || branch.draft === true) return false;
    const snapshot = await buildSwipeMemoryTableSnapshot(sessionId, { isGroup });
    if (!snapshot) return false;
    branch.memoryTableSnapshot = snapshot;
    branch.memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(window.appBridge?.getLastMemoryUpdate?.(sessionId));
    return true;
  };
  const applySwipeBranchMemoryState = async (sessionId, branch, { isGroup } = {}) => {
    if (getMemoryStorageMode() !== 'table') return false;
    if (!branch || typeof branch !== 'object' || !branch.memoryTableSnapshot) return false;
    const applied = await applySwipeMemoryTableSnapshot(sessionId, branch.memoryTableSnapshot, { isGroup });
    if (applied) {
      const entry = cloneSwipeMemoryUpdateEntry(branch.memoryUpdateEntry);
      window.appBridge?.setLastMemoryUpdate?.(sessionId, entry || null);
    }
    return applied;
  };
  const isTurnCheckpointSessionEnabled = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    if (getMemoryStorageMode() !== 'table') return false;
    if (!memoryTableStore?.getMemories || !memoryTemplateStore) return false;
    return true;
  };
  const getTurnCheckpointSessionScope = sessionId => {
    const sid = String(sessionId || '').trim();
    const contact = contactsStore.getContact(sid);
    return {
      isGroup: sid.startsWith('group:') || Boolean(contact?.isGroup),
    };
  };
  const isCheckpointTrackedAssistantMessage = (message, sessionId = '') => {
    if (!message || message.role !== 'assistant') return false;
    if (message.status === 'pending' || message.status === 'sending') return false;
    const sid = String(sessionId || message?.sessionId || chatStore.getCurrent() || '').trim();
    if (!isTurnCheckpointSessionEnabled(sid)) return false;
    const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
    if (meta.isGreeting) return false;
    if (String(meta.kind || '').trim() === 'memory-table-push') return false;
    return true;
  };
  const normalizeCheckpointSwipeState = message => {
    const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
    let swipes = Array.isArray(meta.swipes) && meta.swipes.length
      ? meta.swipes.map(branch => (branch && typeof branch === 'object' ? cloneSwipePlainObject(branch) : {}))
      : [{
          content: String(message?.content ?? ''),
          raw: typeof message?.raw === 'string' ? message.raw : String(message?.content ?? ''),
        }];
    if (!swipes.length) {
      swipes = [{
        content: String(message?.content ?? ''),
        raw: typeof message?.raw === 'string' ? message.raw : String(message?.content ?? ''),
      }];
    }
    if (meta.memoryTableSnapshot && !swipes[0]?.memoryTableSnapshot) {
      swipes[0].memoryTableSnapshot = cloneSwipePlainObject(meta.memoryTableSnapshot);
    }
    if (meta.memoryUpdateEntry && swipes[0]?.memoryUpdateEntry === undefined) {
      swipes[0].memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(meta.memoryUpdateEntry);
    }
    const rawActive = Math.trunc(Number(meta.activeSwipe));
    const activeSwipeIndex = Number.isFinite(rawActive)
      ? Math.min(Math.max(0, rawActive), Math.max(0, swipes.length - 1))
      : 0;
    return {
      meta: cloneSwipePlainObject(meta) || {},
      swipes,
      activeSwipeIndex,
    };
  };
  const findPreviousUserMessageIdForAssistant = (sessionId, assistantMessageId) => {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid) return '';
    const messages = chatStore.getMessages(sid) || [];
    const idx = messages.findIndex(message => String(message?.id || '') === aid);
    if (idx === -1) return '';
    for (let i = idx - 1; i >= 0; i -= 1) {
      const item = messages[i];
      if (!item || item.role !== 'user') continue;
      if (item?.meta?.generatedByAssistant === true) continue;
      return String(item.id || '').trim();
    }
    return '';
  };
  const resolveTurnIndexForAssistant = (sessionId, assistantMessageId, userMessageId = '') => {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid) return 0;
    const messages = chatStore.getMessages(sid) || [];
    let targetUserId = String(userMessageId || '').trim();
    if (!targetUserId) targetUserId = findPreviousUserMessageIdForAssistant(sid, aid);
    if (!targetUserId) return 0;
    let count = 0;
    for (const item of messages) {
      if (!item || item.role !== 'user' || item?.meta?.generatedByAssistant === true) continue;
      count += 1;
      if (String(item.id || '') === targetUserId) return count;
    }
    return count;
  };
  const resolveAssistantFloorForCheckpoint = (sessionId, assistantMessageId) => {
    const sid = String(sessionId || '').trim();
    const aid = String(assistantMessageId || '').trim();
    if (!sid || !aid) return 0;
    const messages = chatStore.getMessages(sid) || [];
    let count = 0;
    for (const item of messages) {
      if (!isCheckpointTrackedAssistantMessage(item, sid)) continue;
      count += 1;
      if (String(item?.id || '') === aid) return count;
    }
    return count;
  };
  const findTailTrackedAssistantMessage = sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const messages = chatStore.getMessages(sid) || [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (isCheckpointTrackedAssistantMessage(messages[i], sid)) return messages[i];
    }
    return null;
  };
  const getCurrentArchiveIdForSession = sessionId => {
    try {
      return String(chatStore.getCurrentArchiveId?.(sessionId) || '').trim();
    } catch {
      return '';
    }
  };
  const refreshTurnCheckpointSnapshotReachability = async (sessionId, { prune = false } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return [];
    const state = await turnCheckpointStore.getSessionState(sid);
    const reachable = new Set(collectCheckpointSnapshotIds(state));
    const baselineId = String(state?.baselineSnapshotId || '').trim();
    if (baselineId) reachable.add(baselineId);
    const ids = Array.from(reachable);
    if (prune) return memorySnapshotStore.pruneUnreachable(sid, ids);
    await memorySnapshotStore.markReachable(sid, ids);
    return ids;
  };
  const ensureSessionBaselineCheckpointSnapshot = async (sessionId, { force = false, snapshot = null } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return '';
    if (!force) {
      const existingId = await turnCheckpointStore.getBaselineSnapshotId(sid);
      if (existingId) return existingId;
    }
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const sourceSnapshot = snapshot || await buildSwipeMemoryTableSnapshot(sid, { isGroup });
    if (!sourceSnapshot) return '';
    const persisted = await memorySnapshotStore.persistSnapshot(sid, sourceSnapshot);
    const snapshotId = String(persisted?.id || '').trim();
    if (!snapshotId) return '';
    await turnCheckpointStore.setBaselineSnapshotId(sid, snapshotId);
    await refreshTurnCheckpointSnapshotReachability(sid);
    return snapshotId;
  };
  const hydrateTurnCheckpointsFromLoadedMessages = async (sessionId, { onlyMissing = true } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return 0;
    const messages = chatStore.getMessages(sid) || [];
    let migrated = 0;
    for (const message of messages) {
      if (!isCheckpointTrackedAssistantMessage(message, sid)) continue;
      const messageId = String(message?.id || '').trim();
      if (!messageId) continue;
      if (onlyMissing) {
        const existing = await turnCheckpointStore.getCheckpoint(sid, messageId);
        if (existing) continue;
      }
      const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
      const hasInlineSnapshot =
        Boolean(meta.memoryTableSnapshot) ||
        (Array.isArray(meta.swipes) && meta.swipes.some(branch => branch && branch.memoryTableSnapshot));
      if (!hasInlineSnapshot) continue;
      await syncTurnCheckpointForMessage(sid, message, { setPointer: false });
      migrated += 1;
    }
    await ensureSessionBaselineCheckpointSnapshot(sid);
    return migrated;
  };
  const restoreCheckpointBranchMemoryState = async (sessionId, branch, { isGroup, fallbackSnapshot = null } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || getMemoryStorageMode() !== 'table') return false;
    const source = branch && typeof branch === 'object' ? branch : {};
    const snapshotId = String(source.memorySnapshotId || '').trim();
    let snapshot = source.memoryTableSnapshot || null;
    if (!snapshot && snapshotId) {
      try {
        snapshot = await memorySnapshotStore.getSnapshot(snapshotId);
      } catch (err) {
        logger.warn('load checkpoint memory snapshot failed', err);
      }
    }
    if (!snapshot && fallbackSnapshot) snapshot = fallbackSnapshot;
    if (!snapshot) return false;
    const applied = await applySwipeMemoryTableSnapshot(sid, snapshot, { isGroup });
    if (applied) {
      const entry = cloneSwipeMemoryUpdateEntry(source.memoryUpdateEntry);
      window.appBridge?.setLastMemoryUpdate?.(sid, entry || null);
    }
    return applied;
  };
  const syncTurnCheckpointForMessage = async (sessionId, messageOrId, {
    setPointer = true,
    captureCurrentActiveState = false,
    forcePointer = false,
  } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return null;
    const message = typeof messageOrId === 'string'
      ? chatStore.findMessage(messageOrId, sid)
      : (messageOrId && typeof messageOrId === 'object' ? (chatStore.findMessage(messageOrId.id, sid) || messageOrId) : null);
    if (!isCheckpointTrackedAssistantMessage(message, sid)) return null;
    const messageId = String(message?.id || '').trim();
    if (!messageId) return null;
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const normalizedState = normalizeCheckpointSwipeState(message);
    const nextMeta = normalizedState.meta || {};
    const nextSwipes = Array.isArray(normalizedState.swipes)
      ? normalizedState.swipes.map(branch => cloneSwipePlainObject(branch) || {})
      : [];
    const activeSwipeIndex = Math.min(
      Math.max(0, Number(normalizedState.activeSwipeIndex || 0)),
      Math.max(0, nextSwipes.length - 1),
    );
    let currentSnapshot = null;
    let currentMemoryEntry = null;
    if (captureCurrentActiveState) {
      currentSnapshot = await buildSwipeMemoryTableSnapshot(sid, { isGroup });
      currentMemoryEntry = cloneSwipeMemoryUpdateEntry(window.appBridge?.getLastMemoryUpdate?.(sid));
      if (currentSnapshot && nextSwipes[activeSwipeIndex]) {
        nextSwipes[activeSwipeIndex].memoryTableSnapshot = cloneSwipePlainObject(currentSnapshot);
        nextSwipes[activeSwipeIndex].memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(currentMemoryEntry);
        if (activeSwipeIndex === 0) {
          nextMeta.memoryTableSnapshot = cloneSwipePlainObject(currentSnapshot);
          nextMeta.memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(currentMemoryEntry);
        }
      }
    }
    if (!nextSwipes.some(branch => branch && branch.draft !== true)) return null;
    for (let index = 0; index < nextSwipes.length; index += 1) {
      const branch = nextSwipes[index];
      if (!branch || branch.draft === true) continue;
      const snapshot = branch.memoryTableSnapshot || null;
      if (snapshot) {
        try {
          const persisted = await memorySnapshotStore.persistSnapshot(sid, snapshot);
          const snapshotId = String(persisted?.id || '').trim();
          if (snapshotId) {
            branch.memorySnapshotId = snapshotId;
            if (index === 0) nextMeta.memorySnapshotId = snapshotId;
          }
        } catch (err) {
          logger.warn('persist turn checkpoint snapshot failed', err);
        }
      }
      if (branch.memoryUpdateEntry !== undefined && index === 0) {
        nextMeta.memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(branch.memoryUpdateEntry);
      }
      if (branch.memoryTableSnapshot && index === 0) {
        nextMeta.memoryTableSnapshot = cloneSwipePlainObject(branch.memoryTableSnapshot);
      }
    }
    nextMeta.swipes = nextSwipes;
    nextMeta.activeSwipe = activeSwipeIndex;
    chatStore.updateMessage(messageId, { meta: nextMeta }, sid);
    const nonDraftBranches = nextSwipes
      .map((branch, index) => ({ branch, index }))
      .filter(item => item.branch && item.branch.draft !== true)
      .map(({ branch, index }) => ({
        swipeIndex: index,
        state: branch?.draft === true ? 'provisional' : 'final',
        replyState:
          branch?.cancelled === true && String(branch?.content || branch?.raw || '').trim()
            ? 'partial_cancelled'
            : (branch?.failed === true ? 'failed' : 'complete'),
        messageContent: String(branch?.content ?? ''),
        messageRaw: typeof branch?.raw === 'string' ? branch.raw : String(branch?.content ?? ''),
        memorySnapshotId: String(branch?.memorySnapshotId || '').trim(),
        memoryUpdateEntry: cloneSwipeMemoryUpdateEntry(branch?.memoryUpdateEntry),
        updatedAt: Date.now(),
      }));
    const userMessageId = findPreviousUserMessageIdForAssistant(sid, messageId);
    const checkpoint = await turnCheckpointStore.upsertCheckpoint(sid, {
      sessionId: sid,
      assistantMessageId: messageId,
      userMessageId,
      turnIndex: resolveTurnIndexForAssistant(sid, messageId, userMessageId),
      aiFloor: resolveAssistantFloorForCheckpoint(sid, messageId),
      updatedAt: Date.now(),
      activeSwipeIndex,
      state: 'final',
      branches: nonDraftBranches,
    });
    const tailAssistant = findTailTrackedAssistantMessage(sid);
    if (setPointer && checkpoint && (forcePointer || String(tailAssistant?.id || '') === messageId)) {
      await turnCheckpointStore.setPointer(sid, {
        sessionId: sid,
        tailAssistantMessageId: messageId,
        tailSwipeIndex: activeSwipeIndex,
        restoredAt: Date.now(),
        source: forcePointer ? 'explicit_sync' : 'tail_sync',
      });
      const currentArchiveId = getCurrentArchiveIdForSession(sid);
      if (currentArchiveId) {
        const activeBranch = nextSwipes[activeSwipeIndex] || nextSwipes[0] || {};
        await turnCheckpointStore.setArchivePointer(sid, currentArchiveId, {
          sessionId: sid,
          archiveId: currentArchiveId,
          tailAssistantMessageId: messageId,
          tailSwipeIndex: activeSwipeIndex,
          memorySnapshotId: String(activeBranch?.memorySnapshotId || nextMeta.memorySnapshotId || '').trim(),
          restoredAt: Date.now(),
          source: forcePointer ? 'archive_explicit_sync' : 'archive_tail_sync',
        });
      }
    }
    await refreshTurnCheckpointSnapshotReachability(sid);
    return checkpoint;
  };
  const restoreMemoryFromCurrentTailAssistant = async (sessionId, {
    refreshBaselineWhenNoTail = false,
    source = 'tail_restore',
  } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return false;
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const tailMessage = findTailTrackedAssistantMessage(sid);
    if (!tailMessage) {
      const baselineId = await ensureSessionBaselineCheckpointSnapshot(sid, { force: refreshBaselineWhenNoTail });
      if (!baselineId) {
        window.appBridge?.setLastMemoryUpdate?.(sid, null);
        await turnCheckpointStore.clearPointer(sid);
        return false;
      }
      const baselineSnapshot = await memorySnapshotStore.getSnapshot(baselineId);
      const applied = await restoreCheckpointBranchMemoryState(sid, { memorySnapshotId: baselineId }, {
        isGroup,
        fallbackSnapshot: baselineSnapshot,
      });
      window.appBridge?.setLastMemoryUpdate?.(sid, null);
      await turnCheckpointStore.clearPointer(sid);
      return applied;
    }
    const messageId = String(tailMessage.id || '').trim();
    const normalizedState = normalizeCheckpointSwipeState(tailMessage);
    const checkpoint = await turnCheckpointStore.getCheckpoint(sid, messageId);
    const activeSwipeIndex = Math.min(
      Math.max(0, Number(normalizedState.activeSwipeIndex || 0)),
      Math.max(0, normalizedState.swipes.length - 1),
    );
    const checkpointBranch = Array.isArray(checkpoint?.branches)
      ? checkpoint.branches.find(branch => Number(branch?.swipeIndex) === activeSwipeIndex)
      : null;
    const inlineBranch = normalizedState.swipes[activeSwipeIndex] || normalizedState.swipes[0] || null;
    const fallbackSnapshot =
      inlineBranch?.memoryTableSnapshot ||
      (activeSwipeIndex === 0 ? tailMessage?.meta?.memoryTableSnapshot || null : null);
    let applied = await restoreCheckpointBranchMemoryState(
      sid,
      { ...(inlineBranch || {}), ...(checkpointBranch || {}) },
      { isGroup, fallbackSnapshot },
    );
    if (!applied && !checkpoint && !fallbackSnapshot) {
      try {
        await syncTurnCheckpointForMessage(sid, tailMessage, {
          setPointer: false,
          captureCurrentActiveState: true,
        });
        const refreshedCheckpoint = await turnCheckpointStore.getCheckpoint(sid, messageId);
        const refreshedBranch = Array.isArray(refreshedCheckpoint?.branches)
          ? refreshedCheckpoint.branches.find(branch => Number(branch?.swipeIndex) === activeSwipeIndex)
          : null;
        if (refreshedBranch?.memorySnapshotId) {
          applied = await restoreCheckpointBranchMemoryState(sid, refreshedBranch, { isGroup });
        }
      } catch (err) {
        logger.warn('backfill tail turn checkpoint from current memory state failed', err);
      }
    }
    if (applied) {
      if (!checkpoint && (inlineBranch?.memoryTableSnapshot || fallbackSnapshot)) {
        await syncTurnCheckpointForMessage(sid, tailMessage, { setPointer: false }).catch(err => {
          logger.warn('hydrate tail turn checkpoint from inline snapshot failed', err);
        });
      }
      await turnCheckpointStore.setPointer(sid, {
        sessionId: sid,
        tailAssistantMessageId: messageId,
        tailSwipeIndex: activeSwipeIndex,
        restoredAt: Date.now(),
        source,
      });
    }
    await ensureSessionBaselineCheckpointSnapshot(sid);
    return applied;
  };
  const removeTurnCheckpointsForMessages = async (sessionId, messages = [], { prune = false } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return false;
    const list = Array.isArray(messages) ? messages : [messages];
    const assistantIds = list
      .map(item => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (item.role === 'assistant') return String(item.id || '').trim();
        return '';
      })
      .filter(Boolean);
    if (!assistantIds.length) return false;
    await Promise.all(assistantIds.map(messageId => turnCheckpointStore.removeCheckpoint(sid, messageId)));
    await refreshTurnCheckpointSnapshotReachability(sid, { prune });
    return true;
  };
  const clearSessionTurnCheckpointState = async sessionId => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    await turnCheckpointStore.clearSession(sid);
    await memorySnapshotStore.clearSession(sid);
    return true;
  };
  const renameSessionTurnCheckpointState = async (oldSessionId, newSessionId) => {
    const from = String(oldSessionId || '').trim();
    const to = String(newSessionId || '').trim();
    if (!from || !to || from === to) return false;
    await turnCheckpointStore.renameSession(from, to);
    await memorySnapshotStore.renameSession(from, to);
    return true;
  };
  const deleteArchiveTurnCheckpointState = async (sessionId, archiveId) => {
    const sid = String(sessionId || '').trim();
    const aid = String(archiveId || '').trim();
    if (!sid || !aid || !isTurnCheckpointSessionEnabled(sid)) return false;
    const messages = await chatStore.exportThreadMessages?.(sid, aid);
    if (Array.isArray(messages) && messages.length) {
      await removeTurnCheckpointsForMessages(sid, messages, { prune: true });
    }
    await turnCheckpointStore.removeArchivePointer(sid, aid);
    await refreshTurnCheckpointSnapshotReachability(sid, { prune: true });
    return true;
  };
  const buildArchivePointerFromCurrentThread = async (sessionId, { fallbackSnapshot = null, source = 'archive_capture' } = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid || !isTurnCheckpointSessionEnabled(sid)) return null;
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const tailMessage = findTailTrackedAssistantMessage(sid);
    let memorySnapshotId = '';
    if (tailMessage) {
      await syncTurnCheckpointForMessage(sid, tailMessage, { setPointer: false });
      const refreshedMessage = chatStore.findMessage(tailMessage.id, sid) || tailMessage;
      const normalizedState = normalizeCheckpointSwipeState(refreshedMessage);
      const activeSwipeIndex = Math.min(
        Math.max(0, Number(normalizedState.activeSwipeIndex || 0)),
        Math.max(0, normalizedState.swipes.length - 1),
      );
      const activeBranch = normalizedState.swipes[activeSwipeIndex] || normalizedState.swipes[0] || {};
      memorySnapshotId = String(activeBranch?.memorySnapshotId || refreshedMessage?.meta?.memorySnapshotId || '').trim();
      if (!memorySnapshotId && activeBranch?.memoryTableSnapshot) {
        const persisted = await memorySnapshotStore.persistSnapshot(sid, activeBranch.memoryTableSnapshot);
        memorySnapshotId = String(persisted?.id || '').trim();
      }
      return {
        sessionId: sid,
        tailAssistantMessageId: String(refreshedMessage?.id || '').trim(),
        tailSwipeIndex: activeSwipeIndex,
        memorySnapshotId,
        restoredAt: Date.now(),
        source,
      };
    }
    const snapshot = fallbackSnapshot || await buildSwipeMemoryTableSnapshot(sid, { isGroup });
    if (!snapshot) return {
      sessionId: sid,
      tailAssistantMessageId: '',
      tailSwipeIndex: 0,
      memorySnapshotId: '',
      restoredAt: Date.now(),
      source,
    };
    const persisted = await memorySnapshotStore.persistSnapshot(sid, snapshot);
    memorySnapshotId = String(persisted?.id || '').trim();
    return {
      sessionId: sid,
      tailAssistantMessageId: '',
      tailSwipeIndex: 0,
      memorySnapshotId,
      restoredAt: Date.now(),
      source,
    };
  };
  const setArchivePointerForArchive = async (sessionId, archiveId, pointer = null, { fallbackSnapshot = null, source = 'archive_capture' } = {}) => {
    const sid = String(sessionId || '').trim();
    const aid = String(archiveId || '').trim();
    if (!sid || !aid || !isTurnCheckpointSessionEnabled(sid)) return null;
    const nextPointer = pointer || await buildArchivePointerFromCurrentThread(sid, { fallbackSnapshot, source });
    if (!nextPointer) return null;
    return turnCheckpointStore.setArchivePointer(sid, aid, {
      ...nextPointer,
      sessionId: sid,
      archiveId: aid,
      source,
      restoredAt: Date.now(),
    });
  };
  const syncCurrentArchivePointerFromLoadedThread = async (sessionId, { fallbackSnapshot = null, source = 'archive_sync' } = {}) => {
    const sid = String(sessionId || '').trim();
    const archiveId = getCurrentArchiveIdForSession(sid);
    if (!sid || !archiveId) return null;
    return setArchivePointerForArchive(sid, archiveId, null, { fallbackSnapshot, source });
  };
  const restoreArchivePointerForLoadedThread = async (sessionId, {
    refreshBaselineWhenNoTail = true,
    source = 'archive_restore',
  } = {}) => {
    const sid = String(sessionId || '').trim();
    const archiveId = getCurrentArchiveIdForSession(sid);
    if (!sid || !archiveId || !isTurnCheckpointSessionEnabled(sid)) {
      return restoreMemoryFromCurrentTailAssistant(sid, { refreshBaselineWhenNoTail, source });
    }
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const pointer = await turnCheckpointStore.getArchivePointer(sid, archiveId);
    if (pointer) {
      const targetId = String(pointer.tailAssistantMessageId || '').trim();
      if (targetId) {
        const targetMessage = chatStore.findMessage(targetId, sid);
        if (isCheckpointTrackedAssistantMessage(targetMessage, sid)) {
          const normalizedState = normalizeCheckpointSwipeState(targetMessage);
          const desiredIndex = Math.min(
            Math.max(0, Number(pointer.tailSwipeIndex || 0)),
            Math.max(0, normalizedState.swipes.length - 1),
          );
          if (desiredIndex !== normalizedState.activeSwipeIndex) {
            const swipes = normalizedState.swipes.map(branch => cloneSwipePlainObject(branch) || {});
            const branch = swipes[desiredIndex] || swipes[0] || {};
            const nextMeta = { ...(normalizedState.meta || {}), swipes, activeSwipe: desiredIndex };
            if (nextMeta && typeof nextMeta === 'object' && 'activeSwipeDraft' in nextMeta) {
              delete nextMeta.activeSwipeDraft;
            }
            const payload = { meta: nextMeta };
            if (branch?.draft !== true) {
              payload.content = branch?.content ?? targetMessage.content;
              payload.raw = branch?.raw !== undefined ? branch.raw : targetMessage.raw;
            }
            const saved = chatStore.updateMessage(targetId, payload, sid) || { ...targetMessage, ...payload };
            if (isSessionActive(sid)) {
              const [decorated] = decorateMessagesForDisplay([saved], { sessionId: sid });
              ui.updateMessage(targetId, decorated || saved);
            }
          }
          const refreshedTarget = chatStore.findMessage(targetId, sid) || targetMessage;
          const refreshedState = normalizeCheckpointSwipeState(refreshedTarget);
          const activeSwipeIndex = Math.min(
            Math.max(0, Number(pointer.tailSwipeIndex || 0)),
            Math.max(0, refreshedState.swipes.length - 1),
          );
          const checkpoint = await turnCheckpointStore.getCheckpoint(sid, targetId);
          const checkpointBranch = Array.isArray(checkpoint?.branches)
            ? checkpoint.branches.find(branch => Number(branch?.swipeIndex) === activeSwipeIndex)
            : null;
          const inlineBranch = refreshedState.swipes[activeSwipeIndex] || refreshedState.swipes[0] || null;
          let fallbackLoadedSnapshot = null;
          const fallbackSnapshotId = String(pointer.memorySnapshotId || '').trim();
          if (fallbackSnapshotId) {
            fallbackLoadedSnapshot = await memorySnapshotStore.getSnapshot(fallbackSnapshotId);
          }
          const applied = await restoreCheckpointBranchMemoryState(
            sid,
            {
              ...(inlineBranch || {}),
              ...(checkpointBranch || {}),
              memorySnapshotId: String(
                checkpointBranch?.memorySnapshotId || inlineBranch?.memorySnapshotId || fallbackSnapshotId || ''
              ).trim(),
            },
            { isGroup, fallbackSnapshot: fallbackLoadedSnapshot },
          );
          if (applied) {
            await turnCheckpointStore.setPointer(sid, {
              sessionId: sid,
              tailAssistantMessageId: targetId,
              tailSwipeIndex: activeSwipeIndex,
              restoredAt: Date.now(),
              source,
            });
            await turnCheckpointStore.setArchivePointer(sid, archiveId, {
              ...pointer,
              archiveId,
              sessionId: sid,
              tailAssistantMessageId: targetId,
              tailSwipeIndex: activeSwipeIndex,
              restoredAt: Date.now(),
              source,
            });
            return true;
          }
        }
      }
      if (pointer.memorySnapshotId) {
        const fallbackLoadedSnapshot = await memorySnapshotStore.getSnapshot(pointer.memorySnapshotId);
        if (fallbackLoadedSnapshot) {
          const applied = await restoreCheckpointBranchMemoryState(
            sid,
            { memorySnapshotId: pointer.memorySnapshotId },
            { isGroup, fallbackSnapshot: fallbackLoadedSnapshot },
          );
          if (applied) {
            window.appBridge?.setLastMemoryUpdate?.(sid, null);
            await turnCheckpointStore.clearPointer(sid);
            await turnCheckpointStore.setArchivePointer(sid, archiveId, {
              ...pointer,
              archiveId,
              sessionId: sid,
              restoredAt: Date.now(),
              source,
            });
            return true;
          }
        }
      }
    }
    const applied = await restoreMemoryFromCurrentTailAssistant(sid, {
      refreshBaselineWhenNoTail,
      source: `${source}_fallback`,
    });
    const fallbackSnapshot = !findTailTrackedAssistantMessage(sid)
      ? await buildSwipeMemoryTableSnapshot(sid, { isGroup })
      : null;
    await syncCurrentArchivePointerFromLoadedThread(sid, {
      fallbackSnapshot,
      source: `${source}_fallback_sync`,
    });
    return applied;
  };
  const restoreMemoryForActiveThread = async (sessionId, options = {}) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const archiveId = getCurrentArchiveIdForSession(sid);
    if (!archiveId) {
      return restoreMemoryFromCurrentTailAssistant(sid, options);
    }
    const applied = await restoreMemoryFromCurrentTailAssistant(sid, options);
    const { isGroup } = getTurnCheckpointSessionScope(sid);
    const fallbackSnapshot = !findTailTrackedAssistantMessage(sid)
      ? await buildSwipeMemoryTableSnapshot(sid, { isGroup })
      : null;
    await syncCurrentArchivePointerFromLoadedThread(sid, {
      fallbackSnapshot,
      source: String(options?.source || 'active_archive_sync'),
    });
    return applied;
  };
  if (window.appBridge) {
    window.appBridge.restoreMemoryFromCurrentTailAssistant = restoreMemoryFromCurrentTailAssistant;
    window.appBridge.ensureSessionBaselineCheckpointSnapshot = ensureSessionBaselineCheckpointSnapshot;
    window.appBridge.syncTurnCheckpointForMessage = syncTurnCheckpointForMessage;
    window.appBridge.hydrateTurnCheckpointsFromLoadedMessages = hydrateTurnCheckpointsFromLoadedMessages;
    window.appBridge.clearSessionTurnCheckpointState = clearSessionTurnCheckpointState;
    window.appBridge.renameSessionTurnCheckpointState = renameSessionTurnCheckpointState;
    window.appBridge.deleteArchiveTurnCheckpointState = deleteArchiveTurnCheckpointState;
    window.appBridge.buildArchivePointerFromCurrentThread = buildArchivePointerFromCurrentThread;
    window.appBridge.setArchivePointerForArchive = setArchivePointerForArchive;
    window.appBridge.restoreArchivePointerForLoadedThread = restoreArchivePointerForLoadedThread;
    window.appBridge.restoreMemoryForActiveThread = restoreMemoryForActiveThread;
  }

  ui.onSwipeChange(async ({ msgId, message, index, previousIndex }) => {
    const sid = chatStore.getCurrent();
    if (!sid || !msgId) return;
    const stored = chatStore.findMessage(msgId, sid) || message;
    const storedMeta = stored?.meta && typeof stored.meta === 'object' ? stored.meta : {};
    const renderMeta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
    const sourceMeta = {
      ...storedMeta,
      ...(Array.isArray(renderMeta.swipes) ? { swipes: renderMeta.swipes, activeSwipe: renderMeta.activeSwipe } : {}),
    };
    const swipes = Array.isArray(sourceMeta.swipes) ? sourceMeta.swipes.map(branch => ({ ...(branch || {}) })) : [];
    if (swipes.length) {
      const messageMemorySnapshot = storedMeta.memoryTableSnapshot || renderMeta.memoryTableSnapshot || null;
      const messageMemoryUpdateEntry = storedMeta.memoryUpdateEntry || renderMeta.memoryUpdateEntry || null;
      if (messageMemorySnapshot && !swipes[0]?.memoryTableSnapshot) {
        swipes[0].memoryTableSnapshot = cloneSwipePlainObject(messageMemorySnapshot);
      }
      if (messageMemoryUpdateEntry && swipes[0]?.memoryUpdateEntry === undefined) {
        swipes[0].memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(messageMemoryUpdateEntry);
      }
    }
    const activeBranch = swipes[index] || null;
    const isDraftBranch = activeBranch?.draft === true;
    const contact = contactsStore.getContact(sid);
    const isGroupScope = sid.startsWith('group:') || Boolean(contact?.isGroup);
    const previousRaw = Math.trunc(Number(previousIndex));
    const previousSafe = Number.isFinite(previousRaw)
      ? Math.min(Math.max(0, previousRaw), Math.max(0, swipes.length - 1))
      : -1;
    const previousBranch = previousSafe !== -1 ? swipes[previousSafe] : null;
    if (
      previousSafe !== -1 &&
      previousSafe !== index &&
      canPersistOutgoingSwipeMemoryState(sid, msgId, previousSafe, previousBranch)
    ) {
      try {
        await persistSwipeBranchMemoryState(swipes, previousSafe, sid, { isGroup: isGroupScope });
      } catch (err) {
        logger.warn('persist swipe memory state failed', err);
      }
    }
    if (!isDraftBranch) {
      try {
        const applied = await applySwipeBranchMemoryState(sid, activeBranch, { isGroup: isGroupScope });
        if (applied) {
          markActiveSwipeMemoryState(sid, msgId, index);
        } else {
          logger.debug('swipe memory state not applied', {
            sessionId: sid,
            msgId,
            index,
            hasSnapshot: Boolean(activeBranch?.memoryTableSnapshot),
          });
        }
      } catch (err) {
        logger.warn('apply swipe memory state failed', err);
      }
    }
    const nextMeta = { ...sourceMeta, swipes, activeSwipe: index };
    if (nextMeta && typeof nextMeta === 'object' && 'activeSwipeDraft' in nextMeta) {
      delete nextMeta.activeSwipeDraft;
    }
    const payload = {
      meta: nextMeta,
    };
    if (!isDraftBranch) {
      payload.content = activeBranch?.content ?? message.content;
      payload.raw = activeBranch?.raw !== undefined ? activeBranch.raw : message.raw;
    }
    const saved = chatStore.updateMessage(msgId, payload, sid) || { ...stored, ...payload };
    if (!isDraftBranch) {
      syncTurnCheckpointForMessage(sid, saved).catch(err => {
        logger.warn('sync turn checkpoint after swipe change failed', err);
      });
    }
  });

  ui.onSwipeRegen(async ({ msgId, message }) => {
    if (uiMode !== 'rp') return;
    if (activeGeneration && !activeGeneration.cancelled) {
      window.toastr?.warning?.('正在生成中，请稍候...');
      return;
    }
    const sid = chatStore.getCurrent();
    if (!sid) return;
    const msgs = chatStore.getMessages(sid);
    const msgIdx = msgs.findIndex(m => String(m?.id || '') === String(msgId || ''));
    if (msgIdx === -1) return;
    let userIdx = -1;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'user') { userIdx = i; break; }
    }
    if (userIdx === -1) {
      window.toastr?.warning?.('未找到对应的用户消息');
      return;
    }
    const userMsg = msgs[userIdx];
    const storedMsg = chatStore.findMessage(msgId, sid) || message;
    const storedMeta = storedMsg?.meta && typeof storedMsg.meta === 'object' ? storedMsg.meta : {};
    const renderMeta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
    const sourceMeta = {
      ...storedMeta,
      ...(Array.isArray(renderMeta.swipes) ? { swipes: renderMeta.swipes, activeSwipe: renderMeta.activeSwipe } : {}),
    };
    let swipesBefore = Array.isArray(sourceMeta.swipes) && sourceMeta.swipes.length
      ? sourceMeta.swipes.map(s => ({ ...s }))
      : [{ content: storedMsg?.content ?? message?.content ?? '', raw: storedMsg?.raw ?? message?.raw }];
    if (swipesBefore.some(branch => branch?.draft)) {
      swipesBefore = swipesBefore.filter(branch => !branch?.draft);
      if (!swipesBefore.length) {
        swipesBefore = [{ content: storedMsg?.content ?? message?.content ?? '', raw: storedMsg?.raw ?? message?.raw }];
      }
    }
    if (swipesBefore.length) {
      const messageMemorySnapshot = storedMeta.memoryTableSnapshot || renderMeta.memoryTableSnapshot || null;
      const messageMemoryUpdateEntry = storedMeta.memoryUpdateEntry || renderMeta.memoryUpdateEntry || null;
      if (messageMemorySnapshot && !swipesBefore[0]?.memoryTableSnapshot) {
        swipesBefore[0].memoryTableSnapshot = cloneSwipePlainObject(messageMemorySnapshot);
      }
      if (messageMemoryUpdateEntry && swipesBefore[0]?.memoryUpdateEntry === undefined) {
        swipesBefore[0].memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(messageMemoryUpdateEntry);
      }
    }
    const beforeIds = new Set((msgs || []).map(m => String(m?.id || '')).filter(Boolean));
    const previousActive = Math.min(
      Math.max(0, Number(sourceMeta.activeSwipe) || 0),
      Math.max(0, swipesBefore.length - 1),
    );
    const draftIndex = swipesBefore.length;
    const draftTotal = swipesBefore.length + 1;
    const streamId = `swipe-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const draftLabel = '生成新回复中...';
    let partialCommitted = false;
    let branchFinalized = false;
    let swipeStreamCtrl = null;
    let baselineMemorySnapshot = null;
    let baselineMemoryUpdateEntry = null;
    const clearActiveSwipeGenerationMarker = () => {
      try {
        if (document.body?.dataset?.activeSwipeGenerationMsgId === String(msgId || '')) {
          delete document.body.dataset.activeSwipeGenerationMsgId;
        }
      } catch {}
    };
    const markActiveSwipeGeneration = () => {
      try {
        if (document.body?.dataset) document.body.dataset.activeSwipeGenerationMsgId = String(msgId || '');
      } catch {}
    };
    const cancelSwipePlaceholderStream = () => {
      try {
        swipeStreamCtrl?.cancel?.({ keepPartial: false });
      } catch {}
    };
    const showDraftBranch = () => {
      const branch = { content: '', raw: '', draft: true, label: draftLabel };
      const nextMeta = {
        ...sourceMeta,
        swipes: [...swipesBefore, branch],
        activeSwipe: draftIndex,
        swipeRegenerating: true,
      };
      markActiveSwipeGeneration();
      const current = chatStore.findMessage(msgId, sid) || storedMsg || message;
      const updated = chatStore.updateMessage(msgId, {
        content: current?.content ?? storedMsg?.content ?? message?.content ?? '',
        raw: current?.raw ?? storedMsg?.raw ?? message?.raw ?? '',
        meta: nextMeta,
      }, sid) || {
        ...current,
        meta: nextMeta,
      };
      const wrapper = ui.scrollEl?.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
      if (wrapper && wrapper.isConnected) {
        wrapper.__chatappMessage = updated;
        ui._applySwipe(wrapper, updated, draftIndex, { emitChange: false });
      }
      return updated;
    };
    const commitBranch = (source, {
      partial = false,
      cancelled = false,
      memoryTableSnapshot = null,
      memoryUpdateEntry = undefined,
    } = {}) => {
      const content = String(source?.content ?? '');
      const raw = typeof source?.raw === 'string' ? source.raw : content;
      if (!content.trim() && !raw.trim()) return false;
      const newBranch = { content, raw };
      if (partial) newBranch.partial = true;
      if (cancelled) newBranch.cancelled = true;
      if (memoryTableSnapshot) newBranch.memoryTableSnapshot = cloneSwipePlainObject(memoryTableSnapshot);
      if (memoryUpdateEntry !== undefined) newBranch.memoryUpdateEntry = cloneSwipeMemoryUpdateEntry(memoryUpdateEntry);
      const merged = [...swipesBefore, newBranch];
      const nextMeta = { ...sourceMeta, swipes: merged, activeSwipe: merged.length - 1 };
      delete nextMeta.swipeRegenerating;
      delete nextMeta.activeSwipeDraft;
      const updated = chatStore.updateMessage(msgId, {
        content: newBranch.content,
        raw: newBranch.raw,
        meta: nextMeta,
      }, sid) || {
        ...storedMsg,
        content: newBranch.content,
        raw: newBranch.raw,
        meta: nextMeta,
      };
      const wrapper = ui.scrollEl?.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
      if (wrapper && wrapper.isConnected) {
        wrapper.__chatappMessage = updated;
        ui._applySwipe(wrapper, updated, merged.length - 1, { emitChange: false });
      }
      branchFinalized = true;
      clearActiveSwipeGenerationMarker();
      syncTurnCheckpointForMessage(sid, updated).catch(err => {
        logger.warn('sync turn checkpoint after swipe commit failed', err);
      });
      return true;
    };
    const restorePreviousBranch = async () => {
      cancelSwipePlaceholderStream();
      const cleanSwipes = swipesBefore.filter(branch => !branch?.draft);
      const restoredSwipes = cleanSwipes.length
        ? cleanSwipes
        : [{ content: storedMsg?.content ?? message?.content ?? '', raw: storedMsg?.raw ?? message?.raw }];
      const restoredActive = Math.min(Math.max(0, previousActive), Math.max(0, restoredSwipes.length - 1));
      const restoredMeta = { ...sourceMeta, swipes: restoredSwipes, activeSwipe: restoredActive };
      const branch = restoredSwipes[restoredActive] || restoredSwipes[0] || {};
      delete restoredMeta.swipeRegenerating;
      delete restoredMeta.activeSwipeDraft;
      try {
        const applied = await applySwipeBranchMemoryState(sid, branch, { isGroup: isGroupScope });
        if (applied) markActiveSwipeMemoryState(sid, msgId, restoredActive);
      } catch (err) {
        logger.warn('restore swipe memory state failed', err);
      }
      const restoredBase = chatStore.findMessage(msgId, sid) || storedMsg || message;
      const restored = chatStore.updateMessage(msgId, {
        content: branch.content ?? '',
        raw: branch.raw,
        meta: restoredMeta,
      }, sid) || {
        ...restoredBase,
        content: branch.content ?? '',
        raw: branch.raw,
        meta: restoredMeta,
      };
      const wrapper = ui.scrollEl?.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
      if (wrapper && wrapper.isConnected) {
        ui.setSwipeRegenerating?.(msgId, false);
        wrapper.__chatappMessage = restored;
        ui._applySwipe(wrapper, restored, restoredActive, { emitChange: false });
      }
      branchFinalized = true;
      clearActiveSwipeGenerationMarker();
      await syncTurnCheckpointForMessage(sid, restored).catch(err => {
        logger.warn('sync turn checkpoint after swipe restore failed', err);
      });
    };
    const contact = contactsStore.getContact(sid);
    const isGroupScope = sid.startsWith('group:') || Boolean(contact?.isGroup);
    if (getMemoryStorageMode() === 'table') {
      try {
        await persistSwipeBranchMemoryState(swipesBefore, previousActive, sid, { isGroup: isGroupScope });
        markActiveSwipeMemoryState(sid, msgId, previousActive);
      } catch (err) {
        logger.warn('persist swipe memory state before regen failed', err);
      }
    }
    showDraftBranch();
    if (getMemoryStorageMode() === 'table') {
      try {
        const rollbackFn = window.appBridge?.rollbackLastMemoryUpdate;
        if (typeof rollbackFn === 'function') await rollbackFn(sid);
        window.appBridge?.setLastMemoryUpdate?.(sid, null);
        baselineMemorySnapshot = await buildSwipeMemoryTableSnapshot(sid, { isGroup: isGroupScope });
        baselineMemoryUpdateEntry = null;
      } catch (err) {
        logger.warn('rollback swipe memory state failed', err);
      }
    }
    swipeStreamCtrl = ui.startSwipeGenerationStream?.(msgId, {
      id: streamId,
      index: draftIndex,
      total: draftTotal,
      label: draftLabel,
    }) || null;
    try {
      const resendText = String(userMsg?.content ?? '').trim() || '[Continue]';
      const sendOk = await handleSend(null, {
        overrideText: resendText,
        suppressUserMessage: true,
        ignorePending: true,
        skipInputRegex: true,
        existingUserMessageId: userMsg.id,
        includeAttachments: false,
        suppressAssistantDom: true,
        excludeMessageIds: [msgId],
        createAssistantStream: meta => {
          if (
            swipeStreamCtrl &&
            (typeof swipeStreamCtrl.isConnected !== 'function' || swipeStreamCtrl.isConnected() !== false)
          ) {
            return swipeStreamCtrl;
          }
          swipeStreamCtrl = ui.startSwipeGenerationStream?.(msgId, {
            ...meta,
            id: streamId,
            index: draftIndex,
            total: draftTotal,
            label: draftLabel,
          }) || null;
          return swipeStreamCtrl;
        },
        swipeTarget: {
          msgId,
          onPartial: partial => {
            partialCommitted = commitBranch(partial, {
              partial: true,
              cancelled: true,
              memoryTableSnapshot: baselineMemorySnapshot,
              memoryUpdateEntry: baselineMemoryUpdateEntry,
            });
            if (partialCommitted) markActiveSwipeMemoryState(sid, msgId, swipesBefore.length);
            return partialCommitted;
          },
        },
      });

      const msgsAfter = chatStore.getMessages(sid);
      const generatedAssistants = (msgsAfter || []).filter(m => {
        const id = String(m?.id || '');
        return id && !beforeIds.has(id) && m?.role === 'assistant' && !m?.meta?.isGreeting;
      });
      const newAiMsg = generatedAssistants[generatedAssistants.length - 1] || null;
      if (partialCommitted) {
        generatedAssistants.forEach(m => {
          ui.removeMessage(m.id);
          chatStore.deleteMessage(m.id, sid);
        });
        return;
      }
      if (!sendOk || !newAiMsg) {
        generatedAssistants.forEach(m => {
          ui.removeMessage(m.id);
          chatStore.deleteMessage(m.id, sid);
        });
        if (sendOk && !newAiMsg) window.toastr?.warning?.('未取得新的回复分支');
        await restorePreviousBranch();
        return;
      }

      let branchMemorySnapshot = null;
      let branchMemoryUpdateEntry = undefined;
      if (getMemoryStorageMode() === 'table') {
        try {
          branchMemorySnapshot = await buildSwipeMemoryTableSnapshot(sid, { isGroup: isGroupScope });
          branchMemoryUpdateEntry = cloneSwipeMemoryUpdateEntry(window.appBridge?.getLastMemoryUpdate?.(sid));
        } catch (err) {
          logger.warn('capture swipe memory state failed', err);
        }
      }
      commitBranch(newAiMsg, {
        memoryTableSnapshot: branchMemorySnapshot,
        memoryUpdateEntry: branchMemoryUpdateEntry,
      });
      markActiveSwipeMemoryState(sid, msgId, swipesBefore.length);
      generatedAssistants.forEach(m => {
        ui.removeMessage(m.id);
        chatStore.deleteMessage(m.id, sid);
      });
    } catch (err) {
      logger.warn('swipe regeneration failed; restoring previous branch', err);
      try {
        const msgsAfterError = chatStore.getMessages(sid);
        const generatedAssistants = (msgsAfterError || []).filter(m => {
          const id = String(m?.id || '');
          return id && !beforeIds.has(id) && m?.role === 'assistant' && !m?.meta?.isGreeting;
        });
        generatedAssistants.forEach(m => {
          ui.removeMessage(m.id);
          chatStore.deleteMessage(m.id, sid);
        });
      } catch {}
      if (!partialCommitted) await restorePreviousBranch();
    } finally {
      if (!branchFinalized) await restorePreviousBranch();
      ui.setSwipeRegenerating?.(msgId, false);
      ui.setStreamingState?.(false);
      clearActiveSwipeGenerationMarker();
      refreshChatAndContacts();
    }
  });

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
  let activeGeneration = null; // { id, sessionId, userMsgId, streamCtrl, cancelled }
  let generationSequence = 0;
  const isGenerationInterrupted = (generationId) =>
    Boolean(generationId) && (!activeGeneration || activeGeneration.id !== generationId || activeGeneration.cancelled);
  const cancelActiveGeneration = (reason = 'user') => {
    if (!activeGeneration || activeGeneration.cancelled) return false;
    const generation = activeGeneration;
    try {
      generation.cancelled = true;
    } catch {}
    try {
      const sid = String(generation.sessionId || '').trim();
      if (sid) abortMemoryUpdate(sid);
    } catch {}
    try {
      window.appBridge.cancelCurrentGeneration(reason);
    } catch {}
    let partial = null;
    try {
      partial = generation.streamCtrl?.cancel?.({ keepPartial: reason === 'user' }) || null;
    } catch {}
    if (!partial && reason === 'user') {
      const rawText = String(generation.streamText || '');
      if (rawText.trim()) {
        const meta = generation.streamMeta && typeof generation.streamMeta === 'object' ? generation.streamMeta : {};
        partial = {
          role: 'assistant',
          type: 'text',
          id: meta.id || generation.streamCtrl?.id,
          name: meta.name || '助手',
          avatar: meta.avatar || getAssistantAvatarForSession(generation.sessionId),
          time: meta.time || formatNowTime(),
          content: rawText,
          raw: rawText,
          rawOriginal: rawText,
          meta: {
            partial: true,
            cancelled: true,
          },
        };
      }
    }
    if (reason === 'user') {
      try {
        const sessionId = String(generation.sessionId || '').trim();
        const content = String(partial?.content || '').trim();
        const msgId = String(partial?.id || '').trim();
        let handledPartial = false;
        const partialCommitHandler =
          typeof generation.partialCommitHandler === 'function' ? generation.partialCommitHandler : null;
        if (sessionId && content && partialCommitHandler) {
          try {
            handledPartial = partialCommitHandler(partial) === true;
          } catch (err) {
            logger.warn('assistant partial commit failed', err);
          }
        }
        const swipeTarget = generation.swipeTarget && typeof generation.swipeTarget === 'object' ? generation.swipeTarget : null;
        if (sessionId && content && typeof swipeTarget?.onPartial === 'function') {
          try {
            handledPartial = swipeTarget.onPartial(partial) === true;
          } catch (err) {
            logger.warn('swipe partial commit failed', err);
          }
        }
        if (sessionId && content && !handledPartial) {
          const exists = msgId ? Boolean(chatStore.findMessage(msgId, sessionId)) : false;
          if (!exists) {
            chatStore.appendMessage(
              {
                role: 'assistant',
                type: 'text',
                id: msgId || undefined,
                name: partial?.name || '助手',
                avatar: partial?.avatar || getAssistantAvatarForSession(sessionId),
                time: partial?.time || formatNowTime(),
                content: String(partial?.content || ''),
                raw: typeof partial?.raw === 'string' ? partial.raw : String(partial?.content || ''),
                rawOriginal:
                  typeof partial?.rawOriginal === 'string'
                    ? partial.rawOriginal
                    : (typeof partial?.raw === 'string' ? partial.raw : String(partial?.content || '')),
                meta: {
                  ...(partial?.meta || {}),
                  partial: true,
                  cancelled: true,
                },
              },
              sessionId,
            );
            refreshChatAndContacts();
          }
        }
      } catch {}
    }
    try {
      ui.hideTyping?.();
    } catch {}
    try {
      ui.setStreamingState?.(false);
    } catch {}
    try {
      ui.setSendingState(false);
    } catch {}
    if (activeGeneration?.id === generation.id) {
      activeGeneration = null;
    }
    return true;
  };
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
          const older = await chatStore.loadOlderMessages(sid, '', { partCount: 1 });
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
  const normalizeSummarySnapshotItems = (items = []) =>
    (Array.isArray(items) ? items : [])
      .map(it => {
        if (!it) return null;
        if (typeof it === 'string') {
          const text = String(it || '').trim();
          if (!text) return null;
          return { at: 0, text };
        }
        const text = String(it?.text || '').trim();
        if (!text) return null;
        const at = Number(it?.at || 0) || 0;
        return { at, text };
      })
      .filter(Boolean);
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
          const activeUser = getActiveUserProfile();
          const userName = String(activeUser?.name || '').trim() || '我';
          const charName = String(contact?.name || sessionId.replace(/^group:/, '') || sessionId) || 'assistant';
          const ctx = {
            user: {
              name: userName,
              persona: String(activeUser?.description || ''),
              personaPosition: activeUser?.position,
              personaDepth: activeUser?.depth,
              personaRole: activeUser?.role,
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
            const keep = normalizeSummarySnapshotItems(chatStore.getSummaries(sessionId)).slice(-2);
            chatStore.setSummaries(keep, sessionId);
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

          const activeUser = getActiveUserProfile();
          const userName = String(activeUser?.name || '').trim() || '我';
          const ctx = {
            user: {
              name: userName,
              persona: String(activeUser?.description || ''),
              personaPosition: activeUser?.position,
              personaDepth: activeUser?.depth,
              personaRole: activeUser?.role,
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
            const keep = normalizeSummarySnapshotItems(momentSummaryStore.getSummaries()).slice(-2);
            momentSummaryStore.setSummaries(keep);
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
    const activeUser = getActiveUserProfile();
    const stickerKey = text && isStickerAllowed() ? parseStickerToken(text) : '';
    const replyTarget = getReplyTargetForSession(sessionId);
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
      name: String(activeUser?.name || '').trim() || '我',
      time: formatNowTime(),
    };
    if (!text && hasAttachments && !stickerKey) {
      pendingMessage.meta = { attachmentsOnly: true };
    }
    if (replyTarget) {
      pendingMessage.meta = {
        ...(pendingMessage.meta || {}),
        replyTo: replyTarget,
      };
    }

    // 添加到聊天历史（作为 pending 状态的消息）
    const saved = chatStore.appendMessage(pendingMessage, sessionId);

    // 在UI中渲染为半透明气泡
    ui.addMessage(saved);

    // 清空输入框
    ui.clearInput();
    if (replyTarget) clearReplyTargetForSession(sessionId);

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
    const skipTemplate = Boolean(options.skipTemplate);
    const skipScripts = Boolean(options.skipScripts);
    const suppressAssistantDom = Boolean(options.suppressAssistantDom);
    const assistantStreamFactory =
      typeof options.createAssistantStream === 'function' ? options.createAssistantStream : null;
    const continueTarget = options.continueTarget && typeof options.continueTarget === 'object' ? options.continueTarget : null;
    const partialCommitHandler =
      typeof options.partialCommitHandler === 'function' ? options.partialCommitHandler : null;
    const swipeTarget = options.swipeTarget && typeof options.swipeTarget === 'object' ? options.swipeTarget : null;
    const excludeMessageIds = new Set(
      Array.isArray(options.excludeMessageIds)
        ? options.excludeMessageIds.map(id => String(id || '')).filter(Boolean)
        : [],
    );
    if (continueTarget?.messageId) excludeMessageIds.add(String(continueTarget.messageId));
    const rpUiMode = uiMode === 'rp';
    const includeAttachments = options.includeAttachments !== false;
    const attachmentQueue = includeAttachments ? composerAttachments.slice() : [];
    const hasAttachments = attachmentQueue.length > 0;
    const sessionId = chatStore.getCurrent();
    let outgoingReplyContexts = [];
    let generationId = 0;
    if (activeGeneration && !activeGeneration.cancelled) {
      window.toastr?.warning?.('正在生成中，请稍候...');
      return false;
    }
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
          const activeUser = getActiveUserProfile();
          const stickerKey = isStickerAllowed() ? parseStickerToken(currentInput) : '';
          const replyTarget = getReplyTargetForSession(sessionId);
          const newPendingMsg = {
            role: 'user',
            type: stickerKey ? 'sticker' : 'text',
            content: stickerKey || currentInput,
            raw: stickerKey ? currentInput : undefined,
            status: 'pending',
            avatar: avatars.user,
            name: String(activeUser?.name || '').trim() || '我',
            time: formatNowTime(),
          };
          if (replyTarget) {
            newPendingMsg.meta = { ...(newPendingMsg.meta || {}), replyTo: replyTarget };
          }
          const saved = chatStore.appendMessage(newPendingMsg, sessionId);
          ui.addMessage(saved);
          messagesToSend.push(saved);
          ui.clearInput();
          if (replyTarget) clearReplyTargetForSession(sessionId);
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
      if (scriptRuntime && !skipScripts) {
        pendingMessagesToConfirm.forEach(m => {
          const updated = chatStore.findMessage(m.id, sessionId) || { ...m, status: 'sending' };
          scriptRuntime.dispatchEvent('message.after_send', { message: updated, sessionId }).catch(err => {
            logger.warn('script message.after_send failed', err);
          });
        });
      }
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
      if (!text && !hasAttachments && !continueTarget) return false;
    }
    const contact = contactsStore.getContact(sessionId);
    const isRpMode = uiMode === 'rp';
    const sharedVariables = isSharedVariableSession(sessionId);
    const activeUser = getActiveUserProfile();
    const activePersona = getEffectivePersona(sessionId);
    const promptUserName = String(activeUser?.name || '').trim() || '我';
    const userName = isRpMode ? '我' : promptUserName;
    const characterName = isRpMode
      ? (String(getRpCharacterName(activePersona) || '').trim() || '角色')
      : (contact?.name || (sessionId.startsWith('group:') ? sessionId.replace(/^group:/, '') : sessionId) || 'assistant');
    const userEchoGuard = createUserEchoGuard(text, promptUserName);
    const isGroupChat = Boolean(contact?.isGroup) || sessionId.startsWith('group:');
    const groupMembers = isGroupChat ? (Array.isArray(contact?.members) ? contact.members : []) : [];
    const containsTemplateSyntax = (value) => {
      if (!value) return false;
      if (typeof value === 'string') return value.includes('<%');
      if (Array.isArray(value)) return value.some(containsTemplateSyntax);
      if (typeof value === 'object') {
        if (containsTemplateSyntax(value.content)) return true;
        if (containsTemplateSyntax(value.text)) return true;
      }
      return false;
    };
    const hasTemplateInMessages = (messages) => {
      if (!Array.isArray(messages)) return false;
      return messages.some(msg => containsTemplateSyntax(msg?.content ?? msg));
    };
    const maybePromptTemplateEnable = async ({ sampleText = '' } = {}) => {
      if (skipTemplate) return;
      const settings = appSettings.get();
      if (settings.templateEnabled !== false) return;
      if (settings.templateDetectDisabled === true) return;
      if (templatePromptedSessions.has(sessionId)) return;
      let detected = containsTemplateSyntax(sampleText);
      if (!detected && typeof window.appBridge?.buildMessages === 'function') {
        try {
          const preview = window.appBridge.buildMessages(sampleText || text, llmContext(sampleText || text));
          detected = hasTemplateInMessages(preview);
        } catch {}
      }
      if (!detected) return;
      templatePromptedSessions.add(sessionId);
      const choice = await appChoice({
        title: '模板提示',
        message: '检测到当前内容包含模板语法（<% %>）。\n启用后可获得完整变量驱动体验。',
        actions: [
          { id: 'enable', label: '启用模板', primary: true },
          { id: 'later', label: '暂不' },
          { id: 'never', label: '不再提示', variant: 'danger' },
        ],
        defaultActionId: 'enable',
      });
      if (choice === 'enable') {
        appSettings.update({ templateEnabled: true });
      } else if (choice === 'never') {
        appSettings.update({ templateDetectDisabled: true });
      }
    };
    const maybePromptScriptAuthorization = async () => {
      if (skipScripts) return;
      if (!scriptStore) return;
      if (scriptPromptedSessions.has(sessionId)) return;
      const personaId = String(activePersona?.id || '').trim();
      if (!personaId) return;
      const scripts = scriptStore.getScripts('character', personaId).filter(s => s && s.authorized !== true);
      if (!scripts.length) return;
      scriptPromptedSessions.add(sessionId);
      const settings = appSettings.get();
      const perms = [
        `读取聊天记录：${settings.scriptAllowReadMessages !== false ? '允许' : '禁用'}`,
        `修改变量：${settings.scriptAllowModifyVariables !== false ? '允许' : '禁用'}`,
        `访问网络：${settings.scriptAllowNetwork === true ? '允许' : '禁用'}`,
      ];
      const choice = await appChoice({
        title: '脚本授权',
        message: `检测到此角色卡包含 ${scripts.length} 条脚本。\n脚本可能需要权限：\n- ${perms.join('\n- ')}`,
        actions: [
          { id: 'allow', label: '允许并启用', primary: true },
          { id: 'once', label: '仅本次允许' },
          { id: 'deny', label: '拒绝', variant: 'danger' },
        ],
        defaultActionId: 'allow',
      });
      if (choice === 'allow') {
        if (settings.scriptEnabled !== true) appSettings.update({ scriptEnabled: true });
        await Promise.all(scripts.map(s => scriptStore.toggleScript('character', personaId, s.id, true)));
        await scriptRuntime?.syncScripts?.({ sessionId });
      } else if (choice === 'once') {
        scriptRuntime?.allowOnce?.(sessionId, scripts.map(s => s.id));
      }
    };
    if (scriptRuntime && !skipScripts) {
      try {
        const payload = {
          content: text,
          sessionId,
          userName,
          isGroup: isGroupChat,
          hasAttachments,
        };
        const updated = await scriptRuntime.dispatchEvent('message.before_send', payload);
        if (
          updated &&
          typeof updated.content === 'string' &&
          updated.content !== text &&
          (!pendingMessagesToConfirm || pendingMessagesToConfirm.length === 0)
        ) {
          text = updated.content;
        }
      } catch (err) {
        logger.warn('script message.before_send failed', err);
      }
    }
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
    const normalizeMomentStoredText = (text, { regexMode = 'output', depth = 0 } = {}) => {
      const source = String(text ?? '');
      const mode = String(regexMode || '').trim().toLowerCase() === 'input' ? 'input' : 'output';
      try {
        if (mode === 'input' && typeof window.appBridge?.applyInputStoredRegex === 'function') {
          return window.appBridge.applyInputStoredRegex(source, { isEdit: false, depth });
        }
        if (typeof window.appBridge?.applyOutputStoredRegex === 'function') {
          return window.appBridge.applyOutputStoredRegex(source, { isEdit: false, depth });
        }
      } catch {}
      return source;
    };
    const normalizeMomentCommentForStore = (comment, { regexMode = 'output', depth = 0 } = {}) => {
      if (!comment || typeof comment !== 'object') return comment;
      const mode = String(regexMode || '').trim().toLowerCase() === 'input' ? 'input' : 'output';
      return {
        ...(comment || {}),
        content: normalizeMomentStoredText(comment?.content, { regexMode: mode, depth }),
        regexMode: mode,
      };
    };
    const normalizeMomentCommentsForStore = (comments = [], opts = {}) =>
      (Array.isArray(comments) ? comments : []).map(comment => normalizeMomentCommentForStore(comment, opts));
    const normalizeMomentRecordForStore = (moment, { regexMode = 'output', depth = 0 } = {}) => {
      if (!moment || typeof moment !== 'object') return moment;
      const mode = String(regexMode || '').trim().toLowerCase() === 'input' ? 'input' : 'output';
      return {
        ...(moment || {}),
        content: normalizeMomentStoredText(moment?.content, { regexMode: mode, depth }),
        comments: normalizeMomentCommentsForStore(moment?.comments, { regexMode: mode, depth }),
        regexMode: mode,
      };
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
        return normalizeMomentRecordForStore(
          { ...(m || {}), ...stats, author, authorId, authorAvatar, originSessionId: sessionId },
          { regexMode: 'output', depth: 0 },
        );
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
    const buildTableMaps = (template, filterOptions = null) => {
      const tableById = new Map();
      const tableNameMap = new Map();
      const tableOrder = [];
      (template?.tables || []).forEach(table => {
        const id = String(table?.id || '').trim();
        if (!id) return;
        if (filterOptions && !tableMatchesMemoryContext(table, filterOptions)) return;
        tableById.set(id, table);
        tableOrder.push(id);
        const name = String(table?.name || '').trim();
        if (name) tableNameMap.set(name.toLowerCase(), id);
      });
      return { tableById, tableNameMap, tableOrder };
    };
    const clonePlainObject = value => {
      if (value === null || value === undefined) return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value && typeof value === 'object' ? { ...value } : value;
      }
    };
    const cloneMemoryUpdateEntry = entry => {
      if (!entry || typeof entry !== 'object') return null;
      const cloned = clonePlainObject(entry) || {};
      const clip = (value, max = 20000) => {
        const text = typeof value === 'string' ? value : '';
        if (!text) return '';
        return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
      };
      return {
        at: cloned.at || 0,
        mode: cloned.mode,
        sessionId: cloned.sessionId,
        tableEditRaw: clip(cloned.tableEditRaw),
        raw: clip(cloned.raw),
        requestPrompt: clip(cloned.requestPrompt),
        actions: Array.isArray(cloned.actions) ? clonePlainObject(cloned.actions) : [],
        rollback: cloned.rollback ? clonePlainObject(cloned.rollback) : null,
        rollbackAt: cloned.rollbackAt || 0,
      };
    };
    const buildSwipeMemoryTableSnapshot = async (sessionId, { isGroup } = {}) => {
      if (getMemoryStorageMode() !== 'table') return null;
      if (!memoryTableStore?.getMemories || !memoryTemplateStore) return null;
      const sid = String(sessionId || '').trim();
      if (!sid) return null;
      let templateInfo = null;
      try {
        templateInfo = await loadTemplateDefinition();
      } catch {
        templateInfo = null;
      }
      const templateId = String(templateInfo?.record?.id || '').trim();
      if (!templateId) return null;
      const groupScope = Boolean(isGroup);
      let rows = [];
      try {
        rows = await memoryTableStore.getMemories({
          scope: groupScope ? 'group' : 'contact',
          group_id: groupScope ? sid : undefined,
          contact_id: groupScope ? undefined : sid,
          template_id: templateId,
        });
      } catch {
        rows = [];
      }
      const picked = sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
        .map(row => {
          const tableId = String(row?.table_id || '').trim();
          if (!tableId) return null;
          return {
            id: String(row?.id || '').trim(),
            template_id: String(row?.template_id || templateId).trim() || templateId,
            table_id: tableId,
            contact_id: groupScope ? null : sid,
            group_id: groupScope ? sid : null,
            row_data: clonePlainObject(row?.row_data || {}),
            is_active: row?.is_active !== false,
            is_pinned: Boolean(row?.is_pinned),
            priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
            sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
          };
        })
        .filter(Boolean);
      return {
        templateId,
        scope: groupScope ? 'group' : 'contact',
        rows: picked,
        capturedAt: Date.now(),
      };
    };
    const applySwipeMemoryTableSnapshot = async (sessionId, snapshot, { isGroup } = {}) => {
      if (getMemoryStorageMode() !== 'table') return false;
      if (!snapshot || !memoryTableStore?.getMemories) return false;
      const sid = String(sessionId || '').trim();
      if (!sid) return false;
      const groupScope = Boolean(isGroup);
      const templateId = String(snapshot?.templateId || '').trim();
      if (!templateId) return false;
      let existing = [];
      try {
        existing = await memoryTableStore.getMemories({
          scope: groupScope ? 'group' : 'contact',
          group_id: groupScope ? sid : undefined,
          contact_id: groupScope ? undefined : sid,
          template_id: templateId,
        });
      } catch {
        existing = [];
      }
      const ids = (Array.isArray(existing) ? existing : [])
        .map(row => String(row?.id || '').trim())
        .filter(Boolean);
      if (ids.length) {
        try {
          await memoryTableStore.batchDeleteMemories?.(ids);
        } catch {
          for (const id of ids) {
            try {
              await memoryTableStore.deleteMemory?.(id);
            } catch {}
          }
        }
      }
      const inputs = sortMemoryRowsForSnapshot(Array.isArray(snapshot?.rows) ? snapshot.rows : [])
        .map(row => {
          const tableId = String(row?.table_id || '').trim();
          if (!tableId) return null;
          return {
            id: row?.id ? String(row.id) : undefined,
            template_id: templateId,
            table_id: tableId,
            contact_id: groupScope ? null : sid,
            group_id: groupScope ? sid : null,
            row_data: clonePlainObject(row?.row_data || {}),
            is_active: row?.is_active !== false,
            is_pinned: Boolean(row?.is_pinned),
            priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
            sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
          };
        })
        .filter(Boolean);
      if (inputs.length) {
        try {
          await memoryTableStore.batchCreateMemories?.(inputs);
        } catch {
          for (const input of inputs) {
            try {
              await memoryTableStore.createMemory?.(input);
            } catch {}
          }
        }
      }
      window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId: sid, templateId } }));
      return true;
    };
    const persistSwipeBranchMemoryState = async (branches, index, sessionId, { isGroup } = {}) => {
      if (getMemoryStorageMode() !== 'table') return false;
      if (!Array.isArray(branches) || index < 0 || index >= branches.length) return false;
      const branch = branches[index] && typeof branches[index] === 'object' ? branches[index] : null;
      if (!branch || branch.draft === true) return false;
      const snapshot = await buildSwipeMemoryTableSnapshot(sessionId, { isGroup });
      if (!snapshot) return false;
      branch.memoryTableSnapshot = snapshot;
      branch.memoryUpdateEntry = cloneMemoryUpdateEntry(window.appBridge?.getLastMemoryUpdate?.(sessionId));
      return true;
    };
    const applySwipeBranchMemoryState = async (sessionId, branch, { isGroup } = {}) => {
      if (getMemoryStorageMode() !== 'table') return false;
      if (!branch || typeof branch !== 'object' || !branch.memoryTableSnapshot) return false;
      const applied = await applySwipeMemoryTableSnapshot(sessionId, branch.memoryTableSnapshot, { isGroup });
      if (applied) {
        const entry = cloneMemoryUpdateEntry(branch.memoryUpdateEntry);
        window.appBridge?.setLastMemoryUpdate?.(sessionId, entry || null);
      }
      return applied;
    };
    const captureAssistantMemoryState = async (sessionId, { isGroup } = {}) => {
      if (getMemoryStorageMode() !== 'table') return null;
      const snapshot = await buildSwipeMemoryTableSnapshot(sessionId, { isGroup });
      if (!snapshot) return null;
      return {
        memoryTableSnapshot: clonePlainObject(snapshot),
        memoryUpdateEntry: cloneMemoryUpdateEntry(window.appBridge?.getLastMemoryUpdate?.(sessionId)),
      };
    };
    const attachAssistantMemoryStateToMeta = (meta, memoryState) => {
      if (!meta || typeof meta !== 'object') return meta;
      if (!memoryState || !memoryState.memoryTableSnapshot) return meta;
      meta.memoryTableSnapshot = clonePlainObject(memoryState.memoryTableSnapshot);
      if (memoryState.memoryUpdateEntry !== undefined) {
        meta.memoryUpdateEntry = cloneMemoryUpdateEntry(memoryState.memoryUpdateEntry);
      }
      return meta;
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

      const rawPlan = window.appBridge?.lastMemoryPlan || null;
      const planTargetId = String(rawPlan?.targetId || '').trim();
      const currentSessionId = String(sessionId || '').trim();
      const plan =
        rawPlan && (!planTargetId || planTargetId === currentSessionId)
          ? rawPlan
          : null;
      if (rawPlan && planTargetId && planTargetId !== currentSessionId) {
        logger.debug('memory apply: ignore stale plan target', {
          planTargetId,
          currentSessionId,
        });
      }

      let templateInfo = null;
      try {
        templateInfo = await loadTemplateDefinition();
      } catch {
        templateInfo = null;
      }
      if (!templateInfo?.record) return null;
      const templateId = String(templateInfo.record?.id || '').trim();
      const template = templateInfo.template || {};
      const contextType = getMemoryContextType({ sessionId, isGroup });
      const sessionMode = resolveMemorySessionMode({ uiMode, sessionId, contextType });
      const { tableById, tableNameMap, tableOrder: templateOrder } = buildTableMaps(template, {
        sessionId,
        isGroup,
        contextType,
        uiMode: sessionMode === 'rp' ? 'rp' : uiMode,
      });
      const planOrder = Array.isArray(plan?.tableOrder) ? plan.tableOrder : [];
      const tableOrder = planOrder.length ? planOrder : templateOrder;
      const rowIndexMap = plan?.rowIndexMap && typeof plan.rowIndexMap === 'object' ? plan.rowIndexMap : {};

      const useSharedGlobalScope = false;
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

      const resolveSessionAssistantTurnNumber = (sid) => {
        const targetSessionId = String(sid || '').trim();
        if (!targetSessionId) return 0;
        const messages = chatStore.getMessages(targetSessionId) || [];
        let count = 0;
        for (const message of messages) {
          if (!message || message.role !== 'assistant') continue;
          if (message.status === 'pending' || message.status === 'sending') continue;
          const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
          if (meta.isGreeting) continue;
          if (String(meta.kind || '').trim() === 'memory-table-push') continue;
          count += 1;
        }
        return count;
      };
      const currentTurnNumber = resolveSessionAssistantTurnNumber(sessionId);
      const normalizeTimelineMemoryActionData = (tableId, rowData) => {
        const next = rowData && typeof rowData === 'object' ? { ...rowData } : {};
        if (!isTimelineMemoryTableId(tableId)) return next;
        if (currentTurnNumber > 0) {
          next.time = buildMemoryTimelineLabel(currentTurnNumber);
          return next;
        }
        const round = extractMemoryTimelineRound(next.time);
        if (round !== null) next.time = buildMemoryTimelineLabel(round);
        return next;
      };
      const resolveInsertSortOrder = (tableId, existingRows = [], rowData = {}) => {
        if (isTimelineMemoryTableId(tableId)) {
          const round = extractMemoryTimelineRound(rowData?.time);
          if (round !== null) return round;
        }
        return computeNextMemoryRowSortOrder(existingRows, tableId);
      };

      const createInputs = [];
      let updated = 0;
      let deleted = 0;
      let skipped = 0;

      const queueInsert = (tableId, table, scopeKey, contactId, groupId, data, { allowDuplicate = false } = {}) => {
        const countKey = `${tableId}:${scopeKey}`;
        const maxRows = Number.isFinite(Number(table?.maxRows)) ? Math.max(0, Math.trunc(Number(table.maxRows))) : 0;
        const existingRows = rowsByTableScope.get(countKey) || [];
        const nextData = normalizeTimelineMemoryActionData(tableId, data);
        if (maxRows && existingRows.length >= maxRows) {
          skipped += 1;
          return false;
        }
        if (!allowDuplicate) {
          const duplicate = existingRows.some(row => rowDataEquals(row?.row_data || {}, nextData));
          if (duplicate) {
            skipped += 1;
            return false;
          }
        }
        const sortOrder = resolveInsertSortOrder(tableId, existingRows, nextData);
        createInputs.push({
          template_id: templateId,
          table_id: tableId,
          contact_id: contactId,
          group_id: groupId,
          row_data: nextData,
          is_active: true,
          ...(Number.isFinite(Number(sortOrder)) && Number(sortOrder) > 0 ? { sort_order: Number(sortOrder) } : {}),
        });
        existingRows.push({
          row_data: nextData,
          sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        });
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
                sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
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
      const isGroupScope = String(sessionId || '').startsWith('group:');
      const contextType = getMemoryContextType({ sessionId, isGroup: isGroupScope });
      const sessionMode = resolveMemorySessionMode({ uiMode, sessionId, contextType });
      const { tableById, tableNameMap, tableOrder } = buildTableMaps(template, {
        sessionId,
        isGroup: isGroupScope,
        contextType,
        uiMode: sessionMode === 'rp' ? 'rp' : uiMode,
      });
      const useSharedGlobalScope = false;
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
            sort_order: Number.isFinite(Number(snap?.sort_order)) ? Number(snap.sort_order) : 0,
          };
          if (current) {
            try {
              const sameData = rowDataEquals(current?.row_data || {}, payload.row_data || {});
              const sameActive = Boolean(current?.is_active) === payload.is_active;
              const samePinned = Boolean(current?.is_pinned) === payload.is_pinned;
              const samePriority = Number.isFinite(Number(current?.priority)) ? Number(current.priority) : 0;
              const sameSortOrder = Number.isFinite(Number(current?.sort_order)) ? Number(current.sort_order) : 0;
              if (!sameData || !sameActive || !samePinned || samePriority !== payload.priority || sameSortOrder !== payload.sort_order) {
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
        return { text: raw, blocks: [], actions: [] };
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
    const abortMemoryUpdate = (sessionId) => {
      const ac = memoryUpdateAbortControllers.get(sessionId);
      if (ac) {
        try { ac.abort(); } catch {}
        memoryUpdateAbortControllers.delete(sessionId);
      }
    };
    const runMemoryUpdateTask = async (sessionId, isGroup, baseContext, checkpointMessageId, signal) => {
      const runId = `${sessionId}:${checkpointMessageId || Date.now()}`;
      memoryUpdateRunning.add(runId);
      try {
        if (signal?.aborted) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        const plan = await buildMemoryUpdatePlan(sessionId, isGroup, baseContext);
        if (window.appBridge) {
          window.appBridge.lastMemoryPlan = plan || null;
        }
        if (!plan?.enabled || !plan.promptText) return;
        if (signal?.aborted) return;
        const historyText = buildMemoryUpdateHistoryText(sessionId);
        if (!historyText.trim()) return;
        const config = await resolveMemoryUpdateConfig();
        if (!config || !canInitClient(config)) {
          logger.warn('memory update config missing or invalid');
          return;
        }
        if (signal?.aborted) return;
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
        ], { signal });
        if (signal?.aborted) return;
        await handleMemoryEditsFromRaw(response, { sessionId, isGroup, force: true, requestPrompt });
        if (checkpointMessageId) {
          await syncTurnCheckpointForMessage(sessionId, checkpointMessageId, {
            captureCurrentActiveState: true,
          });
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          logger.info('memory update aborted', sessionId);
          return;
        }
        logger.warn('memory update failed', err);
      } finally {
        memoryUpdateRunning.delete(runId);
      }
    };
    const enqueueMemoryUpdate = (sessionId, isGroup, baseContext, checkpointMessageId) => {
      let queue = memoryUpdateQueues.get(sessionId);
      if (!queue) {
        queue = { running: false, pending: [] };
        memoryUpdateQueues.set(sessionId, queue);
      }
      queue.pending.push({ isGroup, baseContext, checkpointMessageId });
      if (!queue.running) drainMemoryQueue(sessionId);
    };
    const drainMemoryQueue = async (sessionId) => {
      const queue = memoryUpdateQueues.get(sessionId);
      if (!queue || queue.running) return;
      queue.running = true;
      while (queue.pending.length > 0) {
        const task = queue.pending.shift();
        const ac = new AbortController();
        memoryUpdateAbortControllers.set(sessionId, ac);
        await runMemoryUpdateTask(sessionId, task.isGroup, task.baseContext, task.checkpointMessageId, ac.signal);
        if (memoryUpdateAbortControllers.get(sessionId) === ac) {
          memoryUpdateAbortControllers.delete(sessionId);
        }
      }
      queue.running = false;
    };
    const runMemoryUpdateAfterChat = async (sessionId, isGroup, baseContext, options = {}) => {
      if (!isMemoryAutoExtractSeparate()) return;
      if (!sessionId) return;
      const settings = appSettings.get();
      const everyN = Math.max(1, Math.trunc(Number(settings.memoryFillEveryN)) || 1);
      const counter = (memoryFillSessionCounters.get(sessionId) || 0) + 1;
      if (counter < everyN) {
        memoryFillSessionCounters.set(sessionId, counter);
        return;
      }
      memoryFillSessionCounters.set(sessionId, 0);
      const checkpointMessageId = String(options?.checkpointMessageId || '').trim();
      enqueueMemoryUpdate(sessionId, isGroup, baseContext, checkpointMessageId);
    };
    const applyChatModeAssistantRegex = (text, { depth } = {}) => {
      const cleaned = sanitizeAssistantReplyText(text, promptUserName);
      const reasoningParsed = extractReasoningFromContent(cleaned, { depth, strict: true });
      const finalSource = String(reasoningParsed.content || '');
      let stored = finalSource;
      let display = finalSource;
      try {
        stored = window.appBridge.applyOutputStoredRegex(finalSource, { depth });
        display = window.appBridge.applyOutputDisplayRegex(stored, { depth });
      } catch {}
      return { cleaned, reasoningParsed, finalSource, stored, display };
    };
    const buildAssistantMessageFromText = async (
      rawText,
      { sessionId, time, name, avatar, showName, depth, speakerContactId } = {},
    ) => {
      const sessionKey = String(sessionId || '').trim();
      let displayText = String(rawText ?? '');
      let templateVars = null;
      await maybePromptTemplateEnable({ sampleText: displayText });
      const templateMeta = skipTemplate ? { templateEnabled: false } : undefined;
      const templateAllowed = templateSettings.shouldRun('render', {
        session: { id: sessionKey, settings: chatStore.getSessionSettings?.(sessionKey) || {} },
        meta: templateMeta,
      });
      if (templateAllowed) {
        try {
          const membersText = Array.isArray(groupMembers)
            ? groupMembers.map(mid => contactsStore.getContact(mid)?.name || mid).filter(Boolean).join(',')
            : '';
          const inject = window.appBridge?.getTemplateRenderInjections?.({
            sessionId: sessionKey,
            uiMode,
            content: displayText,
            userName: promptUserName,
            characterName,
            groupName: isGroupChat ? characterName : '',
            membersText,
          });
          const before = Array.isArray(inject?.before) ? inject.before.filter(Boolean).join('\n\n') : '';
          const after = Array.isArray(inject?.after) ? inject.after.filter(Boolean).join('\n\n') : '';
          if (before) displayText = `${before}\n\n${displayText}`;
          if (after) displayText = `${displayText}\n\n${after}`;
        } catch (err) {
          logger.warn('template render injection failed', err);
        }
        try {
          const res = await renderTemplateTextAsync(displayText, {
            stage: 'render',
            chatStore,
            sessionId: sessionKey,
            context: {
              session: { id: sessionKey },
              user: { name: promptUserName },
              meta: templateMeta,
            },
          });
          if (!res.error) {
            displayText = res.text;
            if (res.messageVars && Object.keys(res.messageVars).length) {
              templateVars = res.messageVars;
            }
          }
        } catch (err) {
          logger.warn('template render (message) failed', err);
        }
      }
      // chat-mode-regex rollback marker:
      // Old logic kept for comparison / easy rollback.
      // const cleaned = sanitizeAssistantReplyText(displayText, promptUserName);
      // const reasoningParsed = extractReasoningFromContent(cleaned, { depth, strict: true });
      // const parsed = parseSpecialMessage(reasoningParsed.content || '');
      const { reasoningParsed, finalSource, stored, display } = applyChatModeAssistantRegex(displayText, { depth });
      const parsed = parseSpecialMessage(display);
      const meta = { ...(parsed.meta || {}) };
      const resolvedSpeakerContactId = String(speakerContactId || '').trim();
      const sessionContact = sessionKey ? contactsStore.getContact(sessionKey) : null;
      const isGroupSession = sessionKey.startsWith('group:') || Boolean(sessionContact?.isGroup);
      const resolvedSpeakerName = String(name || '').trim();
      if (showName) meta.showName = true;
      if (resolvedSpeakerContactId) meta.speakerContactId = resolvedSpeakerContactId;
      if (templateVars) meta.templateVars = templateVars;
      if (reasoningParsed.reasoning) {
        meta.reasoning = reasoningParsed.reasoning;
        meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
      }
      let resolvedAvatar = '';
      if (isGroupSession && resolvedSpeakerName) {
        resolvedAvatar = resolveGroupSpeakerRenderAvatar(resolvedSpeakerName, sessionKey, resolvedSpeakerContactId);
      }
      if (resolvedSpeakerContactId) {
        const speakerContact = contactsStore.getContact(resolvedSpeakerContactId);
        if (speakerContact && speakerContact.isGroup !== true) {
          resolvedAvatar = resolveAvatarForContact(resolvedSpeakerContactId, speakerContact);
        }
      }
      if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName) && typeof avatar === 'string' && avatar.trim()) {
        resolvedAvatar = avatar.trim();
      }
      if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName)) {
        resolvedAvatar = getAssistantAvatarForSession(sessionId);
      }
      const next = {
        role: 'assistant',
        ...parsed,
        name: name || '助手',
        avatar: resolvedAvatar,
        sessionId: sessionKey,
        time: time || formatNowTime(),
      };
      const rawValue = String(rawText ?? '');
      if (rawValue) next.rawOriginal = rawValue;
      if (finalSource && finalSource !== rawValue) next.rawSource = finalSource;
      if (stored) next.raw = stored;
      if (Object.keys(meta).length) next.meta = meta;
      return next;
    };
    const stripUpdateVariableBlocks = (text) => {
      let out = String(text || '');
      if (!out) return out;
      const openRe = /<\s*(update(?:variable)?|variableupdate)\b[^>]*>/i;
      for (let i = 0; i < 20; i++) {
        const open = openRe.exec(out);
        if (!open) break;
        const tag = String(open[1] || 'UpdateVariable');
        const start = open.index;
        const afterStart = start + open[0].length;
        const tail = out.slice(afterStart);
        const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i');
        const close = closeRe.exec(tail);
        if (!close) {
          out = out.slice(0, start);
          break;
        }
        const end = afterStart + close.index + close[0].length;
        out = out.slice(0, start) + out.slice(end);
      }
      out = out
        .replace(/<\s*\/?\s*(update(?:variable)?|variableupdate)\b[^>]*>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
      return out;
    };
    // Backward-compatible aliases for historical typo variants used in old edit pipelines.
    const stripUpdateVariableBloacks = stripUpdateVariableBlocks;
    const stripupdatevariablebloacks = stripUpdateVariableBlocks;
    const extractUpdateVariableBlocks = (text) => {
      let out = String(text || '');
      if (!out) return { blocks: [], cleaned: out };
      const blocks = [];
      const openRe = /<\s*(update(?:variable)?|variableupdate)\b[^>]*>/i;
      for (let i = 0; i < 50; i += 1) {
        const open = openRe.exec(out);
        if (!open) break;
        const tag = String(open[1] || 'UpdateVariable');
        const start = open.index;
        const afterStart = start + open[0].length;
        const tail = out.slice(afterStart);
        const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i');
        const close = closeRe.exec(tail);
        if (!close) {
          blocks.push(out.slice(afterStart));
          out = out.slice(0, start);
          break;
        }
        const end = afterStart + close.index + close[0].length;
        blocks.push(out.slice(afterStart, afterStart + close.index));
        out = out.slice(0, start) + out.slice(end);
      }
      return { blocks, cleaned: out };
    };
    const buildUpdateVariableParser = () => {
      const stripCodeFence = (text) => {
        const raw = String(text || '').trim();
        if (!raw) return '';
        const withoutStart = raw.replace(/^```[a-z0-9_-]*\s*/i, '');
        return withoutStart.replace(/```\s*$/i, '').trim();
      };
      const safeJsonParse = (text) => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };
      const parseLooseJson = (text) => {
        let raw = String(text || '').trim();
        if (!raw) return null;
        raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
        raw = raw.replace(/(^|[^\\])\/\/.*$/gm, '$1');
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        raw = raw.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":');
        raw = raw.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_m, body) => {
          const cleaned = String(body || '').replace(/\\"/g, '"').replace(/"/g, '\\"');
          return `"${cleaned}"`;
        });
        return safeJsonParse(raw);
      };
      const parseValue = (input) => {
        const raw = String(input ?? '').trim();
        if (!raw) return '';
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        if (raw === 'null') return null;
        if (raw === 'undefined') return undefined;
        if (/^[+-]?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        const quoted =
          (raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'")) ||
          (raw.startsWith('`') && raw.endsWith('`'));
        const unquoted = quoted ? raw.slice(1, -1) : raw;
        if (unquoted.startsWith('{') || unquoted.startsWith('[')) {
          const parsed = parseLooseJson(unquoted);
          if (parsed !== null) return parsed;
          const direct = safeJsonParse(unquoted);
          if (direct !== null) return direct;
        }
        return unquoted;
      };
      const normalizePath = (raw) => normalizeVariablePathInput(raw);
      const toPath = (raw) => toVariablePath(raw);
      const findMatchingParen = (text, startIndex) => {
        let depth = 1;
        let inQuote = false;
        let quoteChar = '';
        for (let i = startIndex; i < text.length; i += 1) {
          const ch = text[i];
          const prev = i > 0 ? text[i - 1] : '';
          if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
            if (inQuote && ch === quoteChar) {
              inQuote = false;
              quoteChar = '';
            } else if (!inQuote) {
              inQuote = true;
              quoteChar = ch;
            }
          }
          if (inQuote) continue;
          if (ch === '(') depth += 1;
          if (ch === ')') {
            depth -= 1;
            if (depth === 0) return i;
          }
        }
        return -1;
      };
      const splitArgs = (text) => {
        const args = [];
        let buf = '';
        let inQuote = false;
        let quoteChar = '';
        let paren = 0;
        let bracket = 0;
        let brace = 0;
        for (let i = 0; i < text.length; i += 1) {
          const ch = text[i];
          const prev = i > 0 ? text[i - 1] : '';
          if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
            if (inQuote && ch === quoteChar) {
              inQuote = false;
              quoteChar = '';
            } else if (!inQuote) {
              inQuote = true;
              quoteChar = ch;
            }
          }
          if (!inQuote) {
            if (ch === '(') paren += 1;
            if (ch === ')') paren -= 1;
            if (ch === '[') bracket += 1;
            if (ch === ']') bracket -= 1;
            if (ch === '{') brace += 1;
            if (ch === '}') brace -= 1;
          }
          if (ch === ',' && !inQuote && paren === 0 && bracket === 0 && brace === 0) {
            const trimmed = buf.trim();
            if (trimmed) args.push(trimmed);
            buf = '';
            continue;
          }
          buf += ch;
        }
        const trimmed = buf.trim();
        if (trimmed) args.push(trimmed);
        return args;
      };
      const stripKnownRootPrefix = (parts) => stripKnownVariableRootPrefix(parts);
      const parseJsonPatchArray = (value, reason = 'json_patch') => {
        if (!Array.isArray(value)) return [];
        const commands = [];
        value.forEach((op) => {
          const action = String(op?.op || '').toLowerCase();
          let pathParts = decodeJsonPointer(op?.path || op?.to || '');
          pathParts = stripKnownRootPrefix(pathParts);
          const path = normalizeVariablePathParts(pathParts);
          if (!action || !path.length) return;
          if (action === 'replace') {
            commands.push({ type: 'set', path, value: op?.value, reason });
            return;
          }
          if (action === 'delta') {
            commands.push({ type: 'add', path, value: op?.value, reason });
            return;
          }
          if (action === 'add' || action === 'insert') {
            const key = path[path.length - 1];
            const parentPath = path.slice(0, -1);
            if (!parentPath.length) {
              commands.push({ type: 'set', path, value: op?.value, reason });
              return;
            }
            commands.push({ type: 'insert', path: parentPath, key, value: op?.value, reason });
            return;
          }
          if (action === 'remove') {
            commands.push({ type: 'delete', path, reason });
            return;
          }
          if (action === 'move') {
            let fromParts = decodeJsonPointer(op?.from || '');
            fromParts = stripKnownRootPrefix(fromParts);
            const from = normalizeVariablePathParts(fromParts);
            if (!from.length) return;
            commands.push({ type: 'move', from, to: path, reason });
          }
        });
        return commands;
      };
      const parseJsonPatchCommands = (text) => {
        const commands = [];
        const re = /<(json_?patch)>(?:\s*```.*)?([\s\S]*?)(?:```\s*)?<\/\1>/gim;
        let m;
        while ((m = re.exec(text))) {
          const body = stripCodeFence(m[2] || '');
          if (!body) continue;
          const parsed = parseLooseJson(body) ?? safeJsonParse(body);
          commands.push(...parseJsonPatchArray(parsed, 'json_patch'));
        }
        return commands;
      };
      const parseInlineCommands = (text) => {
        const commands = [];
        let index = 0;
        while (index < text.length) {
          const match = text.substring(index).match(/_\.(set|insert|assign|remove|unset|delete|add)\(/);
          if (!match || match.index === undefined) break;
          const type = match[1];
          const start = index + match.index + match[0].length;
          const end = findMatchingParen(text, start);
          if (end === -1) break;
          const argsText = text.slice(start, end);
          const args = splitArgs(argsText);
          if (!args.length) {
            index = end + 1;
            continue;
          }
          const rawPath = normalizePath(args[0]);
          const path = toPath(rawPath);
          if (!path.length && rawPath !== '') {
            index = end + 1;
            continue;
          }
          if (type === 'set') {
            if (args.length >= 3 && rawPath === '') {
              const keyPathRaw = normalizePath(args[1]);
              let keyPath = toPath(keyPathRaw);
              if (!keyPath.length && keyPathRaw !== '') {
                const parsedKey = parseValue(args[1]);
                if (parsedKey !== undefined && parsedKey !== null && parsedKey !== '') {
                  keyPath = [String(parsedKey)];
                }
              }
              if (keyPath.length) commands.push({ type: 'set', path: keyPath, value: parseValue(args[args.length - 1]) });
            } else if (args.length >= 2) {
              commands.push({ type: 'set', path, value: parseValue(args[args.length - 1]) });
            }
          } else if (type === 'add') {
            if (args.length >= 2) commands.push({ type: 'add', path, value: parseValue(args[1]) });
          } else if (type === 'insert' || type === 'assign') {
            if (args.length === 2) {
              commands.push({ type: 'insert', path, key: null, value: parseValue(args[1]) });
            } else if (args.length >= 3) {
              commands.push({ type: 'insert', path, key: parseValue(args[1]), value: parseValue(args[2]) });
            }
          } else if (type === 'remove' || type === 'unset' || type === 'delete') {
            if (args.length >= 2) {
              commands.push({ type: 'remove', path, key: parseValue(args[1]) });
            } else {
              commands.push({ type: 'delete', path });
            }
          }
          index = end + 1;
        }
        return commands;
      };
      const parseCommands = (text) => {
        const stripped = String(text || '')
          .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
          .replace(/<analyze>[\s\S]*?<\/analyze>/gi, '');
        const commands = [];
        const jsonCmds = parseJsonPatchCommands(stripped);
        commands.push(...jsonCmds);
        const cleaned = stripped.replace(/<(json_?patch)>(?:\s*```.*)?[\s\S]*?<\/\1>/gim, '');
        commands.push(...parseInlineCommands(cleaned));
        if (!commands.length) {
          const body = stripCodeFence(stripped);
          const parsed = parseLooseJson(body) ?? safeJsonParse(body);
          commands.push(...parseJsonPatchArray(parsed, 'json_patch_raw'));
        }
        return commands;
      };
      return { parseCommands };
    };
    const updateParser = buildUpdateVariableParser();
    const applyUpdateVariableCommands = (sessionId, commands, { useGlobal = false } = {}) => {
      if (!Array.isArray(commands) || !commands.length) return false;
      const sid = String(sessionId || '').trim();
      if (!sid) return false;
      const listVars = useGlobal
        ? (chatStore.listGlobalVariables?.() || {})
        : (chatStore.listVariables?.(sid) || {});
      const clone = (v) => {
        try {
          return structuredClone(v);
        } catch {
          return JSON.parse(JSON.stringify(v));
        }
      };
      const isPlainObject = (val) => val && typeof val === 'object' && !Array.isArray(val);
      const isMvuWrappedScalar = (val) =>
        Array.isArray(val) && val.length === 2 && typeof val[1] === 'string' && !Array.isArray(val[0]);
      const deepEqual = (a, b) => {
        if (Object.is(a, b)) return true;
        if (typeof a !== typeof b) return false;
        if (Array.isArray(a)) {
          if (!Array.isArray(b) || a.length !== b.length) return false;
          return a.every((v, i) => deepEqual(v, b[i]));
        }
        if (isPlainObject(a)) {
          if (!isPlainObject(b)) return false;
          const keysA = Object.keys(a);
          const keysB = Object.keys(b);
          if (keysA.length !== keysB.length) return false;
          return keysA.every(k => deepEqual(a[k], b[k]));
        }
        return false;
      };
      const getAt = (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false });
      const setAt = (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options);
      const resolveExistingPath = (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options);
      const deleteAt = (obj, path) => deleteValueAtPath(obj, path);
      const mergeObjects = (target, value) => {
        if (!isPlainObject(target) || !isPlainObject(value)) return false;
        Object.entries(value).forEach(([k, v]) => {
          if (isPlainObject(v) && isPlainObject(target[k])) {
            mergeObjects(target[k], v);
          } else {
            target[k] = v;
          }
        });
        return true;
      };
      const pathToString = (path) => {
        if (!Array.isArray(path) || !path.length) return '(root)';
        return path.map(seg => String(seg)).join('.');
      };
      const previewValue = (value) => {
        if (value === null || value === undefined) return String(value);
        if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
          const text = JSON.stringify(value);
          return text.length > 120 ? `${text.slice(0, 117)}...` : text;
        } catch {
          return '[unserializable]';
        }
      };
      const toDateValue = (value) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
        if (typeof value !== 'string') return null;
        const raw = value.trim();
        if (!raw || Number.isFinite(Number(raw))) return null;
        const dt = new Date(raw);
        return Number.isNaN(dt.getTime()) ? null : dt;
      };
      const skipped = [];
      const pushSkip = (cmd, reason) => {
        if (skipped.length >= 12) return;
        const type = String(cmd?.type || '').trim().toLowerCase() || 'unknown';
        const path = Array.isArray(cmd?.path) ? cmd.path : (Array.isArray(cmd?.from) ? cmd.from : []);
        skipped.push(`${type}@${pathToString(path)}:${reason}`);
      };
      let appliedCount = 0;
      const shouldEmitStarted = shouldEmitMvuEvent('mag_variable_update_started');
      const shouldEmitEnded =
        shouldEmitMvuEvent('mag_variable_update_ended') || shouldEmitMvuEvent('mag_variable_update_ended_for_zod');
      const updates = (shouldEmitStarted || shouldEmitEnded) ? {} : null;
      let root = clone(listVars);
      const original = clone(listVars);
      commands.forEach((cmd) => {
        const type = String(cmd?.type || '').trim().toLowerCase();
        if (!type) return;
        if (type === 'move') {
          const from = Array.isArray(cmd.from) ? cmd.from : [];
          const to = Array.isArray(cmd.to) ? cmd.to : [];
          if (!from.length || !to.length) {
            pushSkip(cmd, 'invalid move path');
            return;
          }
          const resolvedFrom = resolveExistingPath(root, from, { allowLeaf: true });
          if (!resolvedFrom || !resolvedFrom.length) {
            pushSkip(cmd, 'move source not found');
            return;
          }
          const value = clone(getAt(root, resolvedFrom));
          const deleted = deleteAt(root, resolvedFrom);
          if (!deleted.ok) {
            pushSkip(cmd, 'move source delete failed');
            return;
          }
          const moved = setAt(root, to, value, { create: true });
          if (!moved.ok) {
            pushSkip(cmd, 'move target set failed');
            return;
          }
          appliedCount += 1;
          return;
        }
        const path = Array.isArray(cmd.path) ? cmd.path : [];
        if (type === 'set') {
          if (!path.length) {
            if (!cmd.value || typeof cmd.value !== 'object') {
              pushSkip(cmd, 'root set requires object');
              return;
            }
            root = clone(cmd.value);
            appliedCount += 1;
            return;
          }
          const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
          if (!resolvedPath || !resolvedPath.length) {
            pushSkip(cmd, 'set path not found');
            return;
          }
          const prev = getAt(root, resolvedPath);
          if (isMvuWrappedScalar(prev) && (typeof prev[0] !== 'object' || prev[0] === null)) {
            const nextWrapped = clone(prev);
            let nextValue = cmd.value;
            if (typeof prev[0] === 'number' && typeof cmd.value === 'string') {
              const n = Number(cmd.value);
              if (Number.isFinite(n)) nextValue = n;
            }
            nextWrapped[0] = nextValue;
            const result = setAt(root, resolvedPath, nextWrapped, { create: false });
            if (!result.ok) {
              pushSkip(cmd, 'wrapped set failed');
              return;
            }
            appliedCount += 1;
            return;
          }
          const result = setAt(root, resolvedPath, cmd.value, { create: false });
          if (!result.ok) {
            pushSkip(cmd, 'set failed');
            return;
          }
          appliedCount += 1;
          return;
        }
        if (type === 'add') {
          const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
          if (!resolvedPath || !resolvedPath.length) {
            pushSkip(cmd, 'add path not found');
            return;
          }
          const rawPathText = pathToString(path);
          const resolvedPathText = pathToString(resolvedPath);
          const currentRaw = getAt(root, resolvedPath);
          const wrapped = isMvuWrappedScalar(currentRaw) && (typeof currentRaw[0] !== 'object' || currentRaw[0] === null);
          const current = wrapped ? currentRaw[0] : currentRaw;
          const delta = Number(cmd.value);
          if (!Number.isFinite(delta)) {
            pushSkip(cmd, 'add delta not number');
            return;
          }
          let next = null;
          const dateBase = toDateValue(current);
          if (dateBase) {
            next = new Date(dateBase.getTime() + delta).toISOString();
          } else if (typeof current === 'number') {
            next = parseFloat((current + delta).toPrecision(12));
          } else if (typeof current === 'string') {
            const baseNum = Number(current);
            if (!Number.isFinite(baseNum)) {
              pushSkip(cmd, 'add target is non-numeric string');
              return;
            }
            next = parseFloat((baseNum + delta).toPrecision(12));
          } else {
            pushSkip(cmd, `add target unsupported type=${typeof current}`);
            return;
          }
          if (wrapped) {
            const nextWrapped = clone(currentRaw);
            nextWrapped[0] = next;
            const result = setAt(root, resolvedPath, nextWrapped, { create: false });
            if (!result.ok) {
              pushSkip(cmd, 'wrapped add failed');
              return;
            }
          } else {
            const result = setAt(root, resolvedPath, next, { create: false });
            if (!result.ok) {
              pushSkip(cmd, 'add set failed');
              return;
            }
          }
          logger.info(
            `[update-variable] add-debug path=${rawPathText} resolved=${resolvedPathText} cur=${previewValue(current)} delta=${previewValue(cmd.value)} next=${previewValue(next)}`,
          );
          appliedCount += 1;
          return;
        }
        if (type === 'insert') {
          const key = cmd.key;
          const target = path.length ? getAt(root, path) : root;
          if (target === undefined || target === null || typeof target !== 'object') {
            const created = typeof key === 'number' || key === '-' ? [] : {};
            setAt(root, path, created, { create: true });
          }
          const container = path.length ? getAt(root, path) : root;
          if (Array.isArray(container)) {
            if (key === null || key === undefined || key === '-') {
              container.push(cmd.value);
              appliedCount += 1;
            } else if (typeof key === 'number') {
              const idx = Math.max(0, Math.min(container.length, key));
              container.splice(idx, 0, cmd.value);
              appliedCount += 1;
            } else {
              pushSkip(cmd, 'insert array key invalid');
            }
          } else if (isPlainObject(container)) {
            if (key === null || key === undefined) {
              if (!mergeObjects(container, cmd.value)) {
                pushSkip(cmd, 'insert merge requires object');
                return;
              }
            } else {
              container[String(key)] = cmd.value;
            }
            appliedCount += 1;
          } else {
            pushSkip(cmd, 'insert target not object');
          }
          return;
        }
        if (type === 'remove') {
          const key = cmd.key;
          const target = path.length ? getAt(root, path) : root;
          if (!target || typeof target !== 'object') {
            pushSkip(cmd, 'remove target not object');
            return;
          }
          if (Array.isArray(target)) {
            if (typeof key === 'number') {
              if (key >= 0 && key < target.length) {
                target.splice(key, 1);
                appliedCount += 1;
              } else {
                pushSkip(cmd, 'remove array index out of range');
              }
            } else {
              const idx = target.findIndex(item => deepEqual(item, key));
              if (idx >= 0) {
                target.splice(idx, 1);
                appliedCount += 1;
              } else {
                pushSkip(cmd, 'remove array item not found');
              }
            }
            return;
          }
          if (isPlainObject(target)) {
            if (typeof key === 'number') {
              const keys = Object.keys(target);
              if (key >= 0 && key < keys.length) {
                delete target[keys[key]];
                appliedCount += 1;
              } else {
                pushSkip(cmd, 'remove object index out of range');
              }
              return;
            }
            if (key === null || key === undefined) {
              pushSkip(cmd, 'remove object key missing');
              return;
            }
            const k = String(key);
            if (!Object.prototype.hasOwnProperty.call(target, k)) {
              pushSkip(cmd, 'remove object key not found');
              return;
            }
            delete target[k];
            appliedCount += 1;
            return;
          }
          pushSkip(cmd, 'remove target unsupported');
          return;
        }
        if (type === 'delete') {
          const resolvedPath = resolveExistingPath(root, path, { allowLeaf: true });
          if (!resolvedPath || !resolvedPath.length) {
            pushSkip(cmd, 'delete path not found');
            return;
          }
          const result = deleteAt(root, resolvedPath);
          if (!result.ok) {
            pushSkip(cmd, 'delete failed');
            return;
          }
          appliedCount += 1;
        }
      });
      if (!isPlainObject(root)) return false;
      const setVar = useGlobal ? chatStore.setGlobalVariable?.bind(chatStore) : chatStore.setVariable?.bind(chatStore);
      const delVar = useGlobal ? chatStore.deleteGlobalVariable?.bind(chatStore) : chatStore.deleteVariable?.bind(chatStore);
      if (typeof setVar !== 'function') return false;
      const allKeys = new Set([...Object.keys(original), ...Object.keys(root)]);
      if (updates) {
        for (const key of allKeys) {
          const nextVal = root[key];
          const prevVal = original[key];
          if (nextVal === undefined) {
            if (key in original) updates[key] = undefined;
            continue;
          }
          if (!deepEqual(prevVal, nextVal)) updates[key] = nextVal;
        }
        if (Object.keys(updates).length && shouldEmitStarted) {
          emitMvuUpdateStarted(sid, updates, { useGlobal });
        }
      }
      let changed = false;
      for (const key of allKeys) {
        if (updates && !Object.prototype.hasOwnProperty.call(updates, key)) continue;
        const nextVal = root[key];
        const prevVal = original[key];
        if (!updates && deepEqual(prevVal, nextVal)) continue;
        if (nextVal === undefined) {
          if (typeof delVar === 'function' && key in original) {
            delVar(key, sid);
            changed = true;
          }
          continue;
        }
        setVar(key, nextVal, sid);
        changed = true;
      }
      if (changed && shouldEmitEnded) {
        emitMvuUpdateEnded(sid, { useGlobal });
      }
      if (appliedCount || skipped.length) {
        logger.info(
          `[update-variable] apply session=${sid} total=${commands.length} applied=${appliedCount} skipped=${skipped.length}`,
        );
      }
      if (skipped.length) {
        logger.warn(`[update-variable] skipped-detail ${skipped.join(' | ')}`);
      }
      if (changed) {
        const changedKeys = [];
        for (const key of allKeys) {
          const nextVal = root[key];
          const prevVal = original[key];
          if (!deepEqual(prevVal, nextVal)) changedKeys.push(String(key));
          if (changedKeys.length >= 12) break;
        }
        if (changedKeys.length) logger.info(`[update-variable] changed-keys ${changedKeys.join(', ')}`);
      }
      return changed;
    };
    const applyUpdateVariableFromMessage = (message, targetSessionId) => {
      if (!message || message.role !== 'assistant') return false;
      const sid = String(targetSessionId || '').trim();
      const isTavernMvuSession = (() => {
        if (!sid) return false;
        const persona = getEffectivePersona(sid);
        const source = persona && typeof persona.source === 'object' ? persona.source : null;
        if (!source || source.type !== 'character_card') return false;
        const mvuSource = String(source.mvuSource || '').trim().toLowerCase();
        const hasCardMvu = source.mvuConverted === true || (mvuSource && mvuSource !== 'none');
        if (!hasCardMvu) return false;
        const schemas = chatStore.listVariableSchemas?.(sid) || {};
        return Object.keys(schemas).length > 0;
      })();
      const raw =
        (typeof message.rawOriginal === 'string' && message.rawOriginal) ||
        (typeof message.rawSource === 'string' && message.rawSource) ||
        (typeof message.raw === 'string' && message.raw) ||
        (typeof message.content === 'string' && message.content) ||
        '';
      if (!raw) return false;
      const { blocks, cleaned: outsideUpdateBlocks } = extractUpdateVariableBlocks(raw);
      const commands = [];
      blocks.forEach((block) => {
        const parsed = updateParser.parseCommands(block);
        if (parsed.length) commands.push(...parsed);
      });
      if (outsideUpdateBlocks) {
        const hasOutsideProtocol =
          /<(json_?patch)\b/i.test(outsideUpdateBlocks) ||
          /_\.(set|insert|assign|remove|unset|delete|add)\(/i.test(outsideUpdateBlocks);
        if (hasOutsideProtocol) {
          const parsedOutside = updateParser.parseCommands(outsideUpdateBlocks);
          if (parsedOutside.length) commands.push(...parsedOutside);
        }
      }
      if (!blocks.length && isTavernMvuSession && !commands.length) {
        commands.push(...updateParser.parseCommands(raw));
      }
      if (!blocks.length && !commands.length && !isTavernMvuSession) return false;
      if (blocks.length || commands.length) {
        logger.info(
          `[update-variable] parse messageId=${String(message?.id || '')} session=${sid} blocks=${blocks.length} commands=${commands.length}`,
        );
        const cmdPreview = commands
          .slice(0, 8)
          .map((cmd) => {
            const type = String(cmd?.type || '');
            const path = Array.isArray(cmd?.path) ? cmd.path.map(p => String(p)).join('.') : '';
            const from = Array.isArray(cmd?.from) ? cmd.from.map(p => String(p)).join('.') : '';
            if (type === 'move') return `move(${from}=>${path})`;
            if (type === 'add' || type === 'set') return `${type}(${path})=${String(cmd?.value ?? '')}`;
            if (type === 'insert') return `insert(${path},${String(cmd?.key ?? '-')})`;
            if (type === 'remove') return `remove(${path},${String(cmd?.key ?? '-')})`;
            if (type === 'delete') return `delete(${path})`;
            return type || 'unknown';
          })
          .join(' | ');
        if (cmdPreview) logger.info(`[update-variable] command-preview ${cmdPreview}`);
      }
      const useGlobal = isSharedVariableSession(targetSessionId);
      const changed = commands.length ? applyUpdateVariableCommands(targetSessionId, commands, { useGlobal }) : false;
      const rawHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(raw);
      const baseStoredRaw = typeof message.raw === 'string' ? message.raw : '';
      const baseSource = typeof message.rawSource === 'string' ? message.rawSource : '';
      const baseOriginal = typeof message.rawOriginal === 'string' ? message.rawOriginal : '';
      const baseFallback = typeof message.content === 'string' ? message.content : '';
      const sourceText = baseSource || baseOriginal || baseFallback;
      const hasSourceText = Boolean(sourceText);
      const sourceHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(sourceText || '');
      const storedHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(baseStoredRaw || '');
      let nextStored = baseStoredRaw ? stripUpdateVariableBlocks(baseStoredRaw) : '';
      let nextSource = sourceText ? stripUpdateVariableBlocks(sourceText) : '';
      let placeholderInjected = false;
      if (!nextStored) {
        const cleanedSource = nextSource;
        if (window.appBridge?.applyOutputStoredRegex) {
          try {
            nextStored = window.appBridge.applyOutputStoredRegex(cleanedSource, { depth: 0 });
          } catch {
            nextStored = cleanedSource;
          }
        } else {
          nextStored = cleanedSource;
        }
      }
      const shouldAppendPlaceholder = isTavernMvuSession && !(rawHasPlaceholder || sourceHasPlaceholder || storedHasPlaceholder);
      if (shouldAppendPlaceholder) {
        nextStored = `${nextStored || ''}\n\n<StatusPlaceHolderImpl/>`.trim();
        nextSource = `${nextSource || ''}\n\n<StatusPlaceHolderImpl/>`.trim();
        placeholderInjected = true;
      }
      const nextDisplay = window.appBridge?.applyOutputDisplayRegex
        ? window.appBridge.applyOutputDisplayRegex(nextStored, { depth: 0 })
        : nextStored;
      let nextMeta = message?.meta && typeof message.meta === 'object' ? { ...message.meta } : null;
      if (isRpSessionId(targetSessionId)) {
        if (!nextMeta) nextMeta = { renderRich: true };
        else if (nextMeta.renderRich !== true) nextMeta.renderRich = true;
      }
      const updatePayload = { raw: nextStored, content: nextDisplay };
      if (hasSourceText) updatePayload.rawSource = nextSource;
      if (nextMeta) updatePayload.meta = nextMeta;
      const sourceUnchanged = !hasSourceText || nextSource === sourceText;
      const displayUnchanged = nextDisplay === (typeof message.content === 'string' ? message.content : '');
      const storedUnchanged = nextStored === baseStoredRaw;
      if (!changed && !placeholderInjected && storedUnchanged && sourceUnchanged && displayUnchanged) {
        return false;
      }
      const updated =
        chatStore.updateMessage(message.id, updatePayload, targetSessionId) || {
          ...message,
          raw: nextStored,
          content: nextDisplay,
          rawSource: hasSourceText ? nextSource : message.rawSource,
          meta: nextMeta || message.meta,
        };
      if (placeholderInjected) {
        logger.info(
          `[update-variable] placeholder-injected messageId=${String(message?.id || '')} session=${sid} source=tavern-mvu`,
        );
      }
      if (isSessionActive(targetSessionId)) ui.updateMessage(message.id, updated);
      return changed || placeholderInjected;
    };
    if (typeof window !== 'undefined') {
      window.__chatappApplyUpdateVariableFromMessage = applyUpdateVariableFromMessage;
    }
    const emitPluginAfterReceive = (message, targetSessionId, { skipScripts: skipThisScripts } = {}) => {
      if (!message || message.role !== 'assistant') return;
      const shouldSkipScripts = typeof skipThisScripts === 'boolean' ? skipThisScripts : skipScripts;
      if (scriptRuntime && !shouldSkipScripts) {
        const payload = { message, sessionId: targetSessionId };
        scriptRuntime.dispatchEvent('message.after_receive', payload).catch(err => {
          logger.warn('script message.after_receive failed', err);
        });
      }
      if (pluginRuntime) {
        const payload = { message, sessionId: targetSessionId };
        pluginRuntime.dispatchEvent('message.after_receive', payload).catch(err => {
          logger.warn('plugin message.after_receive failed', err);
        });
      }
      const useGlobal = isSharedVariableSession(targetSessionId);
      try {
        const localFn = typeof applyUpdateVariableFromMessage === 'function' ? applyUpdateVariableFromMessage : null;
        const globalFn =
          typeof window !== 'undefined' && typeof window.__chatappApplyUpdateVariableFromMessage === 'function'
            ? window.__chatappApplyUpdateVariableFromMessage
            : null;
        const fn = localFn || globalFn;
        if (typeof fn === 'function') fn(message, targetSessionId);
        else logger.warn('[update-variable] apply function unavailable');
      } catch (err) {
        logger.warn('UpdateVariable parse failed', err);
      }
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
        .filter(m => !excludeMessageIds.has(String(m?.id || '')))
        .filter(m => {
          if (!m || typeof m.content !== 'string') return false;
          if (m.role === 'user' || m.role === 'assistant') return true;
          return isGroupChat && m.role === 'system';
        })
        .map((m, idx) => {
          const depth = getDepthForIndex(idx);
          const isCreativeReply =
            m?.role === 'assistant' &&
            (Boolean(m?.meta?.renderRich) || isRpMode);
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
          if (rpUiMode && (m.role === 'assistant' || m.role === 'user')) {
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
      const rawChatLimit = Number(appSettings.get().chatHistoryMax);
      const chatHistoryLimit = Number.isFinite(rawChatLimit) ? Math.max(0, Math.trunc(rawChatLimit)) : 0;
      if (chatHistoryLimit > 0 && history.length > chatHistoryLimit) {
        history.splice(0, history.length - chatHistoryLimit);
      }
      try {
        const openaiPreset = window?.appBridge?.presets?.getResolvedActive?.('openai', getPresetContext())?.preset || {};
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
      if (rpUiMode) {
        const rawLimit = Number(appSettings.get().creativeHistoryMax);
        const creativeLimit = Number.isFinite(rawLimit) ? Math.max(0, Math.trunc(rawLimit)) : 0;
        const creativeAssistantIdx = [];
        history.forEach((m, idx) => {
          if (m?.__creative && m?.role === 'assistant') creativeAssistantIdx.push(idx);
        });
        if (creativeLimit > 0 && creativeAssistantIdx.length > creativeLimit) {
          const firstAssistantToKeep = creativeAssistantIdx[creativeAssistantIdx.length - creativeLimit];
          let keepStart = firstAssistantToKeep;
          for (let i = firstAssistantToKeep - 1; i >= 0; i -= 1) {
            if (history[i]?.role === 'user') {
              keepStart = i;
              break;
            }
          }
          history = history.slice(keepStart);
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
      const openaiPreset = getOpenAIPreset();
      const normalizeRuntimeMemoryPosition = (positionRaw, depthRaw, fallback = '') => {
        const token = String(positionRaw || '').trim().toLowerCase();
        const depthNum = Math.trunc(Number(depthRaw));
        const depth = Number.isFinite(depthNum) ? Math.max(0, depthNum) : 0;
        if (!token || token === 'template') return String(fallback || '').trim().toLowerCase();
        if (token === 'history_depth' && depth === 0) return 'history_after';
        return token;
      };
      const presetMemoryInjectDepthRaw = Math.trunc(Number(openaiPreset?.memory_data_depth));
      const presetMemoryInjectDepth = Number.isFinite(presetMemoryInjectDepthRaw) ? Math.max(0, presetMemoryInjectDepthRaw) : 0;
      const presetMemoryInjectPosition = normalizeRuntimeMemoryPosition(
        openaiPreset?.memory_data_position,
        presetMemoryInjectDepth,
        '',
      );
      const settingsMemoryInjectDepthRaw = Math.trunc(Number(settings.memoryInjectDepth));
      const settingsMemoryInjectDepth = Number.isFinite(settingsMemoryInjectDepthRaw) ? Math.max(0, settingsMemoryInjectDepthRaw) : 0;
      const settingsMemoryInjectPosition = normalizeRuntimeMemoryPosition(
        settings.memoryInjectPosition || 'history_after',
        settingsMemoryInjectDepth,
        'history_after',
      );
      const memoryInjectPosition = presetMemoryInjectPosition || settingsMemoryInjectPosition;
      const memoryInjectDepth = presetMemoryInjectPosition && Number.isFinite(presetMemoryInjectDepthRaw)
        ? Math.max(0, presetMemoryInjectDepthRaw)
        : settingsMemoryInjectDepth;
      const presetMemoryGuideDepthRaw = Math.trunc(Number(openaiPreset?.memory_guide_depth));
      const presetMemoryGuidePosition = normalizeRuntimeMemoryPosition(
        openaiPreset?.memory_guide_position,
        presetMemoryGuideDepthRaw,
        '',
      );
      const memoryGuideDepth = Number.isFinite(presetMemoryGuideDepthRaw) ? Math.max(0, presetMemoryGuideDepthRaw) : 0;
      const metaOverrides = {};
      if (skipTemplate) metaOverrides.templateEnabled = false;
      if (skipScripts) metaOverrides.skipScripts = true;
      return {
        user: {
          name: promptUserName,
          persona: String(activeUser?.description || ''),
          personaPosition: activeUser?.position,
          personaDepth: activeUser?.depth,
          personaRole: activeUser?.role,
        },
        character: {
          name: characterName,
          description: String(activePersona?.description || ''),
        },
        session: {
          id: sessionId,
          isGroup: isGroupChat,
          name: characterName,
          settings: chatStore.getSessionSettings?.(sessionId) || {},
        },
        meta: {
          // Keep summary prompt on; RP/创意写作界面 restricts chat guide to summary-only.
          disableSummary: Boolean(disableSummaryForThis),
          skipInputRegex: Boolean(skipInputRegex),
          appendUserToHistory: continueTarget ? false : undefined,
          suppressPendingUserTurn: Boolean(continueTarget),
          chatGuideMode: rpUiMode ? 'summary-only' : 'full',
          disableChatGuide: false,
          disableScenarioHint: Boolean(rpUiMode),
          disableMomentSummary: Boolean(rpUiMode),
          disablePhoneFormat: Boolean(rpUiMode),
          uiMode: getEffectivePresetUiMode(),
          useGlobalVariables: Boolean(sharedVariables),
          sharedMemory: false,
          defaultRpBridgeSessionId: !isRpMode
            ? getRpSessionId(getEffectivePersona(sessionId)?.id || activePersonaId)
            : '',
          defaultChatBridgeSessionId: isRpMode ? String(lastChatState?.sessionId || '').trim() : '',
          memoryStorageMode: getMemoryStorageMode(),
          memoryAutoExtract: isMemoryAutoExtractInline(),
          memoryInjectPosition,
          memoryInjectDepth,
          memoryGuidePosition: presetMemoryGuidePosition,
          memoryGuideDepth,
          userAttachmentParts: attachmentParts,
          replyPromptHint: buildReplyPromptHint(outgoingReplyContexts),
          extraPromptBlocks: [
            ...(stageManager?.getPromptBlocks?.(sessionId) || []),
            ...peekPromptInjections(sessionId),
          ],
          ...(continueTarget
            ? {
                assistantContinuation: {
                  enabled: true,
                  messageId: continueTarget.messageId,
                  prefix: String(continueTarget.prefix || ''),
                },
              }
            : {}),
          ...metaOverrides,
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
      const handled = runCommand(text, {
        chatStore,
        ui,
        sessionPanel,
        worldPanel,
        appBridge: window.appBridge,
        sendMessage: (content, opts = {}) =>
          handleSend(null, { overrideText: String(content ?? ''), ignorePending: true, ...opts }),
      });
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

    await maybePromptTemplateEnable({ sampleText: text });
    await maybePromptScriptAuthorization();
    if (isTurnCheckpointSessionEnabled(sessionId) && !findTailTrackedAssistantMessage(sessionId)) {
      try {
        await ensureSessionBaselineCheckpointSnapshot(sessionId);
      } catch (err) {
        logger.warn('ensure baseline checkpoint before send failed', err);
      }
    }

    const currentDraftReplyTarget = getReplyTargetForSession(sessionId);
    let consumedDraftReplyTarget = false;
    const hasUserText = Boolean(String(text || '').trim());
    let attachmentMessages = [];
    let attachmentPrimaryId = '';
    if (hasAttachments) {
      attachmentMessages = buildAttachmentMessages(attachmentQueue, { name: userName, avatar: avatars.user });
      if (currentDraftReplyTarget && !hasUserText && !suppressUserMessage && attachmentMessages.length) {
        attachmentMessages[0] = attachReplyTargetToMessage(attachmentMessages[0], currentDraftReplyTarget);
        consumedDraftReplyTarget = true;
      }
      clearComposerAttachments();
      attachmentMessages = attachmentMessages.map(msg => {
        ui.addMessage(msg);
        return chatStore.appendMessage(msg, sessionId) || msg;
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
    let streamCtrl = null;
    let sendSucceeded = false;
    let suppressErrorUI = false;
    let checkpointTargetMessageId = String(swipeTarget?.msgId || continueTarget?.messageId || '').trim();
    const createAssistantStreamCtrl = (meta = {}) => {
      if (assistantStreamFactory) {
        try {
          const customCtrl = assistantStreamFactory(meta);
          if (customCtrl) return customCtrl;
        } catch (err) {
          logger.warn('assistant stream factory failed', err);
        }
      }
      return ui.startAssistantStream(meta);
    };
    const isStreamCtrlConnected = ctrl => {
      if (!ctrl) return false;
      if (typeof ctrl.isConnected !== 'function') return true;
      try {
        return ctrl.isConnected() !== false;
      } catch {
        return false;
      }
    };
    const updateActiveGenerationStreamCache = (text, meta = {}, payload = null) => {
      if (!activeGeneration || activeGeneration.id !== generationId || activeGeneration.sessionId !== sessionId) return;
      activeGeneration.streamText = String(text ?? '');
      activeGeneration.streamPayload =
        payload && typeof payload === 'object'
          ? { ...payload }
          : null;
      activeGeneration.streamMeta = {
        ...((activeGeneration.streamMeta && typeof activeGeneration.streamMeta === 'object') ? activeGeneration.streamMeta : {}),
        ...((meta && typeof meta === 'object') ? meta : {}),
      };
    };
    const ensureAssistantStreamCtrl = (meta = {}) => {
      if (isGenerationInterrupted(generationId)) return null;
      if (isStreamCtrlConnected(streamCtrl)) return streamCtrl;
      if (streamCtrl && !isStreamCtrlConnected(streamCtrl)) streamCtrl = null;
      const sharedCtrl =
        activeGeneration?.id === generationId && activeGeneration?.sessionId === sessionId
          ? activeGeneration.streamCtrl
          : null;
      if (sharedCtrl && sharedCtrl !== streamCtrl && isStreamCtrlConnected(sharedCtrl)) {
        streamCtrl = sharedCtrl;
        return streamCtrl;
      }
      if (!isSessionActive(sessionId)) {
        if (activeGeneration?.id === generationId && activeGeneration?.sessionId === sessionId) {
          activeGeneration.streamCtrl = null;
        }
        return null;
      }
      try {
        ui.hideTyping();
      } catch {}
      try {
        fastForwardDelivery(sessionId);
      } catch {}
      const nextCtrl = createAssistantStreamCtrl(meta);
      if (nextCtrl) {
        streamCtrl = nextCtrl;
        if (activeGeneration?.id === generationId && activeGeneration?.sessionId === sessionId) {
          activeGeneration.streamCtrl = nextCtrl;
          activeGeneration.streamMeta = {
            ...((activeGeneration.streamMeta && typeof activeGeneration.streamMeta === 'object') ? activeGeneration.streamMeta : {}),
            ...((meta && typeof meta === 'object') ? meta : {}),
          };
        }
      }
      return streamCtrl;
    };
    const pushAssistantStreamText = (value, meta = {}) => {
      const payload =
        value && typeof value === 'object' && !Array.isArray(value)
          ? { ...value }
          : null;
      const renderedText = payload ? String(payload.content ?? '') : String(value ?? '');
      updateActiveGenerationStreamCache(renderedText, meta, payload);
      const ctrl = ensureAssistantStreamCtrl(meta);
      if (ctrl) ctrl.update(payload || renderedText);
      return ctrl;
    };
    const bindActiveGenerationReattach = () => {
      if (!activeGeneration || activeGeneration.id !== generationId || activeGeneration.sessionId !== sessionId) return;
      activeGeneration.reattachStream = () => {
        if (isGenerationInterrupted(generationId)) return false;
        const meta =
          activeGeneration?.streamMeta && typeof activeGeneration.streamMeta === 'object'
            ? activeGeneration.streamMeta
            : {};
        const payload =
          activeGeneration?.streamPayload && typeof activeGeneration.streamPayload === 'object'
            ? { ...activeGeneration.streamPayload }
            : null;
        const text = String(activeGeneration?.streamText ?? '');
        const ctrl = ensureAssistantStreamCtrl(meta);
        if (ctrl && (payload || text)) ctrl.update(payload || text);
        return Boolean(ctrl);
      };
    };
    const commitContinuationMessage = (message, { partial = false } = {}) => {
      const targetId = String(continueTarget?.messageId || '').trim();
      if (!targetId || !message) return null;
      const existing = chatStore.findMessage(targetId, sessionId) || continueTarget?.message || null;
      if (!existing) return null;
      const raw = typeof message.raw === 'string' ? message.raw : String(message.content || '');
      const nextMeta = {
        ...((existing?.meta && typeof existing.meta === 'object') ? existing.meta : {}),
        ...((message?.meta && typeof message.meta === 'object') ? message.meta : {}),
      };
      if (partial) {
        nextMeta.partial = true;
        nextMeta.cancelled = true;
      } else {
        delete nextMeta.partial;
        delete nextMeta.cancelled;
      }
      if (Array.isArray(existing?.meta?.swipes) && existing.meta.swipes.length) {
        const swipes = existing.meta.swipes.map(entry => ({ ...(entry || {}) }));
        const rawIndex = Math.trunc(Number(existing?.meta?.activeSwipe));
        const activeIndex = Number.isFinite(rawIndex)
          ? Math.min(Math.max(0, rawIndex), swipes.length - 1)
          : swipes.length - 1;
        if (swipes[activeIndex]) {
          swipes[activeIndex] = {
            ...swipes[activeIndex],
            content: String(message.content || ''),
            raw,
          };
        }
        nextMeta.swipes = swipes;
        nextMeta.activeSwipe = activeIndex;
      }
      const updatePayload = {
        ...existing,
        ...message,
        id: targetId,
        role: 'assistant',
        type: message?.type || existing?.type || 'text',
        name: message?.name || existing?.name || '助手',
        avatar: message?.avatar || existing?.avatar,
        time: message?.time || existing?.time || formatNowTime(),
        content: String(message?.content || ''),
        raw,
        rawOriginal:
          typeof message?.rawOriginal === 'string'
            ? message.rawOriginal
            : (typeof existing?.rawOriginal === 'string' ? existing.rawOriginal : raw),
        rawSource:
          typeof message?.rawSource === 'string'
            ? message.rawSource
            : (typeof existing?.rawSource === 'string' ? existing.rawSource : undefined),
        meta: nextMeta,
      };
      const saved = chatStore.updateMessage(targetId, updatePayload, sessionId) || { ...existing, ...updatePayload };
      if (isSessionActive(sessionId)) ui.updateMessage(targetId, saved);
      return saved;
    };
    const resolvedPartialCommitHandler =
      partialCommitHandler ||
      (continueTarget
        ? (partial => {
            commitContinuationMessage(partial, { partial: true });
            return true;
          })
        : null);

    // 只有在没有 pending 消息时，才创建新的用户消息气泡
    let userMsg = null;
    if (!pendingMessagesToConfirm || pendingMessagesToConfirm.length === 0) {
      if (!suppressUserMessage && hasUserText) {
        const stickerKey = isStickerAllowed() ? parseStickerToken(text) : '';
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
        if (currentDraftReplyTarget) {
          userMsg = attachReplyTargetToMessage(userMsg, currentDraftReplyTarget);
          consumedDraftReplyTarget = true;
        }
        ui.addMessage(userMsg);
        const savedUser = chatStore.appendMessage(userMsg, sessionId);
        userMsg = savedUser || userMsg;
        if (scriptRuntime && !skipScripts) {
          scriptRuntime.dispatchEvent('message.after_send', { message: savedUser || userMsg, sessionId }).catch(err => {
            logger.warn('script message.after_send failed', err);
          });
        }
        if (pluginRuntime) {
          pluginRuntime.dispatchEvent('message.after_send', { message: savedUser || userMsg, sessionId }).catch(err => {
            logger.warn('plugin message.after_send failed', err);
          });
        }
        appendedUserOutput = true;
      }
      outgoingReplyContexts = buildOutgoingReplyContexts(userMsg ? [userMsg] : attachmentMessages);
      const primaryId = userMsg?.id || existingUserMessageId || attachmentPrimaryId || null;
      activeGeneration = {
        id: ++generationSequence,
        sessionId,
        userMsgId: primaryId,
        streamCtrl: null,
        streamText: '',
        streamPayload: null,
        streamMeta: null,
        reattachStream: null,
        partialCommitHandler: resolvedPartialCommitHandler,
        swipeTarget,
        cancelled: false,
      };
      generationId = activeGeneration.id;
      bindActiveGenerationReattach();
      if (appendedUserOutput) refreshChatAndContacts();
      if (appendedUserOutput) ui.showDeliveryStatus();
      if (!suppressUserMessage && appendedUserOutput) ui.clearInput();
    } else {
      outgoingReplyContexts = buildOutgoingReplyContexts([...pendingMessagesToConfirm, ...attachmentMessages]);
      // 有 pending 消息时，使用第一条 pending 消息的 ID
      activeGeneration = {
        id: ++generationSequence,
        sessionId,
        userMsgId: pendingMessagesToConfirm[0]?.id,
        streamCtrl: null,
        streamText: '',
        streamPayload: null,
        streamMeta: null,
        reattachStream: null,
        partialCommitHandler: resolvedPartialCommitHandler,
        swipeTarget,
        cancelled: false,
      };
      generationId = activeGeneration.id;
      bindActiveGenerationReattach();
      if (attachmentMessages.length) refreshChatAndContacts();
      if (!suppressUserMessage && attachmentMessages.length) ui.clearInput();
    }
    if (consumedDraftReplyTarget) clearReplyTargetForSession(sessionId);
    ui.setSendingState(true);
    // 显示已送出状态（对 pending 消息在 flush 后也生效）
    ui.showDeliveryStatus();

    const config = window.appBridge.config.get();
    try {
      if (config.stream) {
        const assistantAvatar = getAssistantAvatarForSession(sessionId);
        const presetState = window.appBridge?.presets?.getState?.() || null;
        const sysp = Boolean(presetState?.enabled?.sysprompt)
          ? (window.appBridge?.presets?.getResolvedActive?.('sysprompt', getPresetContext())?.preset || {})
          : {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = !rpUiMode && (momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled));
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = !isSummaryMemoryEnabled();

        if (rpUiMode) {
          // RP/创意写作界面：完整长文输出，不解析线上格式
          if (isSessionActive(sessionId)) startDeliveryAndTyping(sessionId, assistantAvatar);
          consumePromptInjections(sessionId);
          const stream = await window.appBridge.generate(text, llmContext(text));
          let full = '';
          streamCtrl = null;
          const streamMeta = {
            avatar: assistantAvatar,
            name: '助手',
            time: formatNowTime(),
            typing: false,
            renderRich: true,
            streamMode: 'creative',
          };
          const creativeStreamProcessor = new CreativeStreamProcessor({
            fps: 18,
            normalizeText: normalizeCreativeLineBreaks,
            stripRaw: source => ((!isRpMode && isMemoryAutoExtractInline()) ? stripTableEditBlocks(source) : source),
            extractReasoning: (source, { final = false } = {}) =>
              extractStreamingReasoningFromContent(source, { depth: 0, final }),
            applyStored: source =>
              normalizeCreativeLineBreaks(window.appBridge.applyOutputStoredRegex(source, { depth: 0 })),
            applyDisplay: source =>
              normalizeCreativeLineBreaks(window.appBridge.applyOutputDisplayRegex(source, { depth: 0 })),
          });
          for await (const chunk of stream) {
            if (isGenerationInterrupted(generationId)) break;
            full += chunk;
            const preview = creativeStreamProcessor.append(chunk);
            if (!preview) continue;
            const previewMeta = {
              renderRich: true,
              ...(preview.reasoning
                ? {
                    reasoning: preview.reasoning,
                    reasoningDisplay: preview.reasoningDisplay,
                  }
                : {}),
            };
            streamCtrl = pushAssistantStreamText(
              {
                content: preview.display,
                raw: preview.stored,
                rawSource: preview.contentSource,
                rawOriginal: preview.raw,
                reasoning: preview.reasoning,
                reasoningDisplay: preview.reasoningDisplay,
                meta: previewMeta,
              },
              {
                ...streamMeta,
                raw: preview.stored,
                rawSource: preview.contentSource,
                rawOriginal: preview.raw,
                reasoning: preview.reasoning,
                reasoningDisplay: preview.reasoningDisplay,
              },
            );
          }
          if (isGenerationInterrupted(generationId)) return;
          if (isSessionActive(sessionId)) ui.hideTyping();
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
          } catch {}
          const finalStreamMeta = {
            ...streamMeta,
            raw: stored,
            rawSource: finalSource,
            rawOriginal: full,
            reasoning: reasoningParsed.reasoning,
            reasoningDisplay: reasoningParsed.reasoningDisplay,
          };
          const finalStreamPayload = {
            content: display,
            raw: stored,
            rawSource: finalSource,
            rawOriginal: full,
            reasoning: reasoningParsed.reasoning,
            reasoningDisplay: reasoningParsed.reasoningDisplay,
            meta: {
              renderRich: true,
              ...(reasoningParsed.reasoning
                ? {
                    reasoning: reasoningParsed.reasoning,
                    reasoningDisplay: reasoningParsed.reasoningDisplay,
                  }
                : {}),
            },
          };
          streamCtrl = pushAssistantStreamText(finalStreamPayload, finalStreamMeta);
          const memoryState = isRpMode
            ? await captureAssistantMemoryState(sessionId, { isGroup: isGroupChat })
            : null;
          const meta = attachAssistantMemoryStateToMeta({ renderRich: true }, memoryState);
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
            sessionId,
            rawOriginal: full,
            rawSource: finalSource,
            raw: stored,
            content: display,
            meta,
          };
          if (!isStreamCtrlConnected(streamCtrl) && isSessionActive(sessionId)) {
            streamCtrl = ensureAssistantStreamCtrl(streamMeta);
          }
          if (isStreamCtrlConnected(streamCtrl)) {
            streamCtrl.finish(parsed);
          } else if (isSessionActive(sessionId) && !suppressAssistantDom && !continueTarget) {
            ui.addMessage(parsed);
          }
          {
            const saved = continueTarget
              ? commitContinuationMessage(parsed)
              : chatStore.appendMessage(parsed, sessionId);
            checkpointTargetMessageId = String(
              swipeTarget?.msgId || saved?.id || parsed?.id || continueTarget?.messageId || '',
            ).trim();
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
            emitPluginAfterReceive(saved, sessionId);
            if (isTurnCheckpointSessionEnabled(sessionId) && !swipeTarget) {
              syncTurnCheckpointForMessage(sessionId, saved || parsed, {
                captureCurrentActiveState: true,
              }).catch(err => {
                logger.warn('sync turn checkpoint after assistant save failed', err);
              });
            }
          }
          refreshChatAndContacts();
          sendSucceeded = true;
        } else if (protocolEnabled) {
          // 对话模式（流式）：不逐字显示 AI 原文；只在捕获到完整的”有效标签”后输出解析结果
          if (isSessionActive(sessionId)) startDeliveryAndTyping(sessionId, assistantAvatar);
          const parser = createDialogueParser();
          consumePromptInjections(sessionId);
          const stream = await window.appBridge.generate(text, llmContext(text));
          let fullRaw = '';
          let didAnything = false;
          let mutatedMoments = false;
          const summarySessionIds = new Set([sessionId]);
          for await (const chunk of stream) {
            if (isGenerationInterrupted(generationId)) break;
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
                  // moments-regex rollback marker:
                  // momentsStore.addComments(mid, ev.comments || []);
                  momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
                  mutatedMoments = true;
                  didAnything = true;
                  if (activePage === 'moments') momentsPanel.render();
                } catch {}
                continue;
              }
              if (ev.type === 'group_chat') {
                if (isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }
                const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                if (!targetGroupId) {
                  window.toastr?.warning?.('对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                  continue;
                }
                summarySessionIds.add(targetGroupId);
                // 先收集所有群聊消息
                const groupBatch = [];
                for (const m of (ev.messages || [])) {
                  const speaker = normalizeName(m?.speaker);
                  const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                  if (isSystemSpeaker(speaker)) {
                    groupBatch.push({
                      parsed: {
                        role: 'system', type: 'meta',
                        content: sanitizeAssistantReplyText(content, userName),
                        name: '系统', time: m?.time || formatNowTime(),
                      },
                      isSystem: true, isMe: false,
                    });
                    continue;
                  }
                  const isMe = isUserSpeakerName(speaker);
                  if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                  const role = isMe ? 'user' : 'assistant';
                  const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                  const parsed =
                    role === 'assistant'
                      ? await buildAssistantMessageFromText(content, {
                          sessionId: targetGroupId,
                          time: m?.time || formatNowTime(),
                          name: speaker || '成员',
                          avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                          speakerContactId: c?.id || '',
                          showName: true,
                          depth: 0,
                        })
                      : buildUserMessageFromAI(content, m?.time || formatNowTime());
                  groupBatch.push({ parsed, isMe, isSystem: false, role });
                }

                const grpAnimEnabled = document.body.dataset.typingDots !== 'off';
                const grpIsActive = isSessionActive(targetGroupId);

                if (grpIsActive && grpAnimEnabled && groupBatch.length > 1) {
                  const queueItems = groupBatch.map(({ parsed, isMe, isSystem, role }) => ({
                    message: parsed,
                    callback: () => {
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (isSystem) { emitPluginAfterReceive(saved, targetGroupId); maybeApplyGroupSystemOps(parsed.content, targetGroupId); }
                      else { if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || ''); emitPluginAfterReceive(saved, targetGroupId); }
                    },
                  }));
                  const q = ui.enqueueMessages(queueItems, {
                    avatarUrl: assistantAvatar,
                    typingOptions: getGroupTypingMembers(sessionId) || {},
                  });
                  if (activeGeneration && activeGeneration.id === generationId)
                    activeGeneration._messageQueue = q;
                  await q.promise;
                } else {
                  for (const { parsed, isMe, isSystem, role } of groupBatch) {
                    if (grpIsActive) ui.addMessage(parsed, { autoScroll: grpAnimEnabled });
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    if (isSystem) { emitPluginAfterReceive(saved, targetGroupId); maybeApplyGroupSystemOps(parsed.content, targetGroupId); }
                    else { if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || ''); emitPluginAfterReceive(saved, targetGroupId); }
                  }
                }
                if (grpIsActive) {
                  const uniqueSpeakers = new Set(groupBatch.filter(b => b.role === 'assistant').map(b => b.parsed.name)).size;
                  if (uniqueSpeakers > 0) ui.bumpReadCount(uniqueSpeakers);
                }
                didAnything = true;
                refreshChatAndContacts();
                if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar, getGroupTypingMembers(sessionId) || {});
                continue;
              }
              if (ev.type !== 'private_chat') continue;
              if (isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }

              // 默认路由到当前 session；若标签指向其他私聊，则创建/写入对应会话（后续群聊/动态会扩展）
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回复格式错误：私聊标签未匹配当前联系人，已丢弃');
                continue;
              }
              summarySessionIds.add(targetSessionId);

              // 先收集所有消息
              const parsedBatch = [];
              for (const msgText of (ev.messages || [])) {
                const { speaker, content, time } = normalizeDialogueMessage(msgText);
                if (!content) continue;
                if (userEchoGuard.shouldDrop(content, speaker)) continue;
                const isMe = isUserSpeakerName(speaker);
                const parsed = isMe
                  ? buildUserMessageFromAI(content, time || formatNowTime())
                  : await buildAssistantMessageFromText(content, {
                      sessionId: targetSessionId,
                      time: time || formatNowTime(),
                      depth: 0,
                    });
                parsedBatch.push({ parsed, isMe });
              }

              const animEnabled = document.body.dataset.typingDots !== 'off';
              const isActive = isSessionActive(targetSessionId);

              if (isActive && animEnabled && parsedBatch.length > 1) {
                // 逐条延迟输出
                const queueItems = parsedBatch.map(({ parsed, isMe }) => ({
                  message: parsed,
                  callback: () => {
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                  },
                }));
                const q = ui.enqueueMessages(queueItems, {
                  avatarUrl: assistantAvatar,
                  typingOptions: getGroupTypingMembers(sessionId) || {},
                });
                if (activeGeneration && activeGeneration.id === generationId)
                  activeGeneration._messageQueue = q;
                await q.promise;
              } else {
                // 一次性输出（无动画或单条）
                for (const { parsed, isMe } of parsedBatch) {
                  if (isActive) ui.addMessage(parsed, { autoScroll: animEnabled });
                  const saved = chatStore.appendMessage(parsed, targetSessionId);
                  if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                  emitPluginAfterReceive(saved, targetSessionId);
                }
              }
              didAnything = true;
              refreshChatAndContacts();

              // Continue waiting animation until stream ends / next tag arrives
              if (isSessionActive(sessionId)) ui.showTyping(assistantAvatar, getGroupTypingMembers(sessionId) || {});
            }
          }
          if (isGenerationInterrupted(generationId)) return;
          if (isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }
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
                for (const ev of retryEvents) {
                  if (ev?.type === 'moments') {
                    try {
                      momentsStore.addMany(ingestMoments(ev.moments || []));
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    continue;
                  }
                  if (ev?.type === 'moment_reply') {
                    try {
                      const mid = String(ev.momentId || '').trim();
                      if (!mid) continue;
                      // moments-regex rollback marker:
                      // momentsStore.addComments(mid, ev.comments || []);
                      momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
                      mutatedMoments = true;
                      didAnything = true;
                      if (activePage === 'moments') momentsPanel.render();
                    } catch {}
                    continue;
                  }
                  if (ev?.type === 'group_chat') {
                    const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                    if (!targetGroupId) continue;
                    summarySessionIds.add(targetGroupId);
                    for (const m of (ev.messages || [])) {
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
                        continue;
                      }
                      const isMe = isUserSpeakerName(speaker);
                      if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                      const role = isMe ? 'user' : 'assistant';
                      const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                      const parsed =
                        role === 'assistant'
                          ? await buildAssistantMessageFromText(content, {
                              sessionId: targetGroupId,
                              time: m?.time || formatNowTime(),
                              name: speaker || '成员',
                              avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                              speakerContactId: c?.id || '',
                              showName: true,
                              depth: 0,
                            })
                          : buildUserMessageFromAI(content, m?.time || formatNowTime());
                      if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetGroupId);
                    }
                    didAnything = true;
                    refreshChatAndContacts();
                    continue;
                  }
                  if (ev?.type === 'private_chat') {
                    const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                    if (!targetSessionId) continue;
                    summarySessionIds.add(targetSessionId);
                    for (const msgText of (ev.messages || [])) {
                      const { speaker, content, time } = normalizeDialogueMessage(msgText);
                      if (!content) continue;
                      if (userEchoGuard.shouldDrop(content, speaker)) continue;
                      const isMe = isUserSpeakerName(speaker);
                      const parsed = isMe
                        ? buildUserMessageFromAI(content, time || formatNowTime())
                        : await buildAssistantMessageFromText(content, {
                            sessionId: targetSessionId,
                            time: time || formatNowTime(),
                            depth: 0,
                          });
                      if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetSessionId);
                      if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetSessionId);
                    }
                    didAnything = true;
                    refreshChatAndContacts();
                  }
                }
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
                  for (const ev of retryEvents) {
                    if (ev?.type === 'moments') {
                      try {
                        momentsStore.addMany(ingestMoments(ev.moments || []));
                        mutatedMoments = true;
                        didAnything = true;
                        if (activePage === 'moments') momentsPanel.render();
                      } catch {}
                      continue;
                    }
                    if (ev?.type === 'moment_reply') {
                      try {
                        const mid = String(ev.momentId || '').trim();
                        if (!mid) continue;
                        // moments-regex rollback marker:
                        // momentsStore.addComments(mid, ev.comments || []);
                        momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
                        mutatedMoments = true;
                        didAnything = true;
                        if (activePage === 'moments') momentsPanel.render();
                      } catch {}
                      continue;
                    }
                    if (ev?.type === 'group_chat') {
                      const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                      if (!targetGroupId) continue;
                      summarySessionIds.add(targetGroupId);
                      for (const m of (ev.messages || [])) {
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
                          continue;
                        }
                        const isMe = isUserSpeakerName(speaker);
                        if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                        const role = isMe ? 'user' : 'assistant';
                        const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                        const parsed =
                          role === 'assistant'
                            ? await buildAssistantMessageFromText(content, {
                                sessionId: targetGroupId,
                                time: m?.time || formatNowTime(),
                                name: speaker || '成员',
                                avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                                speakerContactId: c?.id || '',
                                showName: true,
                                depth: 0,
                              })
                            : buildUserMessageFromAI(content, m?.time || formatNowTime());
                        if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetGroupId);
                        if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                        emitPluginAfterReceive(saved, targetGroupId);
                      }
                      didAnything = true;
                      refreshChatAndContacts();
                      continue;
                    }
                    if (ev?.type === 'private_chat') {
                      const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                      if (!targetSessionId) continue;
                      summarySessionIds.add(targetSessionId);
                      for (const msgText of (ev.messages || [])) {
                        const { speaker, content, time } = normalizeDialogueMessage(msgText);
                        if (!content) continue;
                        if (userEchoGuard.shouldDrop(content, speaker)) continue;
                        const isMe = isUserSpeakerName(speaker);
                        const parsed = isMe
                          ? buildUserMessageFromAI(content, time || formatNowTime())
                          : await buildAssistantMessageFromText(content, {
                              sessionId: targetSessionId,
                              time: time || formatNowTime(),
                              depth: 0,
                            });
                        if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                        const saved = chatStore.appendMessage(parsed, targetSessionId);
                        if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                        emitPluginAfterReceive(saved, targetSessionId);
                      }
                      didAnything = true;
                      refreshChatAndContacts();
                    }
                  }
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
          const streamMeta = {
            avatar: assistantAvatar,
            name: '助手',
            time: formatNowTime(),
            typing: true,
          };
          streamCtrl = isSessionActive(sessionId) ? ensureAssistantStreamCtrl(streamMeta) : null;
          consumePromptInjections(sessionId);
          const stream = await window.appBridge.generate(text, llmContext(text));
          let full = '';
          for await (const chunk of stream) {
            if (isGenerationInterrupted(generationId)) break;
            full += chunk;
            const streamText = (!isRpMode && isMemoryAutoExtractInline()) ? stripTableEditBlocks(full) : full;
            streamCtrl = pushAssistantStreamText(streamText, streamMeta);
          }
          if (isGenerationInterrupted(generationId)) return;
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
          // chat-mode-regex rollback marker:
          // Old logic kept for comparison / easy rollback.
          // let stored = sanitizeAssistantReplyText(stripped, userName);
          // const reasoningParsed = extractReasoningFromContent(stored, { depth: 0, strict: true });
          // stored = reasoningParsed.content || '';
          // let display = stored;
          const { reasoningParsed, finalSource, stored, display } = applyChatModeAssistantRegex(stripped, { depth: 0 });
          const meta = {};
          if (reasoningParsed.reasoning) {
            meta.reasoning = reasoningParsed.reasoning;
            meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
          }
          // === RP/创意写作界面===
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
            rawSource: finalSource || undefined,
            raw: stored,
            ...parseSpecialMessage(display),
            meta: Object.keys(meta).length ? meta : undefined,
          };
          updateActiveGenerationStreamCache(display, streamMeta);
          if (isStreamCtrlConnected(streamCtrl)) {
            streamCtrl.update(display);
          } else if (isSessionActive(sessionId)) {
            streamCtrl = ensureAssistantStreamCtrl(streamMeta);
            if (streamCtrl) streamCtrl.update(display);
          }
          if (isStreamCtrlConnected(streamCtrl)) {
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
        const presetState = window.appBridge?.presets?.getState?.() || null;
        const sysp = Boolean(presetState?.enabled?.sysprompt)
          ? (window.appBridge?.presets?.getResolvedActive?.('sysprompt', getPresetContext())?.preset || {})
          : {};
        const privateEnabled = Boolean(sysp?.dialogue_enabled) && String(sysp?.dialogue_rules || '').trim().length > 0;
        const groupEnabled = Boolean(sysp?.group_enabled) && String(sysp?.group_rules || '').trim().length > 0;
        const momentCreateEnabled =
          Boolean(sysp?.moment_create_enabled) && String(sysp?.moment_create_rules || '').trim().length > 0;
        const protocolEnabled = !rpUiMode && (momentCreateEnabled || (isGroupChat ? groupEnabled : privateEnabled));
        // Always include summary request prompt; summary (if present) will be extracted from raw response.
        disableSummaryForThis = !isSummaryMemoryEnabled();

        if (isSessionActive(sessionId)) startDeliveryAndTyping(sessionId, assistantAvatar);
        consumePromptInjections(sessionId);
        const resultRaw = await window.appBridge.generate(text, llmContext(text));
        if (isGenerationInterrupted(generationId)) {
          if (isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }
          return;
        }
        sendSucceeded = true;
        if (isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }
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
        if (rpUiMode) {
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
          const memoryState = isRpMode
            ? await captureAssistantMemoryState(sessionId, { isGroup: isGroupChat })
            : null;
          const meta = attachAssistantMemoryStateToMeta({ renderRich: true }, memoryState);
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
            sessionId,
            rawOriginal: resultRaw,
            rawSource: finalSource,
            raw: stored,
            content: display,
            meta,
          };
          if (isSessionActive(sessionId) && !suppressAssistantDom && !continueTarget) ui.addMessage(parsed);
          {
            const saved = continueTarget
              ? commitContinuationMessage(parsed)
              : chatStore.appendMessage(parsed, sessionId);
            checkpointTargetMessageId = String(
              swipeTarget?.msgId || saved?.id || parsed?.id || continueTarget?.messageId || '',
            ).trim();
            autoMarkReadIfActive(sessionId, saved?.id || parsed?.id || '');
            emitPluginAfterReceive(saved, sessionId);
            if (isTurnCheckpointSessionEnabled(sessionId) && !swipeTarget) {
              syncTurnCheckpointForMessage(sessionId, saved || parsed, {
                captureCurrentActiveState: true,
              }).catch(err => {
                logger.warn('sync turn checkpoint after buffered assistant save failed', err);
              });
            }
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
          for (const ev of events) {
            if (ev?.type === 'moments') {
              momentsStore.addMany(ingestMoments(ev.moments || []));
              didAnything = true;
              mutatedMoments = true;
              continue;
            }
            if (ev?.type === 'moment_reply') {
              const mid = String(ev.momentId || '').trim();
              if (!mid) continue;
              // moments-regex rollback marker:
              // momentsStore.addComments(mid, ev.comments || []);
              momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
              didAnything = true;
              mutatedMoments = true;
              continue;
            }
            if (ev?.type === 'group_chat') {
              const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
              if (!targetGroupId) {
                window.toastr?.warning?.('对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃');
                continue;
              }
              summarySessionIds.add(targetGroupId);
              const nsBatch = [];
              for (const m of (ev.messages || [])) {
                const speaker = normalizeName(m?.speaker);
                const content = String(m?.content || '').replace(/<br\s*\/?>/gi, '\n');
                if (isSystemSpeaker(speaker)) {
                  nsBatch.push({
                    parsed: { role: 'system', type: 'meta', content: sanitizeAssistantReplyText(content, userName), name: '系统', time: m?.time || formatNowTime() },
                    isSystem: true, isMe: false, role: 'system',
                  });
                  continue;
                }
                const isMe = isUserSpeakerName(speaker);
                if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                const role = isMe ? 'user' : 'assistant';
                const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                const parsed =
                  role === 'assistant'
                    ? await buildAssistantMessageFromText(content, {
                        sessionId: targetGroupId, time: m?.time || formatNowTime(),
                        name: speaker || '成员', avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                        speakerContactId: c?.id || '', showName: true, depth: 0,
                      })
                    : buildUserMessageFromAI(content, m?.time || formatNowTime());
                nsBatch.push({ parsed, isMe, isSystem: false, role });
              }
              const nsGrpAnim = document.body.dataset.typingDots !== 'off';
              const nsGrpActive = isSessionActive(targetGroupId);
              if (nsGrpActive && nsGrpAnim && nsBatch.length > 1) {
                const qItems = nsBatch.map(({ parsed, isMe, isSystem, role }) => ({
                  message: parsed,
                  callback: () => {
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    if (isSystem) { emitPluginAfterReceive(saved, targetGroupId); maybeApplyGroupSystemOps(parsed.content, targetGroupId); }
                    else { if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || ''); emitPluginAfterReceive(saved, targetGroupId); }
                  },
                }));
                await ui.enqueueMessages(qItems, { avatarUrl: assistantAvatar, typingOptions: {} }).promise;
              } else {
                for (const { parsed, isMe, isSystem, role } of nsBatch) {
                  if (nsGrpActive) ui.addMessage(parsed, { autoScroll: nsGrpAnim });
                  const saved = chatStore.appendMessage(parsed, targetGroupId);
                  if (isSystem) { emitPluginAfterReceive(saved, targetGroupId); maybeApplyGroupSystemOps(parsed.content, targetGroupId); }
                  else { if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || ''); emitPluginAfterReceive(saved, targetGroupId); }
                }
              }
              if (nsGrpActive) {
                const nsUniqueSpeakers = new Set(nsBatch.filter(b => b.role === 'assistant').map(b => b.parsed.name)).size;
                if (nsUniqueSpeakers > 0) ui.bumpReadCount(nsUniqueSpeakers);
              }
              didAnything = true;
              continue;
            }
            if (ev?.type === 'private_chat') {
              const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
              if (!targetSessionId) {
                window.toastr?.warning?.('对话回复格式错误：私聊标签未匹配当前联系人，已丢弃');
                continue;
              }
              summarySessionIds.add(targetSessionId);
              const nsPvtBatch = [];
              for (const msgText of (ev.messages || [])) {
                const { speaker, content, time } = normalizeDialogueMessage(msgText);
                if (!content) continue;
                if (userEchoGuard.shouldDrop(content, speaker)) continue;
                const isMe = isUserSpeakerName(speaker);
                const parsed = isMe
                  ? buildUserMessageFromAI(content, time || formatNowTime())
                  : await buildAssistantMessageFromText(content, {
                      sessionId: targetSessionId, time: time || formatNowTime(), depth: 0,
                    });
                nsPvtBatch.push({ parsed, isMe });
              }
              const nsPvtAnim = document.body.dataset.typingDots !== 'off';
              const nsPvtActive = isSessionActive(targetSessionId);
              if (nsPvtActive && nsPvtAnim && nsPvtBatch.length > 1) {
                const qItems = nsPvtBatch.map(({ parsed, isMe }) => ({
                  message: parsed,
                  callback: () => {
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                  },
                }));
                await ui.enqueueMessages(qItems, { avatarUrl: assistantAvatar, typingOptions: {} }).promise;
              } else {
                for (const { parsed, isMe } of nsPvtBatch) {
                  if (nsPvtActive) ui.addMessage(parsed, { autoScroll: nsPvtAnim });
                  const saved = chatStore.appendMessage(parsed, targetSessionId);
                  if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                  emitPluginAfterReceive(saved, targetSessionId);
                }
              }
              didAnything = true;
            }
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
          // Fallback: strip complete <thinking>/<think> blocks then parse once more.
          try {
            const retryText = sanitizeThinkingForProtocolParse(resultRaw);
            if (retryText && retryText !== resultRaw) {
              const retryParser = createDialogueParser();
              const retryEvents = retryParser.push(retryText);
              for (const ev of retryEvents) {
                if (ev?.type === 'moments') {
                  momentsStore.addMany(ingestMoments(ev.moments || []));
                  didAnything = true;
                  mutatedMoments = true;
                  continue;
                }
                if (ev?.type === 'moment_reply') {
                  const mid = String(ev.momentId || '').trim();
                  if (!mid) continue;
                  // moments-regex rollback marker:
                  // momentsStore.addComments(mid, ev.comments || []);
                  momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
                  didAnything = true;
                  mutatedMoments = true;
                  continue;
                }
                if (ev?.type === 'group_chat') {
                  const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                  if (!targetGroupId) continue;
                  summarySessionIds.add(targetGroupId);
                  for (const m of (ev.messages || [])) {
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
                      continue;
                    }
                    const isMe = isUserSpeakerName(speaker);
                    if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                    const role = isMe ? 'user' : 'assistant';
                    const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                    const parsed =
                      role === 'assistant'
                        ? await buildAssistantMessageFromText(content, {
                            sessionId: targetGroupId,
                            time: m?.time || formatNowTime(),
                            name: speaker || '成员',
                            avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                            speakerContactId: c?.id || '',
                            showName: true,
                            depth: 0,
                          })
                        : buildUserMessageFromAI(content, m?.time || formatNowTime());
                    if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetGroupId);
                    if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetGroupId);
                    didAnything = true;
                  }
                  continue;
                }
                if (ev?.type === 'private_chat') {
                  const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                  if (!targetSessionId) continue;
                  summarySessionIds.add(targetSessionId);
                  for (const msgText of (ev.messages || [])) {
                    const { speaker, content, time } = normalizeDialogueMessage(msgText);
                    if (!content) continue;
                    if (userEchoGuard.shouldDrop(content, speaker)) continue;
                    const isMe = isUserSpeakerName(speaker);
                    const parsed = isMe
                      ? buildUserMessageFromAI(content, time || formatNowTime())
                      : await buildAssistantMessageFromText(content, {
                          sessionId: targetSessionId,
                          time: time || formatNowTime(),
                          depth: 0,
                        });
                    if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                    didAnything = true;
                  }
                }
              }
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
                for (const ev of retryEvents) {
                  if (ev?.type === 'moments') {
                    momentsStore.addMany(ingestMoments(ev.moments || []));
                    didAnything = true;
                    mutatedMoments = true;
                    continue;
                  }
                  if (ev?.type === 'moment_reply') {
                    const mid = String(ev.momentId || '').trim();
                    if (!mid) continue;
                    // moments-regex rollback marker:
                    // momentsStore.addComments(mid, ev.comments || []);
                    momentsStore.addComments(mid, normalizeMomentCommentsForStore(ev.comments || [], { regexMode: 'output', depth: 0 }));
                    didAnything = true;
                    mutatedMoments = true;
                    continue;
                  }
                  if (ev?.type === 'group_chat') {
                    const targetGroupId = resolveGroupChatTargetSessionId(ev.groupName);
                    if (!targetGroupId) continue;
                    summarySessionIds.add(targetGroupId);
                    for (const m of (ev.messages || [])) {
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
                        continue;
                      }
                      const isMe = isUserSpeakerName(speaker);
                      if (isMe && userEchoGuard.shouldDrop(content, speaker)) continue;
                      const role = isMe ? 'user' : 'assistant';
                      const c = isMe ? null : resolveGroupSpeakerContact(speaker, targetGroupId);
                      const parsed =
                        role === 'assistant'
                          ? await buildAssistantMessageFromText(content, {
                              sessionId: targetGroupId,
                              time: m?.time || formatNowTime(),
                              name: speaker || '成员',
                              avatar: resolveGroupSpeakerAvatar(speaker, targetGroupId, c),
                              speakerContactId: c?.id || '',
                              showName: true,
                              depth: 0,
                            })
                          : buildUserMessageFromAI(content, m?.time || formatNowTime());
                      if (isSessionActive(targetGroupId)) ui.addMessage(parsed);
                      const saved = chatStore.appendMessage(parsed, targetGroupId);
                      if (role === 'assistant') autoMarkReadIfActive(targetGroupId, saved?.id || parsed?.id || '');
                      emitPluginAfterReceive(saved, targetGroupId);
                      didAnything = true;
                    }
                    continue;
                  }
                  if (ev?.type === 'private_chat') {
                    const targetSessionId = resolvePrivateChatTargetSessionId(ev.otherName || characterName);
                    if (!targetSessionId) continue;
                    summarySessionIds.add(targetSessionId);
                    for (const msgText of (ev.messages || [])) {
                      const { speaker, content, time } = normalizeDialogueMessage(msgText);
                      if (!content) continue;
                      if (userEchoGuard.shouldDrop(content, speaker)) continue;
                      const isMe = isUserSpeakerName(speaker);
                      const parsed = isMe
                        ? buildUserMessageFromAI(content, time || formatNowTime())
                        : await buildAssistantMessageFromText(content, {
                            sessionId: targetSessionId,
                            time: time || formatNowTime(),
                            depth: 0,
                          });
                    if (isSessionActive(targetSessionId)) ui.addMessage(parsed);
                    const saved = chatStore.appendMessage(parsed, targetSessionId);
                    if (!isMe) autoMarkReadIfActive(targetSessionId, saved?.id || parsed?.id || '');
                    emitPluginAfterReceive(saved, targetSessionId);
                    didAnything = true;
                  }
                  }
                }
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
        // === RP/创意写作界面===
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
        // chat-mode-regex rollback marker:
        // Old logic kept for comparison / easy rollback.
        // const cleaned = sanitizeAssistantReplyText(stripped, userName);
        // const reasoningParsed = extractReasoningFromContent(cleaned, { depth: 0, strict: true });
        // const stored = reasoningParsed.content || '';
        // const display = stored;
        const { reasoningParsed, finalSource, stored, display } = applyChatModeAssistantRegex(stripped, { depth: 0 });
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
          rawSource: finalSource || undefined,
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
      const generationInterrupted = isGenerationInterrupted(generationId);
      const isCancelled = Boolean(error?.cancelled || generationInterrupted);
      if (!isCancelled) {
        streamCtrl?.cancel?.();
      }
      if (activeGeneration?._messageQueue) {
        try { activeGeneration._messageQueue.cancel(); } catch {}
      }
      if (!generationInterrupted && isSessionActive(sessionId)) { ui.hideTyping(); fastForwardDelivery(sessionId); }
      if (isCancelled) {
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
        scriptRuntime?.consumeOnce?.(sessionId);
        runMemoryUpdateAfterChat(sessionId, isGroupChat, llmContext(''), {
          checkpointMessageId: checkpointTargetMessageId,
        }).catch(() => {});
      }
      updatePendingFloat(sessionId);
      if (!activeGeneration || activeGeneration.id === generationId) {
        ui.setSendingState(false);
      }
      if (activeGeneration?.id === generationId) {
        activeGeneration = null;
      }
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
    const activeUser = getActiveUserProfile();
    const userName = String(activeUser?.name || '').trim() || '我';
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
      if (isAssistant && isRpSessionId(sessionId)) {
        msg.meta = { ...(msg.meta || {}), renderRich: true };
      }
      if (isSessionActive(sessionId)) ui.addMessage(msg);
      const saved = chatStore.appendMessage(msg, sessionId);
      refreshChatAndContacts();
      if (isUser && scriptRuntime) {
        scriptRuntime.dispatchEvent('message.after_send', { message: saved || msg, sessionId }).catch(err => {
          logger.warn('script message.after_send failed', err);
        });
      }
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
    onSendButton: () => {
      if (ui?.isSending || ui?.isStreaming || (activeGeneration && !activeGeneration.cancelled)) {
        cancelActiveGeneration('user');
        return;
      }
      handleSend();
    },
  });
  ui.onReplyCancel(() => {
    clearReplyTargetForSession(chatStore.getCurrent());
  });

  const rpContinueBtn = document.getElementById('rp-continue-btn');
  rpContinueBtn?.addEventListener('click', () => {
    if (uiMode !== 'rp') return;
    if (activeGeneration && !activeGeneration.cancelled) {
      cancelActiveGeneration('user');
      return;
    }
    if (canUseDeepSeekContinuePrefill()) {
      const sessionId = chatStore.getCurrent();
      const targetMessage = getLastContinuableAssistantMessage(sessionId);
      const prefix = getAssistantContinuationSource(targetMessage);
      if (targetMessage?.id && prefix) {
        handleSend(null, {
          overrideText: '',
          suppressUserMessage: true,
          ignorePending: true,
          skipInputRegex: true,
          includeAttachments: false,
          continueTarget: {
            messageId: String(targetMessage.id),
            message: targetMessage,
            prefix,
          },
          createAssistantStream: meta => ui.startAssistantContinuationStream(targetMessage.id, {
            ...meta,
            initialContent: String(targetMessage.content || ''),
          }),
        });
        return;
      }
    }
    handleSend(null, {
      overrideText: '[Continue]',
      suppressUserMessage: true,
      ignorePending: true,
      skipInputRegex: true,
      includeAttachments: false,
    });
  });

  // Legacy send-mode cleanup: RP/创意写作只保留界面切换，不再保留聊天区长按发送模式切换。
  (() => {
    try {
      ui.setSendClickGuard(null);
    } catch {}
    clearLegacySendModeState();
  })();

  ui.onInputChange(text => {
    chatStore.setDraft(text, chatStore.getCurrent());
    updateStickerPreview(text);
  });
  ui.onMessageAction(async (action, message, payload) => {
    const sessionId = chatStore.getCurrent();
    const applyUpdateVariableForMessageSafe = (targetMessage, targetSessionId) => {
      const pickApplyFn = () => {
        const localFn = typeof applyUpdateVariableFromMessage === 'function' ? applyUpdateVariableFromMessage : null;
        const globalFn =
          typeof window !== 'undefined' && typeof window.__chatappApplyUpdateVariableFromMessage === 'function'
            ? window.__chatappApplyUpdateVariableFromMessage
            : null;
        return localFn || globalFn || null;
      };
      const stripSimple = (text) => {
        const raw = String(text || '');
        if (!raw) return raw;
        return raw
          .replace(/<\s*(update(?:variable)?|variableupdate)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
          .replace(/<\s*\/?\s*(update(?:variable)?|variableupdate)\b[^>]*>/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trimEnd();
      };
      try {
        const fn = pickApplyFn();
        if (typeof fn === 'function') return Boolean(fn(targetMessage, targetSessionId));
      } catch (err) {
        logger.warn('edit-assistant-raw: update apply via function failed', err);
      }
      try {
        const raw =
          (typeof targetMessage?.rawOriginal === 'string' && targetMessage.rawOriginal) ||
          (typeof targetMessage?.rawSource === 'string' && targetMessage.rawSource) ||
          (typeof targetMessage?.raw === 'string' && targetMessage.raw) ||
          (typeof targetMessage?.content === 'string' && targetMessage.content) ||
          '';
        if (!raw) return false;
        const localStrip =
          (typeof stripUpdateVariableBlocks === 'function' && stripUpdateVariableBlocks) ||
          (typeof stripUpdateVariableBloacks === 'function' && stripUpdateVariableBloacks) ||
          (typeof stripupdatevariablebloacks === 'function' && stripupdatevariablebloacks) ||
          stripSimple;
        const baseStoredRaw = typeof targetMessage?.raw === 'string' ? targetMessage.raw : '';
        const baseSource = typeof targetMessage?.rawSource === 'string' ? targetMessage.rawSource : '';
        const baseOriginal = typeof targetMessage?.rawOriginal === 'string' ? targetMessage.rawOriginal : '';
        const baseFallback = typeof targetMessage?.content === 'string' ? targetMessage.content : '';
        const sourceText = baseSource || baseOriginal || baseFallback;
        let nextStored = localStrip(baseStoredRaw || raw);
        let nextSource = localStrip(sourceText || raw);
        const sid = String(targetSessionId || '').trim();
        const isTavernMvuSession = (() => {
          if (!sid) return false;
          const persona = getEffectivePersona(sid);
          const source = persona && typeof persona.source === 'object' ? persona.source : null;
          if (!source || source.type !== 'character_card') return false;
          const mvuSource = String(source.mvuSource || '').trim().toLowerCase();
          const hasCardMvu = source.mvuConverted === true || (mvuSource && mvuSource !== 'none');
          if (!hasCardMvu) return false;
          const schemas = chatStore.listVariableSchemas?.(sid) || {};
          return Object.keys(schemas).length > 0;
        })();
        const rawHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(raw);
        const sourceHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(sourceText || '');
        const storedHasPlaceholder = /<StatusPlaceHolderImpl\s*\/?>/i.test(baseStoredRaw || '');
        if (isTavernMvuSession && !(rawHasPlaceholder || sourceHasPlaceholder || storedHasPlaceholder)) {
          nextStored = `${nextStored || ''}\n\n<StatusPlaceHolderImpl/>`.trim();
          nextSource = `${nextSource || ''}\n\n<StatusPlaceHolderImpl/>`.trim();
        }
        if (nextStored === (baseStoredRaw || raw) && nextSource === (sourceText || raw)) return false;
        const nextDisplay = window.appBridge?.applyOutputDisplayRegex
          ? window.appBridge.applyOutputDisplayRegex(nextStored, { depth: 0 })
          : nextStored;
        const patch = { raw: nextStored, content: nextDisplay };
        if (sourceText) patch.rawSource = nextSource;
        const updatedFallback = chatStore.updateMessage(targetMessage.id, patch, targetSessionId);
        if (updatedFallback && isSessionActive(targetSessionId)) ui.updateMessage(targetMessage.id, updatedFallback);
      } catch (err) {
        logger.warn('edit-assistant-raw: update-variable fallback failed', err);
      }
      logger.info('[update-variable] apply function unavailable yet (fallback-strip-applied)');
      return false;
    };
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
        await removeTurnCheckpointsForMessages(sessionId, regenMessages, { prune: true }).catch(err => {
          logger.warn('remove turn checkpoints for regenerated messages failed', err);
        });
        refreshChatAndContacts();
      }
      chatStore.removeLastSummary?.(sessionId);
      if (getMemoryStorageMode() === 'table') {
        try {
          await restoreMemoryForActiveThread(sessionId, {
            refreshBaselineWhenNoTail: false,
            source: 'regenerate_from_user_index',
          });
        } catch (err) {
          logger.warn('restore memory after regenerate failed', err);
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
    if (action === 'reply') {
      const target = buildChatReplyTargetFromMessage(message, sessionId);
      if (!target) return;
      setReplyTargetForSession(sessionId, target);
      try {
        ui.inputEl?.focus?.();
      } catch {}
      return true;
    }
    if (action === 'jump-reply-target') {
      const targetId = String(payload?.targetId || message?.meta?.replyTo?.id || '').trim();
      if (!targetId) return true;
      const ok = await ensureMessageVisibleInCurrentChat(
        String(payload?.sessionId || sessionId || '').trim() || sessionId,
        targetId,
        String(payload?.keyword || '').trim(),
      );
      if (!ok) window.toastr?.warning?.('未找到被回复的消息');
      return true;
    }
    if (action === 'toggle-reaction') {
      const emoji = String(payload?.emoji || '').trim();
      if (!emoji) return true;
      const current = chatStore.findMessage(message.id, sessionId) || message;
      const baseMeta = current?.meta && typeof current.meta === 'object' ? { ...current.meta } : {};
      baseMeta.reactions = toggleReactionActor(baseMeta.reactions, emoji, SELF_REACTION_ACTOR);
      if (!baseMeta.reactions.length) delete baseMeta.reactions;
      else baseMeta.reactions = normalizeReactionEntries(baseMeta.reactions);
      const updated = chatStore.updateMessage(message.id, { meta: baseMeta }, sessionId);
      const finalMessage = updated || { ...current, meta: baseMeta };
      const [decorated] = decorateMessagesForDisplay([finalMessage], { sessionId });
      ui.updateMessage(message.id, decorated || finalMessage);
      refreshChatAndContacts({ immediate: true });
      return true;
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
      const currentReplyTarget = getReplyTargetForSession(sessionId);
      const removedMessages = ids
        .map(id => chatStore.findMessage(id, sessionId))
        .filter(Boolean);
      ids.forEach(id => {
        chatStore.deleteMessage(id, sessionId);
        ui.removeMessage(id);
      });
      if (currentReplyTarget?.id && ids.includes(currentReplyTarget.id)) clearReplyTargetForSession(sessionId);
      await removeTurnCheckpointsForMessages(sessionId, removedMessages, { prune: true }).catch(err => {
        logger.warn('remove turn checkpoints after delete-selected failed', err);
      });
      await restoreMemoryForActiveThread(sessionId, {
        refreshBaselineWhenNoTail: false,
        source: 'delete_selected',
      }).catch(err => {
        logger.warn('restore memory after delete-selected failed', err);
      });
      refreshChatAndContacts();
      return;
    }
    if (action === 'retract' && message.role === 'user') {
      const pending =
        activeGeneration && activeGeneration.sessionId === sessionId && activeGeneration.userMsgId === message.id;
      if (pending) {
        cancelActiveGeneration('retract');
      }
      const currentReplyTarget = getReplyTargetForSession(sessionId);
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      if (currentReplyTarget?.id === String(message.id || '')) clearReplyTargetForSession(sessionId);
      await restoreMemoryForActiveThread(sessionId, {
        refreshBaselineWhenNoTail: false,
        source: 'retract_user_message',
      }).catch(err => {
        logger.warn('restore memory after retract failed', err);
      });
      refreshChatAndContacts();
      return;
    }
    if (action === 'delete') {
      const currentReplyTarget = getReplyTargetForSession(sessionId);
      const removedMessage = chatStore.findMessage(message.id, sessionId) || message;
      chatStore.deleteMessage(message.id, sessionId);
      ui.removeMessage(message.id);
      if (currentReplyTarget?.id === String(message.id || '')) clearReplyTargetForSession(sessionId);
      await removeTurnCheckpointsForMessages(sessionId, [removedMessage], { prune: true }).catch(err => {
        logger.warn('remove turn checkpoint after delete failed', err);
      });
      await restoreMemoryForActiveThread(sessionId, {
        refreshBaselineWhenNoTail: false,
        source: 'delete_message',
      }).catch(err => {
        logger.warn('restore memory after delete failed', err);
      });
      refreshChatAndContacts();
      return;
    }
    if (action === 'edit-assistant-raw' && message.role === 'assistant') {
      const next = String(payload?.text ?? '');
      const regexEditMode = payload?.regexEditMode === true;
      const stripFn =
        (typeof stripUpdateVariableBlocks === 'function' && stripUpdateVariableBlocks) ||
        (typeof stripUpdateVariableBloacks === 'function' && stripUpdateVariableBloacks) ||
        (typeof stripupdatevariablebloacks === 'function' && stripupdatevariablebloacks) ||
        (text => String(text ?? ''));
      const cleanedForRender = stripFn(next);
      const hadUpdateVariableTag = /<\s*(update(?:variable)?|variableupdate)\b/i.test(next);
      if (hadUpdateVariableTag) {
        logger.info(
          `[edit-assistant-raw] strip-update-variable messageId=${String(message?.id || '')} rawLen=${next.length} cleanedLen=${cleanedForRender.length}`,
        );
      }
      const isCreativeAssistant =
        Boolean(message?.meta?.renderRich) || (sessionId && isRpSessionId(sessionId));
      let updater = null;

      if (isCreativeAssistant) {
        const rawSource = normalizeCreativeLineBreaks(cleanedForRender);
        const reasoningParsed = extractReasoningFromContent(rawSource, { depth: 0, strict: true });
        const finalSource = normalizeCreativeLineBreaks(reasoningParsed.content || '');
        let stored = finalSource;
        let display = finalSource;
        try {
          stored = normalizeCreativeLineBreaks(
            window.appBridge.applyOutputStoredRegex(finalSource, { isEdit: regexEditMode, depth: 0 }),
          );
          display = normalizeCreativeLineBreaks(
            window.appBridge.applyOutputDisplayRegex(stored, { isEdit: regexEditMode, depth: 0 }),
          );
        } catch {}
        const nextMeta =
          message?.meta && typeof message.meta === 'object' ? { ...message.meta, renderRich: true } : { renderRich: true };
        if (reasoningParsed.reasoning) {
          nextMeta.reasoning = reasoningParsed.reasoning;
          nextMeta.reasoningDisplay = reasoningParsed.reasoningDisplay;
        } else {
          delete nextMeta.reasoning;
          delete nextMeta.reasoningDisplay;
        }
        updater = {
          rawOriginal: next,
          rawSource: finalSource,
          raw: stored,
          type: 'text',
          content: display,
          meta: nextMeta,
        };
      } else {
        let stored = cleanedForRender;
        let display = cleanedForRender;
        try {
          stored = window.appBridge.applyOutputStoredRegex(cleanedForRender, { isEdit: regexEditMode, depth: 0 });
          display = window.appBridge.applyOutputDisplayRegex(stored, { isEdit: regexEditMode, depth: 0 });
        } catch {}
        const parsed = parseSpecialMessage(display);
        const nextMeta = message?.meta && typeof message.meta === 'object' ? { ...message.meta } : undefined;
        if (parsed?.meta && typeof parsed.meta === 'object') {
          updater = {
            rawOriginal: next,
            rawSource: cleanedForRender,
            raw: stored,
            ...parsed,
            meta: nextMeta ? { ...nextMeta, ...parsed.meta } : parsed.meta,
          };
        } else {
          updater = {
            rawOriginal: next,
            rawSource: cleanedForRender,
            raw: stored,
            ...parsed,
          };
        }
      }
      const updated = chatStore.updateMessage(message.id, updater, sessionId);
      if (updated) {
        let finalMessage = updated;
        try {
          const changed = applyUpdateVariableForMessageSafe(updated, sessionId);
          logger.info(
            `[edit-assistant-raw] update-variable messageId=${String(message?.id || '')} session=${String(sessionId || '')} changed=${changed ? 1 : 0}`,
          );
          finalMessage = chatStore.findMessage(message.id, sessionId) || finalMessage;
        } catch (err) {
          logger.warn('edit-assistant-raw: UpdateVariable parse failed', err);
        }
        ui.updateMessage(message.id, finalMessage);
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
          name: getActiveUserName(),
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
    applyMvuSchemaDefaults(chatStore.getCurrent(), { reason: 'worldbook' });
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
  window.addEventListener('open-session-config', () => sessionConfigPanel.show());
  window.addEventListener('preset-changed', async () => {
    try {
      await window.appBridge?.syncPresetRegexBindings?.();
    } catch {}
    scriptRuntime?.syncContext?.().catch(() => {});
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
      scriptRuntime?.syncContext?.({ sessionId: id }).catch(() => {});
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
      syncReplyTargetComposer(id);
      ui.setSessionLabel(id);
      applyMvuSchemaDefaults(id, { reason: 'session' });
      if (uiMode === 'rp') {
        refreshRpToolbar(id);
      }
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
  applyMvuSchemaDefaults(chatStore.getCurrent(), { reason: 'boot' });
  updateWorldIndicator();
  refreshChatAndContacts();
  applyUiModeUI();
  if (initialUiMode === 'rp') {
    uiMode = 'chat';
    persistUiMode();
    applyUiModeUI();
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
        const saved = await pickSavedUiState();
        const page = String(saved?.activePage || '').trim();
        const inChatRoom = Boolean(saved?.inChatRoom);
        if (page && pages[page]) switchPage(page);
        if (applyRestoredSessionShell(want) && inChatRoom) {
          // Preserve session/persona shell only; startup intentionally stays on main UI.
        }
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
      const msg = String(e?.message || err?.message || err || '');
      if (isIgnorableRuntimeNoise(msg)) return;
      uiLog('window.error', {
        msg,
        file: e?.filename,
        line: e?.lineno,
        col: e?.colno,
        stack: err?.stack || '',
      });
    });
    window.addEventListener('unhandledrejection', e => {
      const msg = String(e?.reason?.message || e?.reason || '');
      if (isIgnorableRuntimeNoise(msg)) return;
      uiLog('unhandledrejection', {
        reason: msg,
        stack: e?.reason?.stack || '',
      });
    });
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
    if (!isStickerAllowed()) {
      window.toastr?.info?.('RP界面不支持贴图');
      return;
    }
    const sessionId = chatStore.getCurrent();
    bumpStickerUsage(tag);
    const msg = {
      role: 'user',
      type: 'sticker',
      content: tag,
      name: getActiveUserName(),
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
      name: getActiveUserName(),
      avatar: avatars.user,
      time: formatNowTime(),
    };
    ui.addMessage(msg);
    chatStore.appendMessage(msg, sessionId);
  }

  function updateWorldIndicator() {
    const globalId = window.appBridge?.globalWorldId || '';
    const roleIds = window.appBridge?.getRoleWorldIds?.(chatStore.getCurrent?.()) || [];
    const currentIds = Array.isArray(window.appBridge?.currentWorldIds)
      ? window.appBridge.currentWorldIds
      : (window.appBridge?.currentWorldId ? [window.appBridge.currentWorldId] : []);
    const roleLabel = (() => {
      if (!Array.isArray(roleIds) || !roleIds.length) return '';
      if (roleIds.length <= 2) return roleIds.join(' + ');
      return `${roleIds[0]} + ${roleIds[1]} + ...`;
    })();
    const currentLabel = (() => {
      if (!currentIds.length) return '';
      if (currentIds.length <= 2) return currentIds.join(' + ');
      return `${currentIds[0]} + ${currentIds[1]} + ...`;
    })();
    const parts = [];
    if (globalId) parts.push(`全局:${globalId}`);
    if (roleLabel) parts.push(`角色:${roleLabel}`);
    if (currentLabel) parts.push(`会话:${currentLabel}`);
    const label = parts.length ? parts.join(' / ') : '未启用';
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
  let activeWallpaperLoaded = false;
  const WALLPAPER_IDLE_TIMEOUT_MS = 120000;
  let wallpaperIdleTimer = null;
  let lastWallpaperActivityAt = 0;

  const hasActiveWallpaper = () => {
    if (!activeWallpaperUrl || !activeWallpaperLoaded || !chatRoom) return false;
    const layer = chatRoom.querySelector('.chat-wallpaper-layer');
    if (!layer || layer.classList.contains('is-hidden')) return false;
    const img = layer.querySelector('.chat-wallpaper-image');
    if (!img) return false;
    if (!Number(img.naturalWidth || 0) || !Number(img.naturalHeight || 0)) return false;
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
    activeWallpaperLoaded = false;
    if (!url || !img) {
      layer?.classList.add('is-hidden');
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.removeAttribute('src');
      }
      scheduleWallpaperIdle();
      return;
    }
    layer?.classList.remove('is-hidden');
    if (img.src !== url) img.src = url;
    img.onload = () => {
      activeWallpaperLoaded = Number(img.naturalWidth || 0) > 0 && Number(img.naturalHeight || 0) > 0;
      if (activeWallpaperLoaded) applyWallpaperTransform(img, chatRoom, meta);
      scheduleWallpaperIdle();
    };
    img.onerror = () => {
      activeWallpaperLoaded = false;
      scheduleWallpaperIdle();
    };
    if (img.complete) {
      activeWallpaperLoaded = Number(img.naturalWidth || 0) > 0 && Number(img.naturalHeight || 0) > 0;
      if (activeWallpaperLoaded) applyWallpaperTransform(img, chatRoom, meta);
    }
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
  patchDebugUiRegistry((registry) => {
    registry.actions.openChatSettings = openChatSettings;
    registry.actions.closeChatSettings = closeChatSettings;
  });

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

  appRuntimeReady = true;
  logger.info('✅ Chat UI 初始化完成');

  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await themeManager.init();
    await initApp();
  })().catch(err => reportFatalError(err, 'App init failed'));
});
