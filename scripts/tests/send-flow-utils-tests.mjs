import assert from 'node:assert/strict';

import {
  normalizeHandleSendInvocation,
  normalizeHandleSendOptions,
  resolveSyspromptProtocolFlags,
} from '../../src/scripts/ui/chat/send-flow-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeHandleSendInvocation treats DOM-style events as empty send arguments', () => {
  const eventLike = {
    preventDefault() {},
  };

  assert.deepEqual(normalizeHandleSendInvocation(eventLike, { overrideText: 'ignored' }), {
    targetMessageId: null,
    options: {},
  });
});

test('normalizeHandleSendInvocation upgrades object target into options payload', () => {
  const swipeTarget = { msgId: 'assistant-1' };
  const result = normalizeHandleSendInvocation({
    overrideText: '继续',
    swipeTarget,
  });

  assert.equal(result.targetMessageId, null);
  assert.equal(result.options.overrideText, '继续');
  assert.equal(result.options.swipeTarget, swipeTarget);
});

test('normalizeHandleSendOptions preserves valid fields and deduplicates excluded ids', () => {
  const streamFactory = () => ({});
  const partialCommitHandler = () => true;
  const swipeTarget = { msgId: 'assistant-2' };
  const continueTarget = { messageId: 'assistant-2', prefix: '继续' };

  const result = normalizeHandleSendOptions({
    overrideText: '  保留空格  ',
    ignorePending: 1,
    suppressUserMessage: 'yes',
    existingUserMessageId: 'user-1',
    skipInputRegex: true,
    skipTemplate: true,
    skipScripts: true,
    suppressAssistantDom: true,
    createAssistantStream: streamFactory,
    continueTarget,
    partialCommitHandler,
    swipeTarget,
    excludeMessageIds: ['assistant-2', 'assistant-3', '', null],
    includeAttachments: false,
  });

  assert.equal(result.overrideTextRaw, '  保留空格  ');
  assert.equal(result.overrideText, '  保留空格  ');
  assert.equal(result.ignorePending, true);
  assert.equal(result.suppressUserMessage, true);
  assert.equal(result.existingUserMessageId, 'user-1');
  assert.equal(result.skipInputRegex, true);
  assert.equal(result.skipTemplate, true);
  assert.equal(result.skipScripts, true);
  assert.equal(result.suppressAssistantDom, true);
  assert.equal(result.assistantStreamFactory, streamFactory);
  assert.equal(result.continueTarget, continueTarget);
  assert.equal(result.partialCommitHandler, partialCommitHandler);
  assert.equal(result.swipeTarget, swipeTarget);
  assert.deepEqual(result.excludeMessageIds, ['assistant-2', 'assistant-3']);
  assert.equal(result.includeAttachments, false);
});

test('normalizeHandleSendOptions falls back safely for invalid payloads', () => {
  const result = normalizeHandleSendOptions({
    overrideText: '   ',
    existingUserMessageId: 123,
    createAssistantStream: 'not-fn',
    continueTarget: 'bad',
    partialCommitHandler: 'bad',
    swipeTarget: 'bad',
  });

  assert.equal(result.overrideTextRaw, '   ');
  assert.equal(result.overrideText, '');
  assert.equal(result.existingUserMessageId, '');
  assert.equal(result.assistantStreamFactory, null);
  assert.equal(result.continueTarget, null);
  assert.equal(result.partialCommitHandler, null);
  assert.equal(result.swipeTarget, null);
  assert.deepEqual(result.excludeMessageIds, []);
  assert.equal(result.includeAttachments, true);
});

test('resolveSyspromptProtocolFlags enables private or group protocol only when matching rules exist', () => {
  assert.deepEqual(
    resolveSyspromptProtocolFlags({
      sysp: {
        dialogue_enabled: true,
        dialogue_rules: '私聊规则',
        group_enabled: true,
        group_rules: '',
        moment_create_enabled: false,
        moment_create_rules: '不会启用',
      },
      rpUiMode: false,
      isGroupChat: false,
      summaryEnabled: true,
    }),
    {
      dialogueEnabled: true,
      groupEnabled: false,
      momentCreateEnabled: false,
      protocolEnabled: true,
      disableSummaryForThis: false,
    },
  );
});

test('resolveSyspromptProtocolFlags lets moment creation override chat mode and disables in rp mode', () => {
  assert.deepEqual(
    resolveSyspromptProtocolFlags({
      sysp: {
        dialogue_enabled: false,
        dialogue_rules: '私聊规则',
        group_enabled: false,
        group_rules: '群聊规则',
        moment_create_enabled: true,
        moment_create_rules: '动态规则',
      },
      rpUiMode: true,
      isGroupChat: true,
      summaryEnabled: false,
    }),
    {
      dialogueEnabled: false,
      groupEnabled: false,
      momentCreateEnabled: true,
      protocolEnabled: false,
      disableSummaryForThis: true,
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
