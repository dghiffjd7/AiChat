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
  x: '2.4194%',
  y: '2.4194%',
});
assert.deepEqual(getMaidGuideExpression('complete'), {
  state: 'complete',
  row: 3,
  column: 3,
  x: '97.5806%',
  y: '97.5806%',
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
assert.equal(MAID_GUIDE_EXPRESSION_ZOOM, 1.18);
assert.equal(MAID_GUIDE_EXPRESSION_BACKGROUND, '#efedf7');
assert.equal(element.style.backgroundSize, '472% 472%');
assert.equal(element.style.backgroundColor, MAID_GUIDE_EXPRESSION_BACKGROUND);
assert.match(element.style.backgroundImage, /maid-guide-expression-sheet\.webp/);
assert.equal(classes.has('maid-guide-expression'), true);

assert.equal(MAID_GUIDE_EXPRESSION_SHEET_SRC, './assets/media/maid-guide-expression-sheet.webp');
for (const path of [
  '../../src/assets/media/maid-guide-expression-sheet.webp',
  '../../src-tauri/resources/media/maid-guide-expression-sheet.webp',
]) {
  const stat = fs.statSync(new URL(path, import.meta.url));
  assert.ok(stat.size > 50_000 && stat.size < 300_000, `${path} should stay compressed for UI use`);
}

console.log('ok - maid guide maps 16 generated expressions onto one compressed sprite sheet');
