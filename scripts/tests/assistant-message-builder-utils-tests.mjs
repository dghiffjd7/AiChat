import assert from 'node:assert/strict';

import {
  applyChatModeAssistantRegex,
  buildAssistantMessageFromText,
  buildChatModeAssistantMessage,
  buildChatModeAssistantMessageFromParts,
  buildChatModeAssistantMessageParts,
  buildCreativeAssistantMessage,
  buildCreativeAssistantMessageParts,
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

test('buildCreativeAssistantMessage composes creative regex memory summary and native reasoning meta', async () => {
  const calls = [];
  const message = await buildCreativeAssistantMessage({
    rawOriginal: 'raw\r\nreply',
    text: 'shown\r\nreply',
    sessionId: 'rp:session',
    id: 'stream-1',
    includeId: true,
    avatar: 'assistant.png',
    time: '10:00',
    summary: '摘要',
    isRpMode: true,
    isGroupChat: true,
    nativeReasoningState: { source: 'native' },
    normalizeCreativeLineBreaks: value => String(value ?? '').replace(/\r\n/g, '\n'),
    extractReasoningFromContent(value, options) {
      calls.push(['reasoning', value, options]);
      return {
        content: `${value}:source`,
        reasoning: 'parsed',
        reasoningDisplay: 'Parsed',
      };
    },
    resolveReasoningState(reasoningParsed, nativeReasoningState, options) {
      calls.push(['resolve-reasoning', reasoningParsed.reasoning, nativeReasoningState, options]);
      return {
        reasoning: 'native',
        reasoningDisplay: 'Native',
        reasoningHidden: true,
        reasoningLabel: 'Thinking',
        reasoningSource: 'native',
      };
    },
    applyOutputRegexPairSafe(value, options) {
      calls.push(['regex', value, options.depth, typeof options.normalizeText]);
      return {
        stored: `${value}:stored`,
        display: `${value}:display`,
      };
    },
    captureAssistantMemoryState(sessionId, options) {
      calls.push(['memory', sessionId, options]);
      return { snapshotId: 'snap-1' };
    },
    attachAssistantMemoryStateToMeta(meta, memoryState) {
      calls.push(['attach-memory', meta, memoryState]);
      return { ...meta, memoryState };
    },
  });

  assert.deepEqual(message, {
    role: 'assistant',
    type: 'text',
    name: '助手',
    avatar: 'assistant.png',
    time: '10:00',
    sessionId: 'rp:session',
    rawOriginal: 'raw\r\nreply',
    rawSource: 'shown\nreply:source',
    raw: 'shown\nreply:source:stored',
    content: 'shown\nreply:source:display',
    meta: {
      renderRich: true,
      memoryState: { snapshotId: 'snap-1' },
      summary: '摘要',
      reasoning: 'native',
      reasoningDisplay: 'Native',
      reasoningHidden: true,
      reasoningLabel: 'Thinking',
      reasoningSource: 'native',
    },
    id: 'stream-1',
  });
  assert.deepEqual(calls, [
    ['reasoning', 'shown\nreply', { depth: 0, strict: true }],
    ['resolve-reasoning', 'parsed', { source: 'native' }, { finalize: true }],
    ['regex', 'shown\nreply:source', 0, 'function'],
    ['memory', 'rp:session', { isGroup: true }],
    ['attach-memory', { renderRich: true }, { snapshotId: 'snap-1' }],
  ]);
});

test('buildCreativeAssistantMessage preserves parsed reasoning and omits id for buffered replies', async () => {
  const message = await buildCreativeAssistantMessage({
    rawOriginal: 'raw',
    text: 'body',
    sessionId: 'rp:session',
    avatar: 'assistant.png',
    time: '10:01',
    normalizeCreativeLineBreaks: value => String(value ?? ''),
    extractReasoningFromContent: () => ({
      content: 'body source',
      reasoning: 'parsed',
      reasoningDisplay: 'Parsed',
    }),
    applyOutputRegexPairSafe: value => ({
      stored: `${value}:stored`,
      display: `${value}:display`,
    }),
  });

  assert.equal(Object.prototype.hasOwnProperty.call(message, 'id'), false);
  assert.deepEqual(message.meta, {
    renderRich: true,
    reasoning: 'parsed',
    reasoningDisplay: 'Parsed',
  });
  assert.equal(message.rawSource, 'body source');
  assert.equal(message.raw, 'body source:stored');
  assert.equal(message.content, 'body source:display');
});

test('buildCreativeAssistantMessage hides content wrapper in display while preserving creative raw fields', async () => {
  const source = '<content>正文</content>';
  const message = await buildCreativeAssistantMessage({
    rawOriginal: source,
    text: source,
    sessionId: 'rp:session',
    normalizeCreativeLineBreaks: value => String(value ?? ''),
    applyOutputRegexPairSafe: value => ({
      stored: String(value ?? ''),
      display: String(value ?? ''),
    }),
  });

  assert.equal(message.rawOriginal, source);
  assert.equal(message.rawSource, source);
  assert.equal(message.raw, source);
  assert.equal(message.content, '正文');
});

test('buildCreativeAssistantMessageParts hides content wrapper after display regex only', () => {
  const source = '<content type="story">正文</content>';
  const parts = buildCreativeAssistantMessageParts({
    text: source,
    normalizeCreativeLineBreaks: value => String(value ?? ''),
    applyOutputRegexPairSafe: value => ({
      stored: `${value}:stored`,
      display: `${value}:display`,
    }),
  });

  assert.equal(parts.finalSource, source);
  assert.equal(parts.stored, `${source}:stored`);
  assert.equal(parts.display, '正文:display');
});

test('buildCreativeAssistantMessageParts leaves residual XML available to output regex and stored fields', () => {
  const source = '<ztl>状态正常</ztl>';
  const regexInputs = [];
  const parts = buildCreativeAssistantMessageParts({
    text: source,
    normalizeCreativeLineBreaks: value => String(value ?? ''),
    applyOutputRegexPairSafe: value => {
      regexInputs.push(value);
      return { stored: value, display: value };
    },
  });

  assert.deepEqual(regexInputs, [source]);
  assert.equal(parts.rawSource, source);
  assert.equal(parts.finalSource, source);
  assert.equal(parts.stored, source);
  assert.equal(parts.display, source);
});

test('creative finalize keeps body when thinking contains a dangling tableEdit tag', async () => {
  // 端到端创意语料：thinking 中途未闭合 <tableEdit> + 末尾完整块（预设常规要求），
  // 按真实 finalize 顺序（先 memory 提取、再 builder），正文与 thinking 必须完整。
  const { extractTableEditBlocks } = await import('../../src/scripts/memory/memory-edit-parser.js');
  const { createReasoningRuntime } = await import('../../src/scripts/ui/chat/reasoning-runtime-utils.js');
  const raw = [
    '<thinking>',
    '本轮剧情推进：主角进入藏经阁。需要更新表格：',
    '<tableEdit>',
    'insertRow(0, {"0":"藏经阁","1":"主角"})',
    '（模型没有输出闭合标签，思考继续）',
    '</thinking>',
    '',
    '楚寻踏入藏经阁，檀香扑面而来。',
    '他翻开第一卷《太初真解》，字迹如龙蛇游走。',
    '「这便是传说中的上古功法……」他低声呢喃。',
    '',
    '<tableEdit>',
    '<!--',
    'updateRow(0, 0, {"2":"藏经阁一层"})',
    '-->',
    '</tableEdit>',
  ].join('\n');
  const memoryParsed = extractTableEditBlocks(raw);
  assert.equal(memoryParsed.actions.length, 2, '悬空命令与末尾完整块的动作都应提取');
  const runtime = createReasoningRuntime({
    getSettings: () => ({ reasoningAutoParse: true }),
    getPreset: () => ({ prefix: '<thinking>', suffix: '</thinking>' }),
    normalizeLineBreaks: value => String(value ?? ''),
  });
  const parts = buildCreativeAssistantMessageParts({
    text: memoryParsed.text,
    extractReasoningFromContent: runtime.extractReasoningFromContent,
  });
  assert.equal(parts.reasoningParsed.reasoning.includes('主角进入藏经阁'), true, '思考内容保留');
  assert.equal(parts.stored.includes('楚寻踏入藏经阁'), true, '正文开头保留');
  assert.equal(parts.stored.includes('他低声呢喃'), true, '正文结尾保留');
  assert.equal(parts.display.includes('楚寻踏入藏经阁'), true, '显示副本保留正文');
  assert.equal(parts.stored.includes('insertRow'), false, '表格命令不进正文');
});

test('buildCreativeAssistantMessage preserves incomplete image_prompt tags through output regex', async () => {
  const source = '正文\n<image_prompt>\n后续正文';
  const dangerousStrip = value => String(value ?? '').replace(/<\s*image_prompt\b[\s\S]*/i, '');
  const message = await buildCreativeAssistantMessage({
    rawOriginal: source,
    text: source,
    sessionId: 'rp:session',
    normalizeCreativeLineBreaks: value => String(value ?? ''),
    applyOutputRegexPairSafe: value => ({
      stored: dangerousStrip(value),
      display: dangerousStrip(value),
    }),
  });

  assert.equal(message.rawSource, source);
  assert.equal(message.raw, source);
  assert.equal(message.content, source);
});

test('buildChatModeAssistantMessageParts resolves native reasoning without rebuilding payload', () => {
  const calls = [];
  const parts = buildChatModeAssistantMessageParts({
    text: 'reply',
    nativeReasoningState: { source: 'native' },
    applyChatModeAssistantRegex(value, options) {
      calls.push(['regex', value, options]);
      return {
        reasoningParsed: { reasoning: 'parsed', reasoningDisplay: 'Parsed' },
        finalSource: 'reply source',
        stored: 'reply stored',
        display: 'reply display',
      };
    },
    resolveReasoningState(reasoningParsed, nativeReasoningState, options) {
      calls.push(['resolve', reasoningParsed.reasoning, nativeReasoningState, options]);
      return {
        reasoning: 'native',
        reasoningDisplay: 'Native',
        reasoningHidden: true,
        reasoningLabel: 'Thinking',
        reasoningSource: 'native',
      };
    },
  });

  assert.deepEqual(parts, {
    reasoningParsed: { reasoning: 'parsed', reasoningDisplay: 'Parsed' },
    resolvedReasoning: {
      reasoning: 'native',
      reasoningDisplay: 'Native',
      reasoningHidden: true,
      reasoningLabel: 'Thinking',
      reasoningSource: 'native',
    },
    finalSource: 'reply source',
    stored: 'reply stored',
    display: 'reply display',
  });
  assert.deepEqual(calls, [
    ['regex', 'reply', { depth: 0 }],
    ['resolve', 'parsed', { source: 'native' }, { finalize: true }],
  ]);
});

test('buildChatModeAssistantMessageFromParts preserves special message parsing id and reasoning meta', () => {
  const message = buildChatModeAssistantMessageFromParts({
    parts: {
      finalSource: 'reply source',
      stored: 'reply stored',
      display: 'reply display',
      resolvedReasoning: {
        reasoning: 'native',
        reasoningDisplay: 'Native',
        reasoningHidden: true,
      },
    },
    rawOriginal: 'raw reply',
    id: 'stream-2',
    includeId: true,
    avatar: 'assistant.png',
    formatTime: () => '10:02',
    parseSpecialMessage: value => ({
      type: 'text',
      content: value,
      meta: { parsed: true },
    }),
  });

  assert.deepEqual(message, {
    role: 'assistant',
    name: '助手',
    avatar: 'assistant.png',
    time: '10:02',
    rawOriginal: 'raw reply',
    rawSource: 'reply source',
    raw: 'reply stored',
    type: 'text',
    content: 'reply display',
    meta: {
      reasoning: 'native',
      reasoningDisplay: 'Native',
      reasoningHidden: true,
    },
    id: 'stream-2',
  });
});

test('buildChatModeAssistantMessage uses parsed reasoning and omits meta when empty', () => {
  const withReasoning = buildChatModeAssistantMessage({
    text: 'reply',
    rawOriginal: 'raw reply',
    avatar: 'assistant.png',
    time: '10:03',
    applyChatModeAssistantRegex: () => ({
      reasoningParsed: { reasoning: 'parsed', reasoningDisplay: 'Parsed' },
      finalSource: '',
      stored: 'stored',
      display: 'display',
    }),
    parseSpecialMessage: value => ({ type: 'text', content: value }),
  });
  assert.equal(Object.prototype.hasOwnProperty.call(withReasoning, 'id'), false);
  assert.equal(withReasoning.rawSource, undefined);
  assert.deepEqual(withReasoning.meta, {
    reasoning: 'parsed',
    reasoningDisplay: 'Parsed',
  });

  const withoutReasoning = buildChatModeAssistantMessage({
    text: 'reply',
    applyChatModeAssistantRegex: () => ({
      reasoningParsed: { reasoning: '', reasoningDisplay: '' },
      finalSource: 'source',
      stored: 'stored',
      display: 'display',
    }),
    parseSpecialMessage: value => ({ type: 'text', content: value }),
  });
  assert.equal(withoutReasoning.meta, undefined);
});

test('chat/creative builders record real provider usage on meta.usage (Phase B main-task metering)', async () => {
  const { buildCreativeAssistantMessageFromParts } = await import('../../src/scripts/ui/chat/assistant-message-builder-utils.js');
  // 聊天模式：provider 返回 token → meta.usage recorded，toolCallCount 恒 0（主任务无工具）
  const chatMsg = buildChatModeAssistantMessageFromParts({
    parts: { finalSource: 's', stored: 'st', display: 'd', resolvedReasoning: {} },
    parseSpecialMessage: value => ({ type: 'text', content: value }),
    usage: { provider: 'custom', model: 'claude-fable-5', promptTokens: 8500, completionTokens: 120, totalTokens: 8620, latencyMs: 4200, finishReason: 'stop' },
  });
  assert.equal(chatMsg.meta.usage.status, 'recorded');
  assert.equal(chatMsg.meta.usage.provider, 'custom');
  assert.equal(chatMsg.meta.usage.promptTokens, 8500);
  assert.equal(chatMsg.meta.usage.totalTokens, 8620);
  assert.equal(chatMsg.meta.usage.latencyMs, 4200);
  assert.equal(chatMsg.meta.usage.toolCallCount, 0);

  // 创意写作：无 usage 时不加 meta.usage（保持既有 meta 形状）
  const creativeNoUsage = await buildCreativeAssistantMessageFromParts({
    parts: { finalSource: 's', stored: 'st', display: 'd', resolvedReasoning: {} },
  });
  assert.equal(creativeNoUsage.meta.usage, undefined);

  // 创意写作：有 usage 时挂到 meta.usage
  const creativeMsg = await buildCreativeAssistantMessageFromParts({
    parts: { finalSource: 's', stored: 'st', display: 'd', resolvedReasoning: {} },
    usage: { provider: 'openai', model: 'gpt', promptTokens: 1000, completionTokens: 500 },
  });
  assert.equal(creativeMsg.meta.usage.status, 'recorded');
  assert.equal(creativeMsg.meta.usage.totalTokens, 1500);
  assert.equal(creativeMsg.meta.renderRich, true);
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
