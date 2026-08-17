import assert from 'node:assert/strict';

import { AGENT_PERMISSION_DECISIONS } from '../../src/scripts/agent/agent-permissions.js';
import {
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_CONTRACT,
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_STATUSES,
  buildProviderToolPendingPermissionId,
  createProviderToolPendingPermissionStore,
} from '../../src/scripts/agent/provider-tool-pending-permissions.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../../src/scripts/agent/provider-tool-permission-actions.js';

{
  const id = buildProviderToolPendingPermissionId({
    sessionId: 's1',
    requestId: 'r1',
    toolCallId: 'call-1',
  });
  assert.equal(id, 'provider-tool-permission:s1:r1:call-1');
  console.log('ok - provider tool pending permission id is stable');
}

{
  const store = createProviderToolPendingPermissionStore({
    now: () => 1000,
    ttlMs: 5000,
  });
  const entry = store.add({
    requestId: 'stream-1',
    toolCall: {
      id: 'call-2',
      toolName: 'memory.write',
      sessionId: 's2',
      arguments: { text: 'remember' },
    },
    permissions: ['memory:write'],
    checks: [{ decision: 'ask' }],
    interaction: { mode: 'deferred_message_part', sessionId: 's2' },
  });

  assert.equal(entry.status, PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.pending);
  assert.equal(entry.id, 'provider-tool-permission:s2:stream-1:call-2');
  assert.equal(entry.expiresAt, 6000);
  assert.deepEqual(entry.permissions, ['memory:write']);
  assert.deepEqual(entry.argsPreview, { text: 'remember' });
  assert.deepEqual(entry.resumeContract, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_CONTRACT);
  assert.equal(store.getStats().pending, 1);
  assert.equal(store.list({ sessionId: 's2' }).length, 1);
  console.log('ok - provider tool pending permission store captures request snapshots');
}

{
  let clock = 2000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
    ttlMs: 5000,
  });
  const entry = store.add({
    requestId: 'stream-2',
    toolCallId: 'call-3',
    toolName: 'contact_profile.list',
    sessionId: 's3',
    permissions: ['storage'],
  });
  clock = 2500;
  const resolved = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);

  assert.equal(resolved.status, PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.allowed);
  assert.equal(resolved.decision, AGENT_PERMISSION_DECISIONS.allow);
  assert.equal(resolved.action, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  assert.equal(resolved.remember, false);
  assert.equal(resolved.resolvedAt, 2500);
  assert.equal(store.getStats().allowed, 1);
  console.log('ok - provider tool pending permission resolves allow once without remember flag');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 2750 });
  const entry = store.add({
    requestId: 'stream-private-continuation',
    toolCall: {
      id: 'call-private-continuation',
      toolName: 'contact_profile.list',
      sessionId: 's-private',
      providerContinuation: {
        api: 'gemini_generate_content',
        assistantContent: { parts: [{ thoughtSignature: 'opaque' }] },
      },
    },
    continuationContext: {
      historyMessages: [{ role: 'user', content: 'private' }],
    },
  });

  assert.equal(Object.hasOwn(entry.toolCall, 'providerContinuation'), false);
  assert.equal(
    store.getContinuationContext(entry.id).providerContinuation.assistantContent.parts[0].thoughtSignature,
    'opaque',
  );
  store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.deny);
  assert.equal(store.getContinuationContext(entry.id), null);
  console.log('ok - pending provider continuation state stays private and is discarded on denial');
}

{
  let clock = 3000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
    ttlMs: 100,
  });
  const entry = store.add({
    requestId: 'stream-3',
    toolCallId: 'call-4',
    toolName: 'memory.write',
    sessionId: 's4',
    permissions: ['memory:write'],
  });
  const denied = store.resolve(entry.id, 'invalid-action');

  assert.equal(denied.status, PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.denied);
  assert.equal(denied.decision, AGENT_PERMISSION_DECISIONS.deny);
  assert.equal(denied.action, PROVIDER_TOOL_PERMISSION_ACTIONS.deny);

  const remembered = store.add({
    requestId: 'stream-4',
    toolCallId: 'call-5',
    toolName: 'memory.write',
    sessionId: 's4',
    permissions: ['memory:write'],
  });
  const allowed = store.resolve(remembered.id, PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow);
  assert.equal(allowed.status, PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.allowed);
  assert.equal(allowed.remember, true);
  assert.equal(allowed.action, PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow);

  clock = 4000;
  const expired = store.add({
    requestId: 'stream-5',
    toolCallId: 'call-6',
    toolName: 'memory.write',
    sessionId: 's4',
    permissions: ['memory:write'],
  });
  clock = 4200;
  assert.equal(store.get(expired.id).status, PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.expired);
  assert.equal(store.getStats().expired, 1);
  console.log('ok - provider tool pending permission denies invalid actions and expires stale requests');
}

