import assert from 'node:assert/strict';

import { createProviderToolPendingPermissionStore } from '../../src/scripts/agent/provider-tool-pending-permissions.js';
import { createAgentWritePreviewPendingCommitActions } from '../../src/scripts/ui/agent-write-preview-pending-commit-actions.js';

{
  const store = createProviderToolPendingPermissionStore({ now: () => 1000 });
  const pending = store.add({
    id: 'p-variable',
    sessionId: 's1',
    requestId: 'r1',
    toolCallId: 't1',
    toolName: 'variable.preview_commands',
    argsPreview: {
      sessionId: 's1',
      commands: [{ type: 'set', path: ['hp'], value: 12 }],
    },
  });
  store.resolve(pending.id, 'allow_once');
  store.markResume(pending.id, {
    status: 'succeeded',
    result: {
      output: {
        result: {
          changed: 1,
          updates: { hp: 12 },
          rollbackSnapshot: { hp: 10 },
        },
      },
    },
  });
  const calls = [];
  const actions = createAgentWritePreviewPendingCommitActions({
    pendingPermissionStore: store,
    commitHandlers: {
      'variable.preview_commands': async ({ args, previewResult }) => {
        calls.push(['commit', args.sessionId, previewResult.updates.hp]);
        return {
          status: 'committed',
          writesStore: true,
          changed: 1,
          rollbackSnapshot: previewResult.rollbackSnapshot,
          refs: { changedKeys: ['hp'] },
        };
      },
    },
    undoHandlers: {
      'variable.preview_commands': async ({ commitResult }) => {
        calls.push(['undo', commitResult.refs.changedKeys[0]]);
        return { status: 'undone', changed: 1 };
      },
    },
  });
  const blocked = await actions.commitAgentWritePreviewPendingPermission({ id: pending.id });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'confirmation_required');
  const committed = await actions.commitAgentWritePreviewPendingPermission({ id: pending.id, confirmed: true });
  assert.equal(committed.ok, true);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.writesStore, true);
  assert.equal(store.get(pending.id).commitStatus, 'committed');
  const undone = await actions.undoAgentWritePreviewPendingCommit({ id: pending.id, confirmed: true });
  assert.equal(undone.ok, true);
  assert.equal(undone.status, 'undone');
  assert.equal(store.get(pending.id).commitStatus, 'undone');
  assert.deepEqual(calls, [
    ['commit', 's1', 12],
    ['undo', 'hp'],
  ]);
  console.log('ok - write preview pending commit actions require confirmation and store commit/undo state');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 1000 });
  const pending = store.add({
    id: 'p-memory',
    sessionId: 's1',
    requestId: 'r1',
    toolCallId: 't1',
    toolName: 'memory.preview_actions',
    argsPreview: { sessionId: 's1', actions: [{ action: 'insert' }] },
  });
  store.resolve(pending.id, 'allow_once');
  const actions = createAgentWritePreviewPendingCommitActions({
    pendingPermissionStore: store,
    commitHandlers: {
      'memory.preview_actions': async () => ({ status: 'committed' }),
    },
  });
  const result = await actions.commitAgentWritePreviewPendingPermission({ id: pending.id, confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'resume_not_succeeded:idle');
  assert.match(result.message, /预览尚未完成/);
  console.log('ok - write preview pending commit actions block before preview resume succeeds');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 1000 });
  const pending = store.add({
    id: 'p-variable-reject',
    sessionId: 's1',
    requestId: 'r1',
    toolCallId: 't1',
    toolName: 'variable.preview_commands',
    argsPreview: {
      sessionId: 's1',
      commands: [{ type: 'set', path: ['hp'], value: 12 }],
    },
  });
  store.resolve(pending.id, 'allow_once');
  store.markResume(pending.id, {
    status: 'succeeded',
    result: {
      output: {
        result: {
          changed: 1,
          updates: { hp: 12 },
        },
      },
    },
  });
  const actions = createAgentWritePreviewPendingCommitActions({
    pendingPermissionStore: store,
  });
  const result = await actions.rejectAgentWritePreviewPendingCommit({ id: pending.id });
  const stored = store.get(pending.id);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped');
  assert.equal(stored.commitStatus, 'skipped');
  assert.equal(stored.commitResult.reason, 'user_rejected');
  assert.equal(stored.commitResult.writesStore, false);
  assert.match(stored.commitResult.displayMessage, /已打回/);
  console.log('ok - write preview pending reject action marks candidates as handled without writing store');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 1000 });
  const pending = store.add({
    id: 'p-chat',
    sessionId: 's1',
    requestId: 'r1',
    toolCallId: 't1',
    toolName: 'chat.emit_private',
    argsPreview: {},
  });
  const actions = createAgentWritePreviewPendingCommitActions({
    pendingPermissionStore: store,
  });
  const result = await actions.commitAgentWritePreviewPendingPermission({ id: pending.id, confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_write_preview_tool');
  console.log('ok - write preview pending commit actions reject non-write-preview tools');
}
