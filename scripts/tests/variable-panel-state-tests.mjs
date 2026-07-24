import assert from 'node:assert/strict';

import {
  buildVariableListRows,
  buildVariableScopeImpactText,
  buildVariableTree,
  formatVariableScopeLabel,
  getSortedVariableTreeChildren,
  getVariableRenderSlice,
  inferVariableValueType,
  isVariableValueFilled,
  resolveNextEnumValue,
  resolveVariablePanelScope,
  variableTreeNodeMatches,
} from '../../src/scripts/ui/variable-panel-state-utils.js';

{
  assert.deepEqual(
    resolveVariablePanelScope({
      sessionId: ' chat:alice ',
      getVariableScope: sid => (sid === 'chat:alice' ? 'global' : 'session'),
    }),
    { sid: 'chat:alice', scope: 'global' },
  );
  assert.deepEqual(
    resolveVariablePanelScope({ sessionId: '', getVariableScope: () => 'bad' }),
    { sid: '', scope: 'session' },
  );
  assert.equal(formatVariableScopeLabel({ scope: 'global' }), '全局变量（所有会话共享）');
  assert.match(
    buildVariableScopeImpactText({ scope: 'session', sessionId: 's1', action: 'delete' }),
    /删除后相关提示词/,
  );
  assert.match(
    buildVariableScopeImpactText({ scope: 'session', sessionId: 's1', action: 'edit' }),
    /当前值会即时写入/,
  );
  console.log('ok - variable panel state resolves scope and impact text');
}

{
  assert.equal(inferVariableValueType(12), 'number');
  assert.equal(inferVariableValueType(false), 'boolean');
  assert.equal(inferVariableValueType([]), 'array');
  assert.equal(inferVariableValueType({ met: true }), 'object');
  assert.equal(inferVariableValueType(null), 'string');
  assert.equal(isVariableValueFilled(undefined), false);
  assert.equal(isVariableValueFilled(null), false);
  assert.equal(isVariableValueFilled('   '), false);
  assert.equal(isVariableValueFilled(0), true);
  assert.equal(isVariableValueFilled(false), true);
  assert.equal(isVariableValueFilled([]), true);
  assert.equal(isVariableValueFilled({}), true);

  const vars = {
    zeta: '',
    alpha: 0,
    beta: false,
    gamma: 'ready',
  };
  const schemas = {
    alpha: { type: 'number' },
    gamma: { type: 'string' },
  };
  assert.deepEqual(
    buildVariableListRows({ vars, schemas }).map(row => row.key),
    ['alpha', 'beta', 'gamma', 'zeta'],
  );
  assert.deepEqual(
    buildVariableListRows({ vars, schemas, filter: 'filled' }).map(row => row.key),
    ['alpha', 'beta', 'gamma'],
  );
  assert.deepEqual(
    buildVariableListRows({ vars, schemas, filter: 'empty' }).map(row => row.key),
    ['zeta'],
  );
  assert.deepEqual(
    buildVariableListRows({ vars, schemas, term: 'READY' }).map(row => row.key),
    ['gamma'],
  );
  assert.deepEqual(
    buildVariableListRows({
      vars,
      schemas,
      sort: 'updated',
      updatedAtByKey: { alpha: 2, beta: 7, gamma: 4, zeta: 1 },
    }).map(row => row.key),
    ['beta', 'gamma', 'alpha', 'zeta'],
  );
  console.log('ok - variable panel state filters searches and sorts without losing falsey values');
}

{
  const tree = buildVariableTree({
    'player.stats.hp': 12,
    'player.stats.mp': 8,
    inventory: [{ name: '木剑' }],
  });
  const roots = getSortedVariableTreeChildren(tree);
  assert.deepEqual(roots.map(node => node.name), ['inventory', 'player']);
  const player = roots[1];
  assert.equal(variableTreeNodeMatches(player, 'hp'), true);
  assert.equal(variableTreeNodeMatches(player, '木剑'), false);
  const inventory = roots[0];
  assert.equal(variableTreeNodeMatches(inventory, '木剑'), true);
  assert.equal(inventory.children.get('[0]').children.get('name').value, '木剑');
  console.log('ok - variable panel state builds searchable deep trees');
}

{
  const rows = Array.from({ length: 215 }, (_, index) => ({ key: `v${index}` }));
  assert.deepEqual(
    getVariableRenderSlice({ rows, limit: 80, batchSize: 80 }),
    {
      rows: rows.slice(0, 80),
      rendered: 80,
      total: 215,
      hasMore: true,
      nextLimit: 160,
    },
  );
  assert.equal(getVariableRenderSlice({ rows, limit: 240 }).hasMore, false);
  assert.equal(resolveNextEnumValue('熟悉', ['陌生', '熟悉', '朋友']), '朋友');
  assert.equal(resolveNextEnumValue('朋友', ['陌生', '熟悉', '朋友']), '陌生');
  assert.equal(resolveNextEnumValue('', []), '');
  console.log('ok - variable panel state caps large lists and cycles enum values');
}
