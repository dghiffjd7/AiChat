import assert from 'node:assert/strict';

import {
  extractUpdateVariableBlocks,
  splitDanglingBlockTail,
  stripUpdateVariableBlocks,
} from '../../src/scripts/ui/chat/update-variable-block-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('stripUpdateVariableBlocks removes balanced update-variable tags and collapses blank lines', () => {
  assert.equal(
    stripUpdateVariableBlocks('alpha\n<UpdateVariable>{"a":1}</UpdateVariable>\n\n\nbeta\n'),
    'alpha\n\nbeta',
  );
});

test('stripUpdateVariableBlocks truncates dangling update-variable blocks', () => {
  assert.equal(
    stripUpdateVariableBlocks('alpha<variableupdate>{"a":1}'),
    'alpha',
  );
});

test('stripUpdateVariableBlocks keeps prose after a mid-text dangling tag', () => {
  // 创意写作语料：thinking 中途出现未闭合块标签，之后的说明与正文必须保留
  const sample = [
    '<thinking>',
    '需要更新变量：',
    '<UpdateVariable>',
    "_.set('主角.位置', '藏经阁');",
    '（模型没有输出闭合标签）',
    '</thinking>',
    '',
    '楚寻踏入藏经阁，檀香扑面而来。',
    '他翻开第一卷《太初真解》，字迹如龙蛇游走。',
  ].join('\n');
  const out = stripUpdateVariableBlocks(sample);
  assert.equal(out.includes('楚寻踏入藏经阁'), true, '正文必须保留');
  assert.equal(out.includes('（模型没有输出闭合标签）'), true, '块后散文必须保留');
  assert.equal(out.includes('</thinking>'), true, 'thinking 闭合标签必须保留');
  assert.equal(out.includes("_.set('主角.位置'"), false, '块语法前缀应被吞掉');
  assert.equal(/<\s*UpdateVariable/i.test(out), false, '悬空开标签应被移除');
});

test('splitDanglingBlockTail separates command prefix from prose', () => {
  assert.deepEqual(splitDanglingBlockTail('{"a":1}'), { block: '{"a":1}', rest: '' });
  assert.deepEqual(splitDanglingBlockTail('这是一段散文。'), { block: '', rest: '这是一段散文。' });
  const mixed = splitDanglingBlockTail('_.set(\'x\', 1);\n\ninsertRow(0, {"0":"v"})\n随后剧情继续推进。');
  assert.equal(mixed.block.includes('insertRow'), true);
  assert.equal(mixed.rest.trim(), '随后剧情继续推进。');
});

test('extractUpdateVariableBlocks collects multiple blocks and keeps outside content', () => {
  assert.deepEqual(
    extractUpdateVariableBlocks('x<UpdateVariable>one</UpdateVariable>y<variableupdate>two</variableupdate>z'),
    {
      blocks: ['one', 'two'],
      cleaned: 'xyz',
    },
  );
});

test('extractUpdateVariableBlocks keeps trailing body for unclosed tag', () => {
  assert.deepEqual(
    extractUpdateVariableBlocks('head<UpdateVariable>{"a":1}'),
    {
      blocks: ['{"a":1}'],
      cleaned: 'head',
    },
  );
});

test('extractUpdateVariableBlocks returns prose after a mid-text dangling tag to cleaned', () => {
  const sample = 'head<UpdateVariable>\n_.set(\'a\', 1);\n随后正文继续。\n<UpdateVariable>{"b":2}</UpdateVariable>尾部';
  const { blocks, cleaned } = extractUpdateVariableBlocks(sample);
  assert.equal(blocks.length, 2, '未闭合块前缀与后续完整块都应提取');
  assert.equal(blocks[0].includes("_.set('a', 1);"), true);
  assert.equal(blocks[1], '{"b":2}');
  assert.equal(cleaned.includes('随后正文继续。'), true, '散文必须回到 cleaned');
  assert.equal(cleaned.includes('尾部'), true);
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
