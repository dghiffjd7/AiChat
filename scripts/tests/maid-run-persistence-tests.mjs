import assert from 'node:assert/strict';

import { createAgentTaskRuntime } from '../../src/scripts/agent/agent-task-runtime.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { createMaidAssistantAgent } from '../../src/scripts/agent/maid-assistant-agent.js';
import { AgentRunStore } from '../../src/scripts/storage/agent-run-store.js';

const allowAll = { evaluateTool: () => ({ decision: 'allow', checks: [] }) };

const createHarness = ({ executeTool, toolDefinition = {} }) => {
  const store = new AgentRunStore();
  const registry = createAgentToolRegistry({ permissionEvaluator: allowAll, logger: { warn() {} } });
  registry.register({
    ...toolDefinition,
    name: 'app.open_panel',
    description: 'test panel opener',
    schema: { type: 'object' },
    execute: executeTool,
  });
  const runtime = createAgentTaskRuntime({ store, toolRegistry: registry, logger: { warn() {} } });
  return { store, runtime };
};

const openPanelPlan = {
  ok: true,
  toolName: 'app.open_panel',
  args: { panel: 'worldbook' },
  featureId: 'worldbook.open',
  title: '打开世界书',
  response: '我来打开世界书。',
};

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true, opened: true }) });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, true);
  const runs = store.listRuns({ kind: 'maid_assistant' });
  assert.equal(runs.length, 1, `一次 runPrompt 应只产生一个 run，实际 ${runs.length}`);
  const run = runs[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.sessionId, 's1');
  assert.equal(run.metadata.goal, '打开世界书');
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].input.toolName, 'app.open_panel');
  assert.equal(run.steps[0].status, 'succeeded');
  console.log('ok - 单工具执行产生一个含步骤的持久 run');
}

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true, opened: true }) });
  const routingRuntime = {
    beginRequest: () => ({ id: 'cap-request-1' }),
    prepareDecision: () => ({ id: 'cap-snapshot-1', useCandidates: false, promptFeatures: [] }),
    observeDecision: (_snapshot, decision) => ({
      ...decision,
      candidateSnapshotId: 'cap-snapshot-1',
      retrieverVersion: 'test-v1',
      selectedCapabilityId: decision.featureId,
      candidateHit: true,
    }),
    validatePlan: plan => ({ ok: true, plan }),
    finishRequest: () => ({
      effectiveMode: 'shadow',
      decisionCount: 1,
      validSelectionCount: 1,
      hitCount: 1,
      allValidSelectionsCovered: true,
      lastCandidateSnapshotId: 'cap-snapshot-1',
    }),
  };
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    capabilityRoutingRuntime: routingRuntime,
    agentTaskRuntime: runtime,
    logger: { warn() {}, debug() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, true);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.steps[0].input.candidateSnapshotId, 'cap-snapshot-1');
  assert.equal(run.steps[0].input.candidateHit, true);
  assert.equal(Object.hasOwn(run.steps[0].input, 'candidates'), false);
  assert.equal(run.metadata.lastCandidateSnapshotId, 'cap-snapshot-1');
  assert.equal(run.metadata.candidateEffectiveMode, 'shadow');
  assert.equal(run.metadata.candidateAllCovered, true);
  console.log('ok - AgentRun only persists compact candidate snapshot references');
}

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true }) });
  const routingRuntime = {
    beginRequest: () => ({ id: 'cap-request-rejected' }),
    prepareDecision: () => ({ id: 'cap-snapshot-rejected', useCandidates: true, promptFeatures: [] }),
    observeDecision: (_snapshot, decision) => ({
      ...decision,
      candidateSnapshotId: 'cap-snapshot-rejected',
      retrieverVersion: 'test-v1',
    }),
    validatePlan: () => ({
      ok: false,
      reason: 'feature_not_found',
      message: '能力不属于当前候选快照。',
      nearestCandidates: ['worldbook.open'],
    }),
    finishRequest: () => ({
      decisionCount: 1,
      validSelectionCount: 0,
      hitCount: 0,
      allValidSelectionsCovered: false,
      lastCandidateSnapshotId: 'cap-snapshot-rejected',
    }),
  };
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    capabilityRoutingRuntime: routingRuntime,
    agentTaskRuntime: runtime,
    logger: { warn() {}, debug() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, false);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].status, 'failed');
  assert.equal(run.steps[0].input.candidateSnapshotId, 'cap-snapshot-rejected');
  assert.match(run.steps[0].errorMessage, /候选快照/);
  console.log('ok - candidate Validator rejection is persisted as a compact failed AgentRun step');
}

