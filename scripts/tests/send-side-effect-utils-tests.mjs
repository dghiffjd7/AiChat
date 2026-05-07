import assert from 'node:assert/strict';

import {
  dispatchAfterSendEvents,
  markMessagesAsSending,
} from '../../src/scripts/ui/chat/send-side-effect-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('markMessagesAsSending updates store and ui, then returns the latest stored messages', () => {
  const storeMessages = new Map([
    ['m1', { id: 'm1', status: 'pending', content: 'before-1' }],
    ['m2', { id: 'm2', status: 'pending', content: 'before-2' }],
  ]);
  const uiUpdates = [];
  const chatStore = {
    updateMessage(id, patch) {
      const current = storeMessages.get(id);
      const next = { ...current, ...patch, content: `${current.content}-updated` };
      storeMessages.set(id, next);
      return next;
    },
    findMessage(id) {
      return storeMessages.get(id);
    },
  };
  const ui = {
    updateMessage(id, message) {
      uiUpdates.push({ id, message });
    },
  };

  const result = markMessagesAsSending({
    messages: [{ id: 'm1', content: 'local-1' }, { id: 'm2', content: 'local-2' }],
    sessionId: 'session-a',
    chatStore,
    ui,
  });

  assert.deepEqual(result, [
    { id: 'm1', status: 'sending', content: 'before-1-updated' },
    { id: 'm2', status: 'sending', content: 'before-2-updated' },
  ]);
  assert.deepEqual(uiUpdates, [
    { id: 'm1', message: { id: 'm1', status: 'sending', content: 'before-1-updated' } },
    { id: 'm2', message: { id: 'm2', status: 'sending', content: 'before-2-updated' } },
  ]);
});

test('markMessagesAsSending falls back safely when store helpers are missing', () => {
  const result = markMessagesAsSending({
    messages: [{ id: 'm1', content: 'hello' }, { content: 'no-id' }],
  });

  assert.deepEqual(result, [
    { id: 'm1', content: 'hello', status: 'sending' },
    { content: 'no-id', status: 'sending' },
  ]);
});

test('dispatchAfterSendEvents respects skipScripts and still dispatches plugin events', async () => {
  const scriptCalls = [];
  const pluginCalls = [];
  const trace = [];

  dispatchAfterSendEvents({
    messages: [{ id: 'm1' }, { id: 'm2' }],
    sessionId: 'session-a',
    scriptRuntime: {
      dispatchEvent(event, payload) {
        scriptCalls.push({ event, payload });
        return Promise.resolve();
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        pluginCalls.push({ event, payload });
        return Promise.resolve();
      },
    },
    skipScripts: true,
    recordTraceEvent: event => trace.push(event),
  });

  await Promise.resolve();

  assert.deepEqual(scriptCalls, []);
  assert.deepEqual(pluginCalls, [
    { event: 'message.after_send', payload: { message: { id: 'm1' }, sessionId: 'session-a' } },
    { event: 'message.after_send', payload: { message: { id: 'm2' }, sessionId: 'session-a' } },
  ]);
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.messageId]),
    [
      ['plugin', 'after_send.start', 'started', 'm1'],
      ['plugin', 'after_send.finish', 'queued', 'm1'],
      ['plugin', 'after_send.start', 'started', 'm2'],
      ['plugin', 'after_send.finish', 'queued', 'm2'],
    ],
  );
});

test('dispatchAfterSendEvents logs rejected runtime dispatches without aborting sibling events', async () => {
  const warnings = [];
  const pluginCalls = [];

  dispatchAfterSendEvents({
    messages: [{ id: 'm1' }],
    sessionId: 'session-b',
    scriptRuntime: {
      dispatchEvent() {
        return Promise.reject(new Error('script failed'));
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        pluginCalls.push({ event, payload });
        return Promise.resolve();
      },
    },
    logger: {
      warn(...args) {
        warnings.push(args);
      },
    },
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'script message.after_send failed');
  assert.equal(warnings[0][1]?.message, 'script failed');
  assert.deepEqual(pluginCalls, [
    { event: 'message.after_send', payload: { message: { id: 'm1' }, sessionId: 'session-b' } },
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

if (failed > 0) {
  process.exit(1);
}
