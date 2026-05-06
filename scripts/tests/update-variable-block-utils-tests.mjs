import assert from 'node:assert/strict';

import {
  extractUpdateVariableBlocks,
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
