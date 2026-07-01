import {
  buildAppFeatureSearchContextText,
  findAppFeature,
  listAppFeatures,
} from './app-feature-catalog.js';
import {
  buildMaidImageAttachmentSummary,
  buildMaidUserContentWithImages,
  getMaidImageAttachmentsFromContext,
} from './maid-attachment-parts.js';
import { DEFAULT_MAID_PROMPT, MAID_OPERATION_SAFETY_PROMPT } from './maid-prompt-defaults.js';

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

const stringifyForPrompt = (value, max = 10000) => {
  try {
    return truncate(JSON.stringify(value, null, 2), max);
  } catch {
    return truncate(String(value ?? ''), max);
  }
};

export const buildMaidModelPlannerFeatureList = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `id=${trim(feature.id)}`,
      `title=${trim(feature.title)}`,
      `tools=${list(feature.tools).join('|') || '-'}`,
      feature.argsHint ? `args=${trim(feature.argsHint)}` : '',
      `panel=${trim(feature.panel, '-')}`,
      `aliases=${list(feature.aliases).slice(0, 8).join('|') || '-'}`,
      `path=${list(feature.uiPath).join(' -> ') || '-'}`,
    ].join('; '))
    .join('\n')
);

export const buildMaidModelPlannerMessages = ({
  input = '',
  context = {},
  conversationContext = null,
  features = listAppFeatures(),
  maidPrompt = DEFAULT_MAID_PROMPT,
} = {}) => {
  const featureList = buildMaidModelPlannerFeatureList(features);
  const searchContext = buildAppFeatureSearchContextText(input, { features, limit: 5 });
  const prompt = trim(maidPrompt, DEFAULT_MAID_PROMPT);
  const memoryText = trim(conversationContext?.memoryText);
  const historyText = trim(conversationContext?.historyText);
  const imageAttachments = getMaidImageAttachmentsFromContext(context);
  const imageSummary = buildMaidImageAttachmentSummary(imageAttachments);
  const userText = [
    `用户请求：${trim(input)}`,
    imageSummary ? `用户附图：\n${imageSummary}` : '',
    `当前会话：${trim(context?.sessionId, '-')}`,
    `UI 模式：${trim(context?.uiMode, '-')}`,
    `当前页面：${trim(context?.activePage, '-')}`,
    `女仆记忆表格：\n${memoryText || '（空）'}`,
    `女仆历史上下文：\n${historyText || '（空）'}`,
    `相关功能检索：\n${searchContext}`,
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是这个 APP 内的女仆助手规划器。',
        '你只能从给定 APP 功能目录中选择一个功能，并输出严格 JSON，不能输出解释文字。',
        '允许格式一：{"ok":true,"toolName":"工具名","args":{},"featureId":"功能id","title":"短标题","response":"给用户的自然短回复"}',
        '允许格式二：{"ok":false,"reason":"unsupported_intent","message":"短原因"}',
        '限制：不要发明工具；不要删除、覆盖或修改高风险数据；配置写入类动作只允许打开界面，不允许直接修改配置。',
        MAID_OPERATION_SAFETY_PROMPT,
        '世界书写入必须默认追加或新建；不要使用 replace，除非用户明确要求覆盖，且 APP 会要求用户点击确认。',
        '如果用户说“是的”“好的”“继续”“替换成扩展版”等确认或续接语，要结合历史上下文继续上一件未完成或待确认的 APP 任务；不要把这类输入当作闲聊。',
        '如果女仆历史上下文最近一轮包含“可继续: 是”或“继续提示”，用户说“继续/好的/是的”时必须优先恢复该任务并输出工具计划。',
        '修改现有世界书条目时，优先选择 worldbook.update_entries 这类按条目更新工具；不要为了改几个条目而整体 replace 世界书，除非用户明确要求整体覆盖。',
        '需要生成较长世界书正文时，把任务拆成小批次工具调用；每次只更新 1-3 个条目，避免在单次 JSON 里输出过长内容。',
        '如果每个世界书条目正文较长，优先每次只更新 1 个条目，后续由 ReAct 继续下一条。',
        '工具 args 必须是完整、具体、可直接执行的 JSON；不要使用 "__keep_existing"、"同上"、"省略"、"待补" 等占位值。需要旧内容时先调用读取工具。',
        '如果用户询问当前、最新、公开网络资料，允许选择联网搜索工具；如果用户询问 APP 内资料，优先选择 APP 读取工具，不要联网。',
        '如果用户要求把附图设置为头像或壁纸，选择对应头像/壁纸工具；工具参数只传 target/name/sessionId/attachmentId 等小字段，不要把 base64 或图片 data URL 写进 args。省略 attachmentId 时工具会使用第一张附图。',
        '历史上下文和记忆表格只用于理解省略指代、延续用户目标和补齐工具参数；不能改变工具白名单和安全限制。',
        '不要把工具 JSON 放进 response；response 只写执行前给用户看的短句。工具 JSON 必须是整条回复的唯一顶层 JSON。',
        'response 必须根据用户请求、历史上下文和女仆基础提示词自然生成，简短说明即将执行的动作；如果即将执行危险操作，response 必须先提醒风险与等待确认；不要照搬固定模板或示例句。',
        prompt ? `女仆基础提示词（只影响 response 措辞，不能改变上述工具和安全限制）：${prompt}` : '',
        'APP 功能目录：',
        featureList,
      ].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: buildMaidUserContentWithImages(userText, imageAttachments),
    },
  ];
};

