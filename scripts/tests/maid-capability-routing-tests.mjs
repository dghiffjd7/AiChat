import assert from 'node:assert/strict';

import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import {
  MAID_CAPABILITY_ROUTING_MODES,
  createMaidCapabilityRetriever,
  createMaidCapabilityRoutingRuntime,
  resolveCandidateCapabilitySelection,
} from '../../src/scripts/agent/maid-capability-routing.js';

const features = [
  {
    id: 'app.state.read',
    title: '读取当前状态',
    aliases: ['看看当前状态'],
    tools: ['app.read_state'],
    riskLevel: 'low',
    writes: false,
    panel: 'chat',
  },
  {
    id: 'app.resource.read',
    title: '读取资源',
    aliases: ['读取世界书'],
    tools: ['app.read_resource'],
    riskLevel: 'low',
    writes: false,
  },
  {
    id: 'danger.delete',
    title: '删除记录',
    aliases: ['删除这条记录'],
    tools: ['danger.delete'],
    riskLevel: 'high',
    writes: true,
  },
  {
    id: 'app.verify',
    title: '验证结果',
    aliases: ['验证'],
    tools: ['app.verify'],
    riskLevel: 'low',
    writes: false,
  },
  {
    id: 'app.capabilities.search',
    title: '搜索能力',
    aliases: ['找工具'],
    tools: ['app.search_feature'],
    riskLevel: 'low',
    writes: false,
  },
];

const registry = createAgentToolRegistry({
  permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
  logger: { warn() {} },
});
for (const name of ['app.read_state', 'app.read_resource', 'danger.delete', 'app.verify', 'app.search_feature']) {
  registry.register({
    name,
    schema: {
      type: 'object',
      properties: name === 'app.read_resource' ? { resource: { type: 'string' } } : {},
    },
    riskLevel: name === 'danger.delete' ? 'high' : 'low',
    execute: async () => ({ ok: true }),
  });
}

const retrievalLog = {
  decisions: [],
  requests: [],
  recordDecision(value) { this.decisions.push(value); },
  recordRequestSummary(value) { this.requests.push(value); },
};

{
  let calls = 0;
  const retriever = createMaidCapabilityRetriever({
    version: 'injected-v1',
    search: (_query, { features: sourceFeatures }) => {
      calls += 1;
      return [{ ...sourceFeatures.find(item => item.id === 'app.state.read'), score: 100 }];
    },
  });
  const result = retriever.retrieve('任意说法', { features, limit: 8 });
  assert.equal(result[0].id, 'app.state.read');
  assert.equal(retriever.version, 'injected-v1');
  assert.equal(calls, 1);
  console.log('ok - CapabilityRetriever exposes a replaceable retrieve interface');
}

{
  const runtime = createMaidCapabilityRoutingRuntime({
    features,
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    retrievalStore: retrievalLog,
    now: (() => { let value = 1000; return () => value += 1; })(),
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '看看当前状态', context: { uiMode: 'chat' } });
  const snapshot = runtime.prepareDecision({
    requestId: request.id,
    input: '看看当前状态',
    context: { uiMode: 'chat', activePage: 'chat' },
    phase: 'planner',
  });
  assert.equal(snapshot.mode, MAID_CAPABILITY_ROUTING_MODES.shadow);
  assert.equal(snapshot.useCandidates, false);
  assert.equal(snapshot.promptFeatures.length, features.length, 'Shadow 必须继续注入全量目录');
  assert.ok(snapshot.candidateIds.has('app.state.read'));
  assert.ok(snapshot.estimatedFullSchemaTokens >= snapshot.estimatedCandidateSchemaTokens);
  const observed = runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'app.state.read',
    toolName: 'app.read_state',
    args: {},
  });
  assert.equal(observed.candidateSnapshotId, snapshot.id);
  assert.equal(observed.candidateHit, true);
  const summary = runtime.finishRequest(request.id, { ok: true });
  assert.equal(summary.validSelectionCount, 1);
  assert.equal(summary.effectiveMode, 'shadow');
  assert.equal(summary.allValidSelectionsCovered, true);
  assert.equal(retrievalLog.decisions.at(-1).candidateHit, true);
  assert.ok(retrievalLog.decisions.at(-1).selectedRank > 0);
  assert.equal(
    retrievalLog.decisions.at(-1).reciprocalRank,
    1 / retrievalLog.decisions.at(-1).selectedRank,
  );
  assert.equal(retrievalLog.requests.length, 1);
  assert.equal(retrievalLog.requests.at(-1).cohort.riskLevel, 'low');
  console.log('ok - Shadow computes candidates and hit metrics without changing full prompt features');
}

