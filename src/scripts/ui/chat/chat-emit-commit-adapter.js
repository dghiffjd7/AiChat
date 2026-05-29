import { buildChatEmitCommitAdapterPreflight } from '../../agent/tools/chat-emit-commit-adapter-preflight.js';
import {
  appendProtocolGroupChatEventImmediate,
  appendProtocolPrivateChatEventImmediate,
} from './protocol-event-apply-utils.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const list = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

const resolveAppendMessage = runtime => (
  typeof runtime?.appendMessage === 'function'
    ? runtime.appendMessage
    : runtime?.chatStore?.appendMessage?.bind(runtime.chatStore)
);

const resolveDeleteMessage = runtime => (
  typeof runtime?.deleteMessage === 'function'
    ? runtime.deleteMessage
    : runtime?.chatStore?.deleteMessage?.bind(runtime.chatStore)
);

const momentSignature = (moment = {}) => (
  trim(moment.signature) || `${String(moment.author || '').trim()}\u0000${String(moment.content || '')}\u0000${String(moment.time || '')}`
);

const findMomentSnapshot = (store, moment = {}) => {
  if (!store) return { id: trim(moment.id), existed: false, snapshot: null };
  const id = trim(moment.id);
  const byId = id && typeof store.get === 'function' ? store.get(id) : null;
  if (byId) return { id: trim(byId.id || id), existed: true, snapshot: clone(byId) };
  const signature = momentSignature(moment);
  const all = typeof store.list === 'function' ? store.list() : [];
  const bySignature = list(all).find(item => trim(item?.signature) === signature);
  if (bySignature) return { id: trim(bySignature.id), existed: true, snapshot: clone(bySignature) };
  return { id, existed: false, snapshot: null };
};

const commitChatEvent = async (contract, runtime, preflight) => {
  const appendMessage = resolveAppendMessage(runtime);
  const event = contract.protocolEvent;
  const createdMessages = [];
  const wrappedAppend = (message, sessionId) => {
    const saved = appendMessage(message, sessionId) || message;
    const messageId = trim(saved?.id || message?.id);
    if (messageId) {
      createdMessages.push({
        sessionId: trim(sessionId),
        messageId,
      });
    }
    return saved;
  };

  const options = {
    ...runtime,
    appendMessage: wrappedAppend,
    resolveTargetSessionId: typeof runtime?.resolveTargetSessionIdForEvent === 'function'
      ? target => runtime.resolveTargetSessionIdForEvent(target, event)
      : runtime?.resolveTargetSessionId,
  };
  const applied = event?.type === 'group_chat'
    ? await appendProtocolGroupChatEventImmediate(event, options)
    : await appendProtocolPrivateChatEventImmediate(event, options);
  const reason = createdMessages.length
    ? ''
    : (!trim(applied?.targetSessionId) ? 'target_session_not_found' : 'no_chat_message_created');

  return {
    status: applied?.didAnything && createdMessages.length ? 'committed' : 'skipped',
    writesChat: createdMessages.length > 0,
    reason,
    preflight,
    refs: {
      createdMessages,
      createdMessageIds: createdMessages.map(item => item.messageId),
    },
    applied,
    undo: contract.undo || null,
  };
};

const commitMomentCommentEvent = (contract, runtime, preflight) => {
  const store = runtime?.momentsStore;
  const event = contract.protocolEvent;
  const momentId = trim(event?.momentId);
  const before = typeof store?.get === 'function' ? store.get(momentId) : null;
  if (!momentId || !before) {
    return {
      status: 'failed',
      writesChat: false,
      preflight,
      reason: !momentId ? 'missing_moment_id' : 'moment_not_found',
      refs: { createdCommentIds: [], momentSnapshots: [] },
      undo: contract.undo || null,
    };
  }
  const beforeIds = new Set(list(before.comments).map(comment => trim(comment?.id)).filter(Boolean));
  const saved = store.addComments(momentId, event.comments || []);
  const after = typeof store.get === 'function' ? store.get(momentId) : saved;
  const createdCommentIds = list(after?.comments)
    .map(comment => trim(comment?.id))
    .filter(id => id && !beforeIds.has(id));
  return {
    status: createdCommentIds.length ? 'committed' : 'skipped',
    writesChat: false,
    mutatedMoments: createdCommentIds.length > 0,
    reason: createdCommentIds.length ? '' : 'no_comment_created',
    preflight,
    refs: {
      momentId,
      createdCommentIds,
      momentSnapshots: [{ id: momentId, existed: true, snapshot: clone(before) }],
    },
    undo: contract.undo || null,
  };
};

