import assert from 'node:assert/strict';

import {
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
