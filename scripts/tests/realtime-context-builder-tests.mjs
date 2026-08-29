import assert from 'node:assert/strict';

import { buildRealtimeSemanticSnapshotFromRequest } from '../../src/scripts/ui/realtime/realtime-context-builder.js';

const result = buildRealtimeSemanticSnapshotFromRequest({
  messages: [
    { role: 'system', content: '你是武藏。保持沉稳、温柔。' },
    { role: 'system', content: '世界书：港区现在正在下雨。' },
    { role: 'system', content: 'MiPhone_start\n必须输出 msg_start\nMiPhone_end' },
    { role: 'user', content: '上一轮问题' },
    { role: 'assistant', content: '上一轮回答' },
    { role: 'user', content: '现在的问题' },
  ],
}, {
  currentInputText: '现在的问题',
  maxChars: 2000,
});

assert.match(result.instructions, /你是武藏/);
assert.match(result.instructions, /港区现在正在下雨/);
assert.match(result.instructions, /上一轮问题/);
assert.match(result.instructions, /上一轮回答/);
assert.doesNotMatch(result.instructions, /MiPhone_start|msg_start/);
assert.doesNotMatch(result.instructions, /现在的问题/);
assert.equal(result.excludedProtocolMessages, 1);

const bounded = buildRealtimeSemanticSnapshotFromRequest({
  messages: Array.from({ length: 20 }, (_, index) => ({
    role: index === 0 ? 'system' : 'user',
    content: `${index}:${'长内容'.repeat(100)}`,
  })),
}, { maxChars: 900 });
assert.ok(bounded.instructions.length <= 900);
assert.match(bounded.instructions, /0:/);

console.log('realtime context builder tests passed');
