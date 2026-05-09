import assert from 'node:assert/strict';

import {
  dispatchAfterReceiveEffects,
  resolveAfterReceiveSkipScripts,
} from '../../src/scripts/ui/chat/after-receive-dispatch-utils.js';
import {
  buildAfterReceiveHookFinishTraceEvent,
  buildAfterReceiveHookStartTraceEvent,
  buildAfterSendHookFinishTraceEvent,
  buildAfterSendHookStartTraceEvent,
  buildBeforeSendHookFinishTraceEvent,
  buildBeforeSendHookStartTraceEvent,
  buildHookLifecycleTraceEvent,
  buildRuntimeHookFinishTraceEvent,
  buildRuntimeHookStartTraceEvent,
  dispatchRuntimeHookLifecycleEvent,
  runRuntimeHookLifecycleEvent,
} from '../../src/scripts/ui/chat/hook-lifecycle-trace-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

test('resolveAfterReceiveSkipScripts prefers explicit override', () => {
  assert.equal(resolveAfterReceiveSkipScripts(true, false), true);
  assert.equal(resolveAfterReceiveSkipScripts(false, true), false);
  assert.equal(resolveAfterReceiveSkipScripts(undefined, true), true);
});

test('buildHookLifecycleTraceEvent normalizes hook metadata and drops undefined details', () => {
  const event = buildHookLifecycleTraceEvent({
    phase: ' after_receive.start ',
    hookName: ' message.after_receive ',
    runtimeLabel: ' plugin ',
    sessionId: ' s1 ',
    messageId: ' m1 ',
    status: ' started ',
    summary: ' started ',
    details: { kept: true, dropped: undefined },
  });
  assert.deepEqual(event, {
    category: 'plugin-hooks',
    source: 'hook-lifecycle',
    phase: 'after_receive.start',
    hookName: 'message.after_receive',
    runtimeLabel: 'plugin',
    sessionId: 's1',
    messageId: 'm1',
    status: 'started',
    summary: 'started',
    details: { kept: true },
  });
});

test('hook trace patch builders preserve runtime hook payload contracts', () => {
  assert.deepEqual(buildBeforeSendHookStartTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's1',
    text: 'hello',
    isGroupChat: true,
    hasAttachments: false,
    allowTextOverride: true,
  }), {
    phase: 'before_send.start',
    hookName: 'message.before_send',
    runtimeLabel: 'script',
    sessionId: 's1',
    status: 'started',
    summary: 'message.before_send hook started',
    details: {
      isGroupChat: true,
      hasAttachments: false,
      allowTextOverride: true,
      contentLength: 5,
    },
  });
  assert.deepEqual(buildBeforeSendHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's1',
    text: 'hello',
    nextText: 'hello!',
    changed: true,
  }), {
    phase: 'before_send.finish',
    hookName: 'message.before_send',
    runtimeLabel: 'plugin',
    sessionId: 's1',
    status: 'success',
    summary: 'message.before_send hook changed content',
    details: {
      changed: true,
      originalLength: 5,
      nextLength: 6,
    },
  });
  assert.deepEqual(buildAfterSendHookStartTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's2',
    message: { id: ' m1 ', role: 'user', type: 'text' },
  }), {
    phase: 'after_send.start',
    hookName: 'message.after_send',
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'started',
    summary: 'message.after_send hook started',
    details: { role: 'user', type: 'text' },
  });
  assert.deepEqual(buildAfterSendHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'queued',
  }), {
    phase: 'after_send.finish',
    hookName: 'message.after_send',
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'queued',
    summary: 'message.after_send hook queued',
  });
  assert.deepEqual(buildAfterReceiveHookStartTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's3',
    message: { id: 'm2', role: 'assistant', type: 'text' },
  }), {
    phase: 'after_receive.start',
    hookName: 'message.after_receive',
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'started',
    summary: 'message.after_receive hook started',
    details: { role: 'assistant', type: 'text' },
  });
  assert.deepEqual(buildAfterReceiveHookFinishTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'error',
    errorMessage: 'failed',
  }), {
    phase: 'after_receive.finish',
    hookName: 'message.after_receive',
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'error',
    summary: 'failed',
  });
  assert.deepEqual(buildRuntimeHookStartTraceEvent({
    runtimeLabel: 'plugin',
    hookName: 'variable.changed',
    sessionId: 's4',
    details: { name: 'mood', dropped: undefined },
  }), {
    phase: 'variable.changed.start',
    hookName: 'variable.changed',
    runtimeLabel: 'plugin',
    sessionId: 's4',
    messageId: '',
    status: 'started',
    summary: 'variable.changed hook started',
    details: { name: 'mood' },
  });
  assert.deepEqual(buildRuntimeHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    hookName: 'prompt.before_build',
    sessionId: 's5',
    status: 'success',
    details: { hasInputOverride: true },
  }), {
    phase: 'prompt.before_build.finish',
    hookName: 'prompt.before_build',
    runtimeLabel: 'plugin',
    sessionId: 's5',
    messageId: '',
    status: 'success',
    summary: 'prompt.before_build hook finished',
    details: { hasInputOverride: true },
  });
});

