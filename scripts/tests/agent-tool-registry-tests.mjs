import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import {
  AgentToolError,
  AgentToolPermissionError,
  AgentToolSafetyError,
  createAgentToolRegistry,
} from '../../src/scripts/agent/agent-tool-registry.js';
import { createImageAgentTools } from '../../src/scripts/agent/tools/image-tools.js';
import { createMemoryAgentTools } from '../../src/scripts/agent/tools/memory-tools.js';
import { createVariableAgentTools } from '../../src/scripts/agent/tools/variable-tools.js';
import { createWorldbookAgentTools } from '../../src/scripts/agent/tools/worldbook-tools.js';

const logger = { warn: () => {} };

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  registry.register({
    name: 'echo.value',
    permissions: ['debug'],
    schema: {
      type: 'object',
      required: ['value'],
      additionalProperties: false,
      properties: {
        value: { type: 'string', minLength: 2 },
        count: { type: 'integer', minimum: 1 },
      },
    },
    execute: async args => ({ echoed: args.value, count: args.count }),
  });
  assert.equal(registry.get('echo.value').execute, undefined);
  assert.deepEqual(registry.get('echo.value').capabilities, {
    read: true,
    write: false,
    network: false,
    cost: 'none',
    undo: 'none',
    modelContext: 'none',
    confirmation: 'allow_once',
  });
  assert.deepEqual(registry.listTools().map(tool => tool.name), ['echo.value']);
  await assert.rejects(
    () => registry.executeTool('echo.value', { value: 'a', extra: true }),
    err => err instanceof AgentToolError && err.code === 'agent_tool_args_invalid',
  );

  const events = [];
  const result = await registry.executeTool('echo.value', { value: 'ok', count: 2 }, {
    emit: event => events.push(event),
    runId: 'run-1',
    stepId: 'step-1',
    sessionId: 'session-1',
  });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.result, { echoed: 'ok', count: 2 });
  assert.deepEqual(events.map(event => event.type), [
    'agent.tool.started',
    'agent.tool.finished',
  ]);
  console.log('ok - agent tool registry validates args, executes tools, and emits lifecycle events');
}

{
  const events = [];
  let executionSignalAborted = false;
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  registry.register({
    name: 'chat.wait_forever',
    timeoutMs: 5,
    timeoutErrorCode: 'generation_failed',
    execute: async (_args, context) => new Promise(resolve => {
      context.signal.addEventListener('abort', () => {
        executionSignalAborted = true;
        resolve(false);
      }, { once: true });
    }),
  });

  assert.equal(registry.get('chat.wait_forever').timeoutErrorCode, 'generation_failed');
  await assert.rejects(
    registry.executeTool('chat.wait_forever', {}, {
      emit: event => events.push(event),
      runId: 'timeout-run',
      stepId: 'timeout-step',
    }),
    error => (
      error instanceof AgentToolError
      && error.code === 'generation_failed'
      && error.toolName === 'chat.wait_forever'
    ),
  );
  assert.equal(executionSignalAborted, true, 'timeout must abort the signal passed to the underlying tool');
  assert.equal(events.at(-1)?.status, 'failed', 'a provider timeout is a generation failure, not a user cancellation');
  console.log('ok - agent tool registry maps declared timeout failures to a stable failure code');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  registry.register({
    name: 'profile.write',
    permissions: ['storage:write'],
    riskLevel: 'medium',
    execute: async () => true,
  });
  registry.register({
    name: 'network.lookup',
    permissions: ['network'],
    execute: async () => true,
  });
  assert.equal(registry.get('profile.write').capabilities.write, true);
  assert.equal(registry.get('profile.write').capabilities.confirmation, 'required');
  assert.equal(registry.get('profile.write').capabilities.undo, 'manual');
  assert.equal(registry.get('network.lookup').capabilities.network, true);
  assert.equal(registry.get('network.lookup').capabilities.cost, 'variable');
  assert.equal(registry.get('network.lookup').capabilities.confirmation, 'required');
  console.log('ok - agent tool registry infers capability hints from permissions and risk');
}

