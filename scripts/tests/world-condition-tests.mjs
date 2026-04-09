import assert from 'node:assert/strict';
import {
  buildNodeGraphFromWhen,
  buildWhenFromNodeGraph,
  createDefaultPromptClause,
  evaluateConditionTree,
  explainConditionTree,
  isTrivialConditionTree,
} from '../../src/scripts/variables/world-condition-core.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('empty-left clause stays pending and never evaluates truthy', () => {
  const clause = { left: '', op: '>', right: 10, rightType: 'number' };
  const runtime = { resolvePathValue: () => undefined };
  assert.equal(evaluateConditionTree(clause, runtime), false);
  const explanation = explainConditionTree(clause, runtime);
  assert.equal(explanation.result, null);
  assert.equal(explanation.runtimeResult, false);
  assert.equal(explanation.pendingReason, 'missing_left');
});

test('incomplete AND node graph compiles to pending clauses', () => {
  const graph = {
    version: 1,
    nodes: [
      { id: 'v1', type: 'variable', x: 0, y: 0, data: { path: 'hp', autoCreate: false, varType: 'number', defaultValue: 0 } },
      { id: 'val1', type: 'value', x: 0, y: 0, data: { rightType: 'number', value: '10' } },
      { id: 'cmp1', type: 'compare', x: 0, y: 0, data: { op: '>', fallbackRightType: 'number', fallbackRight: '10' } },
      { id: 'logic1', type: 'logic', x: 0, y: 0, data: { logic: 'and', inputCount: 2 } },
      { id: 'result1', type: 'result', x: 0, y: 0, data: {} },
    ],
    edges: [
      { id: 'e1', from: 'v1', fromPort: 'out', to: 'cmp1', toPort: 'left' },
      { id: 'e2', from: 'val1', fromPort: 'out', to: 'cmp1', toPort: 'right' },
      { id: 'e3', from: 'cmp1', fromPort: 'out', to: 'logic1', toPort: 'in1' },
      { id: 'e4', from: 'logic1', fromPort: 'out', to: 'result1', toPort: 'in' },
    ],
  };
  const when = buildWhenFromNodeGraph(graph, {});
  assert.equal(when.logic, 'and');
  assert.equal(when.clauses.length, 2);
  assert.equal(when.clauses[1].pendingReason, 'missing_input');
  const runtime = { resolvePathValue: (path) => (path === 'hp' ? 99 : undefined) };
  assert.equal(evaluateConditionTree(when, runtime), false);
  const explanation = explainConditionTree(when, runtime);
  assert.equal(explanation.result, null);
  assert.equal(explanation.runtimeResult, false);
});

test('incomplete OR graph stays pending even when one branch is truthy', () => {
  const graph = {
    version: 1,
    nodes: [
      { id: 'v1', type: 'variable', x: 0, y: 0, data: { path: 'hp', autoCreate: false, varType: 'number', defaultValue: 0 } },
      { id: 'val1', type: 'value', x: 0, y: 0, data: { rightType: 'number', value: '10' } },
      { id: 'cmp1', type: 'compare', x: 0, y: 0, data: { op: '>', fallbackRightType: 'number', fallbackRight: '10' } },
      { id: 'logic1', type: 'logic', x: 0, y: 0, data: { logic: 'or', inputCount: 2 } },
      { id: 'result1', type: 'result', x: 0, y: 0, data: {} },
    ],
    edges: [
      { id: 'e1', from: 'v1', fromPort: 'out', to: 'cmp1', toPort: 'left' },
      { id: 'e2', from: 'val1', fromPort: 'out', to: 'cmp1', toPort: 'right' },
      { id: 'e3', from: 'cmp1', fromPort: 'out', to: 'logic1', toPort: 'in1' },
      { id: 'e4', from: 'logic1', fromPort: 'out', to: 'result1', toPort: 'in' },
    ],
  };
  const when = buildWhenFromNodeGraph(graph, {});
  const runtime = { resolvePathValue: (path) => (path === 'hp' ? 99 : undefined) };
  assert.equal(evaluateConditionTree(when, runtime), false);
  const explanation = explainConditionTree(when, runtime);
  assert.equal(explanation.result, null);
  assert.equal(explanation.runtimeResult, false);
});

test('blank value node is treated as pending instead of coercing to zero', () => {
  const graph = {
    version: 1,
    nodes: [
      { id: 'v1', type: 'variable', x: 0, y: 0, data: { path: 'hp', autoCreate: false, varType: 'number', defaultValue: 0 } },
      { id: 'val1', type: 'value', x: 0, y: 0, data: { rightType: 'number', value: '' } },
      { id: 'cmp1', type: 'compare', x: 0, y: 0, data: { op: '>', fallbackRightType: 'number', fallbackRight: '10' } },
      { id: 'result1', type: 'result', x: 0, y: 0, data: {} },
    ],
    edges: [
      { id: 'e1', from: 'v1', fromPort: 'out', to: 'cmp1', toPort: 'left' },
      { id: 'e2', from: 'val1', fromPort: 'out', to: 'cmp1', toPort: 'right' },
      { id: 'e3', from: 'cmp1', fromPort: 'out', to: 'result1', toPort: 'in' },
    ],
  };
  const when = buildWhenFromNodeGraph(graph, {});
  assert.equal(when.clauses[0].pendingReason, 'missing_right_literal');
  assert.equal(evaluateConditionTree(when, { resolvePathValue: (path) => (path === 'hp' ? 99 : undefined) }), false);
  const explanation = explainConditionTree(when, { resolvePathValue: (path) => (path === 'hp' ? 99 : undefined) });
  assert.equal(explanation.result, null);
  assert.equal(explanation.children[0].pendingReason, 'missing_right_literal');
});

test('variable-to-variable comparisons roundtrip through node graph helpers', () => {
  const when = {
    left: 'hp',
    op: '>=',
    rightType: 'variable',
    right: 'targetHp',
  };
  const graph = buildNodeGraphFromWhen(when, {});
  const rebuilt = buildWhenFromNodeGraph(graph, {});
  assert.equal(rebuilt.clauses[0].rightType, 'variable');
  assert.equal(rebuilt.clauses[0].right, 'targetHp');
  const runtime = {
    resolvePathValue: (path) => ({ hp: 12, targetHp: 10 }[path]),
  };
  assert.equal(evaluateConditionTree(rebuilt, runtime), true);
});

test('default placeholder condition tree is treated as trivial', () => {
  const when = {
    logic: 'and',
    clauses: [createDefaultPromptClause()],
  };
  assert.equal(isTrivialConditionTree(when), true);
  const graph = buildNodeGraphFromWhen(when, createDefaultPromptClause());
  const rebuilt = buildWhenFromNodeGraph(graph, createDefaultPromptClause());
  assert.equal(isTrivialConditionTree(rebuilt), true);
});

test('configured condition tree is not treated as trivial', () => {
  const when = {
    logic: 'and',
    clauses: [{
      left: 'hp',
      op: '>',
      right: 10,
      rightType: 'number',
    }],
  };
  assert.equal(isTrivialConditionTree(when), false);
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
