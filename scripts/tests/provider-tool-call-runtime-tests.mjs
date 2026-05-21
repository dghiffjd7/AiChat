import assert from 'node:assert/strict';

import { AGENT_PERMISSION_DECISIONS, createAgentPermissionEvaluator } from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { createProviderToolCallRuntime } from '../../src/scripts/agent/provider-tool-call-runtime.js';
import { createProviderToolLoopGuard } from '../../src/scripts/agent/provider-tool-loop-guard.js';
import { createProviderToolPendingPermissionStore } from '../../src/scripts/agent/provider-tool-pending-permissions.js';

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn: () => {} },
  });
  registry.register({
    name: 'memory.echo',
    permissions: ['memory:read'],
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async args => ({ echoed: args.text }),
    summarizeResult: result => `echoed ${result.echoed}`,
  });
  const runtime = createProviderToolCallRuntime({
    toolRegistry: registry,
    now: () => 1000,
    logger: { warn: () => {} },
  });
  const result = await runtime.executeToolCall({
    id: 'call-1',
    toolName: 'memory.echo',
    arguments: { text: 'hello' },
  }, {
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.output.result.echoed, 'hello');
  assert.deepEqual(result.parts.map(part => part.type), ['provider_tool_call', 'provider_tool_result']);
  assert.equal(result.parts[1].status, 'succeeded');
  console.log('ok - createProviderToolCallRuntime executes one provider tool call through tool registry');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger: { warn: () => {} },
  });
  registry.register({
    name: 'memory.write',
    permissions: ['memory:write'],
    schema: { type: 'object' },
    execute: async args => ({ changed: args.text ? 1 : 0 }),
  });
  const pendingPermissionStore = {
    entries: [],
    resolved: [],
    add(request) {
      const entry = { id: 'pending-runtime-allow', request, status: 'pending' };
      this.entries.push(entry);
      return entry;
    },
    resolve(id, action, options) {
      this.resolved.push({ id, action, options });
      return { id, action, status: 'allowed' };
    },
  };
  const runtime = createProviderToolCallRuntime({
    toolRegistry: registry,
    pendingPermissionStore,
    now: () => 2000,
    logger: { warn: () => {} },
  });
  const permissionRequests = [];
  const result = await runtime.executeToolCall({
    id: 'call-2',
    toolName: 'memory.write',
    arguments: { text: 'remember' },
  }, {
    requestId: 'stream-allow',
    requestPermission: async (request) => {
      permissionRequests.push(request);
      return { decision: 'allow' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(permissionRequests.length, 1);
  assert.deepEqual(result.parts.map(part => part.type), [
    'provider_tool_call',
    'provider_tool_permission_request',
    'provider_tool_result',
  ]);
  assert.equal(permissionRequests[0].interaction.mode, 'deferred_message_part');
  assert.equal(result.parts[1].status, 'waiting_permission');
  assert.equal(result.parts[1].metadata.interaction.promptModal, false);
  assert.equal(result.parts[1].metadata.pendingPermissionId, 'pending-runtime-allow');
  assert.equal(result.parts[1].metadata.requestId, 'stream-allow');
  assert.equal(pendingPermissionStore.entries.length, 1);
  assert.deepEqual(pendingPermissionStore.resolved.map(item => item.action), ['allow_once']);
  assert.equal(result.parts[2].status, 'succeeded');
  console.log('ok - createProviderToolCallRuntime emits permission request part before allowed tool execution');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger: { warn: () => {} },
  });
  registry.register({
    name: 'memory.write',
    permissions: ['memory:write'],
    schema: { type: 'object' },
    execute: async () => ({ changed: 1 }),
  });
  const pendingPermissionStore = createProviderToolPendingPermissionStore({
    now: () => 2500,
  });
  const runtime = createProviderToolCallRuntime({
    toolRegistry: registry,
    pendingPermissionStore,
    now: () => 2500,
    logger: { warn: () => {} },
  });
  const result = await runtime.executeToolCall({
    id: 'call-2b',
    toolName: 'memory.write',
    arguments: { text: 'remember' },
  }, {
    requestId: 'stream-deferred',
    sessionId: 's1',
    providerToolSessionGate: { enabled: true, sessionId: 's1' },
    promptPermission: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.parts.map(part => part.type), [
    'provider_tool_call',
    'provider_tool_permission_request',
    'provider_tool_result',
  ]);
  assert.equal(result.parts[1].metadata.interaction.mode, 'deferred_message_part');
  assert.equal(result.parts[1].metadata.interaction.sessionGateEnabled, true);
  assert.equal(result.parts[1].metadata.interaction.promptModal, false);
  assert.equal(result.parts[1].metadata.pendingPermissionId, 'provider-tool-permission:s1:stream-deferred:call-2b');
  assert.equal(pendingPermissionStore.list({ status: 'pending' }).length, 1);
  assert.equal(result.parts[2].errorMessage.includes('Agent tool permission ask'), true);
  console.log('ok - createProviderToolCallRuntime defers provider permission without modal prompt by default');
}

{
  const registry = {
    executeTool: async () => ({ status: 'succeeded', result: { ok: true } }),
  };
  const runtime = createProviderToolCallRuntime({
    toolRegistry: registry,
    loopGuard: createProviderToolLoopGuard({ maxRepeats: 1, now: () => 3000 }),
    now: () => 3000,
    logger: { warn: () => {} },
  });
  const first = await runtime.executeToolCall({
    id: 'call-3a',
    toolName: 'memory.echo',
    arguments: { text: 'same' },
  });
  const second = await runtime.executeToolCall({
    id: 'call-3b',
    toolName: 'memory.echo',
    arguments: { text: 'same' },
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.status, 'blocked');
  assert.equal(second.parts[1].status, 'failed');
  assert.equal(second.parts[1].errorMessage.includes('repeated provider tool call blocked'), true);
  console.log('ok - createProviderToolCallRuntime blocks repeated provider tool calls before execution');
}

{
  const runtime = createProviderToolCallRuntime({
    toolRegistry: null,
    now: () => 4000,
    logger: { warn: () => {} },
  });
  const result = await runtime.executeToolCall({
    id: 'call-4',
    toolName: 'missing',
    arguments: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.parts[1].summary, 'provider tool registry not configured');
  console.log('ok - createProviderToolCallRuntime returns failed result part when registry is missing');
}