{
  let executed = 0;
  let permissionRequested = 0;
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger,
  });
  registry.register({
    name: 'worldbook.bind_session',
    permissions: ['storage:write'],
    riskLevel: 'medium',
    safety: {
      operationType: 'bind_worldbook_to_session',
      destructive: 'never',
    },
    execute: async () => {
      executed += 1;
      return { ok: true };
    },
  });
  await assert.rejects(
    () => registry.executeTool('worldbook.bind_session', {}, {
      operationIntentPolicy: {
        mode: 'read_only',
        source: 'maid_user_request',
        reason: 'explicit_read_without_write',
      },
      requestPermission: () => {
        permissionRequested += 1;
        return 'allow';
      },
    }),
    err => err instanceof AgentToolSafetyError && err.code === 'agent_tool_write_intent_required',
  );
  assert.equal(permissionRequested, 0, '只读越界应在权限确认前阻止');
  assert.equal(executed, 0);

  const allowed = await registry.executeTool('worldbook.bind_session', {}, {
    operationIntentPolicy: {
      mode: 'write_allowed',
      source: 'maid_user_request',
      reason: 'explicit_write',
    },
    requestPermission: () => {
      permissionRequested += 1;
      return 'allow';
    },
  });
  assert.equal(allowed.status, 'succeeded');
  assert.equal(permissionRequested, 1);
  assert.equal(executed, 1);
  console.log('ok - agent tool registry blocks read-only intent from escalating into writes');
}

{
  // 只读意图 + 写工具：有确认通道时升级为强制确认，而不是硬拒绝。
  const confirmRequests = [];
  let executed = 0;
  let decision = 'deny';
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  registry.register({
    name: 'worldbook.bind_session',
    permissions: ['storage:write'],
    riskLevel: 'medium',
    safety: { operationType: 'bind_worldbook_to_session', destructive: 'never' },
    execute: async () => {
      executed += 1;
      return { ok: true };
    },
  });
  const context = {
    operationIntentPolicy: {
      mode: 'read_only',
      source: 'maid_user_request',
      reason: 'explicit_read_without_write',
    },
    requestToolConfirmation: (request) => {
      confirmRequests.push(request);
      return { decision };
    },
  };
  await assert.rejects(
    () => registry.executeTool('worldbook.bind_session', {}, context),
    err => err instanceof AgentToolSafetyError && err.code === 'agent_tool_write_intent_required',
  );
  assert.equal(executed, 0, '确认被拒后不得执行');
  assert.equal(confirmRequests.length, 1);
  assert.equal(confirmRequests[0].escalation, 'read_only_write');
  assert.equal(confirmRequests[0].kind, 'read_only_write_escalation');

  decision = 'allow';
  const allowed = await registry.executeTool('worldbook.bind_session', {}, context);
  assert.equal(allowed.status, 'succeeded');
  assert.equal(executed, 1, '确认放行后按条件写入执行');
  assert.equal(confirmRequests.length, 2);
  console.log('ok - read-only intent escalates write tools to forced confirmation instead of hard block');
}

