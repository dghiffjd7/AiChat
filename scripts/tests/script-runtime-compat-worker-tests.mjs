import assert from 'node:assert/strict';
import vm from 'node:vm';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    const name = String(key || '');
    return this.map.has(name) ? this.map.get(name) : null;
  }

  setItem(key, value) {
    this.map.set(String(key || ''), String(value ?? ''));
  }

  removeItem(key) {
    this.map.delete(String(key || ''));
  }
}

globalThis.localStorage = globalThis.localStorage || new MemoryStorage();
globalThis.window = globalThis.window || {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, delay, ...args) => {
  if (delay === 1000) return 0;
  return realSetTimeout(fn, delay, ...args);
};
const {
  buildScriptRuntimeWorkerSourceForTests,
  ScriptRuntime,
} = await import('../../src/scripts/plugins/script-runtime.js');
globalThis.setTimeout = realSetTimeout;

const createWorkerHarness = () => {
  const messages = [];
  let sandbox = null;
  class FakeXhr {
    open() {
      this.status = 404;
      this.responseText = '';
    }

    send() {
      this.status = 404;
      this.responseText = '';
    }
  }

  sandbox = {
    console,
    structuredClone: globalThis.structuredClone,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Date,
    Math,
    JSON,
    RegExp,
    Error,
    Promise,
    Map,
    WeakMap,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    URL,
    XMLHttpRequest: FakeXhr,
    importScripts: () => {
      throw new Error('blocked in test');
    },
    postMessage: (msg) => {
      messages.push(msg);
      if (msg?.type === 'rpc' && msg.method === 'chat.getMessages') {
        queueMicrotask(() => {
          sandbox.self.onmessage({ data: { type: 'rpc_result', id: msg.id, result: [] } });
        });
      }
    },
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(buildScriptRuntimeWorkerSourceForTests(), sandbox, {
    filename: 'script-runtime-worker.js',
  });
  return { sandbox, messages };
};

{
  const { sandbox, messages } = createWorkerHarness();
  const script = `
    const localVars = getVariables();
    const globalVars = getVariables({ type: 'global' });
    if (localVars.mood !== 'calm') throw new Error('missing local variables');
    if (globalVars.globalMood !== 'shared') throw new Error('missing global variables');
    if (getAllVariables().stat_data.mood !== 'calm') throw new Error('missing variable snapshot');
    localStorage.setItem('compat-key', 'compat-value');
    if (localStorage.getItem('compat-key') !== 'compat-value') throw new Error('missing localStorage shim');
    const node = document.createElement('section');
    document.body.appendChild(node);
    if (document.body.children.length !== 1) throw new Error('missing document shim');
    const missingNode = document.querySelector('#missing-node');
    missingNode.addEventListener('click', () => {});
    missingNode.setAttribute('data-ready', '1');
    missingNode.removeAttribute('data-ready');
    if (missingNode.hasAttribute('data-ready')) throw new Error('missing removeAttribute shim');
    const pwin = window.parent || window;
    pwin.$(document).off('keydown').on('keydown', () => {});
    const $root = $('#settings-root');
    $root.html('<div>settings</div>').append(document.createElement('span')).empty();
    if ($root.html() !== '') throw new Error('missing jquery-like html shim');
    $root[0].scrollHeight = 42;
    if ($root.scrollTop($root[0].scrollHeight).scrollTop() !== 42) throw new Error('missing jquery-like scrollTop shim');
    if ($root.scrollLeft(7).scrollLeft() !== 7) throw new Error('missing jquery-like scrollLeft shim');
    if (errorCatched(() => 7)() !== 7) throw new Error('missing errorCatched shim');
    if (!Context || Context.stat_data.mood !== 'calm') throw new Error('missing Context shim');
    if (!powerUserSettings || typeof powerUserSettings !== 'object') throw new Error('missing powerUserSettings shim');
    if (replaceVariables('m={{mood}} g={{globalMood}}') !== 'm=calm g=shared') throw new Error('missing replaceVariables shim');
    if (TavernHelper.getVariables().mood !== 'calm') throw new Error('missing TavernHelper bridge');
    if (getCurrentCharacterName() !== 'Alice') throw new Error('missing character name shim');
    if (getGlobalWorldbookNames()[0] !== 'World') throw new Error('missing global worldbook names shim');
    const charBooks = getCharWorldbookNames('current');
    if (charBooks.primary !== 'World' || charBooks.additional[0] !== 'Extra') throw new Error('missing character worldbook shim');
    if (getChatWorldbookName('current') !== 'World') throw new Error('missing chat worldbook shim');
    if (getPreset('in_use').prompts[0].name !== 'Rule') throw new Error('missing getPreset shim');
    if (!isPresetPlaceholderPrompt({ placeholder: true })) throw new Error('missing placeholder helper shim');
    if (!isPresetSystemPrompt({ role: 'system' })) throw new Error('missing system prompt helper shim');
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    observer.disconnect();
    if (!Array.isArray(observer.takeRecords())) throw new Error('missing MutationObserver shim');
    const frameId = requestAnimationFrame(() => {});
    cancelAnimationFrame(frameId);
    const stContext = SillyTavern.getContext();
    if (stContext.world_names[0] !== 'World') throw new Error('missing SillyTavern context worldbooks');
    if (typeof stContext.eventSource.on !== 'function') throw new Error('missing SillyTavern event source');
  `;
  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: false },
      context: {
        sessionId: 's1',
        variables: { mood: 'calm' },
        localVariables: { mood: 'calm' },
        globalVariables: { globalMood: 'shared' },
        personaName: 'Alice',
        worldId: 'World',
        worldIds: ['World', 'Extra'],
        worldbookNames: ['World', 'Extra'],
        activePreset: {
          name: 'Preset',
          prompts: [{ id: 'rule', name: 'Rule', content: 'content', enabled: true, role: 'system' }],
          prompts_unused: [],
        },
      },
      scripts: [{ id: 'compat', name: 'compat', enabled: true, content: script }],
    },
  });
  assert.equal(messages.some(msg => msg.type === 'sync_done'), true);
  assert.equal(
    messages.some(msg => msg.type === 'rpc' && msg.method === 'log' && msg.params?.args?.[0] === '脚本加载失败'),
    false,
  );
  console.log('ok - script runtime worker exposes legacy browser and variable globals before script load');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  const calls = [];
  runtime.chatStore = {
    getCurrent: () => 's1',
    listVariables: () => ({ mood: 'calm', nested: { hp: 10 } }),
    listGlobalVariables: () => ({ globalMood: 'shared' }),
    getMessages: () => [{ id: 'm1', role: 'assistant', message: 'hello' }],
    getVariable: key => ({ nested: { hp: 10 } }[key]),
    setVariable: (key, value, sessionId) => {
      calls.push(['set', key, value, sessionId]);
      return true;
    },
    deleteVariable: (key, sessionId) => {
      calls.push(['delete', key, sessionId]);
      return true;
    },
  };
  runtime.bridge = {
    isSharedVariableSession: () => false,
    currentWorldId: 'World',
    currentWorldIds: ['World', 'Extra'],
    worldStore: {
      list: () => ['World', 'Extra'],
      load: id => (id === 'World' ? {
        entries: [{ id: 'entry-1', comment: 'Entry', content: 'world content', disable: false }],
      } : null),
    },
  };
  runtime.presets = {
    getActive: type => (type === 'openai' ? {
      name: 'Preset',
      prompts: [{ id: 'rule', name: 'Rule', content: 'content', enabled: true, role: 'system' }],
    } : {}),
  };
  const context = runtime.buildContext('s1');
  runtime.context = { ...runtime.context, ...context };
  assert.deepEqual(context.variables, { mood: 'calm', nested: { hp: 10 } });
  assert.deepEqual(context.globalVariables, { globalMood: 'shared' });
  assert.deepEqual(context.worldbookNames, ['World', 'Extra']);
  assert.equal(context.activePreset.prompts[0].name, 'Rule');

  const iframeHtml = runtime.iframeRuntime.buildIframeHtml(
    { id: 'esm-compat', name: 'esm compat', content: 'export default function() {}' },
    context,
    { allowNetwork: false },
  );
  assert.match(iframeHtml, /window\.powerUserSettings/);
  assert.match(iframeHtml, /window\.tavern_events/);
  assert.match(iframeHtml, /bridgeCompatGlobalsToHost/);

  const full = await runtime.processRpc('context.getContext', { sessionId: 's1' });
  assert.equal(full.stat_data.mood, 'calm');
  assert.equal(full.global_variables.globalMood, 'shared');
  assert.equal(full.chat.length, 1);
  assert.equal(full.worldbookNames[0], 'World');

  const worldbook = await runtime.processRpc('world.getBook', { world: 'World', sessionId: 's1' });
  assert.equal(worldbook[0].uid, 'entry-1');
  assert.equal(worldbook[0].name, 'Entry');
  assert.equal(worldbook[0].enabled, true);

  const preset = await runtime.processRpc('context.getPreset', { name: 'in_use', sessionId: 's1' });
  assert.equal(preset.prompts[0].name, 'Rule');

  assert.equal(await runtime.processRpc('variables.delete', { key: 'mood', sessionId: 's1' }), true);
  assert.equal(await runtime.processRpc('variables.delete', { key: 'nested.hp', sessionId: 's1' }), true);
  assert.deepEqual(calls, [
    ['delete', 'mood', 's1'],
    ['set', 'nested', {}, 's1'],
  ]);
  console.log('ok - script runtime context and variable RPC include snapshots and delete support');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  runtime.isEnabled = () => true;
  runtime.context = { sessionId: 's1' };
  runtime.worker = {};
  runtime.syncContext = async () => {};
  let calls = 0;
  runtime.callWorker = async (_type, payload) => {
    calls += 1;
    return payload.payload;
  };

  await runtime.dispatchEvent('variable.changed', { sessionId: 's1', name: 'mood' });
  assert.equal(calls, 0);

  runtime.recordListener('variable.changed');
  await runtime.dispatchEvent('variable.changed', { sessionId: 's1', name: 'mood' });
  assert.equal(calls, 1);
  console.log('ok - script runtime skips variable changed dispatch when no script listens');
}