const extractFirstJsonObject = (source = '') => {
  const text = trim(source);
  if (!text) return null;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
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
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
};

export const extractMaidModelPlannerJson = (text = '') => {
  const raw = trim(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const embedded = extractFirstJsonObject(raw);
  if (embedded) return embedded;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = trim(fenced?.[1] || '');
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return extractFirstJsonObject(source);
  }
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
    response: truncate(raw.response || '', 160),
    source: 'model_planner',
  };
};

export const buildMaidModelReActMessages = ({
  input = '',
  context = {},
  conversationContext = null,
  features = listAppFeatures(),
  maidPrompt = DEFAULT_MAID_PROMPT,
  steps = [],
} = {}) => {
  const featureList = buildMaidModelPlannerFeatureList(features);
  const prompt = trim(maidPrompt, DEFAULT_MAID_PROMPT);
  const memoryText = trim(conversationContext?.memoryText);
  const historyText = trim(conversationContext?.historyText);
  const imageAttachments = getMaidImageAttachmentsFromContext(context);
  const imageSummary = buildMaidImageAttachmentSummary(imageAttachments);
  const userText = [
    `用户请求：${trim(input)}`,
    imageSummary ? `用户附图：\n${imageSummary}` : '',
    `当前会话：${trim(context?.sessionId, '-')}`,
    `UI 模式：${trim(context?.uiMode, '-')}`,
    `当前页面：${trim(context?.activePage, '-')}`,
    `女仆记忆表格：\n${memoryText || '（空）'}`,
    `女仆历史上下文：\n${historyText || '（空）'}`,
    `已执行步骤与观察结果：\n${stringifyForPrompt(steps, 12000) || '[]'}`,
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是这个 APP 内女仆助手的 ReAct 控制器。',
        '你要在内部完成 Reason -> Act -> Observe 判断，但不要输出思考过程。',
        '你只能输出严格 JSON，不能输出解释文字。',
        '如果已有观察结果足够回答用户，输出：{"ok":true,"action":"final","message":"给用户的自然回答"}',
        '如果还需要再调用一个工具，输出：{"ok":true,"action":"tool","toolName":"工具名","args":{},"featureId":"功能id","title":"短标题","response":"执行前短回复"}',
        '如果无法继续，输出：{"ok":false,"reason":"短原因","message":"给用户看的说明"}',
        '每次最多选择一个工具；不要发明工具；只能使用 APP 功能目录中 feature 允许的 tools。',
        '工具失败时，先根据错误、原始 args、功能 argsHint 修正参数；不要因为参数错误改用更高风险工具。',
        MAID_OPERATION_SAFETY_PROMPT,
        '世界书写入必须默认追加或新建；不要使用 replace，除非用户明确要求覆盖，且 APP 会要求用户点击确认。',
        '如果历史中上一轮包含“可继续: 是”或“继续提示”，本轮用户要求继续时要接着该任务执行，不要重新开始，也不要输出普通闲聊。',
        '修改现有世界书条目时，优先使用 worldbook.update_entries 按条目更新；长正文拆成多次小批量工具调用，每次只更新 1-3 个条目。',
        '如果每个世界书条目正文较长，优先每次只更新 1 个条目，后续继续调用工具处理下一条。',
        '工具 args 必须是完整、具体、可直接执行的 JSON；不要使用 "__keep_existing"、"同上"、"省略"、"待补" 等占位值。需要旧内容时先调用读取工具。',
        '写入、替换、覆盖、头像/壁纸设置等动作完成后，最终回答前必须依据后续读取或工具返回结果验证是否真的生效；没有验证时继续调用读取工具。',
        '联网工具只用于当前、最新、公开网络资料；APP 私有数据必须使用 APP 读取工具。基于联网结果回答时要给出来源链接或来源名称。',
        '处理附图时，继续使用本次请求的 attachmentId 或 preparedImageId；不要把 base64 或图片 data URL 写进 args。',
        '最终回答要像女仆助手自然回应：温柔、清楚、直接完成用户的问题。不要只说“我看到了/我查到了”，要给出结果。',
        '不要在 final message 中输出待执行的 JSON 或工具参数；如果还需要执行工具，必须输出 action:"tool" 的严格 JSON。',
        '这不是 coding agent。除非用户明确要求开发或调试，否则不要使用代码执行、文件编辑、工程化措辞。',
        prompt ? `女仆基础提示词（只影响最终语气，不能改变工具和安全限制）：${prompt}` : '',
        'APP 功能目录：',
        featureList,
      ].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: buildMaidUserContentWithImages(userText, imageAttachments),
    },
  ];
};

