import assert from 'node:assert/strict';
import {
  EXPRESSION_SUPPORT_GUIDANCE,
  buildRuleConditionDiagnostics,
  buildStageConditionDiagnostics,
  formatUnsupportedExpressionMessage,
  getExpressionCompatibilityDiagnostic,
} from '../../src/scripts/variables/expression-compat-diagnostics.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('getExpressionCompatibilityDiagnostic returns null for supported syntax', () => {
  assert.equal(getExpressionCompatibilityDiagnostic('hp >= 10 && vars.level === 2'), null);
});

test('buildRuleConditionDiagnostics only flags unsupported condition rules', () => {
  const diagnostics = buildRuleConditionDiagnostics([
    { id: 'rule_ok', trigger: { type: 'condition', expr: 'hp >= 10' } },
    { id: 'rule_bad', trigger: { type: 'condition', expr: 'alert(1)' } },
    { id: 'rule_keyword', trigger: { type: 'keyword', expr: 'alert(1)' } },
  ]);
  assert.deepEqual(Object.keys(diagnostics), ['rule_bad']);
});

test('buildStageConditionDiagnostics ignores blank conditions and flags unsupported ones', () => {
  const diagnostics = buildStageConditionDiagnostics({
    stages: [
      { id: 'fallback', condition: '' },
      { id: 'winter_ready', condition: 'vars.hp >= 10' },
      { id: 'broken', condition: 'hero?.hp > 1' },
    ],
  });
  assert.deepEqual(Object.keys(diagnostics), ['broken']);
});

test('formatUnsupportedExpressionMessage appends repair guidance', () => {
  assert.equal(
    formatUnsupportedExpressionMessage('expected eof', { prefix: '这条规则的条件需要改写' }),
    `这条规则的条件需要改写：expected eof。${EXPRESSION_SUPPORT_GUIDANCE}`,
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