const commitMomentPostEvent = (contract, runtime, preflight) => {
  const store = runtime?.momentsStore;
  const moments = list(contract.protocolEvent?.moments);
  const snapshots = moments.map(moment => findMomentSnapshot(store, moment));
  const saved = typeof store?.addMany === 'function' ? store.addMany(moments) : [];
  const createdMomentIds = list(saved).map(moment => trim(moment?.id)).filter(Boolean);
  return {
    status: createdMomentIds.length ? 'committed' : 'skipped',
    writesChat: false,
    mutatedMoments: createdMomentIds.length > 0,
    reason: createdMomentIds.length ? '' : (moments.length ? 'moment_post_not_saved' : 'empty_moment_post'),
    preflight,
    refs: {
      createdMomentIds,
      momentSnapshots: snapshots.map((snapshot, index) => ({
        id: trim(createdMomentIds[index] || snapshot.id),
        existed: snapshot.existed,
        snapshot: snapshot.snapshot,
      })),
    },
    undo: contract.undo || null,
  };
};

export const commitChatEmitContract = async ({
  contract = {},
  runtime = {},
  confirmed = false,
} = {}) => {
  const preflight = buildChatEmitCommitAdapterPreflight({ contract, runtime });
  if (preflight.status !== 'ready') {
    return {
      status: 'blocked',
      writesChat: false,
      currentExecutionWrites: false,
      reason: 'preflight_blocked',
      preflight,
    };
  }
  if (confirmed !== true) {
    return {
      status: 'blocked',
      writesChat: false,
      currentExecutionWrites: false,
      reason: 'confirmation_required',
      preflight,
    };
  }

  const eventType = trim(contract?.protocolEvent?.type);
  if (eventType === 'private_chat' || eventType === 'group_chat') {
    return commitChatEvent(contract, runtime, preflight);
  }
  if (eventType === 'moment_reply') {
    return commitMomentCommentEvent(contract, runtime, preflight);
  }
  if (eventType === 'moments') {
    return commitMomentPostEvent(contract, runtime, preflight);
  }
  return {
    status: 'blocked',
    writesChat: false,
    currentExecutionWrites: false,
    reason: 'unsupported_protocol_event',
    preflight,
  };
};

const undoChatCommit = (commitResult, runtime) => {
  const deleteMessage = resolveDeleteMessage(runtime);
  const deleted = [];
  list(commitResult?.refs?.createdMessages).forEach((ref) => {
    const ok = deleteMessage?.(ref.messageId, ref.sessionId) === true;
    if (ok) deleted.push(ref);
  });
  return {
    status: deleted.length ? 'undone' : 'skipped',
    reason: deleted.length ? '' : 'created_message_not_found',
    refs: { deletedMessages: deleted },
  };
};

const undoMomentCommit = (commitResult, runtime) => {
  const store = runtime?.momentsStore;
  const restored = [];
  const removed = [];
  list(commitResult?.refs?.momentSnapshots).forEach((entry) => {
    const id = trim(entry?.id || entry?.snapshot?.id);
    if (entry?.existed && entry.snapshot) {
      const saved = store?.upsert?.(clone(entry.snapshot));
      if (saved) restored.push(id || trim(saved?.id));
      return;
    }
    if (id && store?.remove?.(id) === true) removed.push(id);
  });

  if (!restored.length && !removed.length && commitResult?.refs?.momentId) {
    list(commitResult?.refs?.createdCommentIds).forEach((commentId) => {
      const ok = store?.removeComment?.(commitResult.refs.momentId, commentId) === true;
      if (ok) removed.push(commentId);
    });
  }

  return {
    status: restored.length || removed.length ? 'undone' : 'skipped',
    reason: restored.length || removed.length ? '' : 'snapshot_restore_noop',
    refs: {
      restoredMomentIds: restored.filter(Boolean),
      removedIds: removed.filter(Boolean),
    },
  };
};

export const undoChatEmitCommit = async ({
  commitResult = {},
  runtime = {},
  confirmed = false,
} = {}) => {
  if (confirmed !== true) {
    return {
      status: 'blocked',
      reason: 'confirmation_required',
    };
  }
  const strategy = trim(commitResult?.undo?.strategy);
  if (strategy === 'delete_created_chat_messages') {
    return undoChatCommit(commitResult, runtime);
  }
  if (
    strategy === 'restore_moment_snapshot_then_remove_created_comments' ||
    strategy === 'restore_or_remove_created_moment'
  ) {
    return undoMomentCommit(commitResult, runtime);
  }
  return {
    status: 'blocked',
    reason: 'unsupported_undo_strategy',
  };
};