{
  // 白名单：带确认闸的 diff 提案工具（allowInReadOnlyIntent）在只读意图下直接放行
  let executed = 0;
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  registry.register({
    name: 'chat.repair_message_format',
    permissions: ['storage:write'],
    riskLevel: 'medium',
    metadata: { allowInReadOnlyIntent: true },
    safety: { operationType: 'write', destructive: 'never' },
    execute: async () => {
      executed += 1;
      return { ok: true, userDecision: 'cancelled' };
    },
  });
  const result = await registry.executeTool('chat.repair_message_format', {}, {
    operationIntentPolicy: { mode: 'read_only', source: 'maid_user_request', reason: 'explicit_read_without_write' },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(executed, 1);
  console.log('ok - diff-proposal tools with UI confirmation gates bypass the read-only escalation');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger,
  });
  registry.register({
    name: 'guarded.tool',
    permissions: ['storage'],
    execute: async () => 'allowed',
  });
  await assert.rejects(
    () => registry.executeTool('guarded.tool', {}),
    err => err instanceof AgentToolPermissionError && err.code === 'agent_tool_permission_required',
  );
  const result = await registry.executeTool('guarded.tool', {}, {
    requestPermission: request => (request.permissions.includes('storage') ? 'allow' : 'deny'),
  });
  assert.equal(result.result, 'allowed');
  console.log('ok - agent tool registry requires explicit approval for ask permissions');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  const calls = [];
  registry.register({
    name: 'world.replace',
    riskLevel: 'medium',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string' },
        name: { type: 'string' },
      },
    },
    safety: {
      operationType: 'replace_existing',
      destructive: 'conditional',
      preflight: async args => (
        args.mode === 'replace'
          ? {
              destructive: true,
              kind: 'world.replace',
              title: '覆盖世界书',
              message: `覆盖 ${args.name}`,
              confirmText: '覆盖',
              cancelText: '新建副本',
              onDeny: {
                action: 'replace_args',
                reason: 'fallback_create_new',
                args: { ...args, mode: 'create_new' },
              },
            }
          : { destructive: false }
      ),
    },
    execute: async (args, context) => {
      calls.push({ args, safety: context.toolSafety });
      return { ok: true, mode: args.mode };
    },
  });
  const publicTool = registry.get('world.replace');
  assert.equal(publicTool.safety.operationType, 'replace_existing');
  assert.equal(publicTool.safety.preflight, undefined);

  const safe = await registry.executeTool('world.replace', { mode: 'append', name: 'A' });
  assert.equal(safe.result.mode, 'append');
  assert.equal(calls[0].safety.required, false);

  const confirmations = [];
  const confirmed = await registry.executeTool('world.replace', { mode: 'replace', name: 'A' }, {
    requestToolConfirmation: request => {
      confirmations.push(request);
      return { decision: 'allow' };
    },
  });
  assert.equal(confirmed.result.mode, 'replace');
  assert.equal(calls[1].safety.decision, 'allow');
  assert.equal(confirmations[0].title, '覆盖世界书');

  const fallback = await registry.executeTool('world.replace', { mode: 'replace', name: 'A' }, {
    requestToolConfirmation: () => false,
  });
  assert.equal(fallback.result.mode, 'create_new');
  assert.equal(calls[2].safety.decision, 'fallback');
  console.log('ok - agent tool registry runs safety preflight with confirmation and safe fallback args');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger,
  });
  let executed = false;
  registry.register({
    name: 'avatar.replace',
    riskLevel: 'medium',
    safety: {
      operationType: 'replace_existing',
      destructive: 'conditional',
      preflight: async () => ({
        destructive: true,
        kind: 'avatar.replace',
        title: '覆盖头像',
        message: '覆盖已有头像',
        onDeny: {
          action: 'skip',
          reason: 'destructive_write_cancelled',
        },
      }),
    },
    execute: async () => {
      executed = true;
      return { ok: true };
    },
  });
  const output = await registry.executeTool('avatar.replace', {}, {
    requestToolConfirmation: () => 'deny',
  });
  assert.equal(output.status, 'skipped');
  assert.equal(output.result.skipped, true);
  assert.equal(output.result.reason, 'destructive_write_cancelled');
  assert.equal(executed, false);
  console.log('ok - agent tool registry skips destructive tools when confirmation is denied');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    requireSafetyForWrites: true,
    logger,
  });
  assert.throws(
    () => registry.register({
      name: 'unsafe.write',
      riskLevel: 'medium',
      execute: async () => true,
    }),
    err => err instanceof AgentToolSafetyError && err.code === 'agent_tool_safety_required',
  );
  registry.register({
    name: 'safe.write',
    riskLevel: 'medium',
    safety: {
      operationType: 'create',
      destructive: 'never',
    },
    execute: async () => true,
  });
  assert.equal(registry.get('safe.write').safety.declared, true);
  console.log('ok - agent tool registry can require explicit safety policy for write tools');
}

