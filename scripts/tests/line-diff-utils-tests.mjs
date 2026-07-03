import assert from 'node:assert/strict';

import { buildLineDiff } from '../../src/scripts/utils/line-diff-utils.js';

{
  const diff = buildLineDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(diff.changed, false);
  assert.equal(diff.rows.length, 0);
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  console.log('ok - 相同文本无变更');
}

{
  const diff = buildLineDiff('a\nb\nc', 'a\nB\nc', { collapseContext: false });
  assert.deepEqual(diff.rows, [
    { type: 'context', oldLine: 1, newLine: 1, text: 'a' },
    { type: 'del', oldLine: 2, newLine: null, text: 'b' },
    { type: 'add', oldLine: null, newLine: 2, text: 'B' },
    { type: 'context', oldLine: 3, newLine: 3, text: 'c' },
  ]);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  console.log('ok - 单行替换产生一红一绿');
}

{
  const diff = buildLineDiff('a\nc', 'a\nb\nc', { collapseContext: false });
  assert.deepEqual(diff.rows.filter(row => row.type === 'add'), [
    { type: 'add', oldLine: null, newLine: 2, text: 'b' },
  ]);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);

  const deletion = buildLineDiff('a\nb\nc', 'a\nc', { collapseContext: false });
  assert.deepEqual(deletion.rows.filter(row => row.type === 'del'), [
    { type: 'del', oldLine: 2, newLine: null, text: 'b' },
  ]);
  assert.equal(deletion.added, 0);
  assert.equal(deletion.removed, 1);
  console.log('ok - 纯新增与纯删除的行号正确');
}

{
  const diff = buildLineDiff('a\r\nb', 'a\nb');
  assert.equal(diff.changed, false, 'CRLF 应与 LF 视为相同');
  console.log('ok - CRLF 归一化');
}

{
  const oldText = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
  const newText = oldText.replace('line10', 'LINE10');
  const diff = buildLineDiff(oldText, newText, { contextKeep: 3 });
  const skips = diff.rows.filter(row => row.type === 'skip');
  assert.equal(skips.length, 2, '首尾长 context 应各折叠为一个 skip');
  assert.equal(skips[0].count + skips[1].count + diff.rows.filter(r => r.type === 'context').length, 19);
  const delRow = diff.rows.find(row => row.type === 'del');
  assert.equal(delRow.oldLine, 11);
  const addRow = diff.rows.find(row => row.type === 'add');
  assert.equal(addRow.newLine, 11);
  console.log('ok - 长 context 折叠且行号保持全局编号');
}

{
  const oldText = Array.from({ length: 2000 }, (_, i) => `old${i}`).join('\n');
  const newText = Array.from({ length: 2000 }, (_, i) => `new${i}`).join('\n');
  const diff = buildLineDiff(oldText, newText);
  assert.equal(diff.truncated, true, '超大变更应标记 truncated');
  assert.equal(diff.removed, 2000);
  assert.equal(diff.added, 2000);
  console.log('ok - 超大变更退化为整段替换并标记 truncated');
}

{
  const diff = buildLineDiff('', 'hello\nworld', { collapseContext: false });
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 1, '空文本按一个空行处理');
  console.log('ok - 空文本到新内容');
}

console.log('line-diff-utils-tests passed');
