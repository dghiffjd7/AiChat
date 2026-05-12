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
  reasoningAutoParse: false,
  reasoningAutoExpand: false,
  reasoningShowHidden: false,
  reasoningAddToPrompts: false,
  reasoningMaxAdditions: 1,
  personaBindContacts: true,
  promptCurrentTimeEnabled: false,
  autoImagePromptEnabled: false,
  autoImagePromptStyle: 'auto',
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
  memoryAutoExtract: true,
  memoryAutoExtractMode: 'inline',
  memoryUpdateApiMode: 'chat',
  memoryUpdateProfileId: '',
  memoryUpdateContextRounds: 6,
  memoryInjectPosition: 'history_after',
  memoryInjectDepth: 0,
  memoryBridgeRpToChatEnabled: true,
  memoryBridgeRpToChatLimit: 0,
  memoryBridgeChatToRpEnabled: true,
  memoryBridgeChatToRpLimit: 5,
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
};

const readSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeSettings = (next) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
};

const migrateSettings = (settings = {}) => {
  const next = { ...(settings || {}) };
  if (next.memoryUpdateContextRounds == null && next.memoryUpdateContextCount != null) {
    const raw = Math.trunc(Number(next.memoryUpdateContextCount));
    const safe = Number.isFinite(raw) ? Math.max(0, raw) : defaults.memoryUpdateContextRounds;
    next.memoryUpdateContextRounds = safe;
  }
  const injectPositionRaw = String(next.memoryInjectPosition || '').trim().toLowerCase();
  if (!injectPositionRaw || injectPositionRaw === 'template') {
    next.memoryInjectPosition = defaults.memoryInjectPosition;
  } else if (injectPositionRaw === 'history_depth') {
    const injectDepthRaw = Math.trunc(Number(next.memoryInjectDepth));
    const injectDepth = Number.isFinite(injectDepthRaw) ? Math.max(0, injectDepthRaw) : defaults.memoryInjectDepth;
    if (injectDepth === 0) next.memoryInjectPosition = 'history_after';
  }
  const injectDepthRaw = Math.trunc(Number(next.memoryInjectDepth));
  if (!Number.isFinite(injectDepthRaw) || injectDepthRaw < 0) {
    next.memoryInjectDepth = defaults.memoryInjectDepth;
  }
  if (next.uiThemeSchemaVersion == null) {
    if (String(next.uiThemeAvatarStyle || '').trim().toLowerCase() === 'rounded') {
      next.uiThemeAvatarStyle = 'system';
    }
    next.uiThemeSchemaVersion = defaults.uiThemeSchemaVersion;
  }
  next.chatDefaultColorMode = inferChatColorMode(next, defaults.chatDefaultColorMode);
  return next;
};

export const appSettings = {
  get() {
    return { ...defaults, ...migrateSettings(readSettings()) };
  },
  getStored() {
    return migrateSettings(readSettings());
  },
  update(patch = {}) {
    const next = { ...defaults, ...migrateSettings(readSettings()), ...patch };
    writeSettings(next);
    return next;
  },
};
