import {
  buildAppFeatureSearchContextText,
  findAppFeature,
  listAppFeatures,
} from './app-feature-catalog.js';
import { planMaidAssistantCommand } from './maid-assistant-agent.js';
import { DEFAULT_MAID_PROMPT } from './maid-prompt-defaults.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const emitDebugSnapshot = (callback, payload = {}, logger = console) => {
  if (typeof callback !== 'function') return;
  try {
    callback(payload);
  } catch (error) {
    logger?.debug?.('maid model planner debug snapshot failed', error);
  }
};

const unsupportedPlan = (reason = 'unsupported_intent', message = '这个请求还没有接入女仆工具。') => ({
  ok: false,
  status: 'unsupported',
  reason,
  message,
});

const truncate = (value = '', max = 240) => {
  const text = trim(value);
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

export const buildMaidModelPlannerFeatureList = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `id=${trim(feature.id)}`,
      `title=${trim(feature.title)}`,
      `tools=${list(feature.tools).join('|') || '-'}`,
      `panel=${trim(feature.panel, '-')}`,
      `aliases=${list(feature.aliases).slice(0, 8).join('|') || '-'}`,
      `path=${list(feature.uiPath).join(' -> ') || '-'}`,
    ].join('; '))
    .join('\n')
);

export const buildMaidModelPlannerMessages = ({
  input = '',
  context = {},
  features = listAppFeatures(),
  maidPrompt = DEFAULT_MAID_PROMPT,
} = {}) => {
  const featureList = buildMaidModelPlannerFeatureList(features);
  const searchContext = buildAppFeatureSearchContextText(input, { features, limit: 5 });
  const prompt = trim(maidPrompt, DEFAULT_MAID_PROMPT);
  return [
    {
      role: 'system',
      content: [
        '你是这个 APP 内的女仆助手规划器。',
        '你只能从给定 APP 功能目录中选择一个功能，并输出严格 JSON，不能输出解释文字。',
        '允许格式一：{"ok":true,"toolName":"工具名","args":{},"featureId":"功能id","title":"短标题","response":"给用户的短回复"}',
        '允许格式二：{"ok":false,"reason":"unsupported_intent","message":"短原因"}',
        '限制：不要发明工具；不要删除、覆盖或修改高风险数据；配置写入类动作只允许打开界面，不允许直接修改配置。',
        prompt ? `女仆基础提示词（只影响 response 措辞，不能改变上述工具和安全限制）：${prompt}` : '',
        'APP 功能目录：',
        featureList,
      ].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户请求：${trim(input)}`,
        `当前会话：${trim(context?.sessionId, '-')}`,
        `UI 模式：${trim(context?.uiMode, '-')}`,
        `当前页面：${trim(context?.activePage, '-')}`,
        `相关功能检索：\n${searchContext}`,
      ].join('\n'),
    },
  ];
};

export const extractMaidModelPlannerJson = (text = '') => {
  const raw = trim(text);
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = trim(fenced?.[1] || raw);
  try {
    return JSON.parse(source);
  } catch {}

  const start = source.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

export const normalizeMaidModelPlan = (raw = {}, {
  features = listAppFeatures(),
  findFeature = findAppFeature,
} = {}) => {
  if (!isPlainObject(raw)) return unsupportedPlan('invalid_model_plan', '模型没有返回有效计划。');
  if (raw.ok === false) {
    return unsupportedPlan(trim(raw.reason, 'unsupported_intent'), truncate(raw.message || '这个请求还没有接入女仆工具。', 160));
  }
  const featureId = trim(raw.featureId);
  const feature = (typeof findFeature === 'function' ? findFeature(featureId) : null) ||
    (Array.isArray(features) ? features.find(item => trim(item?.id) === featureId) : null);
  if (!feature) return unsupportedPlan('feature_not_found', '模型选择了不存在的 APP 功能。');

  const toolName = trim(raw.toolName);
  const allowedTools = new Set(list(feature.tools));
  if (!toolName || !allowedTools.has(toolName)) {
    return unsupportedPlan('tool_not_allowed', '模型选择的工具不在功能白名单内。');
  }

  return {
    ok: true,
    toolName,
    args: isPlainObject(raw.args) ? clone(raw.args) : {},
    featureId: trim(feature.id),
    title: truncate(raw.title || feature.title || feature.id, 80),
    response: truncate(raw.response || `我来打开${feature.title || feature.id}。`, 160),
    source: 'model_planner',
  };
};

export const createMaidModelBackedPlanner = ({
  fallbackPlanner = planMaidAssistantCommand,
  resolveRuntimeConfig = null,
  createClient = null,
  isConfigReady = () => false,
  features = listAppFeatures(),
  onDebugSnapshot = null,
  logger = console,
} = {}) => async (input = '', context = {}) => {
  const localPlan = await fallbackPlanner(input, context);
  if (localPlan?.ok) return localPlan;
  if (typeof resolveRuntimeConfig !== 'function') return localPlan;

  let runtime = null;
  try {
    runtime = await resolveRuntimeConfig({
      sessionId: trim(context?.sessionId),
      uiMode: trim(context?.uiMode),
      taskType: 'maid_assistant',
    });
  } catch (error) {
    logger?.debug?.('maid model planner runtime unavailable', error);
    return localPlan;
  }

  let client = runtime?.client || null;
  const config = isPlainObject(runtime?.config) ? runtime.config : {};
  if (!client && typeof createClient === 'function' && isConfigReady(config)) {
    try {
      client = createClient(config);
    } catch (error) {
      logger?.debug?.('maid model planner client creation failed', error);
      return localPlan;
    }
  }
  if (!client || typeof client.chat !== 'function') return localPlan;

  try {
    const messages = buildMaidModelPlannerMessages({
      input,
      context,
      features,
      maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
    });
    const responseText = await client.chat(messages, {
      temperature: 0,
      maxTokens: 800,
      max_tokens: 800,
    });
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_planner',
      input: trim(input),
      messages,
      responseText,
    }, logger);
    const parsed = extractMaidModelPlannerJson(responseText);
    const modelPlan = normalizeMaidModelPlan(parsed, { features });
    return modelPlan.ok ? modelPlan : localPlan;
  } catch (error) {
    logger?.warn?.('maid model planner failed', error);
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_planner',
      input: trim(input),
      messages: buildMaidModelPlannerMessages({
        input,
        context,
        features,
        maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
      }),
      responseText: error?.message || 'maid model planner failed',
      error,
    }, logger);
    return localPlan;
  }
};