test('dispatchRuntimeHookLifecycleEvent records queued and async error without exposing payload', async () => {
  const calls = [];
  const trace = [];
  const warnings = [];
  const ok = dispatchRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent(event, payload) {
        calls.push([event, payload.secret]);
        return Promise.reject(new Error('async failed'));
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'variable.changed',
    payload: { secret: 'raw-value' },
    sessionId: 's1',
    details: { name: 'mood', scope: 'chat', raw: undefined },
    logger: { warn: (...args) => warnings.push(args) },
    warningMessage: 'plugin variable.changed failed',
    recordTraceEvent: event => trace.push(event),
  });
  await flushMicrotasks();

  assert.equal(ok, true);
  assert.deepEqual(calls, [['variable.changed', 'raw-value']]);
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.summary]),
    [
      ['plugin', 'variable.changed.start', 'started', 'variable.changed hook started'],
      ['plugin', 'variable.changed.finish', 'queued', 'variable.changed hook queued'],
      ['plugin', 'variable.changed.finish', 'error', 'async failed'],
    ],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'plugin variable.changed failed');
  assert.equal(JSON.stringify(trace).includes('raw-value'), false);
});

test('dispatchRuntimeHookLifecycleEvent preserves synchronous dispatch failures', () => {
  const trace = [];
  assert.throws(() => dispatchRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent() {
        throw new Error('sync failed');
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'command.parsed',
    payload: { text: '/secret' },
    sessionId: 's1',
    details: { commandLength: 7 },
    recordTraceEvent: event => trace.push(event),
  }), /sync failed/);
  assert.deepEqual(
    trace.map(event => [event.phase, event.status, event.summary]),
    [
      ['command.parsed.start', 'started', 'command.parsed hook started'],
      ['command.parsed.finish', 'error', 'sync failed'],
    ],
  );
  assert.equal(JSON.stringify(trace).includes('/secret'), false);
});

