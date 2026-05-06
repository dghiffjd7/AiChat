import assert from 'node:assert/strict';

import {
  maybePromptScriptAuthorization,
  maybePromptTemplateEnable,
} from '../../src/scripts/ui/chat/send-prompt-gates.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('maybePromptTemplateEnable prompts when buildMessages preview reveals template syntax', async () => {
  const promptedSessions = new Set();
  const updates = [];
  const prompts = [];

  const prompted = await maybePromptTemplateEnable({
    settingsStore: {
      get() {
        return {
          templateEnabled: false,
          templateDetectDisabled: false,
        };
      },
      update(patch) {
        updates.push(patch);
      },
    },
    promptedSessions,
    sessionId: 'session-a',
    sampleText: 'plain text',
    fallbackText: 'plain text',
    buildMessages(source, context) {
      assert.equal(source, 'plain text');
      assert.deepEqual(context, { source: 'plain text' });
      return [{ content: 'wrapped <% user.name %>' }];
    },
    llmContext(source) {
      return { source };
    },
    promptChoice(config) {
      prompts.push(config);
      return Promise.resolve('enable');
    },
  });

  assert.equal(prompted, true);
  assert.deepEqual(updates, [{ templateEnabled: true }]);
  assert.equal(promptedSessions.has('session-a'), true);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].title, '模板提示');
});

test('maybePromptTemplateEnable can disable future detection when user chooses never', async () => {
  const updates = [];

  await maybePromptTemplateEnable({
    settingsStore: {
      get() {
        return {
          templateEnabled: false,
          templateDetectDisabled: false,
        };
      },
      update(patch) {
        updates.push(patch);
      },
    },
    promptedSessions: new Set(),
    sessionId: 'session-b',
    sampleText: '<% already here %>',
    promptChoice() {
      return Promise.resolve('never');
    },
  });

  assert.deepEqual(updates, [{ templateDetectDisabled: true }]);
});

test('maybePromptScriptAuthorization enables imported character scripts and syncs runtime', async () => {
  const toggles = [];
  const updates = [];
  const synced = [];
  const prompts = [];

  const prompted = await maybePromptScriptAuthorization({
    scriptStore: {
      getScripts(scope, scopeId) {
        assert.equal(scope, 'character');
        assert.equal(scopeId, 'persona-1');
        return [
          { id: 'script-1', authorized: false },
          { id: 'script-2', authorized: true },
          { id: 'script-3' },
        ];
      },
      toggleScript(scope, scopeId, scriptId, enabled) {
        toggles.push({ scope, scopeId, scriptId, enabled });
        return Promise.resolve();
      },
    },
    scriptRuntime: {
      syncScripts(payload) {
        synced.push(payload);
        return Promise.resolve();
      },
    },
    promptedSessions: new Set(),
    sessionId: 'session-c',
    personaId: 'persona-1',
    settingsStore: {
      get() {
        return {
          scriptEnabled: false,
          scriptAllowReadMessages: true,
          scriptAllowModifyVariables: true,
          scriptAllowNetwork: false,
        };
      },
      update(patch) {
        updates.push(patch);
      },
    },
    promptChoice(config) {
      prompts.push(config);
      return Promise.resolve('allow');
    },
  });

  assert.equal(prompted, true);
  assert.deepEqual(updates, [{ scriptEnabled: true }]);
  assert.deepEqual(toggles, [
    { scope: 'character', scopeId: 'persona-1', scriptId: 'script-1', enabled: true },
    { scope: 'character', scopeId: 'persona-1', scriptId: 'script-3', enabled: true },
  ]);
  assert.deepEqual(synced, [{ sessionId: 'session-c' }]);
  assert.equal(prompts[0].title, '脚本授权');
  assert.match(prompts[0].message, /检测到此角色卡包含 2 条脚本。/);
});

test('maybePromptScriptAuthorization supports one-time allow without toggling stored enabled state', async () => {
  const allowOnceCalls = [];
  const updates = [];

  await maybePromptScriptAuthorization({
    scriptStore: {
      getScripts() {
        return [{ id: 'script-1' }];
      },
      toggleScript() {
        throw new Error('toggleScript should not run for once');
      },
    },
    scriptRuntime: {
      allowOnce(sessionId, ids) {
        allowOnceCalls.push({ sessionId, ids });
      },
    },
    promptedSessions: new Set(),
    sessionId: 'session-d',
    personaId: 'persona-2',
    settingsStore: {
      get() {
        return { scriptEnabled: true };
      },
      update(patch) {
        updates.push(patch);
      },
    },
    promptChoice() {
      return Promise.resolve('once');
    },
  });

  assert.deepEqual(allowOnceCalls, [{ sessionId: 'session-d', ids: ['script-1'] }]);
  assert.deepEqual(updates, []);
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
