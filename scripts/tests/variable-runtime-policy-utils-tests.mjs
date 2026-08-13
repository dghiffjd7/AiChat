import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  clearVariableRuntimePendingGreetingInit,
  dispatchVariableRuntimeChangedForSession,
  getVariableRuntimePendingGreetingInit,
  isVariableRuntimeEnabledForSession,
  resumeVariableRuntimeForSession,
  setVariableRuntimePendingGreetingInit,
  setVariableRuntimeEnabledForSession,
} from '../../src/scripts/ui/chat/variable-runtime-policy-utils.js';

globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
};
const { PluginRuntime } = await import('../../src/scripts/plugins/plugin-runtime.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('variable runtime defaults on and is scoped per session', () => {
  const settings = new Map([
    ['enabled', { sharedVariables: true }],
    ['disabled', { variableRuntimeEnabled: false }],
  ]);
  const chatStore = {
    getSessionSettings: sessionId => settings.get(sessionId) || null,
  };

  assert.equal(isVariableRuntimeEnabledForSession(chatStore, 'missing'), true);
  assert.equal(isVariableRuntimeEnabledForSession(chatStore, 'enabled'), true);
  assert.equal(isVariableRuntimeEnabledForSession(chatStore, 'disabled'), false);
});

test('setVariableRuntimeEnabledForSession preserves settings and emits one scoped change', () => {
  const settings = new Map([['s1', { sharedVariables: true, bubbleColor: '#fff' }]]);
  const events = [];
  const chatStore = {
    getSessionSettings: sessionId => settings.get(sessionId) || null,
    setSessionSettings(sessionId, next) {
      settings.set(sessionId, next);
      return true;
    },
  };
  const eventTarget = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };

  const result = setVariableRuntimeEnabledForSession(chatStore, 's1', false, { eventTarget });

  assert.deepEqual(result, { ok: true, sessionId: 's1', enabled: false, changed: true });
  assert.deepEqual(settings.get('s1'), {
    sharedVariables: true,
    bubbleColor: '#fff',
    variableRuntimeEnabled: false,
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail, { sessionId: 's1', enabled: false });
});

test('setVariableRuntimeEnabledForSession is a no-op for the current value or invalid session', () => {
  let writes = 0;
  const chatStore = {
    getSessionSettings: () => ({ variableRuntimeEnabled: false }),
    setSessionSettings: () => {
      writes += 1;
      return true;
    },
  };

  assert.deepEqual(
    setVariableRuntimeEnabledForSession(chatStore, 's1', false),
    { ok: true, sessionId: 's1', enabled: false, changed: false },
  );
  assert.deepEqual(
    setVariableRuntimeEnabledForSession(chatStore, '', true),
    { ok: false, sessionId: '', enabled: true, changed: false },
  );
  assert.equal(writes, 0);
});

test('deferred RP greeting initialization is persisted without replacing other session settings', () => {
  const settings = new Map([['rp:hero', { variableRuntimeEnabled: false, sharedVariables: false }]]);
  const chatStore = {
    getSessionSettings: sessionId => settings.get(sessionId) || null,
    setSessionSettings(sessionId, next) {
      settings.set(sessionId, next);
      return true;
    },
  };

  assert.equal(setVariableRuntimePendingGreetingInit(chatStore, 'rp:hero', { greetingId: 'g2' }), true);
  assert.deepEqual(getVariableRuntimePendingGreetingInit(chatStore, 'rp:hero'), { greetingId: 'g2' });
  assert.deepEqual(settings.get('rp:hero'), {
    variableRuntimeEnabled: false,
    sharedVariables: false,
    variableRuntimePendingGreetingInit: { greetingId: 'g2' },
  });

  assert.equal(clearVariableRuntimePendingGreetingInit(chatStore, 'rp:hero'), true);
  assert.equal(getVariableRuntimePendingGreetingInit(chatStore, 'rp:hero'), null);
  assert.deepEqual(settings.get('rp:hero'), {
    variableRuntimeEnabled: false,
    sharedVariables: false,
  });
});

test('resumeVariableRuntimeForSession restores dependencies before syncing runtime mirrors', async () => {
  const calls = [];
  const result = await resumeVariableRuntimeForSession({
    sessionId: 's1',
    ensureWorlds: async sid => { calls.push(['worlds', sid]); return true; },
    refreshWorldSchemas: async sid => calls.push(['schemas', sid]),
    replayGreetingInit: async sid => { calls.push(['greeting', sid]); return { ok: true }; },
    applySchemaDefaults: sid => calls.push(['defaults', sid]),
    evaluateStage: async sid => calls.push(['stage', sid]),
    syncScriptContext: async sid => calls.push(['script', sid]),
    syncPluginContext: async sid => calls.push(['plugin', sid]),
  });

  assert.deepEqual(result, { ok: true, sessionId: 's1' });
  assert.deepEqual(calls, [
    ['worlds', 's1'],
    ['schemas', 's1'],
    ['greeting', 's1'],
    ['defaults', 's1'],
    ['stage', 's1'],
    ['script', 's1'],
    ['plugin', 's1'],
  ]);
});

test('resumeVariableRuntimeForSession stops before mutation when worlds are unavailable', async () => {
  let calls = 0;
  const result = await resumeVariableRuntimeForSession({
    sessionId: 's1',
    ensureWorlds: async () => false,
    refreshWorldSchemas: () => { calls += 1; },
  });
  assert.deepEqual(result, {
    ok: false,
    sessionId: 's1',
    reason: 'worlds_unavailable',
  });
  assert.equal(calls, 0);
});

test('runtime change dispatch can be delayed until resume reconciliation completes', () => {
  const events = [];
  const eventTarget = { dispatchEvent: event => events.push(event) };
  assert.equal(dispatchVariableRuntimeChangedForSession('s1', true, { eventTarget }), true);
  assert.deepEqual(events[0].detail, { sessionId: 's1', enabled: true });
});

test('plugin runtime resyncs every running variable mirror without firing plugin subscriptions', async () => {
  const runtime = new PluginRuntime(null);
  const calls = [];
  runtime.instances.set('running', {
    status: 'running',
    subscriptions: new Set(['message.after_receive']),
    emit: async (name, payload) => calls.push([name, payload]),
  });
  runtime.instances.set('stopped', {
    status: 'stopped',
    subscriptions: new Set(),
    emit: async () => calls.push(['stopped']),
  });

  assert.equal(await runtime.syncVariableContext('s1'), true);
  assert.deepEqual(calls, [['runtime.variables.resync', { sessionId: 's1' }]]);
  const source = await readFile(
    new URL('../../src/scripts/plugins/plugin-runtime.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /evt === 'runtime\.variables\.resync'[\s\S]*?await refreshLegacySession\(\);[\s\S]*?return data;/,
  );
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

if (failed > 0) process.exit(1);
