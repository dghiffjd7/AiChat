import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const world = {
  name: 'world-a',
  entries: [{ id: 'entry-a', comment: 'Entry', content: 'content', disable: true, constant: false }],
};
const worldWrites = [];
globalThis.window = {
  appBridge: {
    currentWorldId: 'world-a',
    globalWorldId: '',
    worldStore: {
      load: () => world,
      list: () => ['world-a'],
      save: (...args) => worldWrites.push(args),
    },
  },
};

const { renderTemplateMessages } = await import('../../src/scripts/plugins/template-engine.js');

{
  const variableWrites = [];
  const chatStore = {
    listGlobalVariables: () => ({}),
    listVariables: () => ({}),
    listInitialVariables: () => ({}),
    setVariable: (...args) => variableWrites.push(['local', ...args]),
    setGlobalVariable: (...args) => variableWrites.push(['global', ...args]),
    setInitialVariable: (...args) => variableWrites.push(['initial', ...args]),
  };
  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<% setvar('preview_probe','mutated',{scope:'local'}) %><%= getvar('preview_probe',{scope:'local'}) %>",
  }], {
    stage: 'generate',
    chatStore,
    sessionId: 'preview-session',
    context: {},
    readOnly: true,
  });

  assert.equal(result.messages[0].content, 'mutated', '只读预览内部仍应保留连续写读语义');
  assert.deepEqual(variableWrites, [], '只读 EJS 预览不得写入真实变量');
  console.log('ok - EJS 预览隔离变量副作用且保留求值结果');
}

{
  const variableWrites = [];
  const chatStore = {
    listGlobalVariables: () => ({}),
    listVariables: () => ({}),
    listInitialVariables: () => ({}),
    setVariable: (...args) => variableWrites.push(args),
  };
  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<% setvar('normal_probe','persisted',{scope:'local'}) %>done",
  }], {
    stage: 'generate',
    chatStore,
    sessionId: 'normal-session',
    context: {},
  });

  assert.equal(result.messages[0].content, 'done');
  assert.equal(variableWrites.length, 1, '正式生成仍必须保留既有 EJS 变量写入语义');
  console.log('ok - EJS 正式生成写入行为不受预览隔离影响');
}

{
  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<% activewi('world-a','Entry',true) %>done",
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'preview-session',
    context: {},
    readOnly: true,
  });

  assert.equal(result.messages[0].content, 'done');
  assert.equal(world.entries[0].disable, true, '只读 EJS 预览不得修改内存中的世界书对象');
  assert.equal(world.entries[0].constant, false);
  assert.deepEqual(worldWrites, [], '只读 EJS 预览不得保存世界书');
  console.log('ok - EJS 预览隔离世界书副作用');
}

{
  const context = { character: { name: 'Original' } };
  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<% context.character.name = 'Preview only' %><%= character.name %>",
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'preview-session',
    context,
    readOnly: true,
  });

  assert.equal(result.messages[0].content, 'Preview only');
  assert.equal(context.character.name, 'Original', '只读 EJS 不得经由 context 引用改写真实上下文对象');
  console.log('ok - EJS 预览隔离上下文对象引用');
}

{
  let unhandled = null;
  const onUnhandled = reason => {
    unhandled = reason;
  };
  process.once('unhandledRejection', onUnhandled);
  window.appBridge.worldStore.save = () => Promise.reject(new Error('world store is read-only'));
  world.entries[0].disable = true;
  world.entries[0].constant = false;

  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<% activewi('world-a','Entry',true) %>done",
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'blocked-world-session',
    context: {},
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  process.removeListener('unhandledRejection', onUnhandled);

  assert.equal(result.messages[0].content, 'done');
  assert.equal(unhandled, null, 'blocked worldStore.save must be observed instead of becoming an unhandled rejection');
  console.log('ok - template worldbook activation observes asynchronous persistence rejection');
}
