import assert from 'node:assert/strict';

import { buildChatEmitCommitAdapterPreflight } from '../../src/scripts/agent/tools/chat-emit-commit-adapter-preflight.js';
import { buildChatEmitCommitContract } from '../../src/scripts/agent/tools/chat-emit-commit-contract.js';

const chatRuntime = {
  resolveTargetSessionId: () => 'contact:firen',
  appendMessage: () => null,
  deleteMessage: () => false,
  buildAssistantMessageFromText: async () => ({}),
  buildUserMessageFromAI: () => ({}),
};

const momentsRuntime = {
  momentsStore: {
    get: () => null,
    upsert: () => null,
    addMany: () => [],
    addComments: () => null,
    remove: () => false,
    removeComment: () => false,
  },
};

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_private',
    args: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
  });
  const preflight = buildChatEmitCommitAdapterPreflight({ contract, runtime: chatRuntime });
  assert.equal(preflight.status, 'ready');
  assert.equal(preflight.dryRun, true);
  assert.equal(preflight.currentExecutionWrites, false);
  assert.equal(preflight.adapter, 'protocol_event_apply');
  assert.equal(preflight.steps[0].action, 'appendProtocolPrivateChatEventImmediate');
  assert.deepEqual(preflight.missingMethods, []);
  console.log('ok - chat emit commit preflight accepts complete chat runtime');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_group',
    args: {
      groupName: '调查组',
      speakerName: '菲伦',
      content: '别进二楼。',
    },
  });
  const preflight = buildChatEmitCommitAdapterPreflight({
    contract,
    runtime: {
      resolveTargetSessionId: () => 'group:case',
      appendMessage: () => null,
    },
  });
  assert.equal(preflight.status, 'blocked');
  assert.deepEqual(preflight.missingMethods, [
    'deleteMessage',
    'buildAssistantMessageFromText',
    'buildUserMessageFromAI',
  ]);
  console.log('ok - chat emit commit preflight reports missing chat runtime methods');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_comment',
    args: {
      momentId: 'moment-1',
      author: '菲伦',
      content: '我会在楼下等你',
    },
  });
  const preflight = buildChatEmitCommitAdapterPreflight({ contract, runtime: momentsRuntime });
  assert.equal(preflight.status, 'ready');
  assert.equal(preflight.adapter, 'moments_store');
  assert.equal(preflight.steps[0].phase, 'snapshot');
  assert.equal(preflight.steps[1].action, 'momentsStore.addComments');
  assert.equal(preflight.warnings.includes('snapshot required before real commit'), true);
  console.log('ok - chat emit commit preflight accepts complete moments runtime with snapshot warning');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_post',
    args: {
      author: '雪',
      content: '雾岚洋馆门口多了一双鞋印。',
    },
  });
  const preflight = buildChatEmitCommitAdapterPreflight({
    contract,
    runtime: { momentsStore: { get: () => null, addMany: () => [] } },
  });
  assert.equal(preflight.status, 'blocked');
  assert.deepEqual(preflight.missingMethods, [
    'momentsStore.upsert',
    'momentsStore.addComments',
    'momentsStore.remove',
    'momentsStore.removeComment',
  ]);
  console.log('ok - chat emit commit preflight reports missing moments store methods');
}

{
  const preflight = buildChatEmitCommitAdapterPreflight({
    contract: { version: 'old', runtime: { adapter: 'unsupported' } },
    runtime: {},
  });
  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.missingMethods.includes('supported contract version'), true);
  assert.equal(preflight.missingMethods.includes('supported adapter'), true);
  assert.equal(preflight.missingMethods.includes('protocolEvent'), true);
  console.log('ok - chat emit commit preflight fails closed for unsupported contracts');
}