{
  const { store, runtime } = createHarness({
    executeTool: async () => ({ ok: true }),
    toolDefinition: {
      riskLevel: 'medium',
      safety: {
        destructive: 'always',
        onDeny: { action: 'skip', reason: 'user_cancelled' },
      },
    },
  });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('取消危险操作', {
    sessionId: 's1',
    requestToolConfirmation: () => false,
  });
  assert.equal(result.ok, false);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.steps[0].status, 'skipped', '安全确认拒绝应保留 skipped，不应改成 failed');
  assert.equal(run.steps[0].errorMessage, '');
  console.log('ok - 工具业务失败归一化不覆盖安全 skipped 状态');
}

{
  const { store, runtime } = createHarness({
    executeTool: async () => ({
      ok: false,
      reason: 'maid_vision_not_supported',
      message: '当前女仆模型不支持图片输入。',
    }),
  });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('查看选区截图', { sessionId: 's1' });
  assert.equal(result.ok, false);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed', '业务层 ok:false 不应持久化成成功步骤');
  assert.match(run.steps[0].errorMessage, /不支持图片输入/);
  console.log('ok - 工具业务失败在 ReAct 与持久 run 中都记录为失败');
}

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true }) });
  let reactCalls = 0;
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    reactPlanner: async () => {
      reactCalls += 1;
      if (reactCalls === 1) {
        return { ...openPanelPlan, action: 'tool', title: '再看一眼', args: { panel: 'memory' } };
      }
      return { ok: true, action: 'final', message: '两个面板都看过了。' };
    },
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('看看世界书和记忆', { sessionId: 's1' });
  assert.equal(result.ok, true);
  const runs = store.listRuns({ kind: 'maid_assistant' });
  assert.equal(runs.length, 1, `ReAct 多步应共享一个 run，实际 ${runs.length}`);
  assert.equal(runs[0].steps.length, 2);
  assert.equal(runs[0].metadata.stepCount, 2);
  assert.equal(runs[0].status, 'succeeded');
  console.log('ok - ReAct 多步共享同一个持久 run');
}

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true }) });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    reactPlanner: async () => ({ ok: false, reason: 'invalid_model_react_decision', message: '模型没有返回有效决策。' }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'interrupted');
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.metadata.maidStatus, 'interrupted');
  assert.equal(run.metadata.continuable, true);
  assert.ok(run.metadata.continueHint.includes('打开世界书'), 'continueHint 应包含用户目标');
  console.log('ok - 中断 run 记录 continuable 与 continueHint');
}

{
  const { store, runtime } = createHarness({
    executeTool: async () => {
      throw new Error('panel unavailable');
    },
  });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, false);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].status, 'failed');
  assert.ok(run.steps[0].errorMessage.includes('panel unavailable'));
  console.log('ok - 工具异常记录失败步骤和失败 run');
}

{
  const { store, runtime } = createHarness({ executeTool: async () => ({ ok: true }) });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ok: false, status: 'unsupported', reason: 'unsupported_intent', message: '不支持。' }),
    chatResponder: async () => ({ ok: true, status: 'responded', message: '主人今天想聊什么呀？' }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('随便聊聊', { sessionId: 's1' });
  assert.equal(result.ok, true);
  assert.equal(result.responseType, 'chat');
  assert.equal(store.listRuns({ kind: 'maid_assistant' }).length, 0, '纯聊天回应不应建 run');
  console.log('ok - 纯聊天回应不产生 run 记录');
}

