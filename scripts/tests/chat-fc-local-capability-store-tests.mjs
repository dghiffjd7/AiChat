import assert from 'node:assert/strict';
import {
  buildChatFcLocalRuleFromProfile,
  getChatFcLocalCapabilityRules,
  replaceChatFcLocalCapabilityRules,
} from '../../src/scripts/agent/chat-fc-local-capability-rules.js';
import { createChatFcLocalCapabilityStore } from '../../src/scripts/storage/chat-fc-local-capability-store.js';

const profile = {
  id: 'profile-store',
  name: '持久化测试',
  provider: 'custom',
  baseUrl: 'https://store.example.test/v1',
  model: 'store-model',
  apiKey: 'must-not-persist',
};
const built = buildChatFcLocalRuleFromProfile(profile, { enabled: true });
assert.equal(built.ok, true, built.reason);

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
};

{
  replaceChatFcLocalCapabilityRules([]);
  let kv = null;
  const storage = createStorage();
  const store = createChatFcLocalCapabilityStore({
    invoke: async (command, args) => {
      if (command === 'load_kv') return kv;
      if (command === 'save_kv') {
        kv = args.data;
        return true;
      }
      throw new Error(`unexpected command: ${command}`);
    },
    storage,
    now: () => 1786752000000,
  });
  await store.load();
  await store.upsert(built.rule);
  assert.equal(store.list().length, 1);
  assert.equal(getChatFcLocalCapabilityRules().length, 1);
  assert.equal(kv.rules.length, 1);
  const mirror = JSON.stringify(storage.dump());
  assert.equal(mirror.includes('must-not-persist'), false);
  assert.equal(JSON.stringify(kv).includes('must-not-persist'), false);

  const removed = await store.remove(built.rule.ruleId);
  assert.equal(removed, true);
  assert.equal(store.list().length, 0);
  assert.equal(getChatFcLocalCapabilityRules().length, 0);
  console.log('ok - local capability store persists only normalized non-secret rules and updates the runtime registry');
}

{
  replaceChatFcLocalCapabilityRules([]);
  let kv = null;
  const storage = createStorage();
  const store = createChatFcLocalCapabilityStore({
    invoke: async (command, args) => {
      if (command === 'load_kv') return kv;
      if (command === 'save_kv') { kv = args.data; return true; }
      throw new Error(`unexpected command: ${command}`);
    },
    storage,
    now: () => 1786752000000,
  });
  await store.load();
  await store.upsert(built.rule);
  const first = await store.recordAttempt(built.rule.ruleId, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  });
  assert.equal(first.action, 'failure_recorded');
  const second = await store.recordAttempt(built.rule.ruleId, {
    attempted: true,
    ok: false,
    reason: 'invalid_arguments_json',
  });
  assert.equal(second.action, 'circuit_opened');
  assert.equal(store.list()[0].health.circuitOpen, true);
  assert.equal(kv.rules[0].health.circuitOpen, true);
  const reset = await store.resetCircuit(built.rule.ruleId);
  assert.equal(reset, true);
  assert.equal(store.list()[0].enabled, true);
  assert.equal(store.list()[0].health.circuitOpen, false);
  console.log('ok - store persists deterministic failure counts, circuit opening, and explicit reset');
}

{
  replaceChatFcLocalCapabilityRules([built.rule]);
  const stalePayload = {
    schemaVersion: 1,
    savedAt: 100,
    rules: [built.rule],
  };
  let releaseLoad;
  const pendingLoad = new Promise(resolve => {
    releaseLoad = () => resolve(stalePayload);
  });
  const store = createChatFcLocalCapabilityStore({
    invoke: async (command) => {
      if (command === 'load_kv') return pendingLoad;
      if (command === 'save_kv') return true;
      throw new Error(`unexpected command: ${command}`);
    },
    storage: {
      getItem: () => null,
      setItem: () => { throw new Error('mirror unavailable'); },
    },
    now: () => 1786752000000,
  });
  const loading = store.load();
  const recording = store.recordAttempt(built.rule.ruleId, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  });
  await Promise.resolve();
  await Promise.resolve();
  releaseLoad();
  await Promise.all([loading, recording]);
  assert.equal(store.list()[0].health.consecutiveDeterministicFailures, 1);
  console.log('ok - KV hydration is serialized with circuit writes and cannot restore a stale in-memory count');
}

{
  replaceChatFcLocalCapabilityRules([]);
  const store = createChatFcLocalCapabilityStore({
    invoke: async command => command === 'load_kv' ? null : true,
    storage: createStorage(),
    now: () => 1786752000000,
  });
  await store.load();
  await store.upsert(built.rule);
  const duplicate = { ...built.rule, ruleId: 'imported-duplicate', enabled: false };
  const secondRule = buildChatFcLocalRuleFromProfile({
    ...profile,
    id: '',
    baseUrl: 'https://second.example.test/v1',
    model: 'second-model',
  }, { enabled: false }).rule;
  const result = await store.mergeImportedRules([duplicate, secondRule]);
  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(store.list().length, 2);
  assert.equal(store.list().find(item => item.identity.modelId === 'second-model').enabled, false);
  console.log('ok - imported rules merge without overwriting an existing exact identity');
}

{
  const older = {
    schemaVersion: 1,
    savedAt: 100,
    rules: [{ ...built.rule, enabled: false, updatedAt: 100 }],
  };
  const newer = {
    schemaVersion: 1,
    savedAt: 200,
    rules: [{ ...built.rule, enabled: true, updatedAt: 200 }],
  };
  const storage = createStorage({ chat_fc_local_capability_rules_v1: JSON.stringify(newer) });
  const store = createChatFcLocalCapabilityStore({
    invoke: async command => command === 'load_kv' ? older : true,
    storage,
    now: () => 300,
  });
  const loaded = await store.load();
  assert.equal(loaded[0].enabled, true);
  assert.equal(getChatFcLocalCapabilityRules()[0].enabled, true);
  console.log('ok - startup hydration chooses the newest valid KV/local mirror without any network request');
}

{
  replaceChatFcLocalCapabilityRules([]);
  const storage = createStorage();
  const store = createChatFcLocalCapabilityStore({
    invoke: async () => { throw new Error('tauri unavailable'); },
    storage,
    now: () => 400,
  });
  await store.load();
  await store.upsert(built.rule);
  assert.equal(store.list().length, 1);
  assert.ok(storage.getItem('chat_fc_local_capability_rules_v1'));
  console.log('ok - browser/dev fallback remains usable when native KV is unavailable');
}

console.log('chat-fc-local-capability-store-tests passed');
