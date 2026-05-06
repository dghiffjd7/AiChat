import assert from 'node:assert/strict';

import {
  containsTemplateSyntax,
  hasTemplateInMessages,
} from '../../src/scripts/ui/chat/template-detection-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('containsTemplateSyntax detects direct template strings', () => {
  assert.equal(containsTemplateSyntax('hello <% user.name %>'), true);
  assert.equal(containsTemplateSyntax('plain text'), false);
});

test('containsTemplateSyntax walks arrays and message-like objects', () => {
  assert.equal(
    containsTemplateSyntax([
      { content: 'plain' },
      { text: 'nested <% value %>' },
    ]),
    true,
  );
  assert.equal(
    containsTemplateSyntax({
      content: 'plain',
      text: 'still plain',
    }),
    false,
  );
});

test('hasTemplateInMessages checks message content or raw string entries', () => {
  assert.equal(
    hasTemplateInMessages([
      { content: '普通文本' },
      { content: '包含 <% template %>' },
    ]),
    true,
  );
  assert.equal(
    hasTemplateInMessages([
      '普通文本',
      '也没有模板',
    ]),
    false,
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