{
  const calls = [];
  const [updateTool, abortTool] = createMemoryAgentTools({
    memoryUpdateRuntime: {
      runMemoryUpdateAfterChat: async (sessionId, isGroup, baseContext, options) => {
        calls.push({ type: 'update', sessionId, isGroup, baseContext, options });
      },
      abortMemoryUpdate: (sessionId) => {
        calls.push({ type: 'abort', sessionId });
      },
    },
  });
  const queued = await updateTool.execute({
    sessionId: 's1',
    isGroup: true,
    baseContext: { tone: 'quiet' },
    checkpointMessageId: 'm9',
  });
  const aborted = await abortTool.execute({ sessionId: 's1' });
  assert.deepEqual(queued, {
    queued: true,
    sessionId: 's1',
    checkpointMessageId: 'm9',
  });
  assert.deepEqual(aborted, {
    aborted: true,
    sessionId: 's1',
  });
  assert.deepEqual(calls, [
    {
      type: 'update',
      sessionId: 's1',
      isGroup: true,
      baseContext: { tone: 'quiet' },
      options: { checkpointMessageId: 'm9' },
    },
    { type: 'abort', sessionId: 's1' },
  ]);
  console.log('ok - memory agent tools delegate to memory update runtime contract');
}

{
  let runtime = null;
  const calls = [];
  const [updateTool] = createMemoryAgentTools({
    getMemoryUpdateRuntime: () => runtime,
  });
  await assert.rejects(
    () => updateTool.execute({ sessionId: 's2' }),
    /memory update runtime not available/,
  );
  runtime = {
    runMemoryUpdateAfterChat: async (sessionId) => {
      calls.push(sessionId);
    },
  };
  await updateTool.execute({ sessionId: 's2' });
  assert.deepEqual(calls, ['s2']);
  console.log('ok - memory agent tools support deferred runtime lookup');
}

{
  let received = null;
  const tools = createMemoryAgentTools({
    previewMemoryActions: async (payload) => {
      received = payload;
      return { changed: 2, skipped: 1, entries: [] };
    },
  });
  const previewTool = tools.find(tool => tool.name === 'memory.preview_actions');
  assert.equal(previewTool.capabilities.write, false);
  assert.equal(previewTool.capabilities.modelContext, 'allowlist');
  const result = await previewTool.execute({
    sessionId: 's3',
    isGroup: true,
    updateMode: 'standard',
    actions: [{ action: 'insert', tableId: 'profile', data: { name: '菲伦' } }],
    contextType: 'chat',
    uiMode: 'rp',
    useSharedGlobalScope: true,
  });
  assert.deepEqual(result, { changed: 2, skipped: 1, entries: [] });
  assert.deepEqual(received, {
    sessionId: 's3',
    isGroup: true,
    updateMode: 'standard',
    actions: [{ action: 'insert', tableId: 'profile', data: { name: '菲伦' } }],
    contextType: 'chat',
    uiMode: 'rp',
    useSharedGlobalScope: true,
  });
  assert.equal(createMemoryAgentTools().some(tool => tool.name === 'memory.preview_actions'), false);
  console.log('ok - memory agent tools expose read-only action preview contract');
}

{
  let payload = null;
  const [previewTool] = createVariableAgentTools({
    previewVariableCommands: async (nextPayload) => {
      payload = nextPayload;
      return { changed: 1, skipped: [] };
    },
  });
  assert.equal(previewTool.capabilities.write, false);
  assert.equal(previewTool.capabilities.modelContext, 'allowlist');
  const result = await previewTool.execute({
    sessionId: 's-variable',
    useGlobal: true,
    commands: [{ type: 'set', path: ['hp'], value: 12 }],
  });
  assert.deepEqual(result, { changed: 1, skipped: [] });
  assert.deepEqual(payload, {
    sessionId: 's-variable',
    useGlobal: true,
    commands: [{ type: 'set', path: ['hp'], value: 12 }],
  });
  assert.equal(createVariableAgentTools().length, 0);
  console.log('ok - variable agent tools expose read-only command preview contract');
}

