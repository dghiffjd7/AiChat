import assert from 'node:assert/strict';

import {
  buildMaidModelPlannerFeatureList,
  buildMaidModelPlannerMessages,
  createMaidModelBackedPlanner,
  extractMaidModelPlannerJson,
  normalizeMaidModelPlan,
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
  const parsed = extractMaidModelPlannerJson('```json\n{"ok":true,"toolName":"app.open_panel"}\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.toolName, 'app.open_panel');

  const embedded = extractMaidModelPlannerJson('plan: {"ok":false,"reason":"unsupported_intent"} done');
  assert.equal(embedded.ok, false);
  console.log('ok - maid model planner extracts JSON from model text');
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
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => {
      runtimeCalls += 1;
      return {
        client: {
          chat: async () => {
            chatCalls += 1;
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
