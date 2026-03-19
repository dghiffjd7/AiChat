import assert from 'node:assert/strict';
import { serializeForInlineScript } from '../../src/scripts/utils/inline-script.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('serializeForInlineScript escapes closing script tags', () => {
  const raw = '</script><script>alert(1)</script>';
  const serialized = serializeForInlineScript(raw);
  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<\\/script>'), true);
});

test('serializeForInlineScript escapes unicode line separators', () => {
  const raw = `line1\u2028line2\u2029line3`;
  const serialized = serializeForInlineScript(raw);
  assert.equal(serialized.includes('\u2028'), false);
  assert.equal(serialized.includes('\u2029'), false);
  assert.equal(serialized.includes('\\u2028'), true);
  assert.equal(serialized.includes('\\u2029'), true);
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
