import {
  findAppFeature,
  searchAppFeatures,
} from './app-feature-catalog.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeText = value => trim(value)
  .toLowerCase()
  .replace(/[「」『』“”"'`]/g, '')
  .replace(/\s+/g, ' ');

const compactText = value => normalizeText(value).replace(/\s+/g, '');

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

const hasOwn = (value, key) => value !== null &&
  value !== undefined &&
  Object.prototype.hasOwnProperty.call(Object(value), key);

const unwrapToolOutputResult = (output = {}) => (
  hasOwn(output, 'result') ? output.result : output
);

const isToolOutputOk = (output = {}) => {
  if (output?.status && output.status !== 'succeeded') return false;
  const result = unwrapToolOutputResult(output);
  if (isPlainObject(result) && result.ok === false) return false;
  return true;
};

const summarizeToolFailure = (output = {}) => {
  const result = unwrapToolOutputResult(output);
  return trim(
    output?.summary ||
    result?.message ||
    result?.reason ||
    output?.reason ||
    '女仆执行失败。',
  );
};

const buildSuccessMessage = ({ plan = {}, output = {}, execution = {} } = {}) => {
  const guideMessage = trim(execution?.message);
  const result = unwrapToolOutputResult(output);
  if (result?.requestTriggered === true && plan?.toolName === 'chat.send_message') {
    const target = trim(result.sessionName || result.sessionId);
    return target ? `已发送给「${target}」，联系人正在回复。` : '已发送，联系人正在回复。';
  }
  const actionMessage = trim(plan.response || output?.summary || '已完成。');
  return [guideMessage, actionMessage]
    .filter(Boolean)
    .join(' ');
};

const stripTrailingPunctuation = value => trim(value)
  .replace(/[。.!！?？,，;；:：\s]+$/g, '')
  .trim();

const extractQuotedName = (text = '') => {
  const raw = String(text || '');
  const patterns = [
    /[叫名为為]\s*[「『“"']([^」』”"']{1,80})[」』”"']/,
    /[「『“"']([^」』”"']{1,80})[」』”"']/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return stripTrailingPunctuation(match[1]);
  }
  return '';
};

const extractSessionName = (text = '') => {
  const quoted = extractQuotedName(text);
  if (quoted) return quoted;
  const raw = String(text || '').trim();
  const patterns = [
    /(?:创建|新建|新增|添加|开)(?:一个|一個)?(?:叫|名为|名為)?\s*([^，。,.!?！？]{1,80}?)(?:的)?(?:聊天室|会话|好友|联系人)/,
    /(?:创建|新建|新增|添加|开)(?:一个|一個)?(?:聊天室|会话|好友|联系人)\s*([^，。,.!?！？]{1,80})/,
    /(?:聊天室|会话|好友|联系人)(?:叫|名为|名為)?\s*([^，。,.!?！？]{1,80})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const value = stripTrailingPunctuation(match?.[1] || '');
    if (!value) continue;
    const cleaned = value
      .replace(/^(一个|一個|叫|名为|名為)\s*/u, '')
      .replace(/\s*(吧|一下|并打开|並打開|打开|進入|进入)$/u, '')
      .trim();
    if (cleaned) return cleaned;
  }
  return '';
};

const extractSessionNames = (text = '') => {
  const raw = String(text || '').trim();
  const quoted = Array.from(raw.matchAll(/[「『“"']([^」』”"']{1,80})[」』”"']/g))
    .map(match => stripTrailingPunctuation(match?.[1] || ''))
    .filter(Boolean);
  if (quoted.length > 1) return Array.from(new Set(quoted)).slice(0, 20);
  const patterns = [
    /(?:创建|新建|新增|添加|开)(?:\s*(?:两个|兩個|多个|多個|一些|几个|幾個|\d+\s*个))?(?:聊天室|会话|好友|联系人)[，,：:\s]*(.{1,180})/u,
    /(?:聊天室|会话|好友|联系人)[，,：:\s]*(.{1,180})/u,
  ];
  let source = '';
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      source = match[1];
      break;
    }
  }
  if (!source) return [];
  source = source
    .replace(/^(分别|分別|为|為|叫|名为|名為)\s*/u, '')
    .replace(/\s*(的|吧|一下|并打开|並打開|打开|進入|进入)$/u, '')
    .trim();
  const names = source
    .split(/(?:和|与|及|以及|、|，|,|；|;|\s+and\s+)/iu)
    .map(item => stripTrailingPunctuation(item)
      .replace(/^(一个|一個|两个|兩個|多个|多個|聊天室|会话|好友|联系人)\s*/u, '')
      .replace(/\s*(的|聊天室|会话|好友|联系人)$/u, '')
      .trim())
    .filter(item => item && !/^(两个|兩個|多个|多個|聊天室|会话|好友|联系人)$/.test(item));
  return Array.from(new Set(names)).slice(0, 20);
};

