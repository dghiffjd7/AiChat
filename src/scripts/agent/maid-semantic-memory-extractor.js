import { validateMaidSemanticMemoryKey } from '../storage/maid-semantic-memory-store.js';
import { normalizeAgentUsage } from './agent-events.js';

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

const truncate = (value = '', max = 600) => {
  const text = trim(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

const uniqueStrings = (values = [], limit = 20) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map(value => trim(value))
    .filter(Boolean),
)).slice(0, limit);

const CANDIDATE_KEY_RULES = Object.freeze([
  {
    key: 'presentation.default',
    pattern: /(后台|前台|打开|进入|跳转|切换界面|显示界面|主要界面|留在当前|不要打开)/iu,
  },
  {
    key: 'response.style',
    pattern: /(回复|回答|说明|回报).{0,18}(简洁|精简|详细|完整|语气|口吻|风格|长度)|(简洁|精简|详细|完整).{0,12}(回复|回答|说明)/iu,
  },
  {
    key: 'workflow.confirmation',
    pattern: /(?:允许一次|始终允许|危险操作.{0,20}(?:确认|允许|询问)|(?:删除|执行|写入|变更|发布|导入).{0,16}(?:前|之前).{0,12}(?:确认|询问)|(?:确认|询问).{0,12}(?:后|以后|再).{0,12}(?:删除|执行|写入|变更|发布|导入)|(?:无需|不用|不要|必须|需要|应当).{0,8}(?:用户)?确认)/iu,
  },
  {
    key: 'workflow.navigation',
    pattern: /(批量操作|主要操作|次要操作|重复操作|完成后).{0,20}(打开|显示|界面|后台)/iu,
  },
  {
    key: 'format.default',
    pattern: /(格式|标签|xml|json|yaml|markdown|排版|代码块)/iu,
  },
  {
    key: 'language.default',
    pattern: /(中文|英文|日文|繁体|简体|语言)/iu,
  },
  {
    key: 'privacy.default',
    pattern: /(隐私|敏感|隐藏|外发|上传|保密|资料保护)/iu,
  },
  {
    key: 'model.default',
    pattern: /(模型|主模型|sub-agent|子代理|flash|opus|gemini|deepseek)/iu,
  },
  {
    key: 'content.writing_style',
    pattern: /(写作|正文|句子|用词|文风|润色|叙事|描写)/iu,
  },
]);

const RESOURCE_TOOL_RULES = Object.freeze([
  { prefix: 'worldbook.', type: 'worldbook', ids: ['worldbookId', 'worldId', 'id'] },
  { prefix: 'session.', type: 'session', ids: ['sessionId', 'chatId', 'id'] },
  { prefix: 'group.', type: 'group', ids: ['groupId', 'sessionId', 'id'] },
  { prefix: 'persona.', type: 'persona', ids: ['personaId', 'id'] },
  { prefix: 'user.', type: 'user', ids: ['userId', 'id'] },
  { prefix: 'preset.', type: 'preset', ids: ['presetId', 'id'] },
  { prefix: 'regex.', type: 'regex', ids: ['regexSetId', 'regexId', 'id'] },
  { prefix: 'script.', type: 'script', ids: ['scriptId', 'id'] },
  { prefix: 'variable.', type: 'variable', ids: ['variableId', 'path', 'id'] },
  { prefix: 'moment.', type: 'moment', ids: ['momentId', 'id'] },
  { prefix: 'moments.', type: 'moment', ids: ['momentId', 'id'] },
]);

const READ_ONLY_TOOL_PATTERN = /\.(?:read|list|get|inspect|search|query|status|preview)$/iu;
const WRITE_TOOL_PATTERN = /\.(?:create|update|delete|remove|bind|set|enable|disable|add|append|import|save|clear|rename|publish|apply)(?:_|$|\.)/iu;
const WHOLE_RESOURCE_DELETE_TOOL_PATTERN = /\.(?:delete_many|delete|remove)$/iu;

const getNestedObject = (value, key) => (
  isPlainObject(value?.[key]) ? value[key] : null
);

const findFirstValue = (sources = [], keys = []) => {
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const key of keys) {
      const value = trim(source[key]);
      if (value) return value;
    }
  }
  return '';
};

const resolveStructuredResource = (step = {}) => {
  const toolName = trim(step?.toolName).toLowerCase();
  const rule = RESOURCE_TOOL_RULES.find(item => toolName.startsWith(item.prefix));
  if (!rule || READ_ONLY_TOOL_PATTERN.test(toolName) || !WRITE_TOOL_PATTERN.test(toolName)) return null;
  if (step?.args?.preview === true || step?.output?.preview === true) return null;
  if (trim(step?.status).toLowerCase() !== 'succeeded') return null;
  const output = isPlainObject(step?.output) ? step.output : {};
  if (output?.ok === false || output?.changed === false || output?.dryRun === true) return null;
  const args = isPlainObject(step?.args) ? step.args : {};
  const id = findFirstValue([
    output,
    getNestedObject(output, 'resource'),
    getNestedObject(output, 'created'),
    getNestedObject(output, 'updated'),
    getNestedObject(output, 'result'),
    args,
  ], rule.ids);
  if (!id) return null;
  return {
    type: rule.type,
    id,
    deleted: WHOLE_RESOURCE_DELETE_TOOL_PATTERN.test(toolName),
  };
};

