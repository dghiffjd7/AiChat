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
  let called = 0;
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => {
      called += 1;
      return {};
    },
  });
  const plan = await planner('打开世界书');
  assert.equal(plan.ok, true);
  assert.equal(plan.toolName, 'app.open_panel');
  assert.equal(called, 0);
  console.log('ok - maid model planner keeps local planner as first choice');
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
  console.log('ok - maid model planner uses configured client after local fallback');
}

{
  const planner = createMaidModelBackedPlanner({
    resolveRuntimeConfig: async () => ({ config: {} }),
    isConfigReady: () => false,
  });
  const plan = await planner('完全未知的请求');
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'unsupported_intent');
  console.log('ok - maid model planner falls back when API is not configured');
}
