import { buildScriptAuthorizationMessage } from '../script-authorization-utils.js';
import {
  containsTemplateSyntax,
  hasTemplateInMessages,
} from './template-detection-utils.js';

const isPromptedSession = (promptedSessions, sessionId) =>
  Boolean(promptedSessions?.has?.(sessionId));

const markPromptedSession = (promptedSessions, sessionId) => {
  promptedSessions?.add?.(sessionId);
};

export const maybePromptTemplateEnable = async ({
  skipTemplate = false,
  settingsStore = null,
  promptedSessions = null,
  sessionId = '',
  sampleText = '',
  fallbackText = '',
  buildMessages = null,
  llmContext = null,
  promptChoice = null,
} = {}) => {
  if (skipTemplate) return false;
  if (!settingsStore?.get || !settingsStore?.update || typeof promptChoice !== 'function') return false;

  const settings = settingsStore.get();
  if (settings.templateEnabled !== false) return false;
  if (settings.templateDetectDisabled === true) return false;
  if (isPromptedSession(promptedSessions, sessionId)) return false;

  const previewSource = sampleText || fallbackText;
  let detected = containsTemplateSyntax(sampleText);
  if (!detected && typeof buildMessages === 'function') {
    try {
      const preview = buildMessages(
        previewSource,
        typeof llmContext === 'function' ? llmContext(previewSource) : undefined,
      );
      detected = hasTemplateInMessages(preview);
    } catch {}
  }
  if (!detected) return false;

  markPromptedSession(promptedSessions, sessionId);
  const choice = await promptChoice({
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
    settingsStore.update({ templateEnabled: true });
  } else if (choice === 'never') {
    settingsStore.update({ templateDetectDisabled: true });
  }
  return true;
};

export const maybePromptScriptAuthorization = async ({
  skipScripts = false,
  scriptStore = null,
  scriptRuntime = null,
  promptedSessions = null,
  sessionId = '',
  personaId = '',
  settingsStore = null,
  promptChoice = null,
} = {}) => {
  if (skipScripts) return false;
  if (!scriptStore || !settingsStore?.get || !settingsStore?.update || typeof promptChoice !== 'function') {
    return false;
  }
  if (isPromptedSession(promptedSessions, sessionId)) return false;

  const nextPersonaId = String(personaId || '').trim();
  if (!nextPersonaId) return false;

  const scripts = scriptStore
    .getScripts('character', nextPersonaId)
    .filter(script => script && script.authorized !== true);
  if (!scripts.length) return false;

  markPromptedSession(promptedSessions, sessionId);
  const settings = settingsStore.get();
  const choice = await promptChoice({
    title: '脚本授权',
    message: buildScriptAuthorizationMessage({
      leadText: `检测到此角色卡包含 ${scripts.length} 条脚本。`,
      settings,
    }),
    actions: [
      { id: 'allow', label: '允许并启用', primary: true },
      { id: 'once', label: '仅本次允许' },
      { id: 'deny', label: '拒绝', variant: 'danger' },
    ],
    defaultActionId: 'allow',
  });

  if (choice === 'allow') {
    if (settings.scriptEnabled !== true) settingsStore.update({ scriptEnabled: true });
    await Promise.all(
      scripts.map(script => scriptStore.toggleScript('character', nextPersonaId, script.id, true)),
    );
    await scriptRuntime?.syncScripts?.({ sessionId });
  } else if (choice === 'once') {
    scriptRuntime?.allowOnce?.(sessionId, scripts.map(script => script.id));
  }

  return true;
};
