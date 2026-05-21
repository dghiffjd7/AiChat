import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES,
  createProviderToolPendingPermissionStore,
} from '../../src/scripts/agent/provider-tool-pending-permissions.js';
import {
  createProviderToolPendingContinuationPlanner,
} from '../../src/scripts/agent/provider-tool-pending-continuation.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../../src/scripts/agent/provider-tool-permission-actions.js';

const createAllowedResumedPending = ({
  toolName = 'contact_profile.list',
  provider = 'openai',
  model = 'gpt-continuation',
  permissions = ['storage'],
  output = {
    status: 'succeeded',
    result: { items: [{ id: 'c1', name: 'Alice' }] },
    summary: '1 contact available',
  },
  now = () => 1000,
} = {}) => {
  const store = createProviderToolPendingPermissionStore({ now });
  const entry = store.add({
    requestId: 'continuation-1',
    toolCall: {
      id: `call-${toolName}`,
      toolName,
      sessionId: 's1',
      provider,
      model,
      arguments: { limit: 1 },
    },
    permissions,
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  store.markResume(allowed.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded,
    result: {
      output,
      partCount: 2,
    },
  });
  return { store, pendingId: allowed.id };
};

{
  const store = createProviderToolPendingPermissionStore({
    now: () => 1000,
  });
  const entry = store.add({
    requestId: 'continuation-blocked',
    toolCall: {
      id: 'call-blocked',
      toolName: 'contact_profile.list',
      sessionId: 's1',
      provider: 'openai',
      model: 'gpt-continuation',
      arguments: { limit: 1 },
    },
    permissions: ['storage'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  const planner = createProviderToolPendingContinuationPlanner({
    pendingPermissionStore: store,
    now: () => 1100,
  });
  const plan = await planner.plan(allowed.id);

  assert.equal(plan.ok, false);
  assert.equal(plan.status, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked);
  assert.equal(plan.reason.includes('resume is not succeeded'), true);
  assert.equal(store.get(allowed.id).continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked);
  console.log('ok - provider tool pending continuation blocks before resume succeeds');
}

{
  const { store, pendingId } = createAllowedResumedPending({
    now: () => 2000,
  });
  const planner = createProviderToolPendingContinuationPlanner({
    pendingPermissionStore: store,
    now: () => 2100,
  });
  const plan = await planner.plan(pendingId);
  const stored = store.get(pendingId);

  assert.equal(plan.ok, true);
  assert.equal(plan.status, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready);
  assert.equal(plan.network, false);
  assert.equal(plan.writesChat, false);
  assert.equal(plan.replayChat, false);
  assert.equal(plan.runsProvider, false);
  assert.equal(plan.realNetwork, false);
  assert.equal(plan.requestPreview.toolResultCount, 1);
  assert.equal(plan.requestPreview.messages[1].role, 'tool');
  assert.equal(plan.runnerHandoff.status, 'ready');
  assert.equal(plan.runnerRequestDraft.status, 'ready');
  assert.equal(plan.runnerFacade.status, 'disabled');
  assert.equal(plan.loopState.shouldContinue, true);
  assert.equal(stored.continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready);
  assert.equal(stored.continuationAttempt, 1);
  assert.equal(stored.continuationResult.runnerFacade.status, 'disabled');
  console.log('ok - provider tool pending continuation builds request draft with facade disabled');
}

{
  const { store, pendingId } = createAllowedResumedPending({
    toolName: 'memory.write',
    permissions: ['memory:write'],
    output: {
      status: 'succeeded',
      result: { changed: 1 },
      summary: 'memory changed',
    },
    now: () => 3000,
  });
  const planner = createProviderToolPendingContinuationPlanner({
    pendingPermissionStore: store,
    now: () => 3100,
  });
  const plan = await planner.plan(pendingId);

  assert.equal(plan.ok, false);
  assert.equal(plan.status, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped);
  assert.equal(plan.requestPreview.toolResultCount, 0);
  assert.equal(plan.requestPreview.skippedToolResultCount, 1);
  assert.equal(plan.runnerHandoff.reason.includes('no model-safe tool results'), true);
  assert.equal(store.get(pendingId).continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped);
  console.log('ok - provider tool pending continuation skips tools outside model-context allowlist');
}

{
  const { store, pendingId } = createAllowedResumedPending({
    now: () => 4000,
  });
  const planner = createProviderToolPendingContinuationPlanner({
    pendingPermissionStore: store,
    now: () => 4100,
  });
  const plan = await planner.plan(pendingId, {
    runnerFacadeEnabled: true,
    runner: async (draft, context) => {
      assert.equal(context.allowNetwork, false);
      assert.equal(draft.writesChat, false);
      return {
        output: 'provider_stream_events',
        network: false,
        writesChat: false,
        events: [
          { type: 'provider_stream_start' },
          { type: 'provider_stream_delta', textDelta: 'ready', accumulatedText: 'ready' },
          { type: 'provider_stream_end', finalText: 'ready', finishReason: 'stop' },
        ],
      };
    },
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.status, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded);
  assert.equal(plan.runsProvider, true);
  assert.equal(plan.realNetwork, false);
  assert.equal(plan.runnerFacade.eventCount, 3);
  assert.equal(plan.runnerFacade.finalText, 'ready');
  assert.equal(store.get(pendingId).continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded);
  console.log('ok - provider tool pending continuation can run injected local facade runner');
}

{
  const { store, pendingId } = createAllowedResumedPending({
    now: () => 5000,
  });
  const planner = createProviderToolPendingContinuationPlanner({
    pendingPermissionStore: store,
    now: () => 5100,
  });
  const plan = await planner.plan(pendingId, {
    runnerFacadeEnabled: true,
    runner: async () => ({
      output: 'provider_stream_events',
      network: true,
      events: [{ type: 'provider_stream_start' }],
    }),
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.status, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked);
  assert.equal(plan.runsProvider, false);
  assert.equal(plan.runnerFacade.reason.includes('network'), true);
  assert.equal(store.get(pendingId).continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked);
  console.log('ok - provider tool pending continuation facade blocks network results');
}
