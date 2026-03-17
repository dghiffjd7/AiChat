import assert from 'node:assert/strict';
import {
  evaluateBooleanExpression,
  evaluateExpression,
  validateExpressionSyntax,
} from '../../src/scripts/variables/safe-expression-evaluator.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('supports arithmetic, comparison, and parentheses', () => {
  const result = evaluateBooleanExpression('(hp + 3) * 2 >= 30', { hp: 12 });
  assert.equal(result, true);
});

test('supports nested member access and bracket lookups', () => {
  const scope = {
    variables: { hero: { hp: 12 } },
    local_variables: { 'hero.hp': 12 },
    global_variables: { profile: { level: 2 } },
  };
  const result = evaluateBooleanExpression(
    'variables.hero.hp >= 10 && global_variables.profile.level === 2 && local_variables["hero.hp"] === 12',
    scope,
  );
  assert.equal(result, true);
});

test('supports vars alias compatibility', () => {
  const vars = {
    hp: 12,
    variables: { hero: { hp: 12 } },
  };
  const scope = { ...vars, vars };
  const result = evaluateBooleanExpression('vars.hp === 12 && vars.variables.hero.hp === 12', scope);
  assert.equal(result, true);
});

test('logical operators short-circuit safely', () => {
  assert.equal(evaluateExpression('true || missing.deep.value', {}), true);
  assert.equal(evaluateExpression('false && missing.deep.value', {}), false);
});

test('member access only uses own properties', () => {
  const value = evaluateExpression('variables.constructor', {
    variables: { hero: { hp: 1 } },
  });
  assert.equal(value, undefined);
});

test('function-call syntax is rejected', () => {
  assert.throws(() => evaluateExpression('alert(1)', {}), /expected eof|unexpected token/i);
});

test('validateExpressionSyntax reports parser errors without executing', () => {
  assert.deepEqual(validateExpressionSyntax('hp >= 10 && vars.level === 2'), {
    ok: true,
    error: '',
  });
  assert.equal(validateExpressionSyntax('alert(1)').ok, false);
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
