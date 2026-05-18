import assert from 'node:assert/strict';

import {
  buildLlmContextMetaInput,
  buildLlmContextMeta,
  normalizeRuntimeMemoryPosition,
  resolveLlmMemoryRuntimeConfig,
} from '../../src/scripts/ui/chat/llm-context-meta-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeRuntimeMemoryPosition keeps template empty for template-driven placement', () => {
  assert.equal(normalizeRuntimeMemoryPosition('', 0, 'history_after'), 'history_after');
  assert.equal(normalizeRuntimeMemoryPosition('template', 0, 'history_after'), '');
  assert.equal(normalizeRuntimeMemoryPosition('history_depth', 0, 'history_after'), 'history_depth');
  assert.equal(normalizeRuntimeMemoryPosition('history_depth', 2, 'history_after'), 'history_depth');
});

test('resolveLlmMemoryRuntimeConfig prefers preset inject settings and normalizes guide settings', () => {
  assert.deepEqual(
    resolveLlmMemoryRuntimeConfig({
      openaiPreset: {
        memory_data_position: 'history_depth',
        memory_data_depth: '3',
        memory_guide_position: 'template',
        memory_guide_depth: '0',
      },
      settings: {
        memoryInjectPosition: 'history_after',
        memoryInjectDepth: '1',
      },
    }),
    {
      memoryInjectPosition: 'history_depth',
      memoryInjectDepth: 3,
      memoryGuidePosition: '',
      memoryGuideDepth: 0,
    },
  );
});

test('resolveLlmMemoryRuntimeConfig defaults dynamic memory near latest user', () => {
  assert.deepEqual(
    resolveLlmMemoryRuntimeConfig({
      openaiPreset: {},
      settings: {},
    }),
    {
      memoryInjectPosition: 'before_latest_user',
      memoryInjectDepth: 0,
      memoryGuidePosition: '',
      memoryGuideDepth: 0,
    },
  );
});

test('buildLlmContextMeta composes continuation and skip overrides', () => {
  const meta = buildLlmContextMeta({
    disableSummary: true,
    skipInputRegex: true,
    continueTarget: { messageId: 'msg-1', prefix: 'keep' },
    rpUiMode: true,
    uiMode: 'rp',
    sharedVariables: true,
    defaultRpBridgeSessionId: 'rp-1',
    defaultChatBridgeSessionId: 'chat-1',
    memoryStorageMode: 'table',
    memoryAutoExtract: true,
    memoryRuntime: {
      memoryInjectPosition: 'history_after',
      memoryInjectDepth: 2,
      memoryGuidePosition: 'history_before',
      memoryGuideDepth: 1,
    },
    attachmentParts: [{ type: 'image_url' }],
    replyPromptHint: 'reply',
    extraPromptBlocks: ['block'],
    skipTemplate: true,
    skipScripts: true,
  });

  assert.deepEqual(meta, {
    disableSummary: true,
    skipInputRegex: true,
    appendUserToHistory: false,
    suppressPendingUserTurn: true,
    chatGuideMode: 'summary-only',
    disableChatGuide: false,
    disableScenarioHint: true,
    disableMomentSummary: true,
    disablePhoneFormat: true,
    uiMode: 'rp',
    useGlobalVariables: true,
    sharedMemory: false,
    defaultRpBridgeSessionId: 'rp-1',
    defaultChatBridgeSessionId: 'chat-1',
    memoryStorageMode: 'table',
    memoryAutoExtract: true,
    memoryInjectPosition: 'history_after',
    memoryInjectDepth: 2,
    memoryGuidePosition: 'history_before',
    memoryGuideDepth: 1,
    userAttachmentParts: [{ type: 'image_url' }],
    replyPromptHint: 'reply',
    extraPromptBlocks: ['block'],
    assistantContinuation: {
      enabled: true,
      messageId: 'msg-1',
      prefix: 'keep',
    },
    templateEnabled: false,
    skipScripts: true,
  });
});

test('buildLlmContextMetaInput derives bridge session defaults and merges prompt blocks', () => {
  assert.deepEqual(
    buildLlmContextMetaInput({
      disableSummary: true,
      skipInputRegex: true,
      continueTarget: { messageId: 'msg-1' },
      rpUiMode: false,
      uiMode: 'chat',
      sharedVariables: true,
      isRpMode: false,
      rpBridgeSessionId: 'rp-42',
      lastChatBridgeSessionId: 'chat-7',
      memoryStorageMode: 'table',
      memoryAutoExtract: true,
      memoryRuntime: { memoryInjectPosition: 'history_after' },
      attachmentParts: [{ type: 'image_url' }],
      replyPromptHint: 'reply',
      stagePromptBlocks: ['stage'],
      injectedPromptBlocks: ['inject'],
      skipTemplate: true,
      skipScripts: true,
    }),
    {
      disableSummary: true,
      skipInputRegex: true,
      continueTarget: { messageId: 'msg-1' },
      rpUiMode: false,
      uiMode: 'chat',
      sharedVariables: true,
      defaultRpBridgeSessionId: 'rp-42',
      defaultChatBridgeSessionId: '',
      memoryStorageMode: 'table',
      memoryAutoExtract: true,
      memoryRuntime: { memoryInjectPosition: 'history_after' },
      attachmentParts: [{ type: 'image_url' }],
      replyPromptHint: 'reply',
      extraPromptBlocks: ['stage', 'inject'],
      skipTemplate: true,
      skipScripts: true,
    },
  );
  assert.deepEqual(
    buildLlmContextMetaInput({
      isRpMode: true,
      rpBridgeSessionId: 'rp-42',
      lastChatBridgeSessionId: 'chat-7',
    }),
    {
      disableSummary: false,
      skipInputRegex: false,
      continueTarget: null,
      rpUiMode: false,
      uiMode: 'chat',
      sharedVariables: false,
      defaultRpBridgeSessionId: '',
      defaultChatBridgeSessionId: 'chat-7',
      memoryStorageMode: '',
      memoryAutoExtract: false,
      memoryRuntime: null,
      attachmentParts: [],
      replyPromptHint: '',
      extraPromptBlocks: [],
      skipTemplate: false,
      skipScripts: false,
    },
  );
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
