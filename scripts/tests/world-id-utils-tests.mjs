import assert from 'node:assert/strict';
import { normalizeWorldIdList } from '../../src/scripts/ui/world-id-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizes a single string binding into an array', () => {
  assert.deepEqual(normalizeWorldIdList('海伦娜'), ['海伦娜']);
});

test('deduplicates array bindings and trims blanks', () => {
  assert.deepEqual(
    normalizeWorldIdList([' 贝尔法斯特 ', '', '贝尔法斯特', '菲伦']),
    ['贝尔法斯特', '菲伦'],
  );
});

test('can exclude builtin world ids', () => {
  assert.deepEqual(
    normalizeWorldIdList(['__phone_format__', '芙莉莲(葬送)'], { excludeBuiltin: '__phone_format__' }),
    ['芙莉莲(葬送)'],
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
