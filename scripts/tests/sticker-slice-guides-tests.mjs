import assert from 'node:assert/strict';

import {
  buildGuideRects,
  buildGuideStateFromSettings,
  guideStateSignature,
  moveGuideInState,
  normalizeGuideState,
} from '../../src/scripts/utils/sticker-slice-guides.js';

const base = buildGuideStateFromSettings({
  width: 600,
  height: 400,
  rows: 4,
  cols: 6,
  margin: 16,
  gap: 8,
});

assert.equal(base.xGuides.length, 7);
assert.equal(base.yGuides.length, 5);
assert.equal(base.rotation, 0);

const moved = moveGuideInState(base, 'x', 1, 140);
assert.ok(moved.xGuides[1] > moved.xGuides[0]);
assert.ok(moved.xGuides[1] < moved.xGuides[2]);

const normalized = normalizeGuideState({
  width: 600,
  height: 400,
  rotation: 999,
  xGuides: [500, 10, 300, 590],
  yGuides: [390, 5],
});

assert.equal(normalized.rotation, 180);
assert.ok(normalized.xGuides[0] < normalized.xGuides[1]);
assert.ok(normalized.yGuides[0] < normalized.yGuides[1]);

const rects = buildGuideRects(base);
assert.equal(rects.length, 24);
assert.ok(rects.every((rect) => rect.width > 0 && rect.height > 0));

const sigA = guideStateSignature(base);
const sigB = guideStateSignature(moved);
assert.notEqual(sigA, sigB);

console.log('sticker-slice-guides tests passed');
