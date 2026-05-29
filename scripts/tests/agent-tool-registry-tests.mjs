import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import {
  AgentToolError,
  AgentToolPermissionError,
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
