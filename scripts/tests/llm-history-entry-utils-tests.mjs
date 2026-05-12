import assert from 'node:assert/strict';

import {
  buildLlmHistoryEntry,
  loadLlmCreativeSummarySource,
  resolveLlmCreativeHistorySummary,
  resolveLlmHistoryImageAttachment,
} from '../../src/scripts/ui/chat/llm-history-entry-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveLlmHistoryImageAttachment keeps history images detached from prompt media', () => {
  assert.equal(
    resolveLlmHistoryImageAttachment(
      { type: 'image', content: 'https://example.com/a.png', meta: {} },
      { isAttachmentExpired: () => false },
    ),
    '',
  );
  assert.equal(
    resolveLlmHistoryImageAttachment(
      { type: 'image', content: '[图片]', meta: {} },
      { isAttachmentExpired: () => false },
    ),
    '',
  );
  assert.equal(
    resolveLlmHistoryImageAttachment(
      { type: 'image', content: 'https://example.com/a.png', meta: {} },
      { isAttachmentExpired: () => true },
    ),
    '',
  );
});

test('resolveLlmCreativeHistorySummary prefers direct then compacted then latest summary list item', () => {
  assert.equal(
    resolveLlmCreativeHistorySummary({
      directSummary: 'direct',
      compactedSummary: { text: 'compacted' },
      summaries: ['last'],
    }),
    'direct',
  );
  assert.equal(
    resolveLlmCreativeHistorySummary({
      compactedSummary: { text: 'compacted' },
      summaries: ['last'],
    }),
    'compacted',
  );
  assert.equal(
    resolveLlmCreativeHistorySummary({
      summaries: [{ text: 'older' }, { text: 'last' }],
    }),
    'last',
  );
});

test('loadLlmCreativeSummarySource snapshots store fallbacks and tolerates getter errors', () => {
  assert.deepEqual(
    loadLlmCreativeSummarySource({
      getCompactedSummary: () => ({ text: 'compacted' }),
      getSummaries: () => [{ text: 'one' }, { text: 'two' }],
    }),
    {
      compactedSummary: { text: 'compacted' },
      summaries: [{ text: 'one' }, { text: 'two' }],
    },
  );
  assert.deepEqual(
    loadLlmCreativeSummarySource({
      getCompactedSummary: () => {
        throw new Error('no compacted');
      },
      getSummaries: () => {
        throw new Error('no summaries');
      },
    }),
    {
      compactedSummary: '',
      summaries: [],
    },
  );
});

test('buildLlmHistoryEntry converts group system messages into assistant-readable system lines', () => {
  assert.deepEqual(
    buildLlmHistoryEntry(
      { role: 'system', content: '系统消息：Alice 加入了群聊' },
      { isGroupChat: true },
    ),
    {
      role: 'assistant',
      content: '系统消息（我们能解析的这种）：Alice 加入了群聊',
      name: '系统',
      __creative: false,
    },
  );
});

test('buildLlmHistoryEntry converts history image messages to placeholders only', () => {
  assert.deepEqual(
    buildLlmHistoryEntry(
      { role: 'user', type: 'image', content: 'https://example.com/a.png', name: '我' },
      {},
    ),
    {
      role: 'user',
      content: '[图片]',
      name: '我',
      __creative: false,
      __reasoning: '',
    },
  );
});

test('buildLlmHistoryEntry prefers rp plain text and preserves assistant reasoning', () => {
  assert.deepEqual(
    buildLlmHistoryEntry(
      {
        role: 'assistant',
        content: '<div>rich</div>',
        raw: '<raw>',
        meta: { renderRich: true, reasoning: 'think' },
        name: '角色',
      },
      {
        isRpMode: true,
        rpUiMode: true,
        depth: 3,
        resolvePlainText: (_message, options) => {
          assert.equal(options.depth, 3);
          assert.equal(options.preferRawSource, true);
          return 'plain';
        },
      },
    ),
    {
      role: 'assistant',
      content: 'plain',
      name: '角色',
      __creative: true,
      __reasoning: 'think',
    },
  );
});

test('buildLlmHistoryEntry uses creative summary for rich assistant outside rp mode', () => {
  assert.deepEqual(
    buildLlmHistoryEntry(
      {
        role: 'assistant',
        content: '<div>rich</div>',
        meta: { renderRich: true },
        name: '角色',
      },
      {
        creativeSummary: 'summary text',
      },
    ),
    {
      role: 'assistant',
      content: 'summary text',
      name: '角色',
      __creative: true,
      __reasoning: '',
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
