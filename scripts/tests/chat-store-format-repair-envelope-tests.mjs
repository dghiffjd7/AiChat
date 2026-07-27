import assert from 'node:assert/strict';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.get(String(key)) ?? null,
  setItem: (key, value) => memoryStorage.set(String(key), String(value)),
  removeItem: key => memoryStorage.delete(String(key)),
};
globalThis.document = { body: { dataset: {} } };
globalThis.window = globalThis;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = () => 0;
const { ChatStore } = await import('../../src/scripts/storage/chat-store.js');
globalThis.setTimeout = realSetTimeout;

{
  const store = new ChatStore({ scopeId: 'format-envelope' });
  const sourceSessionId = 'source-session';
  const longRaw = `前${'x'.repeat(220_000)}尾`;
  assert.equal(store.setLastRawResponse(longRaw, sourceSessionId, {
    turnId: 'turn-1',
    sourceSessionId,
    targetSessionId: 'contact-session',
    sourceKind: 'social_turn_raw',
  }), true);

  const initial = store.getLastRawResponseEnvelope(sourceSessionId);
  assert.equal(initial.text.length, 220_000);
  assert.equal(initial.text.endsWith('尾'), true);
  assert.equal(initial.truncated, true);
  assert.equal(initial.turnId, 'turn-1');
  assert.equal(initial.sourceSessionId, sourceSessionId);
  assert.equal(initial.targetSessionId, 'contact-session');
  assert.deepEqual(initial.sourceMessageIds, []);

  assert.equal(store.registerLastRawResponseSourceMessage({
    sourceSessionId,
    targetSessionId: 'contact-session',
    turnId: 'turn-1',
    messageId: 'bubble-1',
  }), true);
  assert.equal(store.registerLastRawResponseSourceMessage({
    sourceSessionId,
    targetSessionId: 'contact-session',
    turnId: 'turn-1',
    messageId: 'bubble-2',
  }), true);
  assert.equal(store.registerLastRawResponseSourceMessage({
    sourceSessionId,
    targetSessionId: 'contact-session',
    turnId: 'turn-1',
    messageId: 'bubble-2',
  }), true);
  assert.equal(store.registerLastRawResponseSourceMessage({
    sourceSessionId,
    targetSessionId: 'contact-session',
    turnId: 'stale-turn',
    messageId: 'stale-bubble',
  }), false);

  const registered = store.getLastRawResponseEnvelope(sourceSessionId);
  assert.deepEqual(registered.sourceMessageIds, ['bubble-1', 'bubble-2']);
  assert.deepEqual(registered.targetSessionIds, ['contact-session']);
  console.log('ok - ChatStore persists a bounded latest raw envelope and source message ids');
}

{
  const store = new ChatStore({ scopeId: 'format-envelope-clear' });
  const sid = 'session';
  store.setLastRawResponse('完整原文', sid, {
    turnId: 'turn-clear',
    sourceSessionId: sid,
  });
  store.clear(sid);
  assert.deepEqual(store.getLastRawResponseEnvelope(sid), {
    text: '',
    at: 0,
    truncated: false,
    turnId: '',
    sourceSessionId: sid,
    targetSessionId: '',
    targetSessionIds: [],
    sourceKind: 'social_turn_raw',
    sourceMessageIds: [],
  });
  console.log('ok - ChatStore clear resets the latest raw repair envelope');
}
