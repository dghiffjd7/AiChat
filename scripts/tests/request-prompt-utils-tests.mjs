import assert from 'node:assert/strict';

import {
  buildPromptPreviewSnapshot,
  buildMemoryUpdateHistoryText,
  buildRequestPromptText,
  resolveMemoryUpdateRequestPrompt,
} from '../../src/scripts/ui/chat/request-prompt-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildRequestPromptText formats mixed content arrays and media tokens', () => {
  assert.equal(
    buildRequestPromptText([
      { role: 'system', content: 'rules' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aaa' } },
          { type: 'input_audio' },
        ],
      },
      { role: 'assistant', content: 'data:image/gif;base64,bbb' },
    ]),
    [
      'system:\nrules',
      'user:\nhello\n[图片]\n[语音]',
      'assistant:\n[gif]',
    ].join('\n\n'),
  );
});

test('buildMemoryUpdateHistoryText groups rounds, strips assistant text, and skips pending messages', () => {
  assert.equal(
    buildMemoryUpdateHistoryText([
      { role: 'assistant', raw: 'orphan<edit>x</edit>' },
      { role: 'user', name: '阿明', raw: '你好' },
      { role: 'assistant', raw: '回复<edit>删</edit>' },
      { role: 'system', content: '系统提示' },
      { role: 'assistant', raw: 'data:image/png;base64,aaa', type: 'image' },
      { role: 'user', raw: '下一轮', status: 'pending' },
      { role: 'user', raw: '结束' },
      { role: 'assistant', type: 'document', content: 'doc.txt' },
    ], {
      limit: 2,
      stripAssistantText: text => text.replace(/<edit>.*?<\/edit>/g, ''),
    }),
    [
      '阿明: 你好',
      '助手: 回复',
      '系统: 系统提示',
      '助手: [图片]',
      '用户: 结束',
      '助手: [文件] doc.txt',
    ].join('\n'),
  );
});

test('buildMemoryUpdateHistoryText enforces zero limit and 4000 char clipping', () => {
  assert.equal(buildMemoryUpdateHistoryText([{ role: 'user', raw: 'x' }], { limit: 0 }), '');
  const long = 'a'.repeat(5000);
  const result = buildMemoryUpdateHistoryText([{ role: 'user', raw: long }], { limit: 1 });
  assert.equal(result.length, '用户: '.length + 4001);
  assert.equal(result.endsWith('…'), true);
});

test('resolveMemoryUpdateRequestPrompt prefers explicit, then inferred, then last entry prompt', () => {
  assert.equal(
    resolveMemoryUpdateRequestPrompt({
      requestPrompt: ' direct ',
      lastRequestMessages: [{ role: 'user', content: 'ignored' }],
      lastEntryRequestPrompt: 'fallback',
    }),
    ' direct ',
  );
  assert.equal(
    resolveMemoryUpdateRequestPrompt({
      requestPrompt: '   ',
      lastRequestMessages: [{ role: 'user', content: 'hello' }],
      lastEntryRequestPrompt: 'fallback',
    }),
    'user:\nhello',
  );
  assert.equal(
    resolveMemoryUpdateRequestPrompt({
      requestPrompt: '',
      lastRequestMessages: null,
      lastEntryRequestPrompt: 'fallback',
      buildRequestPrompt: () => '',
    }),
    'fallback',
  );
});

test('buildPromptPreviewSnapshot formats meta header and prompt body', () => {
  const snapshot = buildPromptPreviewSnapshot({
    request: {
      provider: 'openai',
      model: 'gpt',
      baseUrl: 'http://x',
      stream: true,
      at: 123,
      options: { temperature: 0.7, maxTokens: undefined },
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hello' },
      ],
    },
    contactName: '会话A',
    formatAt: () => 'TIME',
  });
  assert.equal(snapshot.meta, '会话A · TIME');
  assert.match(snapshot.head, /provider: openai/);
  assert.match(snapshot.head, /stream: true/);
  assert.match(snapshot.head, /options: temperature=0.7/);
  assert.equal(snapshot.body, 'system:\nrules\n\nuser:\nhello');
  assert.equal(snapshot.messages.length, 2);
  // 预览含本地估算 token（标注非精确），且返回结构化字段
  assert.match(snapshot.head, /估算输入 token: ~\d+/);
  assert.match(snapshot.head, /非精确/);
  assert.equal(typeof snapshot.estimatedInputTokens, 'number');
  assert.ok(snapshot.estimatedInputTokens > 0);
});

test('buildPromptPreviewSnapshot applies and labels a learned calibration coefficient', () => {
  const snapshot = buildPromptPreviewSnapshot({
    request: {
      messages: [{ role: 'user', content: 'abcd' }],
    },
    tokenCalibration: {
      coefficient: 1.5,
      samples: 3,
    },
  });
  assert.match(snapshot.head, /本地校准估算 ×1\.500/);
  assert.equal(snapshot.tokenCalibration.samples, 3);
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

if (failed > 0) process.exit(1);
