import assert from 'node:assert/strict';

import {
  buildMaidChatResponderMessages,
  createMaidChatResponder,
} from '../../src/scripts/agent/maid-chat-responder.js';

{
  const messages = buildMaidChatResponderMessages({
    input: '你好啊',
    context: { sessionId: 's1', uiMode: 'chat', activePage: 'chat' },
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /女仆助手/);
  assert.match(messages[0].content, /不要输出 JSON/);
  assert.match(messages[1].content, /你好啊/);
  assert.match(messages[1].content, /s1/);
  assert.match(messages[1].content, /APP 相关讯息/);
  console.log('ok - maid chat responder builds natural reply messages');
}

{
  const messages = buildMaidChatResponderMessages({
    input: '帮我打开世界书',
    context: { sessionId: 's1' },
  });
  assert.match(messages[1].content, /命中：打开世界书/);
  assert.match(messages[1].content, /worldbook\.open/);
  console.log('ok - maid chat responder includes searched app context');
}

{
  const messages = buildMaidChatResponderMessages({
    input: '你好啊',
    maidPrompt: '自定义女仆 system prompt',
  });
  assert.equal(messages[0].content, '自定义女仆 system prompt');
  console.log('ok - maid chat responder uses editable maid prompt as system prompt');
}

{
  const calls = [];
  const debugSnapshots = [];
  const responder = createMaidChatResponder({
    resolveRuntimeConfig: async () => ({
      configured: true,
      maidPrompt: '活泼一点',
      client: {
        chat: async (messages, options) => {
          calls.push({ messages, options });
          return '你好，我在。';
        },
      },
    }),
    isConfigReady: () => true,
    onDebugSnapshot: snapshot => debugSnapshots.push(snapshot),
    logger: { warn() {} },
  });
  const result = await responder('你好啊', { sessionId: 's1' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'responded');
  assert.equal(result.message, '你好，我在。');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages[0].content, '活泼一点');
  assert.equal(calls[0].options.maxTokens, 500);
  assert.equal(debugSnapshots.length, 1);
  assert.equal(debugSnapshots[0].source, 'maid_chat_responder');
  assert.equal(debugSnapshots[0].responseText, '你好，我在。');
  assert.match(debugSnapshots[0].messages[1].content, /你好啊/);
  console.log('ok - maid chat responder calls bound runtime client');
}

{
  const responder = createMaidChatResponder({
    resolveRuntimeConfig: async () => ({
      configured: false,
      reason: 'maid_profile_not_bound',
    }),
    logger: { warn() {} },
  });
  const result = await responder('你好啊');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'maid_profile_not_bound');
  console.log('ok - maid chat responder refuses without bound runtime client');
}
