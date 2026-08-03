import assert from 'node:assert/strict';

import {
  buildAssistantReasoningEditPatch,
  buildUserMessageEditPatch,
  hasDownstreamConversationContext,
} from '../../src/scripts/ui/chat/message-edit-transaction-utils.js';

{
  const messages = [
    { id: 'u1', role: 'user' },
    { id: 'pending', role: 'assistant', status: 'pending' },
    { id: 'a1', role: 'assistant' },
  ];
  assert.equal(hasDownstreamConversationContext(messages, 'u1'), true);
  assert.equal(hasDownstreamConversationContext(messages, 'a1'), false);
  assert.equal(hasDownstreamConversationContext(messages, 'missing'), false);
  console.log('ok - user edit detects only committed downstream conversation context');
}

{
  const calls = [];
  const patch = buildUserMessageEditPatch({
    text: '  原始输入  ',
    applyStoredRegex(value, options) {
      calls.push(['stored', value, options]);
      return `<stored>${value}</stored>`;
    },
    applyDisplayRegex(value, options) {
      calls.push(['display', value, options]);
      return `display:${value}`;
    },
    now: () => 1234,
  });
  assert.deepEqual(patch, {
    content: 'display:<stored>  原始输入  </stored>',
    raw: '<stored>  原始输入  </stored>',
    rawInput: '  原始输入  ',
    editedAt: 1234,
  });
  assert.deepEqual(calls, [
    ['stored', '  原始输入  ', { isEdit: true }],
    ['display', '<stored>  原始输入  </stored>', { isEdit: true, depth: 0 }],
  ]);
  console.log('ok - user edit preserves pre-regex whitespace and records editedAt');
}

{
  const message = {
    id: 'assistant-native',
    role: 'assistant',
    rawOriginal: '正文原文',
    meta: {
      reasoning: 'old-stored',
      reasoningDisplay: 'old-display',
      reasoningLabel: 'Thought for 8 秒',
      reasoningSource: 'native:openai',
      activeSwipe: 1,
      swipes: [
        { content: 'branch-a', reasoning: 'branch-a-thought', reasoningDisplay: 'branch-a-display' },
        {
          content: 'branch-b',
          reasoning: 'old-stored',
          reasoningDisplay: 'old-display',
        },
      ],
    },
  };
  const patch = buildAssistantReasoningEditPatch({
    message,
    text: '  新思维链  ',
    applyReasoningRegex: value => ({
      stored: `stored:${value}`,
      display: `display:${value}`,
    }),
  });
  assert.equal(patch.rawOriginal, undefined, 'native reasoning must not be inserted into the provider body');
  assert.equal(patch.meta.reasoning, 'stored:  新思维链  ');
  assert.equal(patch.meta.reasoningDisplay, 'display:  新思维链  ');
  assert.equal(patch.meta.reasoningLabel, 'Thought for 8 秒');
  assert.equal(patch.meta.reasoningSource, 'native:openai');
  assert.equal(patch.meta.swipes[0].reasoning, 'branch-a-thought');
  assert.equal(patch.meta.swipes[1].reasoning, 'stored:  新思维链  ');
  assert.equal(patch.meta.swipes[1].reasoningDisplay, 'display:  新思维链  ');
  assert.equal(patch.meta.swipes[1].reasoningLabel, 'Thought for 8 秒');
  assert.equal(patch.meta.swipes[1].reasoningSource, 'native:openai');
  console.log('ok - native reasoning edits update only reasoning metadata and the active swipe branch');
}

{
  const message = {
    id: 'assistant-tagged',
    role: 'assistant',
    rawOriginal: '<think>旧思路</think>\n正文保持不变',
    rawSource: '正文保持不变',
    content: '正文保持不变',
    meta: {
      reasoning: '旧思路',
      reasoningDisplay: '旧思路',
      renderRich: true,
    },
  };
  const patch = buildAssistantReasoningEditPatch({
    message,
    text: '新思路',
    reasoningPrefix: '<think>',
    reasoningSuffix: '</think>',
    applyReasoningRegex: value => ({ stored: value, display: value }),
  });
  assert.equal(patch.rawOriginal, '<think>新思路</think>\n正文保持不变');
  assert.equal(patch.rawSource, undefined);
  assert.equal(patch.content, undefined);
  assert.equal(patch.meta.reasoning, '新思路');
  assert.equal(patch.meta.reasoningDisplay, '新思路');

  const cleared = buildAssistantReasoningEditPatch({
    message,
    text: '',
    reasoningPrefix: '<think>',
    reasoningSuffix: '</think>',
  });
  assert.equal(cleared.rawOriginal, '正文保持不变');
  assert.equal('reasoning' in cleared.meta, false);
  assert.equal('reasoningDisplay' in cleared.meta, false);
  console.log('ok - tagged reasoning edits replace or remove only the tagged block while preserving the response body');
}
