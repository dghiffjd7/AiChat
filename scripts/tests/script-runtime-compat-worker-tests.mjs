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
  isEsmLikeScriptForTests,
  ScriptRuntime,
} = await import('../../src/scripts/plugins/script-runtime.js');
globalThis.setTimeout = realSetTimeout;

const createWorkerHarness = ({ chatMessages = [], characterRegexes = [], fetchImpl } = {}) => {
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
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    XMLHttpRequest: FakeXhr,
    importScripts: () => {
      throw new Error('blocked in test');
    },
    postMessage: (msg) => {
      messages.push(msg);
      if (msg?.type === 'rpc' && msg.method === 'chat.getMessages') {
        queueMicrotask(() => {
          sandbox.self.onmessage({ data: { type: 'rpc_result', id: msg.id, result: chatMessages } });
        });
      } else if (msg?.type === 'rpc' && msg.method === 'regex.getCharacter') {
        queueMicrotask(() => {
          sandbox.self.onmessage({ data: { type: 'rpc_result', id: msg.id, result: characterRegexes } });
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

assert.equal(isEsmLikeScriptForTests("import 'https://example.com/loader.js'"), true);
assert.equal(isEsmLikeScriptForTests('export const value = 1;'), true);
assert.equal(isEsmLikeScriptForTests('const important = true;'), false);
assert.equal(isEsmLikeScriptForTests("import { ref } from 'vue';"), true);
assert.equal(isEsmLikeScriptForTests(";import{a}from'x';"), true);
assert.equal(isEsmLikeScriptForTests('}\nexport{helper}'), true);
assert.equal(isEsmLikeScriptForTests('export default function() {}'), true);
// 脚本内嵌 HTML/取值字符串不是模块语法（对话渲染系统 v7.1 误路由回归形态）
assert.equal(isEsmLikeScriptForTests('const html = `<button id="bam-btn-import" style="x">导入</button>`;'), false);
assert.equal(isEsmLikeScriptForTests("$('#bam-btn-import').addEventListener('click', () => {});"), false);
assert.equal(isEsmLikeScriptForTests("const exportBtn = doc.getElementById('bam-btn-export');"), false);
assert.equal(isEsmLikeScriptForTests('module.exports = {}; exports.foo = 1;'), false);
assert.equal(isEsmLikeScriptForTests('const data = { import: fn, export: gn };'), false);
console.log('ok - script runtime recognizes actual ESM import and export syntax');

{
  let fetchCalls = 0;
  const { sandbox, messages } = createWorkerHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, text: async () => 'remote script' };
    },
  });
  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: false },
      context: { sessionId: 's1' },
      scripts: [{
        id: 'network-disabled',
        name: 'network disabled',
        enabled: true,
        content: `fetch('https://example.com/remote.js').catch(() => {});`,
      }],
    },
  });
  await flushTimers();
  assert.equal(fetchCalls, 0, 'disabled script network permission must block direct fetch');
  assert.equal(
    messages.some(msg => msg.type === 'rpc' && msg.method === 'log' && /脚本网络已禁用/.test(JSON.stringify(msg.params || {}))),
    true,
    'blocked fetch should emit an explicit script warning',
  );
  const allowed = createWorkerHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, text: async () => 'remote script' };
    },
  });
  await allowed.sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: true },
      context: { sessionId: 's1' },
      scripts: [{
        id: 'network-enabled',
        name: 'network enabled',
        enabled: true,
        content: `fetch('https://example.com/remote.js').catch(() => {});`,
      }],
    },
  });
  await flushTimers();
  assert.equal(fetchCalls, 1, 'enabled script network permission should preserve direct fetch');
  console.log('ok - worker blocks direct fetch when script network permission is disabled');
}

