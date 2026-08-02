import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAID_GUIDE_EXPRESSIONS,
  MAID_GUIDE_EXPRESSION_BACKGROUND,
  MAID_GUIDE_EXPRESSION_SHEET_SRC,
  MAID_GUIDE_EXPRESSION_ZOOM,
  applyMaidGuideExpression,
  getMaidGuideExpression,
  resolveMaidGuideExpressionState,
} from '../../src/scripts/ui/maid-guide-expression-utils.js';

assert.equal(Object.keys(MAID_GUIDE_EXPRESSIONS).length, 16);
assert.deepEqual(getMaidGuideExpression('welcome'), {
  state: 'welcome',
  row: 0,
  column: 0,
  x: '0%',
  y: '0%',
});
assert.deepEqual(getMaidGuideExpression('complete'), {
  state: 'complete',
  row: 3,
  column: 3,
  x: '100%',
  y: '100%',
});
assert.equal(getMaidGuideExpression('missing').state, 'welcome');

assert.equal(resolveMaidGuideExpressionState({ phase: 'done' }), 'complete');
assert.equal(resolveMaidGuideExpressionState({ step: { action: 'click' } }), 'point');
assert.equal(resolveMaidGuideExpressionState({ step: { action: 'type' } }), 'clipboard');
assert.equal(resolveMaidGuideExpressionState({ step: { action: 'wait-event', target: 'chat-body' } }), 'waiting');
assert.equal(resolveMaidGuideExpressionState({ step: { expression: 'apology' } }), 'apology');

const classes = new Set();
const element = {
  classList: { add: value => classes.add(value) },
  dataset: {},
  style: {},
};
const applied = applyMaidGuideExpression(element, 'encourage');
assert.equal(applied.state, 'encourage');
assert.equal(element.dataset.maidExpression, 'encourage');
assert.equal(MAID_GUIDE_EXPRESSION_ZOOM, 1);
assert.equal(MAID_GUIDE_EXPRESSION_BACKGROUND, '#efedf7');
assert.equal(element.style.backgroundSize, '400% 400%');
assert.equal(element.style.backgroundColor, MAID_GUIDE_EXPRESSION_BACKGROUND);
assert.match(element.style.backgroundImage, /maid-guide-expression-sheet\.webp/);
assert.equal(classes.has('maid-guide-expression'), true);

assert.equal(MAID_GUIDE_EXPRESSION_SHEET_SRC, './assets/media/maid-guide-expression-sheet.webp');
let canonicalBytes = null;
for (const path of [
  '../../src/assets/media/maid-guide-expression-sheet.webp',
  '../../src-tauri/resources/media/maid-guide-expression-sheet.webp',
  '../../src-tauri/gen/android/app/src/main/assets/resources/media/maid-guide-expression-sheet.webp',
]) {
  const url = new URL(path, import.meta.url);
  const stat = fs.statSync(url);
  assert.ok(stat.size > 1_000_000 && stat.size < 3_000_000, `${path} should retain lossless sprite detail`);
  const bytes = fs.readFileSync(url);
  const chunkOffset = bytes.indexOf(Buffer.from('VP8L'));
  assert.ok(chunkOffset > 0, `${path} should contain a lossless VP8L chunk`);
  const frameOffset = chunkOffset + 8;
  assert.equal(bytes[frameOffset], 0x2f, `${path} should contain a valid VP8L signature`);
  const dimensions = bytes.readUInt32LE(frameOffset + 1);
  assert.deepEqual(
    [(dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1],
    [1280, 1280],
    `${path} should use four integer 320px cells`,
  );
  if (canonicalBytes) assert.equal(bytes.equals(canonicalBytes), true, `${path} should match the web asset byte-for-byte`);
  else canonicalBytes = bytes;
}

console.log('ok - maid guide maps 16 focused expressions onto one lossless integer-grid sprite sheet');