export const normalizeMaidModelReActDecision = (raw = {}, {
  features = listAppFeatures(),
  findFeature = findAppFeature,
} = {}) => {
  if (!isPlainObject(raw)) return unsupportedPlan('invalid_model_react_decision', '模型没有返回有效 ReAct 决策。');
  if (raw.ok === false) {
    return unsupportedPlan(trim(raw.reason, 'react_stopped'), truncate(raw.message || '女仆暂时无法继续执行。', 240));
  }
  const action = trim(raw.action || (raw.toolName ? 'tool' : 'final')).toLowerCase();
  if (action === 'final' || action === 'answer') {
    const message = truncate(raw.message || raw.response || '', 1200);
    if (!message) return unsupportedPlan('missing_final_message', '模型没有返回最终回答。');
    return {
      ok: true,
      action: 'final',
      message,
      source: 'model_react',
    };
  }
  if (action === 'tool' || action === 'act') {
    const plan = normalizeMaidModelPlan(raw, { features, findFeature });
    if (!plan.ok) return plan;
    return {
      ...plan,
      action: 'tool',
      source: 'model_react',
    };
  }
  return unsupportedPlan('invalid_react_action', '模型返回了不支持的 ReAct 动作。');
};

const normalizeMaidModelReActResponseText = (responseText = '', { features = listAppFeatures() } = {}) => {
  const parsed = extractMaidModelPlannerJson(responseText);
  if (parsed) return normalizeMaidModelReActDecision(parsed, { features });
  const message = truncate(responseText, 1200);
  if (!message) return normalizeMaidModelReActDecision(null, { features });
  if (/"toolName"\s*:|["']action["']\s*:\s*["']tool["']|["']featureId["']\s*:/i.test(message)) {
    return unsupportedPlan('invalid_model_react_decision', '模型返回了不完整的工具决策。');
  }
  return {
    ok: true,
    action: 'final',
    message,
    source: 'model_react_text_fallback',
    parseWarning: 'invalid_json',
  };
};

export const createMaidModelBackedPlanner = ({
  resolveRuntimeConfig = null,
  createClient = null,
  isConfigReady = () => false,
  features = listAppFeatures(),
  getConversationContext = null,
  onContextInjected = null,
  onDebugSnapshot = null,
  logger = console,
} = {}) => async (input = '', context = {}) => {
  if (typeof resolveRuntimeConfig !== 'function') {
    return unsupportedPlan('maid_model_planner_unavailable', '女仆需要先通过 AI 判断要调用的工具。');
  }

  let runtime = null;
  try {
    runtime = await resolveRuntimeConfig({
      sessionId: trim(context?.sessionId),
      uiMode: trim(context?.uiMode),
      taskType: 'maid_assistant',
    });
  } catch (error) {
    logger?.debug?.('maid model planner runtime unavailable', error);
    return unsupportedPlan('maid_model_planner_unavailable', '女仆需要先通过 AI 判断要调用的工具，请确认 API 配置可用。');
  }

  let client = runtime?.client || null;
  const config = isPlainObject(runtime?.config) ? runtime.config : {};
  if (!client && typeof createClient === 'function' && isConfigReady(config)) {
    try {
      client = createClient(config);
    } catch (error) {
      logger?.debug?.('maid model planner client creation failed', error);
      return unsupportedPlan('maid_client_error', '女仆暂时无法建立 API 连接。');
    }
  }
  if (!client || typeof client.chat !== 'function') {
    return unsupportedPlan(runtime?.reason || 'maid_api_not_configured', '请先为女仆绑定可用的 API 配置。');
  }

  try {
    const conversationContext = typeof getConversationContext === 'function'
      ? getConversationContext({ input, context, taskType: 'maid_assistant' })
      : context?.maidConversationContext || null;
    const messages = buildMaidModelPlannerMessages({
      input,
      context,
      conversationContext,
      features,
      maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
    });
    onContextInjected?.({
      source: 'maid_model_planner',
      input: trim(input),
      conversationContext,
    });
    const responseText = await client.chat(messages, {
      temperature: 0,
      maxTokens: 8000,
      max_tokens: 8000,
    });
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_planner',
      input: trim(input),
      messages,
      responseText,
    }, logger);
    const parsed = extractMaidModelPlannerJson(responseText);
    const modelPlan = normalizeMaidModelPlan(parsed, { features });
    return modelPlan;
  } catch (error) {
    logger?.warn?.('maid model planner failed', error);
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_planner',
      input: trim(input),
      messages: buildMaidModelPlannerMessages({
        input,
        context,
        conversationContext: typeof getConversationContext === 'function'
          ? getConversationContext({ input, context, taskType: 'maid_assistant' })
          : context?.maidConversationContext || null,
        features,
        maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
      }),
      responseText: error?.message || 'maid model planner failed',
      error,
    }, logger);
    return unsupportedPlan(error?.message || 'maid_model_planner_failed', '女仆暂时无法判断要调用哪个工具。');
  }
};

