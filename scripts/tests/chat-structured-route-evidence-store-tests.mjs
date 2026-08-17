import assert from 'node:assert/strict';
import {
  CHAT_STRUCTURED_CONTRACT_REVISION,
  CHAT_STRUCTURED_ROUTE_MODES,
} from '../../src/scripts/agent/chat-structured-route-evidence.js';
import {
  CHAT_STRUCTURED_EVIDENCE_STORE_KEY,
  createChatStructuredRouteEvidenceStore,
} from '../../src/scripts/storage/chat-structured-route-evidence-store.js';

const identity = {
  provider: 'opencode',
  endpoint: 'official_opencode_go_chat_completions',
  adapter: 'openai_chat_completions',
  model: 'candidate-model',
  route: 'go',
  schemaProfile: 'phone.reply.ir.v1',
  surface: 'private_chat',
  capabilitySet: ['basic_chat'],
  contractRevision: CHAT_STRUCTURED_CONTRACT_REVISION,
};
const strictSuccess = {
  attempted: true,
  ok: true,
  committed: true,
  fallbackUsed: false,
  argumentRepairApplied: false,
  canonicalRoundTrip: true,
  frozenTargetMatched: true,
  domainValidated: true,
  responseIdentityStable: true,
};

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    dump: () => Object.fromEntries(values),
  };
};

{
  let kv = null;
  const storage = createStorage();
  const store = createChatStructuredRouteEvidenceStore({
    invoke: async (command, args) => {
      if (command === 'load_kv') return kv;
      if (command === 'save_kv') { kv = args.data; return true; }
      throw new Error(`unexpected ${command}`);
    },
    storage,
    now: () => 1000,
  });
  await store.load();
  const transition = await store.record(
    identity,
    CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    strictSuccess,
  );
  assert.equal(transition.action, 'strict_success_recorded');
  assert.equal(store.list().length, 1);
  assert.equal(kv.schemaVersion, 2);
  assert.equal(JSON.stringify(kv).includes('API_KEY'), false);
  assert.ok(storage.getItem(CHAT_STRUCTURED_EVIDENCE_STORE_KEY));
  console.log('ok - v2 evidence store persists sanitized exact cells to KV and mirror');
}

{
  const oldV1 = {
    schemaVersion: 1,
    savedAt: 9999,
    rules: [{ identity, health: { successCount: 999 } }],
  };
  const storage = createStorage({
    chat_fc_local_capability_rules_v1: JSON.stringify(oldV1),
    [CHAT_STRUCTURED_EVIDENCE_STORE_KEY]: JSON.stringify(oldV1),
  });
  const store = createChatStructuredRouteEvidenceStore({
    invoke: async command => command === 'load_kv' ? oldV1 : true,
    storage,
    now: () => 2000,
  });
  await store.load();
  assert.equal(store.list().length, 0);
  assert.equal(store.get(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc), null);
  console.log('ok - local rule v1 is never converted into fabricated observed success');
}

{
  let releaseLoad;
  const pending = new Promise(resolve => { releaseLoad = resolve; });
  let saved = null;
  const store = createChatStructuredRouteEvidenceStore({
    invoke: async (command, args) => {
      if (command === 'load_kv') return pending;
      if (command === 'save_kv') { saved = args.data; return true; }
      throw new Error(`unexpected ${command}`);
    },
    storage: createStorage(),
    now: () => 3000,
  });
  const loading = store.load();
  const recording = store.record(identity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal, strictSuccess);
  releaseLoad(null);
  await Promise.all([loading, recording]);
  assert.equal(store.list().length, 1);
  assert.equal(saved.cells.length, 1);
  console.log('ok - hydration and attempt writes are serialized');
}

{
  const store = createChatStructuredRouteEvidenceStore({
    invoke: async command => command === 'load_kv' ? null : true,
    storage: createStorage(),
    now: () => 4000,
  });
  await store.load();
  await store.record(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  });
  await store.record(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  });
  assert.equal(store.get(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc).health.circuitOpen, true);
  assert.equal(await store.reset(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc), true);
  const reset = store.get(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc);
  assert.equal(reset.health.circuitOpen, false);
  assert.equal(reset.health.strictSuccessCount, 0);
  console.log('ok - a single evidence cell can be explicitly cleared without touching other modes');
}

{
  let clock = 5000;
  const store = createChatStructuredRouteEvidenceStore({
    invoke: async command => command === 'load_kv' ? null : true,
    storage: createStorage(),
    now: () => clock,
  });
  await store.load();
  await store.record(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, {
    attempted: true,
    ok: false,
    reason: 'no_tool_call',
  });
  clock += 1;
  await store.record(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, {
    attempted: true,
    ok: false,
    reason: 'invalid_phone_reply_ir',
  });
  assert.equal(store.getHalfOpenAvailability(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc).available, false);
  assert.equal(await store.armHalfOpen(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc), true);
  assert.equal(store.tryAcquireHalfOpen(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, { requestId: 'req-a' }), true);
  assert.equal(store.tryAcquireHalfOpen(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, { requestId: 'req-b' }), false);
  assert.equal(store.getHalfOpenAvailability(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc).reason, 'half_open_busy');
  assert.equal(store.releaseHalfOpenRequest('req-a'), true);
  assert.equal(store.tryAcquireHalfOpen(identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc, { requestId: 'req-b' }), true);
  console.log('ok - manual retry arms one exact evidence key and the half-open lease is single-flight');
}

console.log('chat-structured-route-evidence-store-tests passed');
