import { DEFAULT_MAID_PROMPT } from './maid-prompt-defaults.js';
import { buildAppFeatureSearchContextText, listAppFeatures } from './app-feature-catalog.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const emitDebugSnapshot = (callback, payload = {}, logger = console) => {
  if (typeof callback !== 'function') return;
  try {
    callback(payload);
  } catch (error) {
    logger?.debug?.('maid chat responder debug snapshot failed', error);
  }
};

export const buildMaidChatResponderMessages = ({
  input = '',
  context = {},
  features = listAppFeatures(),
  maidPrompt = DEFAULT_MAID_PROMPT,
} = {}) => {
  const appContext = buildAppFeatureSearchContextText(input, { features, limit: 5 });
  return [
    {
      role: 'system',
      content: trim(maidPrompt, DEFAULT_MAID_PROMPT),
    },
    {
      role: 'user',
      content: [
        `用户输入：${trim(input)}`,
        `当前会话：${trim(context?.sessionId, '-')}`,
        `UI 模式：${trim(context?.uiMode, '-')}`,
        `当前页面：${trim(context?.activePage, '-')}`,
        `APP 相关讯息：\n${appContext}`,
      ].join('\n'),
    },
  ];
};

export const createMaidChatResponder = ({
  resolveRuntimeConfig = null,
  createClient = null,
  isConfigReady = () => false,
  onDebugSnapshot = null,
  logger = console,
} = {}) => async (input = '', context = {}) => {
  const text = trim(input);
  if (!text) {
    return {
      ok: false,
      status: 'empty',
      reason: 'empty_input',
      message: '请输入想和女仆说的话。',
    };
  }
  if (typeof resolveRuntimeConfig !== 'function') {
    return {
      ok: false,
      status: 'unavailable',
      reason: 'maid_runtime_unavailable',
      message: '女仆还没有可用的 API 配置。',
    };
  }

  let runtime = null;
  try {
    runtime = await resolveRuntimeConfig({
      sessionId: trim(context?.sessionId),
      uiMode: trim(context?.uiMode),
      taskType: 'maid_chat',
    });
  } catch (error) {
    logger?.warn?.('maid chat responder runtime unavailable', error);
    return {
      ok: false,
      status: 'failed',
      reason: error?.message || 'maid_runtime_error',
      message: '女仆暂时无法连接 API。',
      error,
    };
  }

  let client = runtime?.client || null;
  const config = isPlainObject(runtime?.config) ? runtime.config : {};
  if (!client && typeof createClient === 'function' && isConfigReady(config)) {
    try {
      client = createClient(config);
    } catch (error) {
      logger?.warn?.('maid chat responder client creation failed', error);
      return {
        ok: false,
        status: 'failed',
        reason: error?.message || 'maid_client_error',
        message: '女仆暂时无法建立 API 连接。',
        error,
      };
    }
  }
  if (!client || typeof client.chat !== 'function') {
    return {
      ok: false,
      status: 'unavailable',
      reason: runtime?.reason || 'maid_api_not_configured',
      message: '请先为女仆绑定可用的 API 配置。',
    };
  }

  try {
    const messages = buildMaidChatResponderMessages({
      input: text,
      context,
      maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
    });
    const responseText = await client.chat(messages, {
      temperature: 0.7,
      maxTokens: 500,
      max_tokens: 500,
    });
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_chat_responder',
      input: text,
      messages,
      responseText,
    }, logger);
    return {
      ok: true,
      status: 'responded',
      source: 'maid_chat_responder',
      input: text,
      message: trim(responseText, '我在的。'),
    };
  } catch (error) {
    logger?.warn?.('maid chat responder failed', error);
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_chat_responder',
      input: text,
      messages: buildMaidChatResponderMessages({
        input: text,
        context,
        maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
      }),
      responseText: error?.message || '女仆暂时无法回复。',
      error,
    }, logger);
    return {
      ok: false,
      status: 'failed',
      reason: error?.message || 'maid_chat_failed',
      message: error?.message || '女仆暂时无法回复。',
      error,
    };
  }
};
