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
      } else if (msg?.type === 'rpc') {
        queueMicrotask(() => {
          sandbox.self.onmessage({ data: { type: 'rpc_result', id: msg.id, result: true } });
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

const flushTimers = () => new Promise(resolve => setTimeout(resolve, 0));

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
    if (node.ownerDocument !== document) throw new Error('missing ownerDocument shim');
    node.setAttribute('data-test-node', '1');
    node.dataset.directValue = 'ok';
    document.body.appendChild(node);
    if (!document.body.contains(node)) throw new Error('missing document tree shim');
    if (document.querySelector('section[data-test-node="1"]') !== node) throw new Error('missing document querySelector shim');
    if (document.querySelector('section[data-direct-value="ok"]') !== node) throw new Error('missing dataset selector shim');
    if (document.querySelector('#missing-node') !== null) throw new Error('querySelector should return null for missing nodes');
    node.innerHTML = '<div class="inner"><span data-role="label">hello</span></div>';
    if (node.querySelector('.inner [data-role="label"]')?.textContent !== 'hello') throw new Error('missing innerHTML parser shim');
    const escapeNode = document.createElement('div');
    escapeNode.textContent = '<safe>';
    if (escapeNode.innerHTML !== '&lt;safe&gt;') throw new Error('missing textContent html escaping shim');
    node.style.left = '12px';
    node.style.setProperty('--orb-menu-max-height', '420px');
    node.style.setProperty('background-color', 'red');
    if (node.style.left !== '12px') throw new Error('missing direct style property shim');
    if (node.style.getPropertyValue('--orb-menu-max-height') !== '420px') throw new Error('missing custom style property shim');
    if (node.style.backgroundColor !== 'red') throw new Error('missing hyphenated style property shim');
    if (!node.style.cssText.includes('--orb-menu-max-height: 420px;')) throw new Error('missing cssText style serialization');
    if (node.style.removeProperty('--orb-menu-max-height') !== '420px') throw new Error('missing style removeProperty shim');
    if (node.style.getPropertyValue('--orb-menu-max-height') !== '') throw new Error('style removeProperty did not clear value');
    node.style.cssText = 'top: 16px; --orb-details-max-height: 240px;';
    if (node.style.top !== '16px') throw new Error('missing cssText parsing for normal property');
    if (node.style.getPropertyValue('--orb-details-max-height') !== '240px') throw new Error('missing cssText parsing for custom property');
    let windowEventSeen = false;
    window.addEventListener('chatapp-test', () => { windowEventSeen = true; });
    window.dispatchEvent(new Event('chatapp-test'));
    if (!windowEventSeen) throw new Error('missing window event target shim');
    const delegateRoot = document.createElement('div');
    const delegateButton = document.createElement('button');
    let delegatedClickSeen = false;
    delegateRoot.appendChild(delegateButton);
    document.body.appendChild(delegateRoot);
    delegateRoot.addEventListener('click', event => {
      if (event.target === delegateButton && event.currentTarget === delegateRoot) delegatedClickSeen = true;
    });
    delegateButton.click();
    if (!delegatedClickSeen) throw new Error('missing DOM event bubbling shim');
    toastr.info('compat toast');
    window.parent.toastr.warning('compat parent toast');
    const missingNode = document.createElement('div');
    missingNode.id = 'missing-node';
    document.body.appendChild(missingNode);
    missingNode.addEventListener('click', () => {});
    missingNode.setAttribute('data-ready', '1');
    missingNode.removeAttribute('data-ready');
    if (missingNode.hasAttribute('data-ready')) throw new Error('missing removeAttribute shim');
    const promptList = document.querySelector('#completion_prompt_manager_list');
    if (!promptList) throw new Error('missing virtual prompt manager');
    const promptRow = promptList.querySelector('li[data-pm-identifier="rule"]');
    if (!promptRow) throw new Error('missing virtual prompt row');
    if (!promptRow.classList.contains('completion_prompt_manager_prompt_disabled')) throw new Error('missing virtual prompt disabled state');
    const promptName = promptRow.querySelector('[data-pm-name]');
    if (promptName?.getAttribute('data-pm-name') !== 'Rule') throw new Error('missing virtual prompt name');
    promptRow.querySelector('.prompt-manager-toggle-action').click();
    if (promptRow.classList.contains('completion_prompt_manager_prompt_disabled')) throw new Error('virtual prompt toggle did not update local state');
    const pwin = window.parent || window;
    pwin.$(document).off('keydown').on('keydown', () => {});
    const settingsRoot = document.createElement('div');
    settingsRoot.id = 'settings-root';
    document.body.appendChild(settingsRoot);
    const $root = $('#settings-root');
    const $created = $('<button class="created-btn">go</button>');
    if ($created.get(0)?.textContent !== 'go') throw new Error('missing jquery html creation shim');
    $root.html('<div>settings</div>').append('<span class="appended">tail</span>').prepend('<b class="prepended">head</b>');
    if ($root.find('.appended').text() !== 'tail') throw new Error('missing jquery append html shim');
    if ($root.find('.prepended').text() !== 'head') throw new Error('missing jquery prepend html shim');
    $root.empty();
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
          prompt_order: [{ character_id: 100001, order: [{ identifier: 'rule', enabled: false }] }],
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
  assert.equal(
    messages.some(msg => msg.type === 'rpc' && msg.method === 'preset.setPromptEnabled' && msg.params?.identifier === 'rule' && msg.params?.enabled === true),
    true,
  );
  console.log('ok - script runtime worker exposes legacy browser and variable globals before script load');
}

{
  const { sandbox, messages } = createWorkerHarness();
  const script = `
    const style = document.createElement('style');
    style.textContent = '.floating-box { position: fixed; right: 12px; bottom: 12px; }';
    document.head.appendChild(style);
    const internal = document.createElement('div');
    internal.setAttribute('data-chatapp-virtual', 'internal-test');
    internal.textContent = 'hidden adapter';
    document.body.appendChild(internal);
    const root = document.createElement('div');
    root.className = 'floating-box';
    root.textContent = 'open';
    root.addEventListener('click', event => {
      const rect = root.getBoundingClientRect();
      root.setAttribute('data-clicked', String(event.clientX));
      root.setAttribute('data-rect', rect.left + ',' + rect.top + ',' + rect.width + ',' + root.offsetHeight);
      root.textContent = 'clicked';
    });
    document.body.appendChild(root);
    const htmlRoot = document.createElement('div');
    htmlRoot.id = 'html-mounted-widget';
    htmlRoot.textContent = 'html mounted';
    document.documentElement.appendChild(htmlRoot);
  `;

  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: false },
      context: { sessionId: 's1' },
      scripts: [{ id: 'ui-compat', name: 'ui compat', enabled: true, content: script }],
    },
  });
  await flushTimers();

  const firstUpdate = messages.filter(msg => msg.type === 'ui_update').at(-1);
  assert.ok(firstUpdate, 'missing worker ui update');
  assert.equal(firstUpdate.payload.styles.some(css => css.includes('.floating-box')), true);
  const initialHtml = firstUpdate.payload.roots.join('');
  assert.match(initialHtml, /data-chatapp-virtual-node-id="/);
  assert.match(initialHtml, /data-chatapp-has-ui-listener="1"/);
  assert.match(initialHtml, /html-mounted-widget/);
  assert.equal(initialHtml.includes('hidden adapter'), false);
  const nodeId = initialHtml.match(/data-chatapp-virtual-node-id="([^"]+)"/)?.[1];
  assert.ok(nodeId, 'missing mirrored node id');

  await sandbox.self.onmessage({
    data: {
      type: 'ui_layout',
      items: [{
        nodeId,
        left: 9,
        top: 10,
        right: 57,
        bottom: 59,
        width: 48,
        height: 49,
        clientWidth: 48,
        clientHeight: 49,
      }],
    },
  });
  await sandbox.self.onmessage({
    data: {
      type: 'ui_event',
      nodeId,
      eventType: 'click',
      event: { clientX: 42, bubbles: true, cancelable: true },
    },
  });
  await flushTimers();

  const clickedUpdate = messages.filter(msg => msg.type === 'ui_update').at(-1);
  const clickedHtml = clickedUpdate.payload.roots.join('');
  assert.match(clickedHtml, /data-clicked="42"/);
  assert.match(clickedHtml, /data-rect="9,10,48,49"/);
  assert.match(clickedHtml, />clicked</);
  console.log('ok - script runtime mirrors virtual DOM UI generically and relays UI events');
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
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'rule', enabled: true }] }],
    } : {}),
    getActiveId: type => (type === 'openai' ? 'preset-openai' : ''),
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
  const presetData = {
    name: 'Preset',
    prompts: [{ identifier: 'rule', name: 'Rule', content: 'content', enabled: true, role: 'system' }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'rule', enabled: true }] }],
  };
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  runtime.context = { sessionId: 's1', openaiPresetId: 'preset-openai' };
  const upserts = [];
  runtime.presets = {
    getResolvedActive: () => ({ presetId: 'preset-openai', preset: structuredClone(presetData) }),
    getActiveId: () => 'preset-openai',
    getActive: () => structuredClone(presetData),
    upsert: async (type, payload) => {
      upserts.push({ type, payload });
      return payload.id;
    },
  };
  const ok = await runtime.processRpc('preset.setPromptEnabled', {
    sessionId: 's1',
    identifier: 'rule',
    enabled: false,
  });

  assert.equal(ok, true);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].type, 'openai');
  assert.equal(upserts[0].payload.id, 'preset-openai');
  assert.equal(upserts[0].payload.makeActive, false);
  assert.equal(upserts[0].payload.data.prompts[0].enabled, false);
  assert.equal(upserts[0].payload.data.prompt_order[0].order[0].enabled, false);
  console.log('ok - script runtime controlled prompt manager RPC updates active openai preset without switching');
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