{
  let payload = null;
  const [previewTool] = createWorldbookAgentTools({
    previewWorldbookActions: async (nextPayload) => {
      payload = nextPayload;
      return { changed: 2, skipped: 0, entries: [] };
    },
  });
  assert.equal(previewTool.capabilities.write, false);
  assert.equal(previewTool.capabilities.modelContext, 'allowlist');
  const result = await previewTool.execute({
    worldId: 'world-agent',
    actions: [{ action: 'update_entry', entryId: 'e1', patch: { content: 'next' } }],
  });
  assert.deepEqual(result, { changed: 2, skipped: 0, entries: [] });
  assert.deepEqual(payload, {
    worldId: 'world-agent',
    actions: [{ action: 'update_entry', entryId: 'e1', patch: { content: 'next' } }],
  });
  assert.equal(createWorldbookAgentTools().length, 0);
  console.log('ok - worldbook agent tools expose read-only action preview contract');
}

{
  let payload = null;
  const [imageTool] = createImageAgentTools({
    mediaGenerationService: {
      generateImage: async (nextPayload) => {
        payload = nextPayload;
        return { output: { path: 'generated.png' } };
      },
    },
  });
  const result = await imageTool.execute({
    prompt: '  draw city lights  ',
    config: { provider: 'test' },
    sessionId: 's2',
    scope: { source: 'agent' },
    options: { size: '512x512' },
  }, { signal: 'signal-token' });
  assert.deepEqual(payload, {
    prompt: 'draw city lights',
    config: { provider: 'test' },
    sessionId: 's2',
    scope: { source: 'agent' },
    options: { size: '512x512' },
    signal: 'signal-token',
    agentTask: true,
  });
  assert.equal(result.output.path, 'generated.png');
  assert.equal(imageTool.summarizeResult(result), 'image generated: generated.png');
  console.log('ok - image agent tool delegates to media generation service contract');
}

{
  // 确认 gate 前后应通知 onToolConfirmationPending/Resolved（run 可标 waiting_permission）
  const registry = createAgentToolRegistry({ logger: { warn() {} } });
  registry.register({
    name: 'test.dangerous_write',
    title: 'Dangerous write',
    source: 'test',
    riskLevel: 'high',
    capabilities: { read: false, write: true, network: false, cost: 'none', undo: 'none', modelContext: 'allowlist', confirmation: 'always' },
    safety: { destructive: 'always' },
    schema: { type: 'object', additionalProperties: true, properties: {} },
    execute: async () => ({ ok: true }),
  });
  const events = [];
  const out = await registry.executeTool('test.dangerous_write', {}, {
    requestPermission: () => ({ decision: 'allow' }),
    requestToolConfirmation: async () => { events.push('confirm'); return { decision: 'allow' }; },
    onToolConfirmationPending: () => events.push('pending'),
    onToolConfirmationResolved: () => events.push('resolved'),
  });
  assert.equal(out.status, 'succeeded');
  assert.deepEqual(events, ['pending', 'confirm', 'resolved'], '确认前后回调顺序');
  console.log('ok - 确认 gate 通知 pending/resolved 回调');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  let visibleRequest = null;
  let executionRequest = null;
  registry.register({
    name: 'test.structured_delete',
    title: 'Structured delete',
    riskLevel: 'high',
    capabilities: { read: true, write: true },
    safety: {
      operationType: 'delete_records',
      destructive: 'conditional',
      preflight: async () => ({
        destructive: true,
        kind: 'test.structured_delete',
        allowAlways: false,
        details: {
          resource: 'session',
          items: [
            { id: 'a', label: 'A', avatar: 'data:image/png;base64,AAAA' },
            { id: 'b', label: 'B', avatar: 'data:image/png;base64,BBBB' },
          ],
        },
      }),
    },
    execute: async (_args, context) => {
      executionRequest = context.toolSafety.request;
      return { ok: true };
    },
  });
  const output = await registry.executeTool('test.structured_delete', {}, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      visibleRequest = request;
      return true;
    },
  });
  assert.equal(output.status, 'succeeded');
  assert.equal(visibleRequest.allowAlways, false);
  assert.match(visibleRequest.details.items[0].avatar, /^data:image/);
  assert.equal(Object.hasOwn(executionRequest.details, 'items'), false);
  assert.equal(executionRequest.details.itemCount, 2);
  assert.deepEqual(executionRequest.details.itemIds, ['a', 'b']);
  assert.equal(JSON.stringify(executionRequest).includes('data:image'), false);
  console.log('ok - structured confirmation items are visible to UI but stripped from persisted tool safety context');
}
