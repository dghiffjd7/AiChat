import assert from 'node:assert/strict';

import {
  buildMaidModelPlannerFeatureList,
  buildMaidModelPlannerMessages,
  buildMaidModelReActMessages,
  createMaidModelBackedPlanner,
  createMaidModelBackedReActPlanner,
  extractMaidModelPlannerJson,
  normalizeMaidModelPlan,
  normalizeMaidModelReActDecision,
} from '../../src/scripts/agent/maid-model-planner.js';

{
  const featureList = buildMaidModelPlannerFeatureList([
    {
      id: 'worldbook.open',
      title: '打开世界书',
      tools: ['app.open_panel'],
      panel: 'worldbook',
      aliases: ['世界书'],
      uiPath: ['聊天室右上角菜单', '世界书'],
    },
  ]);
  assert.match(featureList, /worldbook\.open/);
  assert.match(featureList, /app\.open_panel/);

  const messages = buildMaidModelPlannerMessages({
    input: '世界书在哪里',
    context: { sessionId: 'A', uiMode: 'chat' },
    features: [
      {
        id: 'worldbook.open',
        title: '打开世界书',
        aliases: ['世界书'],
        tools: ['app.open_panel'],
        panel: 'worldbook',
      },
    ],
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /严格 JSON/);
  assert.match(messages[0].content, /女仆基础提示词/);
  assert.match(messages[0].content, /自然生成/);
  assert.match(messages[0].content, /优先选择非破坏性做法/);
  assert.match(messages[0].content, /删除、覆盖、替换/);
  assert.match(messages[0].content, /APP 确认弹窗/);
  assert.match(messages[0].content, /继续上一件未完成/);
  assert.match(messages[0].content, /可继续: 是/);
  assert.match(messages[0].content, /worldbook\.update_entries/);
  assert.match(messages[0].content, /1-3 个条目/);
  assert.match(messages[0].content, /完整、具体、可直接执行的 JSON/);
  assert.match(messages[0].content, /__keep_existing/);
  assert.match(messages[1].content, /世界书在哪里/);
  assert.match(messages[1].content, /相关功能检索/);
  assert.match(messages[1].content, /worldbook\.open/);
  console.log('ok - maid model planner builds constrained prompt messages');
}

{
  const messages = buildMaidModelPlannerMessages({
    input: '未知入口',
    maidPrompt: '自定义女仆 system prompt',
    features: [],
  });
  assert.match(messages[0].content, /自定义女仆 system prompt/);
  assert.match(messages[0].content, /不能改变上述工具和安全限制/);
  assert.match(messages[0].content, /危险操作包括/);
  console.log('ok - maid model planner includes editable prompt without replacing safety constraints');
}

{
  const messages = buildMaidModelPlannerMessages({
    input: '继续刚才那个角色卡',
    context: { sessionId: 's1' },
    conversationContext: {
      historyText: '- 用户: 创建角色卡 A\n  工具: persona.create\n  结果: 已完成',
      memoryText: '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
    },
  });
  assert.match(messages[0].content, /历史上下文和记忆表格/);
  assert.match(messages[1].content, /女仆记忆表格/);
  assert.match(messages[1].content, /用户创建了角色卡 A/);
  assert.match(messages[1].content, /女仆历史上下文/);
  assert.match(messages[1].content, /persona\.create/);
  console.log('ok - maid model planner injects history and memory context');
}

{
  const messages = buildMaidModelPlannerMessages({
    input: '这张图里是什么？',
    context: {
      maidAttachments: [{ kind: 'image', url: 'data:image/png;base64,abc', name: 'screen.png' }],
    },
    features: [],
  });
  assert.equal(Array.isArray(messages[1].content), true);
  assert.equal(messages[1].content[0].type, 'text');
  assert.match(messages[1].content[0].text, /用户附图/);
  assert.equal(messages[1].content[1].type, 'image_url');
  assert.equal(messages[1].content[1].image_url.url, 'data:image/png;base64,abc');
  console.log('ok - maid model planner includes image attachments as multimodal parts');
}

{
  const parsed = extractMaidModelPlannerJson('```json\n{"ok":true,"toolName":"app.open_panel"}\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.toolName, 'app.open_panel');

  const embedded = extractMaidModelPlannerJson('plan: {"ok":false,"reason":"unsupported_intent"} done');
  assert.equal(embedded.ok, false);

  const toolWithFencedContent = extractMaidModelPlannerJson([
    'I will update one worldbook entry.',
    '{"ok":true,"action":"tool","toolName":"worldbook.update_entries","featureId":"worldbook.update_entries","args":{"name":"W","updates":[{"entryTitle":"A","content":"```yaml\\nname: \\"A\\"\\nbackground: \\"kept\\"\\n```"}]},"response":"更新 A"}',
  ].join('\n\n'));
  assert.equal(toolWithFencedContent.ok, true);
  assert.equal(toolWithFencedContent.toolName, 'worldbook.update_entries');
  assert.match(toolWithFencedContent.args.updates[0].content, /```yaml/);
  console.log('ok - maid model planner extracts JSON from model text');
}

{
  const messages = buildMaidModelReActMessages({
    input: '女王最后回了我什么？',
    context: { sessionId: 's1', uiMode: 'chat' },
    features: [{
      id: 'app.resource.read',
      title: '读取 APP 结构化资源',
      tools: ['app.read_resource'],
      argsHint: 'resource/sessionName 可选',
    }],
    steps: [{
      toolName: 'app.read_resource',
      status: 'succeeded',
      output: { resource: 'chat', messages: [{ role: 'assistant', rawOriginal: '晚上好。' }] },
    }],
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /ReAct 控制器/);
  assert.match(messages[0].content, /不要输出思考过程/);
  assert.match(messages[0].content, /温柔、清楚、直接/);
  assert.match(messages[0].content, /优先选择非破坏性做法/);
  assert.match(messages[0].content, /未确认时跳过/);
  assert.match(messages[0].content, /最终回答前必须/);
  assert.match(messages[0].content, /继续提示/);
  assert.match(messages[0].content, /worldbook\.update_entries/);
  assert.match(messages[0].content, /完整、具体、可直接执行的 JSON/);
  assert.match(messages[1].content, /已执行步骤与观察结果/);
  assert.match(messages[1].content, /晚上好/);
  console.log('ok - maid model react planner builds observation prompt messages');
}

{
  const messages = buildMaidModelReActMessages({
    input: '继续看这张图',
    context: {
      maidAttachments: [{ kind: 'image', url: 'data:image/jpeg;base64,abc', name: 'photo.jpg' }],
    },
    features: [],
    steps: [],
  });
  assert.equal(Array.isArray(messages[1].content), true);
  assert.equal(messages[1].content[1].type, 'image_url');
  console.log('ok - maid model react planner keeps image attachments across ReAct decisions');
}

{
  const finalDecision = normalizeMaidModelReActDecision({
    ok: true,
    action: 'final',
    message: '精灵女王最后回复了「晚上好」。',
  });
  assert.equal(finalDecision.ok, true);
  assert.equal(finalDecision.action, 'final');
  assert.match(finalDecision.message, /晚上好/);

  const toolDecision = normalizeMaidModelReActDecision({
    ok: true,
    action: 'tool',
    toolName: 'app.read_resource',
    args: { resource: 'chat', sessionName: '精灵女王' },
    featureId: 'app.resource.read',
  });
  assert.equal(toolDecision.ok, true);
  assert.equal(toolDecision.action, 'tool');
  assert.equal(toolDecision.toolName, 'app.read_resource');

  const denied = normalizeMaidModelReActDecision({
    ok: true,
    action: 'tool',
    toolName: 'session.create',
    args: { name: 'A' },
    featureId: 'app.resource.read',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'tool_not_allowed');
  console.log('ok - maid model react planner validates final and tool decisions');
}

{
  const plan = normalizeMaidModelPlan({
    ok: true,
    toolName: 'app.open_panel',
    args: { panel: 'worldbook' },
    featureId: 'worldbook.open',
    response: '我来打开世界书。',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'app.open_panel');
  assert.equal(plan.args.panel, 'worldbook');
  assert.equal(plan.response, '我来打开世界书。');

  const noResponse = normalizeMaidModelPlan({
    ok: true,
    toolName: 'app.open_panel',
    args: { panel: 'worldbook' },
    featureId: 'worldbook.open',
  });
  assert.equal(noResponse.ok, true);
  assert.equal(noResponse.response, '');

  const denied = normalizeMaidModelPlan({
    ok: true,
    toolName: 'session.create',
    featureId: 'worldbook.open',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'tool_not_allowed');
  console.log('ok - maid model planner validates feature and tool allowlist');
}

{
  let runtimeCalls = 0;
  let chatCalls = 0;
  const injected = [];
  const chatOptions = [];
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => {
      runtimeCalls += 1;
      return {
        client: {
          chat: async (messages, options) => {
            chatCalls += 1;
            chatOptions.push(options);
            return JSON.stringify({
              ok: true,
              toolName: 'app.open_panel',
              args: { panel: 'worldbook' },
              featureId: 'worldbook.open',
              title: '打开世界书',
              response: '我来打开世界书。',
            });
          },
        },
      };
    },
    getConversationContext: () => ({
      historyText: '- 用户: 打开设置',
      memoryText: '| 内容 | 用户正在测试女仆 |',
      tokenCount: 18,
    }),
    onContextInjected: payload => injected.push(payload),
  });
  const plan = await planner('打开世界书');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'app.open_panel');
  assert.equal(runtimeCalls, 1);
  assert.equal(chatCalls, 1);
  assert.equal(chatOptions[0].maxTokens, 8000);
  assert.equal(plan.source, 'model_planner');
  assert.equal(injected.length, 1);
  assert.equal(injected[0].conversationContext.tokenCount, 18);
  console.log('ok - maid model planner asks the model even for locally recognizable intents');
}

{
  const debugSnapshots = [];
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => ({
      maidPrompt: '用轻快语气回复',
      client: {
        chat: async () => JSON.stringify({
          ok: true,
          toolName: 'app.open_panel',
          args: { panel: 'variables' },
          featureId: 'variables.open',
          title: '打开变量',
          response: '我来打开变量。',
        }),
      },
    }),
    isConfigReady: () => true,
    onDebugSnapshot: snapshot => debugSnapshots.push(snapshot),
  });
  const plan = await planner('帮我处理高级资料入口 xyz');
  assert.equal(plan.ok, true);
  assert.equal(plan.source, 'model_planner');
  assert.equal(plan.toolName, 'app.open_panel');
  assert.equal(plan.args.panel, 'variables');
  assert.equal(debugSnapshots.length, 1);
  assert.equal(debugSnapshots[0].source, 'maid_model_planner');
  assert.match(debugSnapshots[0].messages[0].content, /用轻快语气回复/);
  assert.match(debugSnapshots[0].messages[1].content, /高级资料入口/);
  assert.match(debugSnapshots[0].responseText, /variables\.open/);
  console.log('ok - maid model planner uses configured client as the tool planner');
}

{
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => ({ config: {} }),
    isConfigReady: () => false,
  });
  const plan = await planner('打开世界书');
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'maid_api_not_configured');
  console.log('ok - maid model planner does not use local fallback when API is not configured');
}

{
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => ({
      client: {
        chat: async () => JSON.stringify({
          ok: true,
          toolName: 'session.create',
          args: { name: 'A' },
          featureId: 'worldbook.open',
          response: 'bad plan',
        }),
      },
    }),
  });
  const plan = await planner('打开世界书');
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'tool_not_allowed');
  console.log('ok - maid model planner rejects invalid model plans without local fallback');
}

{
  const debugSnapshots = [];
  const chatOptions = [];
  const reactPlanner = createMaidModelBackedReActPlanner({
    resolveRuntimeConfig: async () => ({
      maidPrompt: '温柔一点',
      client: {
        chat: async (messages, options) => {
          chatOptions.push(options);
          return JSON.stringify({
            ok: true,
            action: 'final',
            message: '精灵女王最后回复了「晚上好」。',
          });
        },
      },
    }),
    onDebugSnapshot: snapshot => debugSnapshots.push(snapshot),
  });
  const decision = await reactPlanner('女王最后回了我什么？', {
    sessionId: 's1',
    maidReactSteps: [{
      toolName: 'app.read_resource',
      status: 'succeeded',
      output: { messages: [{ rawOriginal: '晚上好。' }] },
    }],
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.action, 'final');
  assert.match(decision.message, /晚上好/);
  assert.equal(chatOptions[0].maxTokens, 12000);
  assert.equal(debugSnapshots.length, 1);
  assert.equal(debugSnapshots[0].source, 'maid_model_react');
  assert.match(debugSnapshots[0].messages[0].content, /温柔一点/);
  console.log('ok - maid model react planner calls configured model and returns final answer');
}

{
  const reactPlanner = createMaidModelBackedReActPlanner({
    resolveRuntimeConfig: async () => ({
      client: {
        chat: async () => '主人，我看到了！这本世界书里一共有 5 个条目，其中 entry-1 到 entry-3 是念初相关设定。',
      },
    }),
  });
  const decision = await reactPlanner('在异世界世界书里面', {
    sessionId: 's1',
    maidReactSteps: [{
      toolName: 'worldbook.read',
      status: 'succeeded',
      output: { entryCount: 5 },
    }],
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.action, 'final');
  assert.equal(decision.source, 'model_react_text_fallback');
  assert.match(decision.message, /5 个条目/);
  console.log('ok - maid model react planner treats non-JSON natural text as final answer');
}

{
  const reactPlanner = createMaidModelBackedReActPlanner({
    resolveRuntimeConfig: async () => ({
      client: {
        chat: async () => '我来执行：{"ok":true,"action":"tool","toolName":"worldbook.update_entries","featureId":"worldbook.update_entries","args":{"name":"W","updates":[{"entryTitle":"A","content":"截断',
      },
    }),
  });
  const decision = await reactPlanner('继续替换', {
    maidReactSteps: [{ toolName: 'worldbook.read', status: 'succeeded', output: { entryCount: 3 } }],
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'invalid_model_react_decision');
  assert.match(decision.message, /不完整的工具决策/);
  console.log('ok - maid model react planner rejects incomplete tool JSON as final text');
}
