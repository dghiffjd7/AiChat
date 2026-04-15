const SETTINGS_KEY = 'app_settings_v1';

const defaults = {
  showDebugToggle: false,
  debugExecutionLogs: false,
  typingDotsEnabled: true,
  allowRichIframeScripts: false,
  creativeHistoryMax: 3,
  creativeWideBubble: true,
  reasoningAutoParse: false,
  reasoningAutoExpand: false,
  reasoningShowHidden: false,
  reasoningAddToPrompts: false,
  reasoningMaxAdditions: 1,
  personaBindContacts: true,
  promptCurrentTimeEnabled: false,
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
  memoryInjectPosition: 'template',
  memoryInjectDepth: 4,
  memoryBridgeRpToChatEnabled: true,
  memoryBridgeRpToChatLimit: 0,
  memoryBridgeChatToRpEnabled: true,
  memoryBridgeChatToRpLimit: 5,
  memoryAutoConfirm: false,
  memoryAutoStepByStep: false,
  chatDefaultBubbleColor: '#c9c9c9',
  chatDefaultTextColor: '#1F2937',
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
  return next;
};

export const appSettings = {
  get() {
    return { ...defaults, ...migrateSettings(readSettings()) };
  },
  update(patch = {}) {
    const next = { ...defaults, ...migrateSettings(readSettings()), ...patch };
    writeSettings(next);
    return next;
  },
};