// todos 随 run 持久化 + 失败分类写入 run metadata。
{
  const store = new AgentRunStore();
  const registry = createAgentToolRegistry({ permissionEvaluator: allowAll, logger: { warn() {} } });
  registry.register({
    name: 'app.open_panel',
    description: 'test panel opener',
    schema: { type: 'object' },
    execute: async () => ({ ok: true }),
  });
  const runtime = createAgentTaskRuntime({ store, toolRegistry: registry, logger: { warn() {} } });
  const { registerMaidTodoTools } = await import('../../src/scripts/agent/tools/maid-todo-tools.js');
  registerMaidTodoTools(registry, {
    getRun: runId => store.getRun(runId),
    updateRun: (runId, patch) => runtime.updateRun(runId, patch),
  });
  let reactCalls = 0;
  const agent = createMaidAssistantAgent({
    planner: async () => ({
      ok: true,
      toolName: 'maid.todo.write',
      args: { todos: [{ content: '创建聊天室', status: 'in_progress' }] },
      featureId: 'maid.todo',
      title: '记录任务清单',
      response: '我先记录任务清单。',
    }),
    reactPlanner: async () => {
      reactCalls += 1;
      return { ok: true, action: 'final', message: '清单已记录。' };
    },
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('帮我创建聊天室并记录进度', { sessionId: 's1' });
  assert.equal(result.ok, true);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.metadata.todos.length, 1);
  assert.equal(run.metadata.todos[0].content, '创建聊天室');
  console.log('ok - maid.todo.write 把清单持久化到当前 run');
}

{
  const { store, runtime } = createHarness({
    executeTool: async () => {
      const err = new Error('args.name is required');
      throw err;
    },
  });
  const agent = createMaidAssistantAgent({
    planner: async () => ({ ...openPanelPlan }),
    agentTaskRuntime: runtime,
    logger: { warn() {} },
  });
  const result = await agent.runPrompt('打开世界书', { sessionId: 's1' });
  assert.equal(result.ok, false);
  const run = store.listRuns({ kind: 'maid_assistant' })[0];
  assert.equal(run.metadata.failureCode, 'invalid_args', '失败分类应写入 run metadata');
  console.log('ok - 失败分类枚举写入 run metadata');
}

console.log('maid-run-persistence-tests passed');

{
  // 僵尸 run 兜底：boot 时上会话遗留的 running run 标为可继续 interrupted
  const kvData = {
    version: 1,
    updatedAt: 500,
    runs: {
      'run-stale': { id: 'run-stale', kind: 'maid_assistant', status: 'running', createdAt: 400, updatedAt: 500, steps: [], metadata: { goal: '遗留任务' } },
      'run-done': { id: 'run-done', kind: 'maid_assistant', status: 'succeeded', createdAt: 300, updatedAt: 400, steps: [], metadata: {} },
    },
    events: [],
  };
  globalThis.__TAURI_INVOKE__ = async (cmd, args) => {
    if (cmd === 'load_kv') return kvData;
    if (cmd === 'save_kv') return true;
    return null;
  };
  const { AgentRunStore } = await import('../../src/scripts/storage/agent-run-store.js');
  const store = new AgentRunStore({ now: () => 1000 });
  await store.load();
  const stale = store.getRun?.('run-stale') || store.exportState({ includeNonExportable: true }).runs['run-stale'];
  assert.equal(stale.status, 'cancelled', '遗留 running 应标 cancelled（枚举内终态）');
  assert.equal(stale.cancelReason, 'app_restarted');
  assert.equal(stale.metadata.continuable, true);
  assert.equal(stale.metadata.failureCode, 'app_restarted');
  const done = store.exportState({ includeNonExportable: true }).runs['run-done'];
  assert.equal(done.status, 'succeeded', '终态 run 不受影响');
  delete globalThis.__TAURI_INVOKE__;
  console.log('ok - 僵尸 running run 启动时标记为可继续 interrupted');
}