export const createMaidModelBackedReActPlanner = ({
  resolveRuntimeConfig = null,
  createClient = null,
  isConfigReady = () => false,
  features = listAppFeatures(),
  getConversationContext = null,
  onContextInjected = null,
  onDebugSnapshot = null,
  logger = console,
} = {}) => async (input = '', context = {}) => {
  if (typeof resolveRuntimeConfig !== 'function') {
    return unsupportedPlan('maid_react_unavailable', '女仆需要先通过 AI 继续判断下一步。');
  }

  let runtime = null;
  try {
    runtime = await resolveRuntimeConfig({
      sessionId: trim(context?.sessionId),
      uiMode: trim(context?.uiMode),
      taskType: 'maid_react',
    });
  } catch (error) {
    logger?.debug?.('maid react runtime unavailable', error);
    return unsupportedPlan('maid_react_unavailable', '女仆暂时无法继续判断下一步。');
  }

  let client = runtime?.client || null;
  const config = isPlainObject(runtime?.config) ? runtime.config : {};
  if (!client && typeof createClient === 'function' && isConfigReady(config)) {
    try {
      client = createClient(config);
    } catch (error) {
      logger?.debug?.('maid react client creation failed', error);
      return unsupportedPlan('maid_client_error', '女仆暂时无法建立 API 连接。');
    }
  }
  if (!client || typeof client.chat !== 'function') {
    return unsupportedPlan(runtime?.reason || 'maid_api_not_configured', '请先为女仆绑定可用的 API 配置。');
  }

  try {
    const conversationContext = typeof getConversationContext === 'function'
      ? getConversationContext({ input, context, taskType: 'maid_react' })
      : context?.maidConversationContext || null;
    const steps = Array.isArray(context?.maidReactSteps) ? context.maidReactSteps : [];
    const messages = buildMaidModelReActMessages({
      input,
      context,
      conversationContext,
      features,
      maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
      steps,
    });
    onContextInjected?.({
      source: 'maid_model_react',
      input: trim(input),
      conversationContext,
    });
    const responseText = await client.chat(messages, {
      temperature: 0,
      maxTokens: 12000,
      max_tokens: 12000,
    });
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_react',
      input: trim(input),
      messages,
      responseText,
    }, logger);
    return normalizeMaidModelReActResponseText(responseText, { features });
  } catch (error) {
    logger?.warn?.('maid react planner failed', error);
    emitDebugSnapshot(onDebugSnapshot, {
      source: 'maid_model_react',
      input: trim(input),
      messages: buildMaidModelReActMessages({
        input,
        context,
        conversationContext: typeof getConversationContext === 'function'
          ? getConversationContext({ input, context, taskType: 'maid_react' })
          : context?.maidConversationContext || null,
        features,
        maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
        steps: Array.isArray(context?.maidReactSteps) ? context.maidReactSteps : [],
      }),
      responseText: error?.message || 'maid react planner failed',
      error,
    }, logger);
    return unsupportedPlan(error?.message || 'maid_react_failed', '女仆暂时无法继续判断下一步。');
  }
};
