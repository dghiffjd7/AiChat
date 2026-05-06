import assert from 'node:assert/strict';

import { buildLlmHistoryForSession } from '../../src/scripts/ui/chat/llm-history-builder-utils.js';

{
  const history = buildLlmHistoryForSession({
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        content: '<div>rich</div>',
        meta: { renderRich: true },
        name: '角色',
      },
      {
        id: 'u1',
        role: 'user',
        content: '继续',
      },
    ],
    creativeSummaryGetters: {
      getCompactedSummary: () => ({ text: 'summary text' }),
      getSummaries: () => [],
    },
    excludeMessageIds: [],
    isAttachmentExpired: () => false,
    isGroupChat: false,
    isRpMode: false,
    openaiPreset: {},
    pendingUserText: '继续',
    reasoningPreset: {},
    resolvePlainText: () => '',
    resolveStickerKeyword: () => '',
    rpUiMode: false,
    settings: {},
    applyMacros: value => value,
  });
  assert.deepEqual(history, [
    {
      role: 'assistant',
      content: 'summary text',
      name: '角色',
    },
  ]);
  console.log('ok - buildLlmHistoryForSession composes entry building and trailing user echo cleanup');
}

{
  const history = buildLlmHistoryForSession({
    messages: [
      { id: 'drop', role: 'assistant', content: '丢弃我' },
      { id: 'keep', role: 'assistant', content: '保留我' },
    ],
    creativeSummaryGetters: {
      getCompactedSummary: () => '',
      getSummaries: () => [],
    },
    excludeMessageIds: new Set(['drop']),
    isAttachmentExpired: () => false,
    isGroupChat: false,
    isRpMode: false,
    openaiPreset: {},
    pendingUserText: '',
    reasoningPreset: {},
    resolvePlainText: () => '',
    resolveStickerKeyword: () => '',
    rpUiMode: false,
    settings: {},
    applyMacros: value => value,
  });
  assert.deepEqual(history, [
    {
      role: 'assistant',
      content: '保留我',
      name: '',
    },
  ]);
  console.log('ok - buildLlmHistoryForSession wires candidate filtering into final history output');
}