export const projectMaidStructuredMemoriesFromResult = (result = {}) => {
  const memories = [];
  const seenResources = new Set();
  (Array.isArray(result?.steps) ? result.steps : []).forEach((step) => {
    const resource = resolveStructuredResource(step);
    if (!resource) return;
    const resourceKey = `${resource.type}:${resource.id}`;
    if (seenResources.has(resourceKey)) return;
    seenResources.add(resourceKey);
    const summary = truncate(
      step?.summary ||
      step?.output?.summary ||
      step?.title ||
      step?.toolName ||
      (resource.deleted ? '资源已删除' : '资源状态已更新'),
      360,
    );
    memories.push({
      kind: 'resource_state',
      key: '',
      content: summary,
      tags: uniqueStrings([resource.type, trim(step?.toolName)], 6),
      status: resource.deleted ? 'stale' : 'active',
      confidence: 'verified',
      resourceRef: { type: resource.type, id: resource.id },
    });
  });
  if (result?.continuable === true) {
    memories.push({
      kind: 'task_state',
      key: 'task.current',
      content: truncate(
        result?.continueHint ||
        result?.message ||
        result?.reason ||
        '当前女仆任务尚未完成，可继续执行。',
        600,
      ),
      tags: ['待继续'],
      status: 'active',
      confidence: 'verified',
    });
  }
  return memories;
};

export const buildMaidSemanticMemoryCandidateKeys = (turns = []) => {
  const inputText = (Array.isArray(turns) ? turns : [])
    .map(turn => trim(turn?.input))
    .filter(Boolean)
    .join('\n');
  if (!inputText) return [];
  return CANDIDATE_KEY_RULES
    .filter(rule => rule.pattern.test(inputText))
    .map(rule => rule.key);
};

