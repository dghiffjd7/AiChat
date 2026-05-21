import assert from 'node:assert/strict';

import { AGENT_PERMISSION_DECISIONS, createAgentPermissionEvaluator } from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import {
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES,
  createProviderToolPendingPermissionStore,
} from '../../src/scripts/agent/provider-tool-pending-permissions.js';
import { createProviderToolPendingResumeExecutor } from '../../src/scripts/agent/provider-tool-pending-resume.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../../src/scripts/agent/provider-tool-permission-actions.js';

const createMemoryWriteRegistry = () => {
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger: { warn: () => {} },
  });
  registry.register({
    name: 'memory.write',
    permissions: ['memory:write'],
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: async args => ({ changed: args.text ? 1 : 0 }),
    summarizeResult: result => `changed ${result.changed}`,
  });
  return registry;
};

{
  const store = createProviderToolPendingPermissionStore({
    now: () => 1000,
  });
  const entry = store.add({
    requestId: 'resume-1',
    toolCall: {
      id: 'call-resume-1',
      toolName: 'memory.write',
      sessionId: 's1',
      arguments: { text: 'remember' },
    },
    permissions: ['memory:write'],
  });
  const executor = createProviderToolPendingResumeExecutor({
    toolRegistry: createMemoryWriteRegistry(),
    pendingPermissionStore: store,
    readSessionGate: () => ({ enabled: true, sessionId: 's1' }),
    now: () => 1100,
    logger: { warn: () => {} },
  });

  const blocked = await executor.resume(entry.id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked);
  assert.equal(blocked.reason.includes('not allowed'), true);
  assert.equal(store.get(entry.id).resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.idle);
  console.log('ok - provider tool pending resume blocks unresolved permissions');
}

{
  let clock = 2000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
  });
  const entry = store.add({
    requestId: 'resume-2',
    toolCall: {
      id: 'call-resume-2',
      toolName: 'memory.write',
      sessionId: 's2',
      arguments: { text: 'remember' },
      provider: 'openai',
      model: 'gpt-x',
    },
    permissions: ['memory:write'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  const executor = createProviderToolPendingResumeExecutor({
    toolRegistry: createMemoryWriteRegistry(),
    pendingPermissionStore: store,
    readSessionGate: () => ({ enabled: true, sessionId: 's2' }),
    now: () => clock,
    logger: { warn: () => {} },
  });
  clock = 2100;
  const resumed = await executor.resume(allowed.id);
  const stored = store.get(allowed.id);

  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.replayChat, false);
  assert.equal(resumed.writesChat, false);
  assert.equal(resumed.runsProvider, false);
  assert.deepEqual(resumed.parts.map(part => part.type), ['provider_tool_call', 'provider_tool_result']);
  assert.equal(resumed.parts[1].status, 'succeeded');
  assert.equal(resumed.output.result.changed, 1);
  assert.equal(stored.resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded);
  assert.equal(stored.resumeAttempt, 1);
  assert.equal(stored.resumeResult.partCount, 2);
  assert.deepEqual(stored.resumeParts.map(part => part.type), ['provider_tool_call', 'provider_tool_result']);

  const duplicate = await executor.resume(allowed.id);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded);
  assert.equal(duplicate.resumed, false);
  console.log('ok - provider tool pending resume executes one allowed tool call once');
}

{
  const store = createProviderToolPendingPermissionStore({
    now: () => 3000,
  });
  const entry = store.add({
    requestId: 'resume-3',
    toolCall: {
      id: 'call-resume-3',
      toolName: 'memory.write',
      sessionId: 's3',
      arguments: { text: 'remember' },
    },
    permissions: ['memory:write'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow);
  const executor = createProviderToolPendingResumeExecutor({
    toolRegistry: createMemoryWriteRegistry(),
    pendingPermissionStore: store,
    readSessionGate: () => ({ enabled: false, sessionId: 's3' }),
    now: () => 3100,
    logger: { warn: () => {} },
  });
  const blocked = await executor.resume(allowed.id);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked);
  assert.equal(blocked.reason, 'provider tool session gate is disabled');
  assert.equal(store.get(allowed.id).resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked);
  console.log('ok - provider tool pending resume requires the session gate to stay enabled');
}

{
  const store = createProviderToolPendingPermissionStore({
    now: () => 4000,
  });
  const entry = store.add({
    requestId: 'resume-4',
    toolCall: {
      id: 'call-resume-4',
      toolName: 'memory.write',
      sessionId: 's4',
      arguments: { text: 'remember' },
    },
    permissions: ['other:permission'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  const executor = createProviderToolPendingResumeExecutor({
    toolRegistry: createMemoryWriteRegistry(),
    pendingPermissionStore: store,
    readSessionGate: () => ({ enabled: true, sessionId: 's4' }),
    now: () => 4100,
    logger: { warn: () => {} },
  });
  const failed = await executor.resume(allowed.id);

  assert.equal(failed.ok, false);
  assert.equal(failed.status, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.failed);
  assert.equal(failed.errorMessage.includes('Agent tool permission ask'), true);
  assert.equal(store.get(allowed.id).resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.failed);
  assert.deepEqual(store.get(allowed.id).resumeParts.map(part => part.type), ['provider_tool_call', 'provider_tool_result']);
  console.log('ok - provider tool pending resume fails closed when resumed permission does not match');
}
