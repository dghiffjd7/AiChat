import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAID_GUIDE_EXPRESSIONS,
  MAID_GUIDE_EXPRESSION_BACKGROUND,
  MAID_GUIDE_EXPRESSION_SHEET_COMPACT_SRC,
  MAID_GUIDE_EXPRESSION_SHEET_HDPI_SRC,
  MAID_GUIDE_EXPRESSION_SHEET_SRC,
  MAID_GUIDE_EXPRESSION_ZOOM,
  applyMaidGuideExpression,
  getMaidGuideExpression,
  resolveMaidGuideExpressionSheetSrc,
  resolveMaidGuideExpressionState,
} from '../../src/scripts/ui/maid-guide-expression-utils.js';

// 双端选表：桌面低 DPR 用 1280 大表让浏览器一次缩放；高 DPR 端用预缩+锐化的 216px/格表。
assert.equal(resolveMaidGuideExpressionSheetSrc(1), MAID_GUIDE_EXPRESSION_SHEET_SRC);
assert.equal(resolveMaidGuideExpressionSheetSrc(1.5), MAID_GUIDE_EXPRESSION_SHEET_SRC);
assert.equal(resolveMaidGuideExpressionSheetSrc(2), MAID_GUIDE_EXPRESSION_SHEET_HDPI_SRC);
assert.equal(resolveMaidGuideExpressionSheetSrc(3), MAID_GUIDE_EXPRESSION_SHEET_HDPI_SRC);
assert.equal(resolveMaidGuideExpressionSheetSrc(undefined), MAID_GUIDE_EXPRESSION_SHEET_SRC, 'Node/无 DPR 环境回退桌面表');
assert.equal(resolveMaidGuideExpressionSheetSrc(1, 'compact'), MAID_GUIDE_EXPRESSION_SHEET_COMPACT_SRC);
assert.equal(resolveMaidGuideExpressionSheetSrc(3, 'compact'), MAID_GUIDE_EXPRESSION_SHEET_COMPACT_SRC);

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
assert.equal(element.style.backgroundImage, 'url("./assets/media/maid-guide-expression-sheet-compact.webp")');
assert.equal(classes.has('maid-guide-expression'), true);

const fullElement = { classList: { add() {} }, dataset: {}, style: {} };
applyMaidGuideExpression(fullElement, 'complete', { variant: 'full' });
assert.equal(fullElement.style.backgroundImage, 'url("./assets/media/maid-guide-expression-sheet.webp")');

assert.equal(MAID_GUIDE_EXPRESSION_SHEET_SRC, './assets/media/maid-guide-expression-sheet.webp');
assert.equal(MAID_GUIDE_EXPRESSION_SHEET_HDPI_SRC, './assets/media/maid-guide-expression-sheet-hdpi.webp');
assert.equal(MAID_GUIDE_EXPRESSION_SHEET_COMPACT_SRC, './assets/media/maid-guide-expression-sheet-compact.webp');

const assertLosslessSheet = (basename, expectedEdge, expectedCell, minSize) => {
  let canonicalBytes = null;
  for (const path of [
    `../../src/assets/media/${basename}`,
    `../../src-tauri/resources/media/${basename}`,
    `../../src-tauri/gen/android/app/src/main/assets/resources/media/${basename}`,
  ]) {
    const url = new URL(path, import.meta.url);
    const stat = fs.statSync(url);
    assert.ok(stat.size > minSize && stat.size < 3_000_000, `${path} should retain lossless sprite detail`);
    const bytes = fs.readFileSync(url);
    const chunkOffset = bytes.indexOf(Buffer.from('VP8L'));
    assert.ok(chunkOffset > 0, `${path} should contain a lossless VP8L chunk`);
    const frameOffset = chunkOffset + 8;
    assert.equal(bytes[frameOffset], 0x2f, `${path} should contain a valid VP8L signature`);
    const dimensions = bytes.readUInt32LE(frameOffset + 1);
    assert.deepEqual(
      [(dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1],
      [expectedEdge, expectedEdge],
      `${path} should use four integer ${expectedCell}px cells`,
    );
    if (canonicalBytes) assert.equal(bytes.equals(canonicalBytes), true, `${path} should match the web asset byte-for-byte`);
    else canonicalBytes = bytes;
  }
};

assertLosslessSheet('maid-guide-expression-sheet.webp', 1280, 320, 1_000_000);
// hdpi 表 216px/格 = 完成卡 72px 显示 @DPR3 的精确 3 倍，离线 Lanczos+锐化。
assertLosslessSheet('maid-guide-expression-sheet-hdpi.webp', 864, 216, 500_000);
// compact 表 192px/格覆盖 52px@DPR3，并以头肩构图提升 46–52px 下的可读性。
assertLosslessSheet('maid-guide-expression-sheet-compact.webp', 768, 192, 400_000);

console.log('ok - maid guide maps 16 focused expressions onto per-DPR lossless integer-grid sprite sheets');
