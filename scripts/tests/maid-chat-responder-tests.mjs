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
  assert.match(messages[0].content, /自定义女仆 system prompt/);
  assert.match(messages[0].content, /历史上下文/);
  console.log('ok - maid chat responder uses editable maid prompt as system prompt');
}

{
  const messages = buildMaidChatResponderMessages({
    input: '继续刚才那个',
    context: { sessionId: 's1' },
    conversationContext: {
      historyText: '- 用户: 创建角色卡 A\n  结果: 已完成',
      memoryText: '| 1 | 摘要 |\n| 内容 | 用户创建了角色卡 A。 |',
    },
  });
  assert.match(messages[1].content, /女仆记忆表格/);
  assert.match(messages[1].content, /用户创建了角色卡 A/);
  assert.match(messages[1].content, /女仆历史上下文/);
  assert.match(messages[1].content, /创建角色卡 A/);
  console.log('ok - maid chat responder injects history and memory context');
}

{
  const messages = buildMaidChatResponderMessages({
    input: '帮我看看这张图',
    context: {
      maidAttachments: [{ kind: 'image', url: 'data:image/png;base64,abc', name: 'screen.png' }],
    },
  });
  assert.equal(Array.isArray(messages[1].content), true);
  assert.match(messages[1].content[0].text, /用户附图/);
  assert.equal(messages[1].content[1].type, 'image_url');
  assert.equal(messages[1].content[1].image_url.url, 'data:image/png;base64,abc');
  console.log('ok - maid chat responder includes image attachments as multimodal parts');
}

{
  const messages = buildMaidChatResponderMessages({
    input: '女王最后回了我什么？',
    context: {
      sessionId: 's1',
      maidToolObservation: {
        plan: { toolName: 'app.read_resource' },
        output: { messages: [{ role: 'assistant', rawOriginal: '晚上好，今天辛苦了。' }] },
      },
    },
  });
  assert.match(messages[0].content, /工具观察结果/);
  assert.match(messages[0].content, /不要只说已查看/);
  assert.match(messages[1].content, /已执行工具观察结果/);
  assert.match(messages[1].content, /今天辛苦了/);
  console.log('ok - maid chat responder can summarize tool observations');
}

{
  const calls = [];
  const injected = [];
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
    getConversationContext: () => ({
      historyText: '- 用户: 你好',
      memoryText: '| 内容 | 用户在打招呼 |',
      tokenCount: 12,
    }),
    onContextInjected: payload => injected.push(payload),
    onDebugSnapshot: snapshot => debugSnapshots.push(snapshot),
    logger: { warn() {} },
  });
  const result = await responder('你好啊', { sessionId: 's1' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'responded');
  assert.equal(result.message, '你好，我在。');
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /活泼一点/);
  assert.match(calls[0].messages[0].content, /历史上下文/);
  assert.equal(calls[0].options.maxTokens, 500);
  assert.equal(debugSnapshots.length, 1);
  assert.equal(debugSnapshots[0].source, 'maid_chat_responder');
  assert.equal(debugSnapshots[0].responseText, '你好，我在。');
  assert.match(debugSnapshots[0].messages[1].content, /你好啊/);
  assert.equal(injected.length, 1);
  assert.equal(injected[0].conversationContext.tokenCount, 12);
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
