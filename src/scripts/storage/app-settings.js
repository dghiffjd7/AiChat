const SETTINGS_KEY = 'app_settings_v1';
const LEGACY_LIGHT_CHAT_DEFAULTS = Object.freeze({
  bubbleColor: '#c9c9c9',
  textColor: '#1F2937',
});
const LEGACY_DARK_CHAT_DEFAULTS = Object.freeze({
  bubbleColor: '#000000',
  textColor: '#ffffff',
});

const normalizeChatColorMode = (value, fallback = 'theme') => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'custom' ? 'custom' : fallback;
};

const isThemeManagedChatDefaultColor = (value, kind = 'bubble') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;
  return kind === 'text'
    ? raw === LEGACY_LIGHT_CHAT_DEFAULTS.textColor.toLowerCase()
      || raw === LEGACY_DARK_CHAT_DEFAULTS.textColor.toLowerCase()
    : raw === LEGACY_LIGHT_CHAT_DEFAULTS.bubbleColor.toLowerCase()
      || raw === LEGACY_DARK_CHAT_DEFAULTS.bubbleColor.toLowerCase();
};

const inferChatColorMode = (input = {}, fallback = 'theme') => {
  const explicit = String(input?.chatDefaultColorMode || '').trim().toLowerCase();
  if (explicit === 'custom' || explicit === 'theme') return explicit;
  const bubble = String(input?.chatDefaultBubbleColor || '').trim();
  const text = String(input?.chatDefaultTextColor || '').trim();
  if (!bubble && !text) return fallback;
  return isThemeManagedChatDefaultColor(bubble, 'bubble') && isThemeManagedChatDefaultColor(text, 'text')
    ? 'theme'
    : 'custom';
};

const defaults = {
  showDebugToggle: false,
  debugExecutionLogs: false,
  typingDotsEnabled: true,
  allowRichIframeScripts: false,
  chatHistoryMax: 0,
  creativeHistoryMax: 0,
  creativeWideBubble: true,
  creativeReadingSize: 'standard',
  creativeNarrativeFont: 'serif',
  reasoningAutoParse: false,
  reasoningAutoExpand: false,
  reasoningShowHidden: false,
  reasoningAddToPrompts: false,
  reasoningMaxAdditions: 1,
  personaBindContacts: true,
  promptCurrentTimeEnabled: false,
  momentCommentSideEffectsEnabled: true,
  autoImagePromptEnabled: false,
  autoImagePromptWritingEnabled: true,
  autoImagePromptStyle: 'auto',
  autoImagePromptDecisionMode: 'conservative',
  autoImagePromptMomentMediaMode: 'ai',
  autoImagePromptCooldownRounds: 0,
  autoImagePromptWindowRounds: 0,
  autoImagePromptWindowMax: 0,
  autoImagePromptMaxConcurrency: 1,
  autoImagePromptMaxPerResponse: 0,
  autoImagePromptConcurrencyDefaultMigrated: true,
  autoImagePromptSkipRepeated: true,
  autoImagePromptRateLimitDefaultsMigrated: true,
  templateEnabled: false,
  templateExecuteBeforeGenerate: true,
  templateExecuteAfterRender: true,
  templateShowErrorToast: true,
  templateDetectDisabled: false,
  scriptEnabled: false,
  scriptAllowModifyVariables: true,
  scriptAllowReadMessages: true,
  scriptAllowNetwork: false,
  memoryEnabled: true,
  memoryStorageMode: 'table',
  memoryTableEnabledChat: true,
  memoryTableEnabledMoments: true,
  memoryTableEnabledWriting: true,
  memoryAutoExtract: true,
  memoryAutoExtractMode: 'inline',
  memoryInjectDefaultD0Migrated: true,
  memoryInjectDefaultLatestUserMigrated: true,
  memoryUpdateApiMode: 'chat',
  memoryUpdateProfileId: '',
  memoryUpdateContextRounds: 6,
  memoryInjectPosition: 'before_latest_user',
  memoryInjectDepth: 0,
  memoryBridgeRpToChatEnabled: true,
  memoryBridgeRpToChatLimit: 0,
  memoryBridgeChatToRpEnabled: true,
  memoryBridgeChatToRpLimit: 5,
  memoryBridgeMomentsToChatEnabled: true,
  memoryBridgeMomentsToChatLimit: 5,
  memoryBridgeMomentsToChatTableSettings: {},
  memoryBridgeChatToMomentsEnabled: true,
  memoryBridgeChatToMomentsLimit: 5,
  memoryBridgeChatToMomentsTableSettings: {},
  memoryBridgeRpToMomentsEnabled: true,
  memoryBridgeRpToMomentsLimit: 5,
  memoryBridgeRpToMomentsTableSettings: {},
  memoryAutoConfirm: false,
  memoryAutoStepByStep: false,
  memoryFillEveryN: 1,
  chatDefaultColorMode: 'theme',
  chatDefaultBubbleColor: '#c9c9c9',
  chatDefaultTextColor: '#1F2937',
  uiThemePresetId: 'classic-dark',
  uiThemeAvatarStyle: 'system',
  uiThemeChatDisplay: 'default',
  uiThemeToastrPosition: 'toast-top-right',
  uiThemeFontScale: 1,
  uiThemeReducedMotion: false,
  uiThemeCompactInput: false,
  uiThemeHideChatAvatars: false,
  uiThemeSchemaVersion: 2,
  webSearchProvider: 'duckduckgo',
  webSearchLocale: 'zh-tw',
  webSearchApiKey: '',
};

