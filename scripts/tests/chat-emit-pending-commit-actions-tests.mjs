import assert from 'node:assert/strict';

import { createProviderToolPendingPermissionStore } from '../../src/scripts/agent/provider-tool-pending-permissions.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../../src/scripts/agent/provider-tool-permission-actions.js';
import { createChatEmitPendingCommitActions } from '../../src/scripts/ui/chat/chat-emit-pending-commit-actions.js';

{
  const store = createProviderToolPendingPermissionStore({ now: () => 1000 });
  const entry = store.add({
    id: 'pending-chat-emit-1',
    status: 'allowed',
    decision: 'allow',
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
    toolName: 'chat.emit_private',
    sessionId: 'contact:firen',
    permissions: ['chat:emit_candidate'],
    argsPreview: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
    resumeStatus: 'succeeded',
    resumeResult: {
      output: {
        status: 'succeeded',
        result: {
          commitContract: {
            version: 'chat_emit_commit_contract_v1',
            toolName: 'chat.emit_private',
            status: 'ready',
            protocolEvent: {
              type: 'private_chat',
              otherName: '菲伦',
              messages: [{ speaker: '菲伦', content: '今晚别一个人走。' }],
            },
            undo: { strategy: 'delete_created_chat_messages' },
          },
        },
      },
    },
  });
  const calls = [];
  const actions = createChatEmitPendingCommitActions({
    pendingPermissionStore: store,
    createRuntime: () => ({ marker: 'runtime' }),
    commitChatEmitContract: async ({ contract, runtime, confirmed }) => {
      calls.push({ contract, runtime, confirmed });
      return {
        status: 'committed',
        writesChat: true,
        refs: {
          createdMessages: [{ sessionId: 'contact:firen', messageId: 'm1' }],
          createdMessageIds: ['m1'],
        },
        undo: contract.undo,
      };
    },
  });
  const result = await actions.commitChatEmitPendingPermission({ id: entry.id, confirmed: true });
  const stored = store.get(entry.id);
  assert.equal(result.ok, true);
  assert.equal(calls[0].confirmed, true);
  assert.equal(calls[0].runtime.marker, 'runtime');
  assert.equal(stored.commitStatus, 'committed');
  assert.deepEqual(stored.commitResult.refs.createdMessageIds, ['m1']);
  console.log('ok - chat emit pending commit action commits resumed review-only candidates explicitly');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 2000 });
  const entry = store.add({
    id: 'pending-chat-emit-2',
    status: 'allowed',
    decision: 'allow',
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
    toolName: 'chat.emit_private',
    sessionId: 'contact:firen',
    permissions: ['chat:emit_candidate'],
    resumeStatus: 'idle',
    argsPreview: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
  });
  const actions = createChatEmitPendingCommitActions({
    pendingPermissionStore: store,
    commitChatEmitContract: async () => {
      throw new Error('should not commit before resume');
    },
  });
  const result = await actions.commitChatEmitPendingPermission({ id: entry.id, confirmed: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'resume_not_succeeded:idle');
  assert.match(result.message, /候选尚未完成工具恢复/);
  assert.equal(store.get(entry.id).commitStatus, 'idle');
  console.log('ok - chat emit pending commit action blocks candidates before tool resume succeeds');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 2500 });
  const entry = store.add({
    id: 'pending-chat-emit-2b',
    status: 'allowed',
    decision: 'allow',
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
    toolName: 'chat.emit_private',
    sessionId: 'contact:firen',
    permissions: ['chat:emit_candidate'],
    resumeStatus: 'succeeded',
    argsPreview: {
      targetName: '不存在',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
  });
  const actions = createChatEmitPendingCommitActions({
    pendingPermissionStore: store,
    commitChatEmitContract: async () => ({
      status: 'skipped',
      writesChat: false,
      reason: 'target_session_not_found',
      refs: { createdMessages: [], createdMessageIds: [] },
    }),
  });
  const result = await actions.commitChatEmitPendingPermission({ id: entry.id, confirmed: true });
  const stored = store.get(entry.id);
  assert.equal(result.ok, true);
  assert.equal(stored.commitStatus, 'skipped');
  assert.match(stored.commitResult.displayMessage, /找不到候选目标会话/);
  assert.equal(stored.commitErrorMessage, '');
  console.log('ok - chat emit pending commit action stores readable skipped commit messages');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 2600 });
  const entry = store.add({
    id: 'pending-chat-emit-reject',
    status: 'allowed',
    decision: 'allow',
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
    toolName: 'chat.emit_private',
    sessionId: 'contact:firen',
    permissions: ['chat:emit_candidate'],
    resumeStatus: 'succeeded',
    argsPreview: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
  });
  const actions = createChatEmitPendingCommitActions({
    pendingPermissionStore: store,
  });
  const result = await actions.rejectChatEmitPendingCommit({ id: entry.id });
  const stored = store.get(entry.id);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped');
  assert.equal(stored.commitStatus, 'skipped');
  assert.equal(stored.commitResult.reason, 'user_rejected');
  assert.equal(stored.commitResult.writesChat, false);
  assert.match(stored.commitResult.displayMessage, /已打回/);
  console.log('ok - chat emit pending reject action marks candidates as handled without writing chat');
}

{
  const store = createProviderToolPendingPermissionStore({ now: () => 3000 });
  const entry = store.add({
    id: 'pending-chat-emit-3',
    status: 'allowed',
    decision: 'allow',
    action: PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
    toolName: 'chat.emit_private',
    sessionId: 'contact:firen',
    permissions: ['chat:emit_candidate'],
    resumeStatus: 'succeeded',
    commitStatus: 'committed',
    commitResult: {
      status: 'committed',
      refs: {
        createdMessages: [{ sessionId: 'contact:firen', messageId: 'm1' }],
      },
      undo: { strategy: 'delete_created_chat_messages' },
    },
  });
  const actions = createChatEmitPendingCommitActions({
    pendingPermissionStore: store,
    undoChatEmitCommit: async ({ commitResult, confirmed }) => ({
      status: confirmed && commitResult?.refs?.createdMessages?.length ? 'undone' : 'blocked',
      refs: { deletedMessages: commitResult.refs.createdMessages },
    }),
  });
  const result = await actions.undoChatEmitPendingCommit({ id: entry.id, confirmed: true });
  const stored = store.get(entry.id);
  assert.equal(result.ok, true);
  assert.equal(stored.commitStatus, 'undone');
  assert.equal(stored.commitUndoStatus, 'undone');
  assert.deepEqual(stored.commitUndoResult.refs.deletedMessages, [{ sessionId: 'contact:firen', messageId: 'm1' }]);
  console.log('ok - chat emit pending commit action undoes committed candidates explicitly');
}