{
  const runtime = createMaidCapabilityRoutingRuntime({
    features,
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    retrievalStore: retrievalLog,
    logger: { debug() {} },
  });
  runtime.setConfig({ mode: 'canary', canaryPercent: 100, minScore: 45 });
  const request = runtime.beginRequest({ input: '读取世界书' });
  const first = runtime.prepareDecision({
    requestId: request.id,
    input: '读取世界书',
    context: {},
    phase: 'planner',
  });
  assert.equal(first.useCandidates, true);
  assert.ok(first.promptFeatures.length < features.length);
  const readFeature = first.candidateFeatures.find(item => item.id === 'app.resource.read');
  assert.equal(readFeature.toolSchemas['app.read_resource'].type, 'object');

  const corrected = resolveCandidateCapabilitySelection({
    featureId: 'app.resource.reed',
    toolName: 'app.read_resource',
    features: first.candidateFeatures,
  });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.feature.id, 'app.resource.read');
  assert.equal(corrected.correction.rule, 'unique_tool_owner');
  const lowRiskFuzzy = resolveCandidateCapabilitySelection({
    featureId: 'app.resource.rea',
    toolName: 'app.read_resourc',
    features: first.candidateFeatures,
  });
  assert.equal(lowRiskFuzzy.ok, true);
  assert.equal(lowRiskFuzzy.feature.id, 'app.resource.read');
  assert.equal(lowRiskFuzzy.toolName, 'app.read_resource');

  const observed = runtime.observeDecision(first, {
    ok: true,
    featureId: 'app.resource.read',
    toolName: 'app.read_resource',
    args: { resource: 'worldbook' },
  });
  const validated = runtime.validatePlan(observed, { context: {} });
  assert.equal(validated.ok, true);

  const second = runtime.prepareDecision({
    requestId: request.id,
    input: '完全不同的下一步',
    context: { maidReactSteps: [{ featureId: 'app.resource.read', toolName: 'app.read_resource' }] },
    steps: [{ featureId: 'app.resource.read', toolName: 'app.read_resource' }],
    phase: 'react',
  });
  assert.notEqual(second.id, first.id);
  assert.equal(second.rolloutBucket, first.rolloutBucket, '同一 request 的 Canary 分桶必须跨 ReAct 决策稳定');
  assert.ok(second.candidateIds.has('app.resource.read'), '上一能力应作为 bounded sticky 保留');

  const verification = runtime.authorizeVerification({
    requestId: request.id,
    parentPlan: observed,
    verificationPlan: {
      ok: true,
      action: 'tool',
      featureId: 'app.verify',
      toolName: 'app.verify',
      args: {},
    },
  });
  assert.match(verification.candidateSnapshotId, /^cap-verify:/);
  assert.equal(retrievalLog.decisions.at(-1).metricEligible, false);
  assert.equal(runtime.validatePlan(verification, { context: {} }).ok, true);
  assert.equal(runtime.finishRequest(request.id, { ok: true }).effectiveMode, 'candidate');
  console.log('ok - Canary uses schema-aware candidates, per-decision snapshots, sticky reuse, and verification child snapshots');
}

