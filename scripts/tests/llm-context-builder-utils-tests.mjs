import assert from 'node:assert/strict';

import { buildLlmContextPayload } from '../../src/scripts/ui/chat/llm-context-builder-utils.js';

{
  const payload = buildLlmContextPayload({
    promptUserName: '我',
    activeUser: { description: '用户描述', position: 'before_char', depth: 2, role: 'system' },
    characterName: '角色A',
    activePersona: { description: '角色描述' },
    sessionId: 's1',
    isGroupChat: true,
    sessionSettings: { temperature: 0.7 },
    disableSummary: true,
    skipInputRegex: true,
    continueTarget: { messageId: 'm1', prefix: '继续' },
    rpUiMode: false,
    uiMode: 'chat',
    sharedVariables: true,
    isRpMode: false,
    rpBridgeSessionId: 'rp-1',
    lastChatBridgeSessionId: 'chat-9',
    memoryStorageMode: 'table',
    memoryAutoExtract: true,
    openaiPreset: {
      memory_data_position: 'history_after',
      memory_data_depth: 3,
    },
    attachmentParts: [{ type: 'image', url: 'x' }],
    replyPromptHint: 'reply hint',
    stagePromptBlocks: ['stage'],
    injectedPromptBlocks: ['injected'],
    skipTemplate: true,
    skipScripts: true,
    groupMembers: ['u1', 'u2'],
    getContactName: id => ({ u1: 'Alice', u2: 'Bob' }[id] || id),
    buildHistory: pendingUserText => [{ role: 'user', content: pendingUserText }],
    pendingUserText: '测试输入',
    settings: {
      memoryInjectPosition: 'history_before',
      memoryInjectDepth: 1,
    },
  });

  assert.deepEqual(payload.user, {
    name: '我',
    persona: '用户描述',
    personaPosition: 'before_char',
    personaDepth: 2,
    personaRole: 'system',
  });
  assert.deepEqual(payload.character, {
    name: '角色A',
    description: '角色描述',
  });
  assert.deepEqual(payload.session, {
    id: 's1',
    isGroup: true,
    name: '角色A',
    settings: { temperature: 0.7 },
  });
  assert.equal(payload.meta.disableSummary, true);
  assert.equal(payload.meta.skipInputRegex, true);
  assert.equal(payload.meta.useGlobalVariables, true);
  assert.equal(payload.meta.memoryInjectPosition, 'history_after');
  assert.equal(payload.meta.memoryInjectDepth, 3);
  assert.deepEqual(payload.meta.extraPromptBlocks, ['stage', 'injected']);
  assert.deepEqual(payload.group, {
    id: 's1',
    name: '角色A',
    members: ['u1', 'u2'],
    memberNames: ['Alice', 'Bob'],
  });
  assert.deepEqual(payload.history, [{ role: 'user', content: '测试输入' }]);
  console.log('ok - buildLlmContextPayload composes user session meta group and history sections');
}

{
  const payload = buildLlmContextPayload({
    sessionId: 's2',
    characterName: '角色B',
    isGroupChat: false,
    isRpMode: true,
    openaiPreset: null,
    settings: {
      memoryInjectPosition: 'history_before',
      memoryInjectDepth: 4,
    },
    buildHistory: () => [],
  });

  assert.equal(payload.group, null);
  assert.equal(payload.meta.defaultRpBridgeSessionId, '');
  assert.equal(payload.meta.defaultChatBridgeSessionId, '');
  assert.equal(payload.meta.memoryInjectPosition, 'history_before');
  assert.equal(payload.meta.memoryInjectDepth, 4);
  console.log('ok - buildLlmContextPayload respects rp bridge defaults and settings fallback');
}