{
  const { sandbox, messages } = createWorkerHarness({
    chatMessages: [
      { id: 'm1', role: 'user', raw: 'hello' },
      { id: 'm2', role: 'assistant', rawOriginal: 'world with update block', rawSource: 'world', raw: 'world' },
    ],
    characterRegexes: [
      { id: 'r1', script_name: 'desktop', enabled: true, __chatappSetId: 'set-1' },
    ],
  });
  const script = `
    if (getLastMessageId() !== 1) throw new Error('missing last message id');
    const messages = getChatMessages(1, { include_swipes: false });
    if (messages[0]?.message !== 'world' || messages[0]?.role !== 'assistant') throw new Error('missing tavern message shape');
    const latestAssistant = getChatMessages(-1, { role: 'assistant' });
    if (latestAssistant.length !== 1 || latestAssistant[0]?.message !== 'world') throw new Error('missing negative latest-message selector');
    const assistantRange = getChatMessages('0-{{lastMessageId}}', { role: 'assistant' });
    if (assistantRange.length !== 1 || assistantRange[0]?.message_id !== 1) throw new Error('missing range macro or role filter');
    if (tavern_events.GENERATION_ENDED !== 'message.after_receive') throw new Error('missing generation event alias');
    if (tavern_events.CHARACTER_MESSAGE_RENDERED !== 'message.after_render') throw new Error('missing render event alias');
    const regexes = getTavernRegexes({ scope: 'character' });
    if (regexes[0]?.script_name !== 'desktop' || regexes[0]?.enabled !== true) throw new Error('missing character regexes');
    regexes[0].enabled = false;
    replaceTavernRegexes(regexes, { scope: 'character' });
    setChatMessages([{ message_id: 1, message: 'world\\nmarker' }], { refresh: 'affected' });
    replaceScriptButtons(getScriptId(), [{ name: 'Switch', visible: true }]);
    eventOnButton('Switch', () => document.getElementById('chatapp-script-buttons-tavern-api')?.setAttribute('data-button-clicked', '1'));
    eventOn(tavern_events.GENERATION_ENDED, () => {});
  `;
  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: false },
      context: { sessionId: 's1' },
      scripts: [{ id: 'tavern-api', name: 'tavern api', enabled: true, content: script }],
    },
  });
  await flushTimers();
  assert.equal(messages.some(msg => msg.type === 'listener_add' && msg.event === 'message.after_receive'), true);
  assert.equal(messages.some(msg => msg.type === 'rpc' && msg.method === 'chat.setMessages'), true);
  assert.equal(messages.some(msg => msg.type === 'rpc' && msg.method === 'regex.replaceCharacter'), true);
  const firstUpdate = messages.filter(msg => msg.type === 'ui_update').at(-1);
  assert.ok(firstUpdate, 'missing script button ui update');
  const html = firstUpdate.payload.roots.join('');
  assert.match(html, />Switch</);
  const nodeId = html.match(/<button[^>]*data-chatapp-virtual-node-id="([^"]+)"/)?.[1];
  assert.ok(nodeId, 'missing script button node id');
  await sandbox.self.onmessage({
    data: { type: 'ui_event', nodeId, eventType: 'click', event: { bubbles: true, cancelable: true } },
  });
  await flushTimers();
  const clicked = messages.filter(msg => msg.type === 'ui_update').at(-1)?.payload?.roots?.join('') || '';
  assert.match(clicked, /data-button-clicked="1"/);
  console.log('ok - script runtime exposes TavernHelper message, regex, event, and script-button contracts');
}

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
    node.style.left = 'NaNpx';
    if (node.style.left === 'NaNpx') throw new Error('style shim should reject invalid NaN lengths');
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
    const presetRegexNames = Array.from(document.querySelectorAll('#saved_preset_scripts .regex_script_name')).map(node => node.textContent);
    if (!presetRegexNames.includes('TG-版本标记 V3.0.5')) throw new Error('missing virtual preset regex rows');
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
        presetRegexes: [
          { id: 'preset-regex-1', script_name: 'TG-版本标记 V3.0.5', enabled: false },
        ],
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
    if (window.innerWidth !== 777 || window.innerHeight !== 555) throw new Error('missing viewport globals');
    if (!window.visualViewport || window.visualViewport.width !== 777) throw new Error('missing visualViewport shim');
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
      root.setAttribute('data-style-read', root.getAttribute('style'));
      root.textContent = 'clicked';
    });
    document.addEventListener('mousemove', event => {
      root.setAttribute('data-doc-move', event.clientX + ',' + window.innerWidth);
    });
    document.addEventListener('mouseup', event => {
      root.setAttribute('data-doc-up', event.clientY + ',' + window.innerHeight);
    });
    window.addEventListener('resize', () => {
      root.setAttribute('data-resize', window.innerWidth + 'x' + window.innerHeight);
    });
    root.style.left = '12px';
    document.body.appendChild(root);
    const details = document.createElement('details');
    details.id = 'native-details';
    details.setAttribute('open', '');
    const summary = document.createElement('summary');
    summary.textContent = 'section';
    details.appendChild(summary);
    document.body.appendChild(details);
    const htmlRoot = document.createElement('div');
    htmlRoot.id = 'html-mounted-widget';
    htmlRoot.textContent = 'html mounted';
    document.documentElement.appendChild(htmlRoot);
  `;

  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: {
        allowNetwork: false,
        viewport: { innerWidth: 777, innerHeight: 555, devicePixelRatio: 2 },
      },
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
  const detailsNodeId = initialHtml.match(/<details[^>]*data-chatapp-virtual-node-id="([^"]+)"/)?.[1];
  assert.ok(detailsNodeId, 'missing mirrored details node id');

  await sandbox.self.onmessage({
    data: {
      type: 'ui_layout',
      viewport: { innerWidth: 900, innerHeight: 600, devicePixelRatio: 1.5 },
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
  await sandbox.self.onmessage({
    data: {
      type: 'ui_event',
      nodeId: detailsNodeId,
      eventType: 'toggle',
      nativeStateRevision: 1,
      event: { open: false, bubbles: false, cancelable: false },
    },
  });
  await sandbox.self.onmessage({
    data: {
      type: 'ui_event',
      targetType: 'document',
      eventType: 'mousemove',
      event: { clientX: 88, clientY: 99, bubbles: true, cancelable: true },
    },
  });
  await sandbox.self.onmessage({
    data: {
      type: 'ui_event',
      targetType: 'document',
      eventType: 'mouseup',
      event: { clientX: 88, clientY: 101, bubbles: true, cancelable: true },
    },
  });
  await sandbox.self.onmessage({
    data: {
      type: 'ui_viewport',
      eventType: 'resize',
      viewport: { innerWidth: 901, innerHeight: 601, devicePixelRatio: 1.5 },
    },
  });
  await flushTimers();

  const clickedUpdate = messages.filter(msg => msg.type === 'ui_update').at(-1);
  const clickedHtml = clickedUpdate.payload.roots.join('');
  assert.match(clickedHtml, /data-clicked="42"/);
  assert.match(clickedHtml, /data-rect="9,10,48,49"/);
  assert.match(clickedHtml, /data-style-read="left: 12px;"/);
  assert.match(clickedHtml, /data-doc-move="88,900"/);
  assert.match(clickedHtml, /data-doc-up="101,600"/);
  assert.match(clickedHtml, /data-resize="901x601"/);
  assert.match(clickedHtml, />clicked</);
  assert.doesNotMatch(clickedHtml, /<details[^>]*\sopen(?:=|\s|>)/, 'native details state should sync back into the worker tree');
  assert.equal(clickedUpdate.nativeStateRevision, 1, 'worker UI updates should acknowledge native state revisions');
  assert.equal(
    messages.some(msg => msg.type === 'ui_layout_interest' && msg.nodeIds?.includes(nodeId)),
    true,
    'getBoundingClientRect should subscribe the queried virtual node to future layout syncs',
  );
  console.log('ok - script runtime mirrors virtual DOM UI generically and relays UI events');
}

{
  const { sandbox, messages } = createWorkerHarness();
  const script = `
    const root = document.createElement('div');
    document.body.appendChild(root);
    for (let index = 0; index < 30; index += 1) {
      root.innerHTML = '<button id="registry-button">pass ' + index + '</button>';
    }
    document.getElementById('registry-button').addEventListener('click', function () {
      document.getElementById('registry-button').textContent = 'clicked';
      document.querySelector('#registry-button');
      document.body.querySelectorAll('button[id="registry-button"]');
    });
  `;
  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      context: { sessionId: 'registry-test' },
      scripts: [{ id: 'registry-test', name: 'registry test', enabled: true, content: script }],
    },
  });
  await flushTimers();
  const update = messages.filter(msg => msg.type === 'ui_update').at(-1);
  const html = update?.payload?.roots?.join('') || '';
  const buttonNodeId = html.match(/<button[^>]*data-chatapp-virtual-node-id="([^"]+)"/)?.[1];
  assert.ok(buttonNodeId, 'missing final registry test button');
  assert.ok(
    Number(update?.perf?.registeredNodeCount || 0) < 25,
    'worker event registry should only retain the current reachable virtual tree',
  );
  await sandbox.self.onmessage({
    data: {
      type: 'ui_event',
      nodeId: buttonNodeId,
      eventType: 'click',
      traceStartedAt: 123,
      event: { bubbles: true, cancelable: true },
    },
  });
  await flushTimers();
  const eventPerf = messages.filter(msg => msg.type === 'ui_event_perf').at(-1);
  assert.equal(eventPerf?.eventType, 'click');
  assert.equal(eventPerf?.traceStartedAt, 123);
  assert.ok(Number(eventPerf?.workerDispatchMs) >= 0);
  assert.ok(Number(eventPerf?.workerTotalMs) >= Number(eventPerf?.workerDispatchMs));
  assert.ok(Number(eventPerf?.selectorIndexHits) >= 3, 'getElementById and exact id/attribute selectors should use the connected-node index');
  console.log('ok - worker prunes detached virtual nodes and reports discrete UI event timing');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const posted = [];
  runtime.worker = { postMessage: message => posted.push(message) };
  runtime.uiRoot = {};
  runtime.uiShadow = {};
  runtime.postWorkerUiLayout = () => {};
  runtime.scheduleWorkerUiLayoutSync = () => {};

  runtime.beginUiPointerSequence({ type: 'pointerdown', clientX: 10, clientY: 10 });
  runtime.beginUiPointerSequence({ type: 'mousedown', clientX: 10, clientY: 10 });
  assert.equal(runtime.uiCaptureActive, true);

  runtime.endUiPointerSequence({ type: 'pointerup' });
  assert.equal(runtime.uiCaptureActive, true, 'pointerup must not end the paired mouse capture before mouseup');

  const move = {
    type: 'mousemove',
    buttons: 1,
    clientX: 20,
    clientY: 20,
    composedPath: () => [],
  };
  runtime.handleGlobalUiEvent(move);
  runtime.handleGlobalUiEvent(move);
  assert.equal(
    posted.filter(message => message.type === 'ui_event' && message.eventType === 'mousemove').length,
    1,
    'the same document/window event must only be relayed once',
  );

  const mouseup = {
    type: 'mouseup',
    buttons: 0,
    clientX: 20,
    clientY: 20,
    composedPath: () => [],
  };
  runtime.handleGlobalUiEvent(mouseup);
  assert.equal(runtime.uiCaptureActive, false);
  assert.equal(
    posted.filter(message => message.type === 'ui_event' && message.eventType === 'mouseup').length,
    1,
    'mouseup outside the shadow UI must still reach the worker after pointerup',
  );

  const css = runtime.getWorkerUiBaseCss();
  assert.match(css, /\.chatapp-script-ui-surface\s*>\s*\[data-chatapp-virtual-node-id\]/);
  assert.doesNotMatch(
    css,
    /\[data-chatapp-has-ui-listener="1"\][^{]*\{\s*pointer-events:\s*auto/,
    'host CSS must not override a script ancestor pointer-events:none contract',
  );
  assert.equal(runtime.collectUiEventPayload({ type: 'toggle' }, { open: false }).open, false);
  console.log('ok - main script UI host preserves mouse terminal events, dedupes globals, and respects hidden ancestors');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const rendered = [];
  runtime.renderWorkerUi = payload => rendered.push(payload);
  runtime.pendingWorkerUiPayload = { roots: ['pending'] };

  runtime.beginUiPointerSequence({ type: 'pointerdown', clientX: 1, clientY: 1 });
  runtime.beginUiPointerSequence({ type: 'mousedown', clientX: 1, clientY: 1 });
  runtime.endUiPointerSequence({ type: 'pointerup' });
  assert.equal(rendered.length, 0, 'pointerup must not rebuild UI before the paired mouseup/click');
  runtime.endUiPointerSequence({ type: 'mouseup' });
  assert.equal(rendered.length, 0, 'mouseup must retain the click guard until click');
  runtime.releaseUiClickGuardForClick();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(rendered.length, 1, 'the newest deferred UI should render once after click');
  console.log('ok - script UI render remains deferred for the full pointer/mouse click sequence');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const rendered = [];
  runtime.renderWorkerUi = (payload, perf) => rendered.push({ payload, perf });
  runtime.handleWorkerMessage({ type: 'ui_update', payload: { roots: ['first'] }, perf: { workerBuildMs: 3 } });
  runtime.handleWorkerMessage({ type: 'ui_update', payload: { roots: ['second'] }, perf: { workerBuildMs: 5 } });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(rendered.length, 1, 'same-frame worker UI updates should render only once');
  assert.deepEqual(rendered[0].payload.roots, ['second']);
  assert.equal(rendered[0].perf.workerBuildMs, 5);

  for (let index = 0; index < 80; index += 1) {
    runtime.recordUiPerformanceSample?.({ type: 'layout', durationMs: index, nodeCount: index + 1 });
  }
  const perf = runtime.getUiPerformanceSnapshot?.();
  assert.ok(perf, 'missing script UI performance snapshot');
  assert.ok(perf.samples.length <= 60, 'performance samples must remain bounded');
  assert.equal(perf.latest.layout.nodeCount, 80);
  console.log('ok - script UI host coalesces render frames and exposes bounded performance metrics');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const posted = [];
  runtime.worker = { postMessage: message => posted.push(message) };
  const traceStartedAt = runtime.getUiPerformanceNow();
  runtime.handleWorkerMessage({
    type: 'ui_event_perf',
    eventType: 'click',
    traceStartedAt,
    workerDispatchMs: 4,
    workerTotalMs: 7,
  });
  assert.equal(runtime.getUiPerformanceSnapshot().latest.event.eventType, 'click');
  assert.equal(runtime.getUiPerformanceSnapshot().latest.event.workerDispatchMs, 4);
  runtime.processRpc = async () => ({ ok: true });
  await runtime.handleRpc({ id: 'rpc-perf', method: 'chat.getMessages', params: {} });
  assert.deepEqual(posted.at(-1), { type: 'rpc_result', id: 'rpc-perf', result: { ok: true } });
  assert.equal(runtime.getUiPerformanceSnapshot().latest.rpc.method, 'chat.getMessages');
  console.log('ok - main script UI diagnostics record event roundtrip and RPC processing timing');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  let removed = false;
  runtime.uiRoot = { remove: () => { removed = true; } };
  runtime.uiShadow = { replaceChildren: () => {} };
  runtime.handleWorkerMessage({ type: 'ui_reset' });
  assert.equal(removed, true, 'worker sync reset must remove the previous script UI surface');
  assert.equal(runtime.uiRoot, null);
  assert.equal(runtime.uiShadow, null);
  console.log('ok - worker UI reset removes stale preset surfaces before the next script set mounts');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const details = { open: true, getAttribute: () => '9' };
  const surface = { querySelectorAll: () => [details] };
  runtime.uiNativeStatePending.set('9', { revision: 2, open: false });
  runtime.applyPendingNativeUiState(surface, 1);
  assert.equal(details.open, false, 'stale worker payload must not overwrite newer native details state');
  assert.equal(runtime.uiNativeStatePending.has('9'), true);
  details.open = false;
  runtime.applyPendingNativeUiState(surface, 2);
  assert.equal(runtime.uiNativeStatePending.has('9'), false, 'acknowledged native state should leave the pending barrier');
  console.log('ok - native details state barrier survives stale full-tree worker renders until acknowledged');
}

{
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  const rectReads = [];
  const makeNode = id => ({
    getAttribute: name => (name === 'data-chatapp-virtual-node-id' ? id : ''),
    getBoundingClientRect: () => {
      rectReads.push(id);
      return { left: Number(id), top: 0, right: Number(id) + 10, bottom: 10, width: 10, height: 10 };
    },
    clientWidth: 10,
    clientHeight: 10,
    scrollWidth: 10,
    scrollHeight: 10,
  });
  const nodes = [makeNode('1'), makeNode('2'), makeNode('3')];
  runtime.uiShadow = { querySelectorAll: () => nodes };
  runtime.handleWorkerMessage({ type: 'ui_layout_interest', nodeIds: ['2'] });
  const incremental = runtime.collectWorkerUiLayout();
  assert.deepEqual(incremental.map(item => item.nodeId), ['2']);
  assert.deepEqual(rectReads, ['2']);
  rectReads.length = 0;
  const full = runtime.collectWorkerUiLayout({ full: true });
  assert.deepEqual(full.map(item => item.nodeId), ['1', '2', '3']);
  assert.deepEqual(rectReads, ['1', '2', '3']);
  console.log('ok - script UI layout sync keeps first full snapshot and filters later snapshots by queried node interest');
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

{
  // 缺陷 #1 修复：worker 端 setExtensionPrompt / injectPrompts 通过 RPC 到达主线程
  const { sandbox, messages } = createWorkerHarness();
  const script = `
    if (typeof SillyTavern.setExtensionPrompt !== 'function') throw new Error('missing SillyTavern.setExtensionPrompt');
    if (typeof SillyTavern.getContext().setExtensionPrompt !== 'function') throw new Error('missing getContext().setExtensionPrompt');
    if (typeof TavernHelper.injectPrompts !== 'function') throw new Error('missing TavernHelper.injectPrompts');
    if (typeof TavernHelper.uninjectPrompts !== 'function') throw new Error('missing TavernHelper.uninjectPrompts');
    SillyTavern.setExtensionPrompt('bubble_rules', '格式规则内容', 1, 2, false, 'system');
    TavernHelper.injectPrompts([{ id: 'fmt-1', content: '注入内容', position: 'in_chat', depth: 3, role: 'user' }]);
    TavernHelper.uninjectPrompts(['fmt-1']);
  `;
  await sandbox.self.onmessage({
    data: {
      type: 'sync',
      settings: { allowNetwork: false },
      context: { sessionId: 's1' },
      scripts: [{ id: 'sc-1', name: 'inject test', enabled: true, authorized: true, content: script }],
    },
  });
  await flushTimers();
  const rpcs = messages.filter(msg => msg.type === 'rpc');
  const setCall = rpcs.find(msg => msg.method === 'prompt.setExtensionPrompt');
  assert.ok(setCall, 'setExtensionPrompt rpc missing');
  assert.equal(setCall.params.key, 'bubble_rules');
  assert.equal(setCall.params.position, 'in_chat');
  assert.equal(setCall.params.depth, 2);
  const injectCall = rpcs.find(msg => msg.method === 'prompt.injectPrompts');
  assert.ok(injectCall, 'injectPrompts rpc missing');
  assert.equal(injectCall.params.injects[0].id, 'fmt-1');
  assert.equal(injectCall.params.injects[0].role, 'user');
  const uninjectCall = rpcs.find(msg => msg.method === 'prompt.uninjectPrompts');
  assert.ok(uninjectCall, 'uninjectPrompts rpc missing');
  const loadErrors = messages.filter(msg => msg.type === 'rpc' && msg.method === 'log' && /脚本加载失败/.test(JSON.stringify(msg.params || {})));
  assert.equal(loadErrors.length, 0, 'script should load without errors');
  console.log('ok - worker exposes setExtensionPrompt/injectPrompts and forwards RPC');
}

{
  // 缺陷 #1 修复：主线程注入表 upsert/删除/查询/sync 清空/isEnabled 门控
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  runtime.isEnabled = () => true;
  runtime.context = { sessionId: 's1' };

  await runtime.processRpc('prompt.setExtensionPrompt', { key: 'k1', value: '规则A', position: 'in_chat', depth: 2, role: 'system' });
  await runtime.processRpc('prompt.injectPrompts', { injects: [{ id: 'i1', content: '注入B', position: 'before_prompt', depth: 0, role: 'user' }] });
  let blocks = runtime.getScriptPromptInjections('s1');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].content, '规则A');
  assert.equal(blocks[0].position, 'in_chat');
  assert.equal(blocks[1].role, 'user');

  // 空 value = 删除；uninject 删除
  await runtime.processRpc('prompt.setExtensionPrompt', { key: 'k1', value: '' });
  await runtime.processRpc('prompt.uninjectPrompts', { ids: ['i1'] });
  assert.equal(runtime.getScriptPromptInjections('s1').length, 0);

  // 重新写入后：脚本禁用时不注入；sync 清空
  await runtime.processRpc('prompt.setExtensionPrompt', { key: 'k2', value: '规则C' });
  runtime.isEnabled = () => false;
  assert.equal(runtime.getScriptPromptInjections('s1').length, 0);
  runtime.isEnabled = () => true;
  assert.equal(runtime.getScriptPromptInjections('s1').length, 1);
  runtime.buildContext = () => ({ sessionId: 's1' });
  runtime.worker = null;
  await runtime.syncScripts();
  assert.equal(runtime.getScriptPromptInjections('s1').length, 0);
  console.log('ok - main thread script prompt injection table upsert/remove/gate/sync-clear');
}

{
  // 缺陷 #2 修复：预热期超时放宽、sync_done 结束预热、dispatch_error 选择性重启
  const runtime = new ScriptRuntime({ ready: Promise.resolve(), getScripts: () => [] });
  await runtime.ready;
  runtime.isEnabled = () => true;
  runtime.context = { sessionId: 's1' };
  // 预热期：timeout 放宽到 >=15000（用 fake worker 观察不触发 3s 超时）
  runtime.workerWarmingUp = true;
  const posted = [];
  runtime.worker = { postMessage: msg => posted.push(msg), terminate: () => {} };
  const slowCall = runtime.callWorker('dispatch', { event: 'test.slow', payload: {} }, 3000);
  let settled = false;
  slowCall.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(r => setTimeout(r, 3200));
  assert.equal(settled, false, 'warmup call should not timeout at 3s');
  // sync_done 结束预热
  runtime.handleWorkerMessage({ type: 'sync_done' });
  assert.equal(runtime.workerWarmingUp, false);
  // 手动 resolve 挂起的调用（模拟 worker 回复）
  runtime.handleWorkerMessage({ type: 'dispatch_result', id: posted[0].id, result: { ok: true } });
  await slowCall;

  // dispatch_error：普通错误不重启（其他 pending 不受殃及）
  let restarts = 0;
  runtime.restartWorker = () => { restarts += 1; };
  const callA = runtime.callWorker('dispatch', { event: 'a', payload: {} }, 3000);
  const callB = runtime.callWorker('dispatch', { event: 'b', payload: {} }, 3000);
  const idA = posted[1].id;
  runtime.handleWorkerMessage({ type: 'dispatch_error', id: idA, error: '某脚本抛出异常' });
  await assert.rejects(callA, /某脚本抛出异常/);
  assert.equal(restarts, 0, 'normal dispatch error must not restart worker');
  // 结果过大才重启
  const idB = posted[2].id;
  runtime.handleWorkerMessage({ type: 'dispatch_error', id: idB, error: '脚本结果过大' });
  await assert.rejects(callB, /脚本结果过大/);
  assert.equal(restarts, 1, 'oversized result should restart worker');
  console.log('ok - warmup grace, sync_done clears warmup, dispatch_error restarts selectively');
}