{
  const runtime = createMaidCapabilityRoutingRuntime({
    features,
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    logger: { debug() {} },
  });
  runtime.setConfig({ mode: 'bounded', candidateLimit: 3, stickyLimit: 4 });
  assert.equal(runtime.getConfig().stickyLimit, 1, '小候选集必须为当前意图和 control plane 留出位置');
  assert.equal(runtime.validatePlan({ featureId: 'legacy.feature' }).ok, true);
  assert.equal(runtime.validatePlan({ capabilityRoutingMode: 'candidate' }).reason, 'candidate_snapshot_missing');
  const missingSnapshot = runtime.validatePlan({
    candidateSnapshotId: 'cap-snapshot:missing',
    featureId: 'app.state.read',
    toolName: 'app.read_state',
  });
  assert.equal(missingSnapshot.ok, false);
  assert.equal(missingSnapshot.reason, 'candidate_snapshot_missing');
  const request = runtime.beginRequest({ input: '看看当前状态' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '看看当前状态' });
  const outside = runtime.validatePlan({
    candidateSnapshotId: snapshot.id,
    featureId: 'outside.feature',
    toolName: 'outside.tool',
  });
  assert.equal(outside.ok, false);
  assert.equal(outside.reason, 'feature_not_found');

  const deleteRequest = runtime.beginRequest({ input: '删除这条记录' });
  const deleteSnapshot = runtime.prepareDecision({
    requestId: deleteRequest.id,
    input: '删除这条记录',
  });
  assert.ok(deleteSnapshot.candidateIds.has('danger.delete'));
  const riskyFuzzy = resolveCandidateCapabilitySelection({
    featureId: 'danger.delet',
    toolName: 'danger.delet',
    features: deleteSnapshot.candidateFeatures,
  });
  assert.equal(riskyFuzzy.ok, false, '高风险能力不得仅凭编辑距离自动纠偏');

  runtime.setConfig({ mode: 'canary', canaryPercent: 100 });
  const fallbackRequest = runtime.beginRequest({ input: '完全无法识别的长尾请求 xyz-987' });
  const fallback = runtime.prepareDecision({
    requestId: fallbackRequest.id,
    input: '完全无法识别的长尾请求 xyz-987',
  });
  assert.equal(fallback.useCandidates, false);
  assert.equal(fallback.effectiveMode, 'full_fallback');
  assert.equal(fallback.promptFeatures.length, features.length);

  runtime.setConfig({ mode: 'shadow' });
  const rollback = runtime.prepareDecision({ requestId: request.id, input: '看看当前状态' });
  assert.equal(rollback.useCandidates, false);
  assert.equal(rollback.promptFeatures.length, features.length);
  console.log('ok - bounded Validator rejects outside/high-risk fuzzy choices and rollback restores full visibility');
}

{
  const policyLog = { decisions: [], recordDecision(value) { this.decisions.push(value); } };
  const runtime = createMaidCapabilityRoutingRuntime({
    features,
    toolRegistry: registry,
    permissionEvaluator: {
      evaluateTool: tool => ({ decision: tool.name === 'danger.delete' ? 'deny' : 'allow', checks: [] }),
    },
    retrievalStore: policyLog,
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '删除这条记录' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '删除这条记录' });
  assert.equal(snapshot.candidateIds.has('danger.delete'), false);
  runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'danger.delete',
    toolName: 'danger.delete',
    args: {},
  });
  assert.equal(policyLog.decisions[0].policyExcluded, true);
  assert.equal(policyLog.decisions[0].validSelection, false);
  assert.equal(runtime.finishRequest(request.id, { ok: false }).validSelectionCount, 0);
  console.log('ok - permission-denied selections are policyExcluded rather than retrieval misses');
}

{
  const policyLog = { decisions: [], recordDecision(value) { this.decisions.push(value); } };
  const runtime = createMaidCapabilityRoutingRuntime({
    features: [{
      id: 'android.only',
      title: 'Android 专用能力',
      aliases: ['执行 Android 专用能力'],
      tools: ['android.only'],
      allowedPlatforms: ['android'],
      riskLevel: 'low',
      writes: false,
    }],
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    retrievalStore: policyLog,
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '执行 Android 专用能力' });
  const snapshot = runtime.prepareDecision({
    requestId: request.id,
    input: '执行 Android 专用能力',
    context: { platform: 'windows' },
  });
  assert.equal(snapshot.excluded[0].reason, 'platform_mismatch');
  runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'android.only',
    toolName: 'android.only',
  });
  assert.equal(policyLog.decisions[0].policyExcluded, true);
  console.log('ok - platform-incompatible capabilities are hard-filtered before ranking');
}

{
  const policyLog = { decisions: [], recordDecision(value) { this.decisions.push(value); } };
  const runtime = createMaidCapabilityRoutingRuntime({
    features: [{
      id: 'mislabelled.danger',
      title: '查看危险记录',
      aliases: ['查看危险记录'],
      tools: ['danger.delete'],
      riskLevel: 'low',
      writes: false,
    }],
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    retrievalStore: policyLog,
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '查看危险记录' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '查看危险记录' });
  assert.equal(snapshot.excluded[0].reason, 'risk_intent_not_explicit');
  runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'mislabelled.danger',
    toolName: 'danger.delete',
  });
  assert.equal(policyLog.decisions[0].policyExcluded, true);
  assert.equal(policyLog.decisions[0].cohort.riskLevel, 'high');
  console.log('ok - Tool Registry risk cannot be downgraded by catalog metadata');
}