const extractQuotedAfter = (text = '', keywords = []) => {
  const raw = String(text || '');
  for (const keyword of keywords) {
    const index = raw.indexOf(keyword);
    if (index < 0) continue;
    const value = extractQuotedName(raw.slice(index));
    if (value) return value;
  }
  return '';
};

const extractNamedTarget = (text = '', keywords = [], fallback = '') => (
  extractQuotedAfter(text, keywords) || extractQuotedName(text) || fallback
);

const extractChatMessageContent = (text = '') => {
  const quoted = extractQuotedAfter(text, ['消息', '内容', '发送', '发']);
  if (quoted) return quoted;
  const raw = String(text || '').trim();
  const match = raw.match(/(?:发送|发)(?:消息)?\s*([^，。,.!?！？]{1,120})/);
  const value = stripTrailingPunctuation(match?.[1] || '');
  if (value && !/(到|给|至)?(?:聊天室|会话)/.test(value)) return value;
  if (/晚上好/i.test(raw)) return '晚上好';
  if (/\bhi\b/i.test(raw)) return 'hi';
  return '';
};

const extractWorldEntries = (text = '') => {
  const raw = String(text || '');
  const entries = [];
  const pattern = /条目\s*[「『“"']([^」』”"']{1,80})[」』”"'][^「『“"']{0,24}[「『“"']([^」』”"']{1,2000})[」』”"']/g;
  let match = pattern.exec(raw);
  while (match) {
    const title = stripTrailingPunctuation(match[1]);
    const content = trim(match[2]);
    if (title && content) {
      entries.push({
        title,
        content,
        keys: [title],
        constant: true,
      });
    }
    match = pattern.exec(raw);
  }
  const compact = compactText(raw);
  if (!entries.some(entry => compactText(entry.title).includes('大姐姐')) && compact.includes('大姐姐')) {
    entries.push({
      title: '温柔大姐姐',
      content: '超级温柔、特别会照顾人的大姐姐，和用户是姐弟关系。她说话耐心，会主动关心用户的状态。',
      keys: ['温柔大姐姐', '大姐姐', '姐姐'],
      constant: true,
    });
  }
  if (!entries.some(entry => compactText(entry.title).includes('青梅竹马')) && (compact.includes('青梅竹马') || compact.includes('大小姐'))) {
    entries.push({
      title: '傲娇大小姐青梅竹马',
      content: '傲娇的大小姐青梅竹马，嘴上不坦率，但很在意用户，和用户从小熟识。',
      keys: ['傲娇大小姐青梅竹马', '大小姐', '青梅竹马'],
      constant: true,
    });
  }
  return entries;
};

const resolvePanelFromFeature = (feature = null) => {
  const panel = trim(feature?.panel);
  if (panel) return panel;
  const id = trim(feature?.id);
  if (id === 'config.api.open') return 'config';
  if (id === 'agent.center.open') return 'agent-center';
  if (id === 'worldbook.open') return 'worldbook';
  if (id === 'memory.open') return 'memory';
  if (id === 'variables.open') return 'variables';
  if (id === 'regex.open') return 'regex';
  return '';
};

const buildPlan = ({
  toolName = '',
  args = {},
  featureId = '',
  title = '',
  response = '',
} = {}) => ({
  ok: true,
  toolName: trim(toolName),
  args: isPlainObject(args) ? clone(args) : {},
  featureId: trim(featureId),
  title: trim(title),
  response: trim(response),
});

const unsupportedPlan = (reason = 'unsupported_intent', message = '暂时还不会执行这个请求。') => ({
  ok: false,
  status: 'unsupported',
  reason,
  message,
});