const parseJsonObject = (value = '') => {
  const text = trim(value)
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeExtractedMemories = (raw = {}, {
  scopeId = 'maid_default',
  candidateKeys = [],
  sourceTurnIds = [],
} = {}) => {
  const allowedSources = new Set(uniqueStrings(sourceTurnIds, 80));
  const allowedKeys = new Set(uniqueStrings(candidateKeys, 30));
  const memories = [];
  for (const item of Array.isArray(raw?.memories) ? raw.memories.slice(0, 12) : []) {
    if (!isPlainObject(item)) continue;
    const kind = trim(item.kind).toLowerCase();
    if (!['preference', 'decision'].includes(kind)) continue;
    const key = trim(item.key).toLowerCase();
    const validation = validateMaidSemanticMemoryKey(key, {
      kind,
      candidateKeys: Array.from(allowedKeys),
      keyOrigin: 'candidate',
    });
    if (!validation.ok) continue;
    const content = truncate(item.content, 600);
    if (!content) continue;
    const sources = uniqueStrings(item.sourceTurnIds, 20).filter(id => allowedSources.has(id));
    if (!sources.length) continue;
    const confidence = trim(item.confidence).toLowerCase() === 'explicit' ? 'explicit' : 'inferred';
    memories.push({
      scopeId: trim(scopeId, 'maid_default'),
      kind,
      key: validation.key,
      content,
      tags: uniqueStrings(item.tags, 8),
      status: 'active',
      confidence,
      sourceTurnIds: sources,
      keyOrigin: 'candidate',
    });
  }
  return memories;
};

export const buildMaidSemanticMemoryExtractionMessages = ({
  turns = [],
  candidateKeys = [],
} = {}) => {
  const projectedTurns = (Array.isArray(turns) ? turns : []).slice(-16).map(turn => ({
    id: trim(turn?.id),
    user: truncate(turn?.input, 1200),
    result: truncate(turn?.message, 700),
    status: trim(turn?.status),
  }));
  return [
    {
      role: 'system',
      content: [
        '你是女仆长期记忆提取器。只提取跨任务仍有价值、且用户明确表达或可谨慎推断的偏好与决定。',
        '纯礼貌、一次性请求、工具读取、失败重试、模型自己的建议和没有持久价值的事实不要保存。',
        '允许输出 0 条；不要为了填满数组制造记忆。',
        'key 只能从候选 key 中选择；kind 只能是 preference 或 decision。',
        '只有用户明确说出长期偏好/决定时 confidence 才是 explicit，否则是 inferred。',
        'sourceTurnIds 必须引用输入中的真实 turn id。',
        '仅输出 JSON：{"memories":[{"kind":"preference","key":"...","content":"...","tags":[],"confidence":"explicit","sourceTurnIds":["..."]}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `候选 key：${JSON.stringify(candidateKeys)}`,
        `待提取轮次：${JSON.stringify(projectedTurns)}`,
      ].join('\n'),
    },
  ];
};

export const createMaidSemanticMemoryExtractor = ({
  resolveRuntimeConfig = null,
  createClient = null,
  isConfigReady = () => false,
  logger = console,
} = {}) => async ({
  turns = [],
  scopeId = 'maid_default',
} = {}) => {
  const sourceTurns = (Array.isArray(turns) ? turns : []).filter(turn => trim(turn?.id));
  const candidateKeys = buildMaidSemanticMemoryCandidateKeys(sourceTurns);
  if (!sourceTurns.length || !candidateKeys.length) {
    return { memories: [], candidateKeys: [] };
  }
  if (typeof resolveRuntimeConfig !== 'function') {
    throw new Error('maid semantic memory runtime unavailable');
  }
  const runtime = await resolveRuntimeConfig({
    taskType: 'maid_memory_extract',
    sessionId: '',
    uiMode: 'maid',
  });
  const config = isPlainObject(runtime?.config) ? runtime.config : {};
  let client = runtime?.client || null;
  if (!client && typeof createClient === 'function' && isConfigReady(config)) {
    client = createClient(config);
  }
  const fallbackClient = runtime?.extractionFallbackClient || null;
  if (
    (!client || typeof client.chat !== 'function') &&
    (!fallbackClient || typeof fallbackClient.chat !== 'function')
  ) {
    throw new Error(runtime?.reason || 'maid semantic memory API not configured');
  }
  const messages = buildMaidSemanticMemoryExtractionMessages({
    turns: sourceTurns,
    candidateKeys,
  });
  const usageEntries = [];
  const runExtraction = async (targetClient, {
    runtimeConfig = {},
    source = 'maid_main',
    degraded = false,
  } = {}) => {
    const startedAt = Date.now();
    let capturedUsage = null;
    try {
      const responseText = await targetClient.chat(messages, {
        temperature: 0,
        maxTokens: 1200,
        max_tokens: 1200,
        onProviderUsage: usage => {
          capturedUsage = usage;
        },
      });
      const parsedResult = parseJsonObject(responseText);
      if (!parsedResult) throw new Error('maid semantic memory extraction returned invalid JSON');
      return parsedResult;
    } finally {
      usageEntries.push({
        ...normalizeAgentUsage({
          ...(isPlainObject(capturedUsage) ? capturedUsage : {}),
          provider: trim(capturedUsage?.provider || runtimeConfig?.provider),
          model: trim(capturedUsage?.model || runtimeConfig?.model),
          latencyMs: Date.now() - startedAt,
          modelCallCount: 1,
          degraded,
        }),
        source,
      });
    }
  };
  const attachUsage = (error) => {
    const target = error instanceof Error
      ? error
      : new Error(trim(error, 'maid semantic memory extraction failed'));
    target.memoryExtractionUsage = clone(usageEntries);
    return target;
  };
  let parsed = null;
  let fallbackUsed = false;
  if (client && typeof client.chat === 'function') {
    try {
      parsed = await runExtraction(client, {
        runtimeConfig: config,
        source: trim(runtime?.memoryExtractionModelSource, 'maid_main'),
      });
    } catch (error) {
      if (!fallbackClient || typeof fallbackClient.chat !== 'function') {
        logger?.warn?.('maid semantic memory extraction failed', error);
        throw attachUsage(error);
      }
      logger?.warn?.('maid semantic memory custom extraction failed; trying maid main model', error);
    }
  }
  if (!parsed && fallbackClient && typeof fallbackClient.chat === 'function') {
    fallbackUsed = true;
    try {
      parsed = await runExtraction(fallbackClient, {
        runtimeConfig: runtime?.extractionFallbackConfig,
        source: 'maid_main_fallback',
        degraded: true,
      });
    } catch (error) {
      logger?.warn?.('maid semantic memory main fallback failed', error);
      throw attachUsage(error);
    }
  }
  const usedConfig = fallbackUsed && isPlainObject(runtime?.extractionFallbackConfig)
    ? runtime.extractionFallbackConfig
    : config;
  return {
    memories: normalizeExtractedMemories(parsed, {
      scopeId,
      candidateKeys,
      sourceTurnIds: sourceTurns.map(turn => turn.id),
    }),
    candidateKeys: clone(candidateKeys),
    fallbackUsed,
    modelSource: fallbackUsed
      ? 'maid_main_fallback'
      : trim(runtime?.memoryExtractionModelSource, 'maid_main'),
    model: trim(usedConfig?.model),
    usageEntries: clone(usageEntries),
  };
};
