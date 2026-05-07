import assert from 'node:assert/strict';

import {
  dispatchAfterReceiveEffects,
  resolveAfterReceiveSkipScripts,
} from '../../src/scripts/ui/chat/after-receive-dispatch-utils.js';
import { buildHookLifecycleTraceEvent } from '../../src/scripts/ui/chat/hook-lifecycle-trace-utils.js';

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
