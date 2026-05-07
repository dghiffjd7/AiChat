import assert from 'node:assert/strict';

import { applyBeforeSendHooks } from '../../src/scripts/ui/chat/send-before-hook-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('applyBeforeSendHooks applies script then plugin overrides in order', async () => {
  const seen = [];

  const result = await applyBeforeSendHooks({
    text: '原始内容',
    sessionId: 'session-a',
    userName: '我',
    isGroupChat: true,
    hasAttachments: false,
    scriptRuntime: {
      dispatchEvent(event, payload) {
        seen.push({ source: 'script', event, payload });
        return Promise.resolve({ content: `${payload.content}-脚本` });
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        seen.push({ source: 'plugin', event, payload });
        return Promise.resolve({ content: `${payload.content}-插件` });
      },
    },
  });

  assert.equal(result, '原始内容-脚本-插件');
  assert.deepEqual(seen, [
    {
      source: 'script',
      event: 'message.before_send',
      payload: {
        content: '原始内容',
        sessionId: 'session-a',
        userName: '我',
        isGroup: true,
        hasAttachments: false,
      },
    },
    {
      source: 'plugin',
      event: 'message.before_send',
      payload: {
        content: '原始内容-脚本',
        sessionId: 'session-a',
        userName: '我',
        isGroup: true,
        hasAttachments: false,
      },
    },
  ]);
});

test('applyBeforeSendHooks can suppress text overrides while still dispatching hooks', async () => {
  const result = await applyBeforeSendHooks({
    text: '保持原文',
    allowTextOverride: false,
    scriptRuntime: {
      dispatchEvent() {
        return Promise.resolve({ content: '不会生效' });
      },
    },
    pluginRuntime: {
      dispatchEvent() {
        return Promise.resolve({ content: '也不会生效' });
      },
    },
  });

  assert.equal(result, '保持原文');
});

test('applyBeforeSendHooks emits lifecycle traces without exposing message content', async () => {
  const trace = [];
  const result = await applyBeforeSendHooks({
    text: '原文',
    sessionId: 'session-trace',
    userName: '我',
    scriptRuntime: {
      dispatchEvent() {
        return Promise.resolve({ content: '原文' });
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        return Promise.resolve({ content: `${payload.content}-插件` });
      },
    },
    recordTraceEvent: event => trace.push(event),
  });

  assert.equal(result, '原文-插件');
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.details.changed]),
    [
      ['script', 'before_send.start', 'started', undefined],
      ['script', 'before_send.finish', 'success', false],
      ['plugin', 'before_send.start', 'started', undefined],
      ['plugin', 'before_send.finish', 'success', true],
    ],
  );
  assert.equal(trace.some(event => Object.hasOwn(event.details, 'content')), false);
});

test('applyBeforeSendHooks skips script runtime when skipScripts is enabled and logs failures', async () => {
  const warnings = [];
  const pluginPayloads = [];

  const result = await applyBeforeSendHooks({
    text: '消息',
    skipScripts: true,
    scriptRuntime: {
      dispatchEvent() {
        throw new Error('script should be skipped');
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        pluginPayloads.push({ event, payload });
        return Promise.reject(new Error('plugin failed'));
      },
    },
    logger: {
      warn(...args) {
        warnings.push(args);
      },
    },
  });

  assert.equal(result, '消息');
  assert.deepEqual(pluginPayloads, [
    {
      event: 'message.before_send',
      payload: {
        content: '消息',
        sessionId: '',
        userName: '',
        isGroup: false,
        hasAttachments: false,
      },
    },
  ]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'plugin message.before_send failed');
  assert.equal(warnings[0][1]?.message, 'plugin failed');
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
