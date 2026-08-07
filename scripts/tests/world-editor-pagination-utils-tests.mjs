import assert from 'node:assert/strict';
import {
  getCompactPageItems,
  paginateWorldEntries,
} from '../../src/scripts/ui/world-editor/world-editor-pagination-utils.js';

{
  const entries = Array.from({ length: 2784 }, (_, idx) => ({ entry: { id: `entry-${idx}` }, idx }));
  const page = paginateWorldEntries(entries, 278, 5);
  assert.equal(page.totalPages, 557);
  assert.equal(page.pageIndex, 278);
  assert.equal(page.items.length, 5);
  assert.deepEqual(page.items.map(item => item.idx), [1390, 1391, 1392, 1393, 1394]);
  console.log('ok - world editor pagination returns only the visible page for a 2784-entry world');
}

{
  const items = getCompactPageItems(557, 278);
  const pages = items.filter(item => Number.isInteger(item));
  assert.ok(items.length <= 9);
  assert.equal(pages.includes(0), true);
  assert.equal(pages.includes(278), true);
  assert.equal(pages.includes(556), true);
  assert.equal(items.includes('ellipsis'), true);
  console.log('ok - huge world pagination keeps a bounded pager around the active page');
}

{
  assert.deepEqual(getCompactPageItems(5, 2), [0, 1, 2, 3, 4]);
  const page = paginateWorldEntries([{ idx: 0 }, { idx: 1 }], 99);
  assert.equal(page.pageIndex, 0);
  assert.equal(page.pageSize, 4);
  assert.equal(page.totalPages, 1);
  console.log('ok - compact pagination defaults to four entries and clamps stale page indexes');
}
