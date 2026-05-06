import assert from 'node:assert/strict';

import {
  applyChatModeAssistantRegex,
  buildAssistantMessageFromText,
} from '../../src/scripts/ui/chat/assistant-message-builder-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyChatModeAssistantRegex runs sanitize, reasoning extraction, and stored/display regex chain', () => {
  const result = applyChatModeAssistantRegex(' raw ', {
    depth: 2,
    promptUserName: '我',
    sanitizeAssistantReplyText: (value, name) => `${name}:${String(value).trim()}`,
    extractReasoningFromContent: value => ({
      content: `${value}:content`,
      reasoning: 'thinking',
      reasoningDisplay: 'THINKING',
    }),
    applyStoredRegex: value => `${value}:stored`,
    applyDisplayRegex: value => `${value}:display`,
  });

  assert.deepEqual(result, {
    cleaned: '我:raw',
    reasoningParsed: {
      content: '我:raw:content',
      reasoning: 'thinking',
      reasoningDisplay: 'THINKING',
    },
    finalSource: '我:raw:content',
    stored: '我:raw:content:stored',
    display: '我:raw:content:stored:display',
  });
});

test('buildAssistantMessageFromText builds assistant payload with reasoning and avatar fallback', async () => {
  const message = await buildAssistantMessageFromText('hello', {
    sessionId: 'chat-a',
    time: '10:00',
    name: '助手',
    promptUserName: '我',
    isGroupChat: false,
    applyChatModeAssistantRegex: value => ({
      reasoningParsed: { content: `${value}:source`, reasoning: 'r', reasoningDisplay: 'R' },
      finalSource: `${value}:source`,
      stored: `${value}:stored`,
      display: `${value}:display`,
    }),
    parseSpecialMessage: value => ({ type: 'text', content: value, meta: { parsed: true } }),
    getSessionContact: () => ({ id: 'chat-a', isGroup: false }),
    getContactById: () => null,
    getAssistantAvatarForSession: () => 'assistant.png',
  });

  assert.deepEqual(message, {
    role: 'assistant',
    type: 'text',
    content: 'hello:display',
    name: '助手',
    avatar: 'assistant.png',
    sessionId: 'chat-a',
    time: '10:00',
    rawOriginal: 'hello',
    rawSource: 'hello:source',
    raw: 'hello:stored',
    meta: {
      parsed: true,
      reasoning: 'r',
      reasoningDisplay: 'R',
    },
  });
});

test('buildAssistantMessageFromText supports template injection/render and group speaker avatar resolution', async () => {
  const calls = [];
  const message = await buildAssistantMessageFromText('hello', {
    sessionId: 'group:room',
    time: '10:00',
    name: '小明',
    showName: true,
    speakerContactId: 'contact-a',
    promptUserName: '我',
    isGroupChat: true,
    maybePromptTemplateGate: ({ sampleText }) => calls.push(`gate:${sampleText}`),
    shouldRunTemplate: () => true,
    getTemplateInjections: ({ content }) => {
      calls.push(`inject:${content}`);
      return { before: ['before'], after: ['after'] };
    },
    renderTemplateText: async (content) => {
      calls.push(`render:${content}`);
      return { text: `${content}:rendered`, messageVars: { mood: 'happy' } };
    },
    applyChatModeAssistantRegex: value => ({
      reasoningParsed: { content: value, reasoning: '', reasoningDisplay: '' },
      finalSource: value,
      stored: value,
      display: value,
    }),
    parseSpecialMessage: value => ({ type: 'text', content: value, meta: {} }),
    getSessionContact: () => ({ id: 'group:room', isGroup: true }),
    getContactById: () => ({ id: 'contact-a', isGroup: false }),
    resolveGroupSpeakerAvatar: ({ speakerName, sessionId, speakerContactId }) => {
      calls.push(`group-avatar:${speakerName}:${sessionId}:${speakerContactId}`);
      return 'group.png';
    },
    resolveContactAvatar: () => 'contact.png',
  });

  assert.deepEqual(calls, [
    'gate:hello',
    'inject:hello',
    'render:before\n\nhello\n\nafter',
    'group-avatar:小明:group:room:contact-a',
  ]);
  assert.deepEqual(message.meta, {
    showName: true,
    speakerContactId: 'contact-a',
    templateVars: { mood: 'happy' },
  });
  assert.equal(message.avatar, 'contact.png');
  assert.equal(message.content, 'before\n\nhello\n\nafter:rendered');
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