// localStorage 配额满时 setItem 会静默失败（真机已发生）；kv（Tauri 本地文件）为权威通道，
// localStorage 仅作同步读缓存。会话内以内存态为准，跨启动由 hydrate 以 __updatedAt 裁决新旧。
let memorySettings = null;
let kvChannel = null;

const readLocalSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const readSettings = () => {
  if (memorySettings) return memorySettings;
  return readLocalSettings();
};

const writeSettings = (next) => {
  const stamped = { ...next, __updatedAt: Date.now() };
  memorySettings = stamped;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(stamped));
  } catch {}
  if (kvChannel?.save) {
    Promise.resolve(kvChannel.save(SETTINGS_KEY, stamped)).catch(() => {});
  }
};

const migrateSettings = (settings = {}) => {
  const next = { ...(settings || {}) };
  if (next.memoryUpdateContextRounds == null && next.memoryUpdateContextCount != null) {
    const raw = Math.trunc(Number(next.memoryUpdateContextCount));
    const safe = Number.isFinite(raw) ? Math.max(0, raw) : defaults.memoryUpdateContextRounds;
    next.memoryUpdateContextRounds = safe;
  }
  const injectPositionRaw = String(next.memoryInjectPosition || '').trim().toLowerCase();
  if (!injectPositionRaw) {
    next.memoryInjectPosition = defaults.memoryInjectPosition;
  } else if (injectPositionRaw === 'history_depth') {
    const injectDepthRaw = Math.trunc(Number(next.memoryInjectDepth));
    if (!Number.isFinite(injectDepthRaw)) next.memoryInjectDepth = defaults.memoryInjectDepth;
  }
  const injectDepthRaw = Math.trunc(Number(next.memoryInjectDepth));
  if (!Number.isFinite(injectDepthRaw) || injectDepthRaw < 0) {
    next.memoryInjectDepth = defaults.memoryInjectDepth;
  }
  if (
    next.memoryInjectDefaultD0Migrated !== true &&
    String(next.memoryInjectPosition || '').trim().toLowerCase() === 'history_after' &&
    Number(next.memoryInjectDepth || 0) === 0
  ) {
    next.memoryInjectPosition = 'history_depth';
    next.memoryInjectDepth = 0;
  }
  next.memoryInjectDefaultD0Migrated = true;
  if (
    next.memoryInjectDefaultLatestUserMigrated !== true &&
    String(next.memoryInjectPosition || '').trim().toLowerCase() === 'history_depth' &&
    Number(next.memoryInjectDepth || 0) === 0
  ) {
    next.memoryInjectPosition = 'before_latest_user';
    next.memoryInjectDepth = 0;
  }
  next.memoryInjectDefaultLatestUserMigrated = true;
  if (next.uiThemeSchemaVersion == null) {
    if (String(next.uiThemeAvatarStyle || '').trim().toLowerCase() === 'rounded') {
      next.uiThemeAvatarStyle = 'system';
    }
    next.uiThemeSchemaVersion = defaults.uiThemeSchemaVersion;
  }
  const imageDecisionMode = String(next.autoImagePromptDecisionMode || '').trim().toLowerCase();
  if (!['conservative', 'standard', 'aggressive'].includes(imageDecisionMode)) {
    next.autoImagePromptDecisionMode = defaults.autoImagePromptDecisionMode;
  }
  const imageMomentMediaMode = String(next.autoImagePromptMomentMediaMode || '').trim().toLowerCase();
  if (!['placeholder', 'image_prompt', 'ai'].includes(imageMomentMediaMode)) {
    next.autoImagePromptMomentMediaMode = defaults.autoImagePromptMomentMediaMode;
  }
  ['autoImagePromptCooldownRounds', 'autoImagePromptWindowRounds', 'autoImagePromptWindowMax', 'autoImagePromptMaxPerResponse'].forEach((key) => {
    const raw = Math.trunc(Number(next[key]));
    next[key] = Number.isFinite(raw) ? Math.max(0, raw) : defaults[key];
  });
  if (
    next.autoImagePromptConcurrencyDefaultMigrated !== true &&
    Number(next.autoImagePromptMaxConcurrency) === 5
  ) {
    next.autoImagePromptMaxConcurrency = defaults.autoImagePromptMaxConcurrency;
  }
  next.autoImagePromptConcurrencyDefaultMigrated = true;
  const imageMaxConcurrency = Math.trunc(Number(next.autoImagePromptMaxConcurrency));
  next.autoImagePromptMaxConcurrency = Number.isFinite(imageMaxConcurrency)
    ? Math.max(1, imageMaxConcurrency)
    : defaults.autoImagePromptMaxConcurrency;
  if (
    next.autoImagePromptRateLimitDefaultsMigrated !== true &&
    Number(next.autoImagePromptCooldownRounds) === 2 &&
    Number(next.autoImagePromptWindowRounds) === 10 &&
    Number(next.autoImagePromptWindowMax) === 2
  ) {
    next.autoImagePromptCooldownRounds = 0;
    next.autoImagePromptWindowRounds = 0;
    next.autoImagePromptWindowMax = 0;
  }
  next.autoImagePromptRateLimitDefaultsMigrated = true;
  next.autoImagePromptSkipRepeated = next.autoImagePromptSkipRepeated !== false;
  next.autoImagePromptWritingEnabled = next.autoImagePromptWritingEnabled !== false;
  next.momentCommentSideEffectsEnabled = next.momentCommentSideEffectsEnabled !== false;
  next.memoryTableEnabledChat = next.memoryTableEnabledChat !== false;
  // 注入整合语义澄清（2026-07-16）：注入选择条只管预览展示，不动功能开关；
  // 一次性回滚此前 presetInjectMemoryChatDefaultOffMigrated 对聊天位的默认关闭
  if (next.presetInjectMemoryChatDefaultOffMigrated === true && next.presetInjectMemoryChatOffRolledBack !== true) {
    next.memoryTableEnabledChat = true;
  }
  next.presetInjectMemoryChatOffRolledBack = true;
  next.memoryTableEnabledMoments = next.memoryTableEnabledMoments !== false;
  next.memoryTableEnabledWriting = next.memoryTableEnabledWriting !== false;
  next.memoryBridgeMomentsToChatEnabled = next.memoryBridgeMomentsToChatEnabled !== false;
  next.memoryBridgeChatToMomentsEnabled = next.memoryBridgeChatToMomentsEnabled !== false;
  next.memoryBridgeRpToMomentsEnabled = next.memoryBridgeRpToMomentsEnabled !== false;
  ['memoryBridgeMomentsToChatLimit', 'memoryBridgeChatToMomentsLimit', 'memoryBridgeRpToMomentsLimit'].forEach((key) => {
    const raw = Math.trunc(Number(next[key]));
    next[key] = Number.isFinite(raw) ? Math.max(0, raw) : defaults[key];
  });
  ['memoryBridgeMomentsToChatTableSettings', 'memoryBridgeChatToMomentsTableSettings', 'memoryBridgeRpToMomentsTableSettings'].forEach((key) => {
    if (!next[key] || typeof next[key] !== 'object' || Array.isArray(next[key])) next[key] = {};
  });
  next.chatDefaultColorMode = inferChatColorMode(next, defaults.chatDefaultColorMode);
  const searchProvider = String(next.webSearchProvider || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  next.webSearchProvider = ['duckduckgo', 'brave', 'tavily', 'serpapi', 'bing'].includes(searchProvider)
    ? searchProvider
    : defaults.webSearchProvider;
  next.webSearchLocale = String(next.webSearchLocale || defaults.webSearchLocale).trim() || defaults.webSearchLocale;
  next.webSearchApiKey = String(next.webSearchApiKey || '');
  return next;
};

export const appSettings = {
  // boot 早期调用：注入 kv 通道并用较新的一侧（__updatedAt）作为权威。
  async hydrate({ loadKv = null, saveKv = null } = {}) {
    kvChannel = { load: loadKv, save: saveKv };
    if (typeof loadKv !== 'function') return this.get();
    try {
      const kvRaw = await loadKv(SETTINGS_KEY);
      const kvData = kvRaw && typeof kvRaw === 'object' && !kvRaw._tooLarge ? kvRaw : null;
      if (kvData && Object.keys(kvData).length) {
        const localData = readLocalSettings();
        memorySettings = Number(kvData.__updatedAt || 0) >= Number(localData.__updatedAt || 0)
          ? kvData
          : localData;
      }
    } catch {}
    return this.get();
  },
  get() {
    const { __updatedAt: _stamp, ...settings } = { ...defaults, ...migrateSettings(readSettings()) };
    return settings;
  },
  getStored() {
    const { __updatedAt: _stamp, ...settings } = migrateSettings(readSettings());
    return settings;
  },
  update(patch = {}) {
    const next = { ...defaults, ...migrateSettings(readSettings()), ...patch };
    delete next.__updatedAt;
    writeSettings(next);
    return next;
  },
};
