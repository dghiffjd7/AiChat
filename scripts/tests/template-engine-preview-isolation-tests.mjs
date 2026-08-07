import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const world = {
  name: 'world-a',
  entries: [{ id: 'entry-a', comment: 'Entry', content: 'content', disable: true, constant: false }],
};
const coldWorld = {
  name: 'cold-world',
  entries: [
    { id: 'cold-entry', comment: 'Cold Entry', content: 'cold content' },
    ...Array.from({ length: 1300 }, (_, index) => ({
      id: `cold-decoy-${index}`,
      comment: `Cold Decoy ${index}`,
      content: 'x'.repeat(1000),
    })),
  ],
};
const worldWrites = [];
const worldLoadCalls = [];
const worldCache = new Map([['world-a', world]]);
const indexedWorldIds = ['world-a', 'cold-world', 'unused-1', 'unused-2', 'unused-3', 'unused-4', 'unused-5'];
globalThis.window = {
  appBridge: {
    currentWorldId: 'world-a',
    globalWorldId: '',
    worldStore: {
      load: id => worldCache.get(String(id || '').trim()) || null,
      list: () => indexedWorldIds.slice(),
      ensureLoadedMany: async (ids) => {
        const requested = Array.isArray(ids) ? ids.map(id => String(id || '').trim()).filter(Boolean) : [];
        worldLoadCalls.push(requested);
        if (requested.includes('cold-world')) worldCache.set('cold-world', coldWorld);
        return requested.map(id => worldCache.get(id)).filter(Boolean);
      },
      save: (...args) => worldWrites.push(args),
    },
    saveWorldInfo: (...args) => {
      worldWrites.push(args);
      return Promise.resolve({ ok: true });
    },
  },
};

const { renderTemplateMessages } = await import('../../src/scripts/plugins/template-engine.js');

{
  const result = await renderTemplateMessages([{
    role: 'system',
    content: `  <%_ {
      const projection = { value: 1 };
    _%>
    <%= projection.value %>
    <%_ } _%>  `,
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'trim-delimiter-session',
    context: {},
    readOnly: true,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.messages[0].content, '1');
  console.log('ok - EJS underscore delimiters trim surrounding whitespace without entering JavaScript source');
}

{
  const result = await renderTemplateMessages([{
    role: 'system',
    content: `<%_ {
      const current = getvar('stat_data');
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const business = Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== '$internal' && key !== 'technical'),
        );
        const counters = current.technical?.uid_counters;
        const projection = counters && typeof counters === 'object'
          ? { ...business, technical: { uid_counters: counters } }
          : business;
    _%>
    <status_current_variables>
    <%= JSON.stringify(projection) %>
    </status_current_variables>
    <%_
      }
    } _%>`,
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({
        story: { chapter: 3 },
        technical: { uid_counters: { event: 7 }, hidden: true },
        $internal: { revision: 9 },
      }),
      listVariables: () => ({ localOnly: true }),
      listInitialVariables: () => ({}),
    },
    sessionId: 'shared-variable-session',
    context: { meta: { useGlobalVariables: true } },
    readOnly: true,
  });

  assert.deepEqual(result.errors, []);
  const match = result.messages[0].content.match(/<status_current_variables>\s*([\s\S]*?)\s*<\/status_current_variables>/);
  assert.ok(match, 'stat_data 应解析为当前变量对象并输出状态段');
  assert.deepEqual(JSON.parse(match[1]), {
    story: { chapter: 3 },
    technical: { uid_counters: { event: 7 } },
  });
  console.log('ok - EJS stat_data compatibility alias follows the active shared-variable scope');
}

{
  const result = await renderTemplateMessages([{
    role: 'assistant',
    content: `<%= '<b>safe</b>' %>`,
  }], {
    stage: 'render',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'render-escape-session',
    context: {},
    readOnly: true,
  });

  assert.equal(result.messages[0].content, '&lt;b&gt;safe&lt;/b&gt;');
  console.log('ok - render-stage EJS interpolation keeps HTML escaping');
}

{
  worldCache.delete('cold-world');
  worldLoadCalls.length = 0;
  const result = await renderTemplateMessages([{
    role: 'system',
    content: "<%= getwi('cold-world','Cold Entry') %>",
  }], {
    stage: 'generate',
    chatStore: {
      listGlobalVariables: () => ({}),
      listVariables: () => ({}),
      listInitialVariables: () => ({}),
    },
    sessionId: 'cold-world-session',
    context: {},
    readOnly: true,
  });

  assert.equal(result.messages[0].content, 'cold content');
  assert.deepEqual(worldLoadCalls, [['cold-world']]);
  console.log('ok - explicit getwi loads an unbound cold worldbook before building the worker snapshot');
}

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
  worldWrites.length = 0;
  window.appBridge.saveWorldInfo = (...args) => {
    worldWrites.push(args);
    return Promise.reject(new Error('world store is read-only'));
  };
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
  assert.equal(unhandled, null, 'blocked saveWorldInfo must be observed instead of becoming an unhandled rejection');
  assert.equal(world.entries[0].disable, true, 'template activation must not mutate the live worldStore object before CAS');
  assert.equal(world.entries[0].constant, false);
  assert.equal(worldWrites.length, 1);
  assert.equal(worldWrites[0][1].entries[0].disable, false);
  assert.equal(worldWrites[0][1].entries[0].constant, true);
  console.log('ok - template worldbook activation writes a clone and observes persistence rejection');
}
