import { buildChatEmitCommitPreview } from './chat-emit-commit-plan.js';

export const CHAT_EMIT_COMMIT_CONTRACT_VERSION = 'chat_emit_commit_contract_v1';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const firstText = (...values) => {
  for (const value of values) {
    const text = trim(value);
    if (text) return text;
  }
  return '';
};

const chatRuntimeContract = Object.freeze({
  adapter: 'protocol_event_apply',
  commitWrites: true,
  commitRequiresUserConfirmation: true,
  requiredMethods: Object.freeze([
    'resolveTargetSessionId',
    'appendMessage',
    'deleteMessage',
    'buildAssistantMessageFromText',
    'buildUserMessageFromAI',
  ]),
  recommendedUiMethods: Object.freeze([
    'onAddUiMessage',
    'autoMarkReadIfActive',
    'emitPluginAfterReceive',
  ]),
});

const momentRuntimeContract = Object.freeze({
  adapter: 'moments_store',
  commitWrites: true,
  commitRequiresUserConfirmation: true,
  requiredMethods: Object.freeze([
    'momentsStore.get',
    'momentsStore.upsert',
    'momentsStore.addMany',
    'momentsStore.addComments',
    'momentsStore.remove',
    'momentsStore.removeComment',
  ]),
  recommendedUiMethods: Object.freeze([
    'renderMoments',
  ]),
});

export const buildChatEmitProtocolEvent = ({
  toolName = '',
  args = {},
  eventDraft = {},
} = {}) => {
  const name = trim(toolName);
  const src = isPlainObject(args) ? args : {};
  const event = isPlainObject(eventDraft) ? eventDraft : {};

  if (name === 'chat.emit_private') {
    return {
      type: 'private_chat',
      otherName: firstText(event.targetName, src.targetName, event.targetId, src.targetId),
      messages: [{
        speaker: firstText(event.speakerName, src.speakerName, event.speakerId, src.speakerId),
        content: firstText(event.content, src.content),
        time: firstText(event.time, src.time),
      }],
    };
  }

  if (name === 'chat.emit_group') {
    return {
      type: 'group_chat',
      groupName: firstText(event.targetName, src.groupName, event.targetId, src.groupId),
      members: list(event.metadata?.members?.length ? event.metadata.members : src.members),
      messages: [{
        speaker: firstText(event.speakerName, src.speakerName, event.speakerId, src.speakerId),
        content: firstText(event.content, src.content),
        time: firstText(event.time, src.time),
      }],
    };
  }

  if (name === 'chat.emit_moment_comment') {
    return {
      type: 'moment_reply',
      momentId: firstText(event.targetId, src.momentId),
      comments: [{
        author: firstText(event.speakerName, src.author),
        content: firstText(event.content, src.content),
        replyTo: firstText(event.metadata?.replyTo, src.replyTo),
        replyToAuthor: firstText(event.metadata?.replyToAuthor, src.replyToAuthor),
        time: firstText(event.time, src.time),
      }],
    };
  }

  if (name === 'chat.emit_moment_post') {
    return {
      type: 'moments',
      moments: [{
        id: firstText(event.targetId, src.momentId),
        author: firstText(event.speakerName, src.author),
        content: firstText(event.content, src.content),
        time: firstText(event.time, src.time),
        likes: Number.isFinite(Number(event.metadata?.likes ?? src.likes))
          ? Math.max(0, Math.trunc(Number(event.metadata?.likes ?? src.likes)))
          : 0,
        views: Number.isFinite(Number(event.metadata?.views ?? src.views))
          ? Math.max(0, Math.trunc(Number(event.metadata?.views ?? src.views)))
          : 0,
      }],
    };
  }

  return null;
};

const buildUndoContract = (toolName = '') => {
  const name = trim(toolName);
  if (name === 'chat.emit_private' || name === 'chat.emit_group') {
    return {
      strategy: 'delete_created_chat_messages',
      snapshotRequired: false,
      createdRefKeys: ['createdMessageIds'],
      requiredMethods: ['chatStore.deleteMessage'],
      notes: 'Undo deletes messages created by the confirmed commit.',
    };
  }
  if (name === 'chat.emit_moment_comment') {
    return {
      strategy: 'restore_moment_snapshot_then_remove_created_comments',
      snapshotRequired: true,
      createdRefKeys: ['createdCommentIds'],
      snapshotKeys: ['momentBeforeCommit'],
      requiredMethods: ['momentsStore.upsert', 'momentsStore.removeComment'],
      notes: 'Snapshot is required because addComments may trim old comments and comment ids are assigned during commit.',
    };
  }
  if (name === 'chat.emit_moment_post') {
    return {
      strategy: 'restore_or_remove_created_moment',
      snapshotRequired: true,
      createdRefKeys: ['createdMomentIds'],
      snapshotKeys: ['momentBeforeCommit'],
      requiredMethods: ['momentsStore.upsert', 'momentsStore.remove'],
      notes: 'Snapshot is required because addMany/upsert may update an existing moment by id or signature.',
    };
  }
  return {
    strategy: 'unsupported',
    snapshotRequired: true,
    createdRefKeys: [],
    requiredMethods: [],
    notes: 'Unsupported chat.emit tool.',
  };
};

const buildCommitRuntime = (toolName = '') => {
  const name = trim(toolName);
  if (name === 'chat.emit_private' || name === 'chat.emit_group') {
    return {
      ...chatRuntimeContract,
      requiredMethods: chatRuntimeContract.requiredMethods.slice(),
      recommendedUiMethods: chatRuntimeContract.recommendedUiMethods.slice(),
    };
  }
  if (name === 'chat.emit_moment_comment' || name === 'chat.emit_moment_post') {
    return {
      ...momentRuntimeContract,
      requiredMethods: momentRuntimeContract.requiredMethods.slice(),
      recommendedUiMethods: momentRuntimeContract.recommendedUiMethods.slice(),
    };
  }
  return {
    adapter: 'unsupported',
    commitWrites: false,
    commitRequiresUserConfirmation: true,
    requiredMethods: [],
    recommendedUiMethods: [],
  };
};

export const buildChatEmitCommitContract = ({
  toolName = '',
  args = {},
  eventDraft = {},
  sessionId = '',
} = {}) => {
  const name = trim(toolName);
  const protocolEvent = buildChatEmitProtocolEvent({ toolName: name, args, eventDraft });
  const supported = Boolean(protocolEvent);
  const preview = buildChatEmitCommitPreview({ toolName: name, args, eventDraft, sessionId });
  return {
    version: CHAT_EMIT_COMMIT_CONTRACT_VERSION,
    toolName: name,
    status: supported ? 'ready' : 'unsupported',
    currentExecutionWrites: false,
    commitRequiresUserConfirmation: true,
    commitMayWrite: supported,
    sessionId: trim(sessionId),
    protocolEvent,
    preview,
    runtime: buildCommitRuntime(name),
    undo: buildUndoContract(name),
  };
};
