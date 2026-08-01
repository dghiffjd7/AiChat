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
    pendingRepair: false,
  });
  console.log('ok - ChatStore clear resets the latest raw repair envelope');
}

{
  const store = new ChatStore({ scopeId: 'format-envelope-pending' });
  const sid = 'session';
  store.setLastRawResponse('成功回复原文', sid, { turnId: 'turn-ok', sourceSessionId: sid });
  assert.equal(
    store.getLastRawResponseEnvelope(sid).pendingRepair,
    false,
    '普通回复默认不得被当成待修复',
  );
  assert.equal(
    store.markLastRawResponsePendingRepair({ sourceSessionId: sid, turnId: 'turn-other' }),
    false,
    '轮次不匹配时不得标记待修复',
  );
  assert.equal(store.getLastRawResponseEnvelope(sid).pendingRepair, false);
  assert.equal(store.markLastRawResponsePendingRepair({ sourceSessionId: sid, turnId: 'turn-ok' }), true);
  assert.equal(store.getLastRawResponseEnvelope(sid).pendingRepair, true);
  // 重派成功或新一轮回复都会重写信封，待修复标记必须回落。
  store.setLastRawResponse('修复后原文', sid, { turnId: 'turn-ok', sourceSessionId: sid });
  assert.equal(store.getLastRawResponseEnvelope(sid).pendingRepair, false);
  console.log('ok - ChatStore only marks pending repair at the rejecting turn');
}

{
  // 历史会话在本功能之前写下的信封经规范化后与被拒信封同形，必须靠 pendingRepair 区分。
  const store = new ChatStore({ scopeId: 'format-envelope-legacy' });
  const sid = 'legacy-session';
  store._ensureSession(sid);
  const session = store.state.sessions[sid];
  session.lastRawResponse = '<private_chat>历史成功回复</private_chat>';
  session.lastRawAt = 1;
  session.lastRawTurnId = 'legacy-turn';
  delete session.lastRawPendingRepair;
  delete session.lastRawSourceMessageIds;
  delete session.lastRawSourceKind;
  store._ensureSession(sid);
  const envelope = store.getLastRawResponseEnvelope(sid);
  assert.equal(envelope.sourceKind, 'social_turn_raw');
  assert.deepEqual(envelope.sourceMessageIds, []);
  assert.equal(envelope.pendingRepair, false, '历史信封不得被规范化成待修复');
  console.log('ok - legacy raw envelopes normalize without inheriting pending repair');
}