const requireAiPlanner = (input = '') => {
  if (!trim(input)) return unsupportedPlan('empty_input', '请输入想让女仆做的事。');
  return unsupportedPlan('maid_planner_required', '女仆需要先由 AI 判定要调用哪个工具。');
};

export const planMaidAssistantCommand = (input = '', context = {}) => {
  const text = trim(input);
  if (!text) return unsupportedPlan('empty_input', '请输入想让女仆做的事。');
  const normalized = normalizeText(text);
  const compact = compactText(text);

  if (compact.includes('会话配置') || compact.includes('聊天室配置') || compact.includes('配置聊天室')) {
    return buildPlan({
      toolName: 'session.open_config',
      args: {},
      featureId: 'session.config.open',
      title: '打开会话配置',
      response: '我来打开当前会话配置。',
    });
  }

  if (
    /(当前|现在|目前).*(状态|资源|会话|页面)/.test(normalized) ||
    compact.includes('当前状态') ||
    compact.includes('用了哪些资源') ||
    compact.includes('当前资源')
  ) {
    return buildPlan({
      toolName: 'app.get_current_state',
      args: {},
      featureId: 'app.state.read',
      title: '查看当前 APP 状态',
      response: '我先查看当前 APP 状态。',
    });
  }

  if (
    /(发送|发).*(消息|hi|晚上好|聊天室|会话)/.test(normalized) ||
    /(聊天室|会话).*(发送|发)/.test(normalized)
  ) {
    const sessionId = extractQuotedAfter(text, ['聊天室', '会话', '给', '到', '至']) || extractSessionName(text);
    const content = extractChatMessageContent(text);
    if (!content) return unsupportedPlan('missing_message_content', '请告诉我要发送什么消息。');
    return buildPlan({
      toolName: 'chat.send_message',
      args: {
        ...(sessionId ? { sessionId } : {}),
        content,
        role: 'user',
        open: true,
      },
      featureId: 'chat.send_message',
      title: '发送聊天消息',
      response: sessionId ? `我来向「${sessionId}」发送消息。` : '我来发送消息。',
    });
  }

  if (
    /(创建|新建|新增|写|绑定).*(世界书)/.test(normalized) ||
    /(世界书).*(创建|新建|新增|写|绑定|条目)/.test(normalized)
  ) {
    const name = extractNamedTarget(text, ['世界书'], '女仆创建的世界书');
    const personaName = extractQuotedAfter(text, ['角色卡', '角色']);
    const entries = extractWorldEntries(text);
    if (!entries.length) return unsupportedPlan('missing_worldbook_entries', '请告诉我要写入世界书的条目内容。');
    return buildPlan({
      toolName: 'worldbook.create',
      args: {
        name,
        entries,
        ...(personaName ? { personaName, bindToPersona: true } : {}),
      },
      featureId: 'worldbook.create',
      title: '创建世界书',
      response: `我来创建世界书「${name}」。`,
    });
  }

  if (/(创建|新建|新增|添加).*(用户名称|用户名|用户)/.test(normalized)) {
    const name = extractNamedTarget(text, ['用户名称', '用户名', '用户'], '');
    if (!name) return unsupportedPlan('missing_user_name', '请告诉我要创建的用户名称。');
    return buildPlan({
      toolName: 'user.create',
      args: { name, setActive: true },
      featureId: 'user.create',
      title: '创建用户名称',
      response: `我来创建用户「${name}」。`,
    });
  }

  if (/(切换|更换|使用|换成|设为当前).*(用户名称|用户名|用户)/.test(normalized)) {
    const target = extractNamedTarget(text, ['用户名称', '用户名', '用户'], '');
    if (!target) return unsupportedPlan('missing_user_name', '请告诉我要切换到哪个用户。');
    return buildPlan({
      toolName: 'user.switch',
      args: { target },
      featureId: 'user.switch',
      title: '切换用户名称',
      response: `我来切换到用户「${target}」。`,
    });
  }

  if (
    /(创建|新建|新增|添加).*(角色卡|角色)/.test(normalized) ||
    /(角色卡|角色).*(创建|新建|新增|添加)/.test(normalized)
  ) {
    const name = extractNamedTarget(text, ['角色卡', '角色'], '');
    if (!name) return unsupportedPlan('missing_persona_name', '请告诉我要创建的角色卡名称。');
    return buildPlan({
      toolName: 'persona.create',
      args: { name, setActive: true },
      featureId: 'persona.create',
      title: '创建角色卡',
      response: `我来创建角色卡「${name}」。`,
    });
  }

  if (
    /(切换|更换|使用|换成|设为当前).*(角色卡|角色)/.test(normalized) ||
    /(角色卡|角色).*(切换|更换|使用|换成|设为当前)/.test(normalized)
  ) {
    const target = extractNamedTarget(text, ['角色卡', '角色'], '');
    if (!target) return unsupportedPlan('missing_persona_name', '请告诉我要切换到哪个角色卡。');
    return buildPlan({
      toolName: 'persona.switch',
      args: { target },
      featureId: 'persona.switch',
      title: '切换角色卡',
      response: `我来切换到角色卡「${target}」。`,
    });
  }

  if (
    /(创建|新建|新增|添加|开).*(聊天室|会话|好友|联系人)/.test(normalized) ||
    /(聊天室|会话|好友|联系人).*(创建|新建|新增|添加)/.test(normalized)
  ) {
    const names = extractSessionNames(text);
    if (names.length > 1) {
      return buildPlan({
        toolName: 'session.create',
        args: { names, open: true },
        featureId: 'session.create',
        title: '创建聊天室',
        response: `我来创建 ${names.length} 个聊天室。`,
      });
    }
    const name = names[0] || extractSessionName(text);
    if (!name) return unsupportedPlan('missing_session_name', '请告诉我要创建的聊天室名称。');
    return buildPlan({
      toolName: 'session.create',
      args: { name, open: true },
      featureId: 'session.create',
      title: '创建聊天室',
      response: `我来创建聊天室「${name}」。`,
    });
  }

  if (
    /(打开|进入|切换).*(聊天室|会话)/.test(normalized) &&
    !compact.includes('会话配置') &&
    !compact.includes('聊天室配置')
  ) {
    const name = extractSessionName(text) || stripTrailingPunctuation(
      text
        .replace(/^(打开|进入|切换)\s*/u, '')
        .replace(/(聊天室|会话)/gu, '')
        .trim(),
    );
    if (!name) return unsupportedPlan('missing_session_id', '请告诉我要打开哪个聊天室。');
    return buildPlan({
      toolName: 'session.open',
      args: { sessionId: name },
      featureId: 'session.open',
      title: '打开聊天室',
      response: `我来打开聊天室「${name}」。`,
    });
  }

  const matches = searchAppFeatures(text, { limit: 3 });
  const feature = matches[0] || null;
  if (feature && Number(feature.score || 0) >= 45) {
    const panel = resolvePanelFromFeature(feature);
    if (feature.id === 'app.state.read') {
      return buildPlan({
        toolName: 'app.get_current_state',
        args: {},
        featureId: feature.id,
        title: feature.title,
        response: '我先查看当前 APP 状态。',
      });
    }
    if (feature.id === 'session.config.open') {
      return buildPlan({
        toolName: 'session.open_config',
        args: {},
        featureId: feature.id,
        title: feature.title,
        response: '我来打开当前会话配置。',
      });
    }
    if (panel) {
      return buildPlan({
        toolName: 'app.open_panel',
        args: {
          panel,
          ...(feature.id === 'config.api.open' ? { tab: 'chat' } : {}),
        },
        featureId: feature.id,
        title: feature.title,
        response: `我来打开${feature.title}。`,
      });
    }
  }

  return unsupportedPlan('unsupported_intent', '这个请求还没有接入女仆工具。');
};