test('runRuntimeHookLifecycleEvent awaits mutable hooks and records non-sensitive result metadata', async () => {
  const trace = [];
  const warnings = [];
  const success = await runRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent(event, payload) {
        assert.equal(event, 'prompt.before_build');
        assert.equal(payload.input, 'raw prompt');
        return Promise.resolve({ input: 'next prompt', context: payload.context });
      },
    },
    runtimeLabel: 'script',
    hookName: 'prompt.before_build',
    payload: { input: 'raw prompt', context: { session: { id: 's1' } } },
    sessionId: 's1',
    details: { inputLength: 10 },
    finishDetails: result => ({
      hasInputOverride: typeof result?.input === 'string',
      inputLength: String(result?.input || '').length,
    }),
    logger: { warn: (...args) => warnings.push(args) },
    recordTraceEvent: event => trace.push(event),
  });
  const failure = await runRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent() {
        return Promise.reject(new Error('mutate failed'));
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'prompt.after_build',
    payload: { prompt: [{ content: 'secret prompt' }] },
    sessionId: 's1',
    details: { promptCount: 1 },
    logger: { warn: (...args) => warnings.push(args) },
    warningMessage: 'plugin prompt.after_build failed',
    recordTraceEvent: event => trace.push(event),
  });

  assert.equal(success.dispatched, true);
  assert.equal(success.result.input, 'next prompt');
  assert.equal(failure.dispatched, true);
  assert.equal(failure.error?.message, 'mutate failed');
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status]),
    [
      ['script', 'prompt.before_build.start', 'started'],
      ['script', 'prompt.before_build.finish', 'success'],
      ['plugin', 'prompt.after_build.start', 'started'],
      ['plugin', 'prompt.after_build.finish', 'error'],
    ],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'plugin prompt.after_build failed');
  assert.equal(JSON.stringify(trace).includes('raw prompt'), false);
  assert.equal(JSON.stringify(trace).includes('secret prompt'), false);
});

test('dispatchAfterReceiveEffects ignores non-assistant messages', () => {
  const calls = [];
  const handled = dispatchAfterReceiveEffects({
    message: { role: 'user' },
    sessionId: 's1',
    applyUpdateVariable: () => calls.push('update'),
  });
  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});

test('dispatchAfterReceiveEffects dispatches runtimes, update apply, and variable rules', async () => {
  const calls = [];
  const trace = [];
  const handled = dispatchAfterReceiveEffects({
    message: { id: 'm1', role: 'assistant' },
    sessionId: 's2',
    defaultSkipScripts: false,
    scriptRuntime: {
      dispatchEvent(event, payload) {
        calls.push(['script', event, payload.sessionId, payload.message.id]);
        return Promise.resolve();
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        calls.push(['plugin', event, payload.sessionId, payload.message.id]);
        return Promise.resolve();
      },
    },
    applyUpdateVariable(message, sessionId) {
      calls.push(['update', message.id, sessionId]);
    },
    handleVariableRules(payload) {
      calls.push(['rules', payload.message.id, payload.sessionId, payload.useGlobalVariables]);
      return Promise.resolve();
    },
    useGlobalVariables: true,
    recordTraceEvent: event => trace.push(event),
    logger: { warn() {} },
  });
  await flushMicrotasks();
  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ['script', 'message.after_receive', 's2', 'm1'],
    ['plugin', 'message.after_receive', 's2', 'm1'],
    ['update', 'm1', 's2'],
    ['rules', 'm1', 's2', true],
  ]);
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.messageId]),
    [
      ['script', 'after_receive.start', 'started', 'm1'],
      ['script', 'after_receive.finish', 'queued', 'm1'],
      ['plugin', 'after_receive.start', 'started', 'm1'],
      ['plugin', 'after_receive.finish', 'queued', 'm1'],
    ],
  );
});

test('dispatchAfterReceiveEffects respects skipScripts and logs async/sync failures', async () => {
  const warnings = [];
  dispatchAfterReceiveEffects({
    message: { id: 'm2', role: 'assistant' },
    sessionId: 's3',
    skipScripts: true,
    defaultSkipScripts: false,
    scriptRuntime: {
      dispatchEvent() {
        throw new Error('script should be skipped');
      },
    },
    pluginRuntime: {
      dispatchEvent() {
        return Promise.reject(new Error('plugin failed'));
      },
    },
    applyUpdateVariable() {
      throw new Error('update failed');
    },
    handleVariableRules() {
      return Promise.reject(new Error('rules failed'));
    },
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });
  await flushMicrotasks();
  assert.deepEqual(warnings, [
    'UpdateVariable parse failed',
    'plugin message.after_receive failed',
    'variable rules after_receive failed',
  ]);
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