{
  const missLog = { decisions: [], recordDecision(value) { this.decisions.push(value); } };
  const runtime = createMaidCapabilityRoutingRuntime({
    features,
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    retriever: { version: 'blind-v1', retrieve: () => [] },
    retrievalStore: missLog,
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '删除这条记录' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '删除这条记录' });
  assert.equal(snapshot.excluded.some(item => item.id === 'danger.delete'), false);
  assert.equal(snapshot.candidateIds.has('danger.delete'), false);
  runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'danger.delete',
    toolName: 'danger.delete',
    args: {},
  });
  assert.equal(missLog.decisions[0].policyExcluded, false);
  assert.equal(missLog.decisions[0].validSelection, true);
  assert.equal(missLog.decisions[0].candidateHit, false);
  assert.equal(missLog.decisions[0].cohort.riskLevel, 'high');
  console.log('ok - explicit high-risk retrieval misses remain in the recall denominator');
}

{
  const partialLog = { decisions: [], recordDecision(value) { this.decisions.push(value); } };
  const runtime = createMaidCapabilityRoutingRuntime({
    features: [...features, {
      id: 'mixed.read',
      title: '读取混合状态',
      aliases: ['读取混合状态'],
      tools: ['app.read_state', 'danger.delete'],
      riskLevel: 'medium',
      writes: true,
    }, {
      id: 'android.state.read',
      title: 'Android 状态读取',
      tools: ['app.read_state'],
      allowedPlatforms: ['android'],
      riskLevel: 'low',
      writes: false,
    }],
    toolRegistry: registry,
    permissionEvaluator: {
      evaluateTool: tool => ({ decision: tool.name === 'danger.delete' ? 'deny' : 'allow', checks: [] }),
    },
    retrievalStore: partialLog,
    logger: { debug() {} },
  });
  const request = runtime.beginRequest({ input: '读取混合状态' });
  const snapshot = runtime.prepareDecision({
    requestId: request.id,
    input: '读取混合状态',
    context: { platform: 'windows' },
  });
  runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'mixed.read',
    toolName: 'app.read_state',
    args: {},
  });
  assert.equal(partialLog.decisions[0].policyExcluded, false);
  assert.equal(partialLog.decisions[0].validSelection, true);
  console.log('ok - denying one tool does not exclude allowed tools in the same capability');
}

{
  const ambiguousFeatures = [
    ...features,
    { id: 'app.verify.alternate', title: '另一验证', tools: ['app.verify'], riskLevel: 'low', writes: false },
  ];
  const runtime = createMaidCapabilityRoutingRuntime({
    features: ambiguousFeatures,
    toolRegistry: registry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    logger: { debug() {} },
  });
  runtime.setConfig({ mode: 'bounded' });
  const request = runtime.beginRequest({ input: '看看当前状态' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '看看当前状态' });
  const parentPlan = runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'app.state.read',
    toolName: 'app.read_state',
    args: {},
  });
  const ambiguousVerification = runtime.authorizeVerification({
    requestId: request.id,
    parentPlan,
    verificationPlan: {
      ok: true,
      featureId: 'app.verify.typo',
      toolName: 'app.verify',
      args: {},
    },
  });
  assert.equal(ambiguousVerification.candidateSnapshotId, snapshot.id);
  assert.equal(runtime.validatePlan(ambiguousVerification).ok, false);
  console.log('ok - ambiguous verification ownership fails closed in candidate mode');
}

{
  const mutableRegistry = createAgentToolRegistry({
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    logger: { warn() {} },
  });
  mutableRegistry.register({
    name: 'app.read_state',
    schema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true }),
  });
  mutableRegistry.register({
    name: 'app.search_feature',
    schema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true }),
  });
  const runtime = createMaidCapabilityRoutingRuntime({
    features: features.filter(item => ['app.state.read', 'app.capabilities.search'].includes(item.id)),
    toolRegistry: mutableRegistry,
    permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
    logger: { debug() {} },
  });
  runtime.setConfig({ mode: 'bounded' });
  const request = runtime.beginRequest({ input: '看看当前状态' });
  const snapshot = runtime.prepareDecision({ requestId: request.id, input: '看看当前状态' });
  const plan = runtime.observeDecision(snapshot, {
    ok: true,
    featureId: 'app.state.read',
    toolName: 'app.read_state',
    args: {},
  });
  mutableRegistry.register({
    name: 'app.read_state',
    schema: { type: 'object', required: ['scope'], properties: { scope: { type: 'string' } } },
    execute: async () => ({ ok: true }),
  });
  const stale = runtime.validatePlan(plan);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'candidate_schema_stale');
  console.log('ok - Validator rejects stale candidate schema hashes before execution');
}

console.log('maid-capability-routing-tests passed');
