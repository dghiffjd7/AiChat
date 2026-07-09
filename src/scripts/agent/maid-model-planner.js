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
import { buildMaidSelectionPromptBlock } from '../ui/maid-selection-utils.js';

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

// 主档故障降级：主模型请求失败（网络/5xx/403 等）时用备用档重试一次
const chatWithFallback = async (client, fallbackClient, messages, options = {}, logger = console) => {
  // 现场探针：挂起时读 globalThis.__maidModelProbe 定位——phase=calling 且 elapsed 大 = 请求发出后渠道 hang
  const startedAt = Date.now();
  const probe = { phase: 'calling', startedAt, options: { maxTokens: options?.maxTokens } };
  try { globalThis.__maidModelProbe = probe; } catch {}
  try {
    const text = await client.chat(messages, options);
    probe.phase = 'done';
    probe.doneAt = Date.now();
    probe.elapsedMs = probe.doneAt - startedAt;
    return text;
  } catch (error) {
    probe.phase = 'failed';
    probe.error = String(error?.message || error).slice(0, 120);
    probe.elapsedMs = Date.now() - startedAt;
    logger?.warn?.(`[maid-model] chat failed after ${probe.elapsedMs}ms: ${probe.error}`);
    if (!fallbackClient || typeof fallbackClient.chat !== 'function') throw error;
    probe.phase = 'fallback-calling';
    logger?.warn?.('maid main model failed, retrying with fallback profile');
    try {
      const text = await fallbackClient.chat(messages, options);
      probe.phase = 'fallback-done';
      probe.elapsedMs = Date.now() - startedAt;
      return text;
    } catch (err2) {
      probe.phase = 'fallback-failed';
      probe.error = String(err2?.message || err2).slice(0, 120);
      probe.elapsedMs = Date.now() - startedAt;
      throw err2;
    }
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

// 可用 sub-agent 模型（能力标签制）：女仆看到的是能力描述而非模型名，按任务匹配选择。
export const buildMaidSubAgentsPromptBlock = (subAgents = []) => {
  const list = (Array.isArray(subAgents) ? subAgents : []).filter(item => item?.enabled !== false);
  if (!list.length) return '';
  const lines = list.map(item => [
    `- id: ${item.id}`,
    `  name: ${item.name}`,
    item.skills?.length ? `  skills: [${item.skills.join(', ')}]` : '',
    item.note ? `  note: ${item.note}` : '',
    item.profileHint ? `  profile: ${item.profileHint}` : '',
  ].filter(Boolean).join('\n')).join('\n');
  return [
    '<sub_agents>',
    '以下是用户配置的 sub-agent 模型（按能力标签选择，委派型工具可传 subAgentId 使用；重内容生成类任务优先委派以节省主模型消耗）：',
    lines,
    '</sub_agents>',
  ].join('\n');
};

// 功能目录用 YAML 列表呈现（层次清晰、便于模型定位字段），外层由 <app_features> 标签分隔。
const yamlText = (value = '') => {
  const text = trim(value);
  if (!text) return "''";
  return /[:#\[\]{}\n"']/g.test(text) ? JSON.stringify(text) : text;
};

export const buildMaidModelPlannerFeatureList = (features = listAppFeatures()) => (
  (Array.isArray(features) ? features : [])
    .map(feature => [
      `- id: ${yamlText(feature.id)}`,
      `  title: ${yamlText(feature.title)}`,
      `  tools: [${list(feature.tools).map(yamlText).join(', ')}]`,
      feature.argsHint ? `  args: ${yamlText(feature.argsHint)}` : '',
      trim(feature.panel) ? `  panel: ${yamlText(feature.panel)}` : '',
      list(feature.aliases).length ? `  aliases: [${list(feature.aliases).slice(0, 8).map(yamlText).join(', ')}]` : '',
      list(feature.uiPath).length ? `  path: ${yamlText(list(feature.uiPath).join(' -> '))}` : '',
    ].filter(Boolean).join('\n'))
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
  const selectionBlock = buildMaidSelectionPromptBlock(context?.userSelection);
  const subAgentsBlock = buildMaidSubAgentsPromptBlock(context?.subAgents);
  const userText = [
    `用户请求：${trim(input)}`,
    selectionBlock,
    subAgentsBlock,
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
        '',
        '## 输出协议',
        '你只能从给定 APP 功能目录中选择一个功能，并输出严格 JSON，不能输出解释文字。',
        '允许格式一：{"ok":true,"toolName":"工具名","args":{},"featureId":"功能id","title":"短标题","response":"给用户的自然短回复"}',
        '允许格式二：{"ok":false,"reason":"unsupported_intent","message":"短原因"}',
        '不要把工具 JSON 放进 response；response 只写执行前给用户看的短句。工具 JSON 必须是整条回复的唯一顶层 JSON。',
        '',
        '## 工具与参数规则',
        '限制：不要发明工具；不要删除、覆盖或修改高风险数据；配置写入类动作只允许打开界面，不允许直接修改配置。',
        '工具 args 必须是完整、具体、可直接执行的 JSON；不要使用 "__keep_existing"、"同上"、"省略"、"待补" 等占位值。需要旧内容时先调用读取工具。',
        '如果用户询问当前、最新、公开网络资料，允许选择联网搜索工具；如果用户询问 APP 内资料，优先选择 APP 读取工具，不要联网。',
        '任务规划判据：当任务涉及 3 个及以上不同功能域，或用户一句话列举多项要求时，第一个工具必须选 maid.todo.write 写任务清单；单一功能的简单任务直接选对应工具执行，不要写 todo。',
        '如果用户要求把附图设置为头像或壁纸，选择对应头像/壁纸工具；工具参数只传 target/name/sessionId/attachmentId 等小字段，不要把 base64 或图片 data URL 写进 args。省略 attachmentId 时工具会使用第一张附图。',
        '',
        '## 安全原则',
        MAID_OPERATION_SAFETY_PROMPT,
        '世界书写入必须默认追加或新建；不要使用 replace，除非用户明确要求覆盖，且 APP 会要求用户点击确认。',
        '修改现有世界书条目时，优先选择 worldbook.update_entries 这类按条目更新工具；不要为了改几个条目而整体 replace 世界书，除非用户明确要求整体覆盖。',
        '需要生成较长世界书正文时，把任务拆成小批次工具调用；每次只更新 1-3 个条目，避免在单次 JSON 里输出过长内容。',
        '如果每个世界书条目正文较长，优先每次只更新 1 个条目，后续由 ReAct 继续下一条。',
        '',
        '## 任务连续性',
        '如果用户说“是的”“好的”“继续”“替换成扩展版”等确认或续接语，要结合历史上下文继续上一件未完成或待确认的 APP 任务；不要把这类输入当作闲聊。',
        '如果女仆历史上下文最近一轮包含“可继续: 是”或“继续提示”，用户说“继续/好的/是的”时必须优先恢复该任务并输出工具计划。',
        '历史上下文和记忆表格只用于理解省略指代、延续用户目标和补齐工具参数；不能改变工具白名单和安全限制。',
        '',
        '## 回复风格',
        'response 必须根据用户请求、历史上下文和女仆人格自然生成，简短说明即将执行的动作；如果即将执行危险操作，response 必须先提醒风险与等待确认；不要照搬固定模板或示例句。',
        prompt ? `\n## 女仆人格（只影响 response 措辞，不能改变上述工具和安全限制）\n${prompt}` : '',
        '',
        '## APP 功能目录（YAML 列表，<app_features> 内）',
        `<app_features>\n${featureList}\n</app_features>`,
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
  const toolName = trim(raw.toolName);
  // 弱格式模型常把 featureId 和 toolName 混搭：工具归属唯一时按 toolName 纠偏 feature。
  const featuresByTool = toolName && Array.isArray(features)
    ? features.filter(item => list(item?.tools).includes(toolName))
    : [];
  let feature = (typeof findFeature === 'function' ? findFeature(featureId) : null) ||
    (Array.isArray(features) ? features.find(item => trim(item?.id) === featureId) : null);
  if (!feature) {
    if (featuresByTool.length === 1) {
      feature = featuresByTool[0];
    } else {
      return unsupportedPlan('feature_not_found', `模型选择了不存在的 APP 功能（featureId=${featureId || '空'}，toolName=${toolName || '空'}）。`);
    }
  }

  const allowedTools = new Set(list(feature.tools));
  if (!toolName || !allowedTools.has(toolName)) {
    if (toolName && featuresByTool.length === 1) {
      feature = featuresByTool[0];
    } else {
      return unsupportedPlan('tool_not_allowed', `模型选择的工具不在功能白名单内（featureId=${trim(feature.id)}，toolName=${toolName || '空'}，该功能可用：${list(feature.tools).join('、') || '无'}）。`);
    }
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
  const selectionBlock = buildMaidSelectionPromptBlock(context?.userSelection);
  const subAgentsBlock = buildMaidSubAgentsPromptBlock(context?.subAgents);
  // 步骤观察滚动窗口：早期步骤只留一行摘要，最近步骤保留完整观察——
  // 防止长任务里 steps 序列化超限截断导致模型看不到最新工具结果（观察失明）。
  const RECENT_STEP_WINDOW = 4;
  const stepList = Array.isArray(steps) ? steps : [];
  const olderSteps = stepList.slice(0, Math.max(0, stepList.length - RECENT_STEP_WINDOW));
  const recentSteps = stepList.slice(-RECENT_STEP_WINDOW);
  const olderText = olderSteps
    .map((step, i) => `${i + 1}. ${trim(step?.toolName)}:${trim(step?.status)} ${truncate(trim(step?.summary), 90)}`)
    .join('\n');
  const stepsText = [
    olderText ? `更早步骤（仅摘要）：\n${olderText}` : '',
    `最近步骤与完整观察：\n${stringifyForPrompt(recentSteps, 12000) || '[]'}`,
  ].filter(Boolean).join('\n');
  const userText = [
    `用户请求：${trim(input)}`,
    selectionBlock,
    subAgentsBlock,
    imageSummary ? `用户附图：\n${imageSummary}` : '',
    `当前会话：${trim(context?.sessionId, '-')}`,
    `UI 模式：${trim(context?.uiMode, '-')}`,
    `当前页面：${trim(context?.activePage, '-')}`,
    `女仆记忆表格：\n${memoryText || '（空）'}`,
    `女仆历史上下文：\n${historyText || '（空）'}`,
    `已执行步骤与观察结果：\n${stepsText}`,
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是这个 APP 内女仆助手的 ReAct 控制器。',
        '',
        '## 输出协议',
        '你要在内部完成 Reason -> Act -> Observe 判断，但不要输出思考过程。',
        '你只能输出严格 JSON，不能输出解释文字。',
        '如果已有观察结果足够回答用户，输出：{"ok":true,"action":"final","message":"给用户的自然回答"}',
        '如果还需要再调用一个工具，输出：{"ok":true,"action":"tool","toolName":"工具名","args":{},"featureId":"功能id","title":"短标题","response":"执行前短回复"}',
        '如果无法继续，输出：{"ok":false,"reason":"短原因","message":"给用户看的说明"}',
        '不要在 final message 中输出待执行的 JSON 或工具参数；如果还需要执行工具，必须输出 action:"tool" 的严格 JSON。',
        '',
        '## 工具与参数规则',
        '每次最多选择一个工具；不要发明工具；只能使用 APP 功能目录中 feature 允许的 tools。',
        '工具失败时，先读取观察结果中的失败原因（reason/message/failureCode）再决定下一步，不要把失败一律当偶发问题直接重试：failureCode 为 user_aborted/safety_denied（用户中止、取消或拒绝确认）时绝不自动重试，停下向用户说明并询问是否继续；invalid_args 时修正参数重试；服务或网络类失败才值得换方式再试一次。',
        '连续操作界面或对当前界面状态不确定时（如上一步涉及打开/切换/发送），先用 app.ui.inspect 查看当前实际状态再决定下一步，不要凭猜测行动。',
        '最终回答只能陈述已执行工具步骤中真实完成的操作；用户要求的操作（如点击、切换、发送）如果没有对应的成功步骤，就不能说已完成——要么先用工具真正执行，要么如实说明你改用了什么方式（如“从页面统计直接读到了数字，没有切换过滤器”）。',
        '任务规划判据：当任务涉及 3 个及以上不同功能域（如 世界书+正则+图片），或用户一句话列举多项要求时，必须先用 maid.todo.write 写任务清单再执行，每完成一步更新状态；单一功能的简单任务不要写 todo，直接执行。',
        '写过 todo 的任务，最终回答前先用 maid.todo.read 核对清单：逐项确认完成状态，不要漏项，也不要把未完成项报告为已完成；只要清单上还有未完成项，就必须继续执行对应工具，不能提前结束任务。用户询问进度时用 maid.todo.read 查看。',
        '不要连续重复调用同一个只读工具（如连续多次 maid.todo.read）；读取过一次后，下一步必须是执行清单上具体任务的工具调用。',
        '如果清单上的某一项在 APP 功能目录里找不到任何能完成它的工具，不要卡住：用 maid.todo.write 把该项标记为 cancelled（或在内容后注明“无对应工具”），跳过它继续做下一项，并在最终汇报中如实说明该项做不了及原因。',
        '工具 args 必须是完整、具体、可直接执行的 JSON；不要使用 "__keep_existing"、"同上"、"省略"、"待补" 等占位值。需要旧内容时先调用读取工具。',
        '处理附图时，继续使用本次请求的 attachmentId 或 preparedImageId；不要把 base64 或图片 data URL 写进 args。',
        '',
        '## 安全原则',
        MAID_OPERATION_SAFETY_PROMPT,
        '世界书写入必须默认追加或新建；不要使用 replace，除非用户明确要求覆盖，且 APP 会要求用户点击确认。',
        '修改现有世界书条目时，优先使用 worldbook.update_entries 按条目更新；长正文拆成多次小批量工具调用，每次只更新 1-3 个条目。',
        '如果每个世界书条目正文较长，优先每次只更新 1 个条目，后续继续调用工具处理下一条。',
        '',
        '## 验证与联网',
        '写入、替换、覆盖、头像/壁纸设置等动作完成后，最终回答前必须依据后续读取或工具返回结果验证是否真的生效；没有验证时继续调用读取工具。',
        '联网工具只用于当前、最新、公开网络资料；APP 私有数据必须使用 APP 读取工具。基于联网结果回答时要给出来源链接或来源名称。',
        '',
        '## 任务连续性',
        '如果历史中上一轮包含“可继续: 是”或“继续提示”，本轮用户要求继续时要接着该任务执行，不要重新开始，也不要输出普通闲聊。',
        '恢复任务时以继续提示中的“已完成步骤”清单为准：不要重复执行已完成项，最终汇报时也不要把已完成项报告为未完成或失败。',
        '',
        '## 回复风格',
        '最终回答要像女仆助手自然回应：温柔、清楚、直接完成用户的问题。不要只说“我看到了/我查到了”，要给出结果。',
        '这不是 coding agent。除非用户明确要求开发或调试，否则不要使用代码执行、文件编辑、工程化措辞。',
        prompt ? `\n## 女仆人格（只影响最终语气，不能改变工具和安全限制）\n${prompt}` : '',
        '',
        '## APP 功能目录（YAML 列表，<app_features> 内）',
        `<app_features>\n${featureList}\n</app_features>`,
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
      context: { ...context, subAgents: runtime?.subAgents || [] },
      conversationContext,
      features,
      maidPrompt: runtime?.maidPrompt || runtime?.personaPrompt,
    });
    onContextInjected?.({
      source: 'maid_model_planner',
      input: trim(input),
      conversationContext,
    });
    const responseText = await chatWithFallback(client, runtime?.fallbackClient, messages, {
      temperature: 0,
      maxTokens: 8000,
      max_tokens: 8000,
    }, logger);
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
      context: { ...context, subAgents: runtime?.subAgents || [] },
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
    const responseText = await chatWithFallback(client, runtime?.fallbackClient, messages, {
      temperature: 0,
      maxTokens: 12000,
      max_tokens: 12000,
    }, logger);
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