{
  let clock = 5000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
  });
  const entry = store.add({
    requestId: 'stream-6',
    toolCallId: 'call-7',
    toolName: 'contact_profile.list',
    sessionId: 's5',
    permissions: ['storage'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  clock = 5100;
  const running = store.markResume(allowed.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running,
  });
  clock = 5200;
  const succeeded = store.markResume(allowed.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded,
    result: { changed: 1 },
    parts: [{ id: 'resume-part-1', type: 'provider_tool_result', status: 'succeeded' }],
  });

  assert.equal(running.resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running);
  assert.equal(running.resumeAttempt, 1);
  assert.equal(running.resumeStartedAt, 5100);
  assert.equal(succeeded.resumeStatus, PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded);
  assert.equal(succeeded.resumeAttempt, 1);
  assert.equal(succeeded.resumeFinishedAt, 5200);
  assert.deepEqual(succeeded.resumeResult, { changed: 1 });
  assert.deepEqual(succeeded.resumeParts, [{ id: 'resume-part-1', type: 'provider_tool_result', status: 'succeeded' }]);
  console.log('ok - provider tool pending permission store tracks single-call resume state');
}

{
  let clock = 6000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
  });
  const entry = store.add({
    requestId: 'stream-7',
    toolCallId: 'call-8',
    toolName: 'contact_profile.list',
    sessionId: 's6',
    permissions: ['storage'],
  });
  const allowed = store.resolve(entry.id, PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce);
  clock = 6100;
  const ready = store.markContinuation(allowed.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready,
    result: {
      requestPreview: { toolResultCount: 1 },
      runnerFacade: { status: 'disabled' },
    },
    parts: [{ id: 'continuation-part-1', type: 'provider_stream_events', status: 'succeeded' }],
  });

  assert.equal(ready.continuationStatus, PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready);
  assert.equal(ready.continuationAttempt, 1);
  assert.equal(ready.continuationFinishedAt, 6100);
  assert.deepEqual(ready.continuationResult.runnerFacade, { status: 'disabled' });
  assert.deepEqual(ready.continuationParts, [{ id: 'continuation-part-1', type: 'provider_stream_events', status: 'succeeded' }]);
  console.log('ok - provider tool pending permission store tracks continuation plan state');
}

{
  let clock = 7000;
  const store = createProviderToolPendingPermissionStore({
    now: () => clock,
  });
  const entry = store.add({
    requestId: 'stream-8',
    toolCallId: 'call-9',
    toolName: 'chat.emit_private',
    sessionId: 's7',
    permissions: ['chat:emit_candidate'],
  });
  clock = 7100;
  const running = store.markCommit(entry.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.running,
  });
  clock = 7200;
  const committed = store.markCommit(entry.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.committed,
    result: {
      status: 'committed',
      refs: { createdMessageIds: ['m1'] },
    },
  });
  clock = 7300;
  const undoRunning = store.markCommitUndo(entry.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.running,
  });
  clock = 7400;
  const undone = store.markCommitUndo(entry.id, {
    status: PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.undone,
    result: {
      status: 'undone',
      refs: { deletedMessages: [{ sessionId: 's7', messageId: 'm1' }] },
    },
  });

  assert.equal(running.commitStatus, PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.running);
  assert.equal(running.commitAttempt, 1);
  assert.equal(running.commitStartedAt, 7100);
  assert.equal(committed.commitStatus, PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.committed);
  assert.equal(committed.commitFinishedAt, 7200);
  assert.deepEqual(committed.commitResult.refs.createdMessageIds, ['m1']);
  assert.equal(undoRunning.commitUndoStatus, PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.running);
  assert.equal(undoRunning.commitUndoAttempt, 1);
  assert.equal(undone.commitStatus, PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.undone);
  assert.equal(undone.commitUndoStatus, PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.undone);
  assert.equal(undone.commitUndoFinishedAt, 7400);
  assert.deepEqual(undone.commitUndoResult.refs.deletedMessages, [{ sessionId: 's7', messageId: 'm1' }]);
  console.log('ok - provider tool pending permission store tracks explicit chat emit commit and undo state');
}
