import assert from 'node:assert/strict';

import {
  normalizeMomentCommentForStore,
  normalizeMomentCommentsForStore,
  normalizeMomentRecordForStore,
  normalizeMomentStoredText,
} from '../../src/scripts/ui/chat/moment-store-normalize-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeMomentStoredText supports input and output regex modes', () => {
  const appBridge = {
    applyInputStoredRegex(value) {
      return `input:${value}`;
    },
    applyOutputStoredRegex(value) {
      return `output:${value}`;
    },
  };
  assert.equal(normalizeMomentStoredText('hello', { regexMode: 'input', appBridge }), 'input:hello');
  assert.equal(normalizeMomentStoredText('hello', { regexMode: 'output', appBridge }), 'output:hello');
});

test('normalizeMomentCommentForStore normalizes content and regexMode', () => {
  assert.deepEqual(
    normalizeMomentCommentForStore(
      { content: 'hello', id: 'c1' },
      {
        regexMode: 'input',
        appBridge: {
          applyInputStoredRegex(value) {
            return `input:${value}`;
          },
        },
      },
    ),
    {
      content: 'input:hello',
      id: 'c1',
      regexMode: 'input',
    },
  );
});

test('normalizeMomentCommentsForStore and normalizeMomentRecordForStore normalize nested comments', () => {
  const appBridge = {
    applyOutputStoredRegex(value) {
      return `output:${value}`;
    },
  };
  assert.deepEqual(
    normalizeMomentCommentsForStore([{ content: 'a' }, { content: 'b' }], { appBridge }),
    [
      { content: 'output:a', regexMode: 'output' },
      { content: 'output:b', regexMode: 'output' },
    ],
  );
  assert.deepEqual(
    normalizeMomentRecordForStore({ content: 'post', comments: [{ content: 'x' }] }, { appBridge }),
    {
      content: 'output:post',
      comments: [{ content: 'output:x', regexMode: 'output' }],
      regexMode: 'output',
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

if (failed > 0) process.exit(1);
