import assert from 'node:assert/strict';

import { normalizeDialogueMessage } from '../../src/scripts/ui/chat/dialogue-message-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeDialogueMessage trims object fields', () => {
  assert.deepEqual(
    normalizeDialogueMessage({ speaker: ' Alice ', content: ' hi ', time: ' 09:00 ' }),
    {
      speaker: 'Alice',
      rawContent: 'hi',
      content: 'hi',
      time: '09:00',
    },
  );
});

test('normalizeDialogueMessage parses inline user speaker prefix when callback accepts it', () => {
  assert.deepEqual(
    normalizeDialogueMessage('我： 你好 ', {
      isUserSpeakerName: value => value === '我',
    }),
    {
      speaker: '我',
      rawContent: '你好',
      content: '你好',
      time: '',
    },
  );
});

test('normalizeDialogueMessage keeps raw text when inline prefix is not a user speaker', () => {
  assert.deepEqual(
    normalizeDialogueMessage('路人：你好', {
      isUserSpeakerName: () => false,
    }),
    {
      speaker: '',
      rawContent: '路人：你好',
      content: '路人：你好',
      time: '',
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
