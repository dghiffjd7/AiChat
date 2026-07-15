import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const { MacroEngine } = await import('../../src/scripts/utils/macro-engine.js');

const makeStore = () => {
  const local = new Map([['seed', '4']]);
  const global = new Map([['seed', '8']]);
  const writes = [];
  return {
    local,
    global,
    writes,
    getVariable: key => local.get(key),
    setVariable: (key, value) => { writes.push(['local', key, value]); local.set(key, value); },
    getGlobalVariable: key => global.get(key),
    setGlobalVariable: (key, value) => { writes.push(['global', key, value]); global.set(key, value); },
  };
};

{
  const store = makeStore();
  const engine = new MacroEngine(store);
  const macroVariableState = new Map();
  const output = engine.process(
    '{{setvar：：preview：：2}}{{addvar::preview::3}}{{getvar::preview}}',
    { sessionId: 's1', macroVariableState },
  );
  assert.equal(output, '5', '预览内连续写读应在模拟状态中保持语义');
  assert.deepEqual(store.writes, [], '预览宏不得写入真实变量存储');
  assert.equal(store.local.has('preview'), false);
  console.log('ok - 本地变量宏预览隔离且保留连续求值语义');
}

{
  const store = makeStore();
  const engine = new MacroEngine(store);
  const output = engine.process('{{incvar::seed}}{{getvar::seed}}', {
    sessionId: 'rp:s1',
    uiMode: 'rp',
    macroVariableState: new Map(),
  });
  assert.equal(output, '99');
  assert.deepEqual(store.writes, [], '创意模式预览不得写入全局变量');
  assert.equal(store.global.get('seed'), '8');
  console.log('ok - 全局变量宏预览隔离');
}

{
  const store = makeStore();
  store.local.set('nested', '{{setvar::escaped_write::bad}}');
  const engine = new MacroEngine(store);
  const output = engine.process('{{getvar::nested}}', {
    sessionId: 's1',
    macroVariableState: new Map(),
  });
  assert.equal(output, '');
  assert.deepEqual(store.writes, [], '递归展开出的写宏也不得触及真实存储');
  assert.equal(store.local.has('escaped_write'), false);
  console.log('ok - 递归宏展开仍保持变量写入隔离');
}

{
  const store = makeStore();
  const engine = new MacroEngine(store);
  engine.process('{{setvar::real::ok}}', { sessionId: 's1' });
  assert.deepEqual(store.writes, [['local', 'real', 'ok']], '非预览宏仍应维持原有写入行为');
  console.log('ok - 非预览宏行为不变');
}
