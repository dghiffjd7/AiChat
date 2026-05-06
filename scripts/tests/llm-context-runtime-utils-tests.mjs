import assert from 'node:assert/strict';

import {
  createLlmContextBuilder,
  createLlmHistoryBuilder,
} from '../../src/scripts/ui/chat/llm-context-runtime-utils.js';

{
  const historyBuilder = createLlmHistoryBuilder({
    sessionId: 's1',
    getMessages: sid => [{ id: `${sid}-m1`, role: 'assistant', content: 'hello' }],
    getSettings: () => ({ chatHistoryRounds: 8 }),
    getOpenAIPreset: () => ({ history_rounds: 4 }),
    getReasoningPreset: () => ({ prefix: '<r>', suffix: '</r>' }),
    excludeMessageIds: ['x1'],
    isRpMode: false,
    isGroupChat: true,
    rpUiMode: false,
    getCompactedSummary: sid => `compacted:${sid}`,
    getSummaries: sid => [{ text: `summary:${sid}` }],
    isAttachmentExpired: () => false,
    resolvePlainText: message => String(message?.content || ''),
    resolveStickerKeyword: () => '',
    buildStickerToken: key => `:${key}:`,
    applyMacros: value => `macro:${value}`,
  });
  const history = historyBuilder('pending text');
  assert.equal(Array.isArray(history), true);
  assert.equal(history[0]?.role, 'assistant');
  assert.equal(history[0]?.content, 'hello');
  assert.equal(history.length >= 1, true);
  console.log('ok - createLlmHistoryBuilder wires runtime getters into llm history builder');
}

{
  let disableSummary = false;
  const ctxBuilder = createLlmContextBuilder({
    promptUserName: '我',
    activeUser: { description: '用户描述' },
    characterName: '角色A',
    activePersona: { description: '角色描述' },
    sessionId: 's1',
    isGroupChat: true,
    getSessionSettings: () => ({ temperature: 0.7 }),
    getDisableSummary: () => disableSummary,
    skipInputRegex: true,
    continueTarget: { messageId: 'm1' },
    rpUiMode: false,
    getUiMode: () => 'chat',
    sharedVariables: true,
    isRpMode: false,
    getRpBridgeSessionId: () => 'rp-1',
    getLastChatBridgeSessionId: () => 'chat-9',
    getMemoryStorageMode: () => 'table',
    isMemoryAutoExtractInline: () => true,
    attachmentParts: [{ type: 'image', url: 'x' }],
    getOpenAIPreset: () => ({ memory_data_position: 'history_after', memory_data_depth: 3 }),
    getSettings: () => ({ memoryInjectPosition: 'history_before', memoryInjectDepth: 1 }),
    getReplyPromptHint: () => 'reply hint',
    getStagePromptBlocks: () => ['stage'],
    getInjectedPromptBlocks: () => ['injected'],
    skipTemplate: true,
    skipScripts: true,
    groupMembers: ['u1'],
    getContactName: id => ({ u1: 'Alice' }[id] || id),
    buildHistory: pendingUserText => [{ role: 'user', content: pendingUserText }],
  });

  const first = ctxBuilder('输入1');
  disableSummary = true;
  const second = ctxBuilder('输入2');

  assert.equal(first.meta.disableSummary, false);
  assert.equal(second.meta.disableSummary, true);
  assert.deepEqual(first.history, [{ role: 'user', content: '输入1' }]);
  assert.deepEqual(second.history, [{ role: 'user', content: '输入2' }]);
  assert.deepEqual(second.meta.extraPromptBlocks, ['stage', 'injected']);
  console.log('ok - createLlmContextBuilder preserves dynamic getters for summary and prompt blocks');
}
