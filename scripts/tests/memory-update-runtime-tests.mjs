import assert from 'node:assert/strict';

import { createMemoryUpdateRuntime } from '../../src/scripts/ui/chat/memory-update-runtime.js';

const createDeps = (overrides = {}) => {
  const calls = {
    configGets: 0,
    configLoads: 0,
    clients: [],
    edits: [],
    messages: null,
    plans: [],
    syncs: [],
    traces: [],
    warnings: [],
  };
  const runtime = createMemoryUpdateRuntime({
    appBridge: {
      config: {
        load: async () => { calls.configLoads += 1; },
        get: () => {
          calls.configGets += 1;
          return { apiKey: 'k' };
        },
      },
    },
    appSettings: {
      get: () => ({
        memoryFillEveryN: 1,
        memoryUpdateApiMode: 'chat',
      }),
    },
    buildMemoryUpdateHistoryText: () => 'user: hi',
    buildMemoryUpdatePlan: async (...args) => {
      calls.plans.push(args);
      return { enabled: true, promptText: 'system prompt' };
    },
    canInitClient: config => Boolean(config?.apiKey),
    createClient: (config) => {
      calls.clients.push(config);
      return {
        chat: async (messages) => {
          calls.messages = messages;
          return '<tableEdit>ok</tableEdit>';
        },
      };
    },
    handleMemoryEditsFromRaw: async (raw, options) => {
      calls.edits.push({ raw, options });
    },
    isMemoryAutoExtractSeparate: () => true,
    isOnline: () => true,
    logger: {
      info: () => {},
      warn: (...args) => calls.warnings.push(args),
    },
    memoryUpdateConfigManager: {
      load: async () => {},
      getActiveProfileId: () => '',
      getRuntimeConfigByProfileId: async () => null,
    },
    recordTraceEvent: event => calls.traces.push(event),
    syncTurnCheckpointForMessage: async (...args) => {
      calls.syncs.push(args);
    },
    ...overrides,
  });
  return { calls, runtime };
};

{
  const { calls, runtime } = createDeps({
    appSettings: {
      get: () => ({
        memoryFillEveryN: 2,
        memoryUpdateApiMode: 'chat',
      }),
    },
  });
  const first = await runtime.runMemoryUpdateAfterChat('s1', false, { meta: { foo: true } }, { checkpointMessageId: 'm1' });
  assert.equal(first, undefined);
  assert.equal(calls.plans.length, 0);
  await runtime.runMemoryUpdateAfterChat('s1', false, { meta: { foo: true } }, { checkpointMessageId: 'm2' });
  assert.equal(calls.plans.length, 1);
  assert.deepEqual(calls.plans[0], ['s1', false, { meta: { foo: true } }]);
  assert.equal(calls.configLoads, 1);
  assert.deepEqual(calls.messages, [
    { role: 'system', content: 'system prompt' },
    {
      role: 'user',
      content: '请根据以下聊天记录更新记忆表格。\n只输出 <tableEdit>...</tableEdit>，不要输出任何解释。\n\n<chat_history>\nuser: hi\n</chat_history>',
    },
  ]);
  assert.equal(calls.edits.length, 1);
  assert.equal(calls.edits[0].raw, '<tableEdit>ok</tableEdit>');
  assert.equal(calls.edits[0].options.sessionId, 's1');
  assert.equal(calls.edits[0].options.force, true);
  assert.match(calls.edits[0].options.requestPrompt, /^system:\nsystem prompt\n\nuser:\n/);
  assert.deepEqual(calls.syncs, [['s1', 'm2', { captureCurrentActiveState: true }]]);
  assert.deepEqual(calls.traces.map(event => [event.phase, event.status, event.details]), [
    ['update.skip', 'skipped', { reason: 'cadence', nextCounter: 1, everyN: 2 }],
    ['update.start', 'started', { isGroup: false, checkpointMessageId: 'm2' }],
    ['update.finish', 'success', { checkpointMessageId: 'm2' }],
  ]);
  console.log('ok - createMemoryUpdateRuntime enforces cadence and runs queued memory update tasks');
}

{
  let loadCount = 0;
  let runtimeConfigId = '';
  const { calls, runtime } = createDeps({
    appBridge: {
      config: {
        load: async () => { throw new Error('chat config path should not run'); },
        get: () => ({ apiKey: 'bad' }),
      },
    },
    appSettings: {
      get: () => ({
        memoryFillEveryN: 1,
        memoryUpdateApiMode: 'profile',
        memoryUpdateProfileId: 'p1',
      }),
    },
    memoryUpdateConfigManager: {
      load: async () => { loadCount += 1; },
      getActiveProfileId: () => '',
      getRuntimeConfigByProfileId: async (profileId) => {
        runtimeConfigId = profileId;
        return { apiKey: 'profile-key' };
      },
    },
  });
  await runtime.runMemoryUpdateAfterChat('s2', true, {}, {});
  assert.equal(loadCount, 1);
  assert.equal(runtimeConfigId, 'p1');
  assert.deepEqual(calls.clients, [{ apiKey: 'profile-key' }]);
  console.log('ok - createMemoryUpdateRuntime resolves profile-scoped config when configured');
}
