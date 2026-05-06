import assert from 'node:assert/strict';

import {
  applyOutputDisplayRegexSafe,
  applyOutputRegexPairSafe,
  applyOutputStoredRegexSafe,
} from '../../src/scripts/ui/chat/output-regex-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyOutputStoredRegexSafe applies bridge function and normalization', () => {
  assert.equal(
    applyOutputStoredRegexSafe('hello', {
      appBridge: {
        applyOutputStoredRegex(value) {
          return `${value}!`;
        },
      },
      normalizeText: value => value.toUpperCase(),
    }),
    'HELLO!',
  );
});

test('applyOutputDisplayRegexSafe falls back on bridge errors and reports stage', () => {
  const stages = [];
  assert.equal(
    applyOutputDisplayRegexSafe('hello', {
      appBridge: {
        applyOutputDisplayRegex() {
          throw new Error('boom');
        },
      },
      onError(_err, stage) {
        stages.push(stage);
      },
    }),
    'hello',
  );
  assert.deepEqual(stages, ['display']);
});

test('applyOutputRegexPairSafe chains stored result into display stage', () => {
  const calls = [];
  assert.deepEqual(
    applyOutputRegexPairSafe('hello', {
      appBridge: {
        applyOutputStoredRegex(value, options) {
          calls.push(['stored', value, options]);
          return `stored:${value}`;
        },
        applyOutputDisplayRegex(value, options) {
          calls.push(['display', value, options]);
          return `display:${value}`;
        },
      },
      depth: 2,
      isEdit: true,
    }),
    {
      stored: 'stored:hello',
      display: 'display:stored:hello',
    },
  );
  assert.deepEqual(calls, [
    ['stored', 'hello', { isEdit: true, depth: 2 }],
    ['display', 'stored:hello', { isEdit: true, depth: 2 }],
  ]);
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