const executeWithRegistry = async ({
  toolRegistry = null,
  plan = null,
  context = {},
} = {}) => {
  if (!plan?.toolName) throw new Error('maid assistant plan missing tool');
  if (!toolRegistry || typeof toolRegistry.executeTool !== 'function') {
    throw new Error('maid assistant tool registry unavailable');
  }
  return toolRegistry.executeTool(plan.toolName, plan.args || {}, context);
};

export const createMaidAssistantAgent = ({
  toolRegistry = null,
  agentTaskRuntime = null,
  planner = requireAiPlanner,
  chatResponder = null,
  guidedActionRuntime = null,
  logger = console,
} = {}) => {
  const runPlannedTool = async (plan, context = {}) => {
    if (agentTaskRuntime && typeof agentTaskRuntime.enqueue === 'function') {
      const runResult = await agentTaskRuntime.enqueue({
        kind: 'maid_assistant',
        source: 'maid-assistant',
        trigger: 'manual',
        sessionId: trim(context.sessionId),
        summary: plan.title || plan.toolName,
      }, async ({ runId, startStep, finishStep }) => {
        const step = startStep?.({
          type: 'tool',
          summary: plan.title || plan.toolName,
          input: {
            toolName: plan.toolName,
            args: plan.args,
          },
        });
        try {
          const output = await agentTaskRuntime.executeTool(plan.toolName, plan.args || {}, {
            ...context,
            runId,
            stepId: step?.id,
            source: 'maid-assistant',
          });
          finishStep?.(step?.id, {
            status: 'succeeded',
            summary: output?.summary || plan.title || plan.toolName,
            output,
          });
          return output;
        } catch (error) {
          finishStep?.(step?.id, {
            status: 'failed',
            summary: error?.message || 'maid assistant tool failed',
            errorMessage: error?.message || String(error || ''),
          });
          throw error;
        }
      });
      return runResult;
    }
    return executeWithRegistry({ toolRegistry, plan, context });
  };

  const executePlan = async (plan, context = {}) => {
    if (guidedActionRuntime && typeof guidedActionRuntime.run === 'function') {
      return guidedActionRuntime.run({
        plan,
        context,
        execute: () => runPlannedTool(plan, context),
      });
    }
    const output = await runPlannedTool(plan, context);
    return {
      output,
      guided: false,
      guide: null,
      message: '',
    };
  };

  const runPrompt = async (input = '', context = {}) => {
    const plan = await planner(input, context);
    if (!plan?.ok) {
      const shouldTryChat = Boolean(
        trim(input) &&
        plan?.reason !== 'empty_input' &&
        typeof chatResponder === 'function',
      );
      if (shouldTryChat) {
        try {
          const chatResult = await chatResponder(input, context, { plan });
          if (chatResult?.ok && trim(chatResult.message)) {
            return {
              ok: true,
              status: chatResult.status || 'responded',
              responseType: 'chat',
              source: chatResult.source || 'maid_chat_responder',
              input: trim(input),
              message: trim(chatResult.message),
            };
          }
          if (chatResult?.status === 'failed') {
            return {
              ok: false,
              status: 'failed',
              responseType: 'chat',
              input: trim(input),
              reason: chatResult.reason || 'maid_chat_failed',
              message: chatResult.message || '女仆暂时无法回复。',
            };
          }
        } catch (error) {
          logger?.warn?.('maid assistant chat response failed', error);
          return {
            ok: false,
            status: 'failed',
            responseType: 'chat',
            input: trim(input),
            reason: error?.message || 'maid_chat_failed',
            message: error?.message || '女仆暂时无法回复。',
          };
        }
      }
      return {
        ok: false,
        status: plan?.status || 'unsupported',
        reason: plan?.reason || 'unsupported_intent',
        message: plan?.message || '暂时还不会执行这个请求。',
        input: trim(input),
      };
    }
    try {
      if (trim(plan.response) && typeof context?.onStatus === 'function') {
        context.onStatus({
          stage: 'planned',
          tone: 'thinking',
          message: trim(plan.response),
          plan: clone(plan),
        });
      }
      const execution = await executePlan(plan, context);
      const output = execution?.output ?? execution;
      if (!isToolOutputOk(output)) {
        return {
          ok: false,
          status: 'failed',
          input: trim(input),
          plan: clone(plan),
          output: clone(output),
          guided: Boolean(execution?.guided),
          guide: clone(execution?.guide || null),
          reason: summarizeToolFailure(output),
          message: summarizeToolFailure(output),
        };
      }
      return {
        ok: true,
        status: 'succeeded',
        input: trim(input),
        plan: clone(plan),
        output: clone(output),
        guided: Boolean(execution?.guided),
        guide: clone(execution?.guide || null),
        message: buildSuccessMessage({ plan, output, execution }),
      };
    } catch (error) {
      logger?.warn?.('maid assistant run failed', error);
      return {
        ok: false,
        status: 'failed',
        input: trim(input),
        plan: clone(plan),
        reason: error?.message || String(error || ''),
        message: error?.message || '女仆执行失败。',
      };
    }
  };

  return {
    plan: planner,
    runPrompt,
    getFeature: findAppFeature,
  };
};
