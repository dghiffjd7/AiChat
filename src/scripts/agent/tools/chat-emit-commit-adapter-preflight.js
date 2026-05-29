import { CHAT_EMIT_COMMIT_CONTRACT_VERSION } from './chat-emit-commit-contract.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasFn = (owner, name) => Boolean(owner && typeof owner[name] === 'function');

const checkChatRuntime = (runtime = {}) => {
  const missing = [];
  if (typeof runtime.resolveTargetSessionId !== 'function') missing.push('resolveTargetSessionId');
  if (typeof runtime.appendMessage !== 'function' && !hasFn(runtime.chatStore, 'appendMessage')) missing.push('appendMessage');
  if (typeof runtime.deleteMessage !== 'function' && !hasFn(runtime.chatStore, 'deleteMessage')) missing.push('deleteMessage');
  if (typeof runtime.buildAssistantMessageFromText !== 'function') missing.push('buildAssistantMessageFromText');
  if (typeof runtime.buildUserMessageFromAI !== 'function') missing.push('buildUserMessageFromAI');
  return missing;
};

const checkMomentsRuntime = (runtime = {}) => {
  const store = runtime.momentsStore;
  const missing = [];
  ['get', 'upsert', 'addMany', 'addComments', 'remove', 'removeComment'].forEach((method) => {
    if (!hasFn(store, method)) missing.push(`momentsStore.${method}`);
  });
  return missing;
};

const buildDryRunSteps = (contract = {}) => {
  const adapter = trim(contract?.runtime?.adapter);
  if (adapter === 'protocol_event_apply') {
    return [
      {
        phase: 'commit',
        adapter,
        action: contract.protocolEvent?.type === 'group_chat'
          ? 'appendProtocolGroupChatEventImmediate'
          : 'appendProtocolPrivateChatEventImmediate',
        writesOnRealCommit: true,
      },
      {
        phase: 'undo',
        action: 'chatStore.deleteMessage',
        refKey: 'createdMessageIds',
        writesOnRealUndo: true,
      },
    ];
  }
  if (adapter === 'moments_store') {
    const isPost = contract.protocolEvent?.type === 'moments';
    return [
      {
        phase: 'snapshot',
        action: isPost ? 'momentsStore.get(momentId)' : 'momentsStore.get(momentId)',
        required: contract.undo?.snapshotRequired === true,
      },
      {
        phase: 'commit',
        adapter,
        action: isPost ? 'momentsStore.addMany' : 'momentsStore.addComments',
        writesOnRealCommit: true,
      },
      {
        phase: 'undo',
        action: isPost ? 'momentsStore.remove/upsert(snapshot)' : 'momentsStore.upsert(snapshot)/removeComment',
        refKey: isPost ? 'createdMomentIds' : 'createdCommentIds',
        writesOnRealUndo: true,
      },
    ];
  }
  return [];
};

export const buildChatEmitCommitAdapterPreflight = ({
  contract = {},
  runtime = {},
} = {}) => {
  const src = isPlainObject(contract) ? contract : {};
  const adapter = trim(src.runtime?.adapter, 'unsupported');
  const missing = adapter === 'protocol_event_apply'
    ? checkChatRuntime(runtime)
    : adapter === 'moments_store'
      ? checkMomentsRuntime(runtime)
      : ['supported adapter'];
  const versionOk = trim(src.version) === CHAT_EMIT_COMMIT_CONTRACT_VERSION;
  if (!versionOk) missing.unshift('supported contract version');
  if (!src.protocolEvent) missing.push('protocolEvent');

  const warnings = [];
  if (src.undo?.snapshotRequired === true) {
    warnings.push('snapshot required before real commit');
  }
  if (src.commitRequiresUserConfirmation !== true) {
    warnings.push('real commit must require explicit user confirmation');
  }

  const ready = missing.length === 0;
  return {
    status: ready ? 'ready' : 'blocked',
    dryRun: true,
    currentExecutionWrites: false,
    adapter,
    missingMethods: missing,
    warnings,
    steps: buildDryRunSteps(src),
  };
};
