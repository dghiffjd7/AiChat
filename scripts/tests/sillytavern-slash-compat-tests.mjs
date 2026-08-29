import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
};

const { createSillyTavernSlashCompat } = await import('../../src/scripts/ui/chat/sillytavern-slash-compat.js');
const { MacroEngine } = await import('../../src/scripts/utils/macro-engine.js');

const createHarness = () => {
  const messages = [];
  const variables = {};
  const globalVariables = {};
  const worlds = {};
  let currentWorld = '';
  const chatStore = {
    getCurrent: () => 's1',
    getMessages: () => messages,
    getVariable: key => variables[key],
    setVariable: (key, value) => {
      variables[key] = value;
      return true;
    },
    deleteVariable: key => {
      delete variables[key];
      return true;
    },
    getGlobalVariable: key => globalVariables[key],
    setGlobalVariable: (key, value) => {
      globalVariables[key] = value;
      return true;
    },
    deleteGlobalVariable: key => {
      delete globalVariables[key];
      return true;
    },
    updateMessage: (id, patch) => {
      const index = messages.findIndex(item => item.id === id);
      if (index < 0) return null;
      messages[index] = { ...messages[index], ...patch };
      return messages[index];
    },
  };
  const inputEl = {
    value: '',
    setSelectionRange() {},
    dispatchEvent() {},
    focus() {},
  };
  const ui = {
    inputEl,
    sendBtn: { click() {} },
    setInputText: next => {
      inputEl.value = next;
    },
  };
  const sent = [];
  const triggered = [];
  const images = [];
  const macroEngine = new MacroEngine(chatStore);
  const appBridge = {
    activeSessionId: 's1',
    getChatStore: () => chatStore,
    getChatUI: () => ui,
    sendMessageFromPlugin: async (content, options = {}) => {
      const message = {
        id: `m${messages.length}`,
        role: options.role || 'user',
        content,
        raw: content,
        name: options.name || '',
        meta: options.meta || {},
      };
      messages.push(message);
      sent.push({ content, options });
      return message;
    },
    triggerAssistantFromSlash: async () => {
      triggered.push(true);
      return true;
    },
    generateImageFromSlash: async prompt => {
      images.push(prompt);
      return true;
    },
    processTextMacros: (text, context = {}) => macroEngine.process(text, context),
    getCurrentWorldId: () => currentWorld,
    setCurrentWorld: id => {
      currentWorld = id;
    },
    waitForWorldStoreReady: async () => true,
    loadStoredWorldInfo: id => worlds[id] || null,
    getWorldInfo: async id => worlds[id] || null,
    saveWorldInfo: async (id, data) => {
      worlds[id] = data;
    },
  };
  const triggerSlash = createSillyTavernSlashCompat({
    appBridge,
    getChatUI: () => ui,
    logger: { debug() {}, info() {}, warn() {} },
    getWindow: () => ({ appBridge, toastr: { info() {} }, prompt: () => '' }),
    getDocument: () => ({ getElementById: () => null }),
    getToastr: () => ({ info() {} }),
  });
  return { triggerSlash, appBridge, chatStore, inputEl, messages, variables, globalVariables, worlds, sent, triggered, images };
};

test('SillyTavern slash compat separates send and trigger', async () => {
  const h = createHarness();
  assert.equal(await h.triggerSlash('/send hello'), true);
  assert.equal(h.sent.length, 1);
  assert.equal(h.triggered.length, 0);
  assert.equal(await h.triggerSlash('/trigger'), true);
  assert.equal(h.triggered.length, 1);
});

test('SillyTavern slash compat supports pipe variables and setinput', async () => {
  const h = createHarness();
  assert.equal(await h.triggerSlash('/setvar key=i 1 | /addvar key=i 2 | /getvar i | /setinput'), true);
  assert.equal(h.variables.i, '3');
  assert.equal(h.inputEl.value, '3');
  assert.equal(await h.triggerSlash('/pass [{{var::i}}] | /setinput'), true);
  assert.equal(h.inputEl.value, '[3]');
});

test('SillyTavern slash compat delegates lastMessageId empty-chat semantics to MacroEngine', async () => {
  const h = createHarness();
  assert.equal(await h.triggerSlash('/pass [{{lastMessageId}}] | /setinput'), true);
  assert.equal(h.inputEl.value, '[]');
});

test('SillyTavern slash compat supports sendas sys comment and images', async () => {
  const h = createHarness();
  await h.triggerSlash('/sendas name=Alice hi');
  await h.triggerSlash('/sys narration');
  await h.triggerSlash('/comment hidden note');
  await h.triggerSlash('/imagine sunset');
  assert.equal(h.messages[0].role, 'assistant');
  assert.equal(h.messages[0].name, 'Alice');
  assert.equal(h.messages[1].role, 'system');
  assert.equal(h.messages[2].meta.hiddenFromRpPrompt, true);
  assert.deepEqual(h.images, ['sunset']);
});

test('SillyTavern slash compat supports basic world info commands', async () => {
  const h = createHarness();
  await h.triggerSlash('/getchatbook | /setvar key=book');
  assert.ok(h.variables.book.startsWith('chatbook_'));
  await h.triggerSlash('/createentry file={{getvar::book}} key=Milla Friend of Lilac | /setvar key=uid');
  assert.equal(h.variables.uid, '1');
  await h.triggerSlash('/getentryfield file={{getvar::book}} field=content {{getvar::uid}} | /setinput');
  assert.equal(h.inputEl.value, 'Friend of Lilac');
});
