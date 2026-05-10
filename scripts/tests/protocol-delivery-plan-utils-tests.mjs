import assert from 'node:assert/strict';

import {
  deliverProtocolDeliveryItem,
  flushPersistedProtocolDeliveryPlans,
  getProtocolDeliveryPlanStorageKey,
  readProtocolDeliveryPlans,
  removeProtocolDeliveryPlan,
  updateProtocolDeliveryPlanCursor,
  upsertProtocolDeliveryPlan,
} from '../../src/scripts/ui/chat/protocol-delivery-plan-utils.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

{
  const storage = new MemoryStorage();
  const plan = upsertProtocolDeliveryPlan({
    storage,
    scopeId: 'scope-a',
    plan: {
      id: 'plan-1',
      sessionId: 'c1',
      items: [
        {
          message: { role: 'assistant', content: 'hello' },
          delivery: { kind: 'private', targetSessionId: 'c1', isMe: false },
        },
      ],
    },
  });
  assert.equal(plan.id, 'plan-1');
  assert.equal(plan.items.length, 1);
  assert.ok(plan.items[0].message.id);
  assert.ok(plan.items[0].message.timestamp);

  const key = getProtocolDeliveryPlanStorageKey('scope-a');
  assert.ok(storage.getItem(key));
  const [storedPlan] = readProtocolDeliveryPlans({ storage, scopeId: 'scope-a' });
  assert.equal(storedPlan.id, 'plan-1');
  assert.equal(updateProtocolDeliveryPlanCursor({ storage, scopeId: 'scope-a', planId: 'plan-1', cursor: 1 }), true);
  assert.equal(readProtocolDeliveryPlans({ storage, scopeId: 'scope-a' })[0].cursor, 1);
  assert.equal(removeProtocolDeliveryPlan({ storage, scopeId: 'scope-a', planId: 'plan-1' }), true);
  assert.equal(storage.getItem(key), null);
  console.log('ok - protocol delivery plans persist message identity and cursor');
}

{
  const appended = [];
  const ui = [];
  const reads = [];
  const receives = [];
  const refreshes = [];
  const existingById = new Map();
  const item = {
    message: { id: 'm1', role: 'assistant', content: 'hello' },
    delivery: { kind: 'private', targetSessionId: 'c1', isMe: false },
  };
  const first = deliverProtocolDeliveryItem(item, {
    findMessage: (id) => existingById.get(id) || null,
    appendMessage: (message, sessionId) => {
      appended.push([sessionId, message.id]);
      existingById.set(message.id, { ...message, saved: true });
      return existingById.get(message.id);
    },
    isSessionActive: sessionId => sessionId === 'c1',
    addUiMessage: (message, options) => ui.push([message.id, options]),
    autoMarkReadIfActive: (sessionId, messageId) => reads.push([sessionId, messageId]),
    emitPluginAfterReceive: (message, sessionId) => receives.push([sessionId, message.id]),
    refreshChatAndContacts: () => refreshes.push('refresh'),
  });
  assert.equal(first.appended, true);
  assert.deepEqual(appended, [['c1', 'm1']]);
  assert.deepEqual(ui, [['m1', { autoScroll: true }]]);
  assert.deepEqual(reads, [['c1', 'm1']]);
  assert.deepEqual(receives, [['c1', 'm1']]);
  assert.equal(refreshes.length, 1);

  const second = deliverProtocolDeliveryItem(item, {
    findMessage: (id) => existingById.get(id) || null,
    appendMessage: () => {
      throw new Error('duplicate delivery should not append');
    },
  });
  assert.equal(second.appended, false);
  assert.equal(second.reason, 'duplicate');
  console.log('ok - deliverProtocolDeliveryItem appends once and skips duplicate ids');
}

{
  const storage = new MemoryStorage();
  const existing = new Map([['m1', { id: 'm1', role: 'assistant', content: 'old' }]]);
  upsertProtocolDeliveryPlan({
    storage,
    scopeId: 'scope-b',
    plan: {
      id: 'plan-2',
      sessionId: 'c2',
      cursor: 0,
      items: [
        {
          message: { id: 'm1', role: 'assistant', content: 'old' },
          delivery: { kind: 'private', targetSessionId: 'c2', isMe: false },
        },
        {
          message: { id: 'm2', role: 'assistant', content: 'new' },
          delivery: { kind: 'private', targetSessionId: 'c2', isMe: false },
        },
      ],
    },
  });
  const appended = [];
  const result = await flushPersistedProtocolDeliveryPlans({
    storage,
    scopeId: 'scope-b',
    findMessage: (id) => existing.get(id) || null,
    appendMessage: (message, sessionId) => {
      appended.push([sessionId, message.id]);
      existing.set(message.id, message);
      return message;
    },
    isSessionActive: () => false,
  });
  assert.deepEqual(result, { plans: 1, appended: 1, skipped: 1, failed: 0 });
  assert.deepEqual(appended, [['c2', 'm2']]);
  assert.deepEqual(readProtocolDeliveryPlans({ storage, scopeId: 'scope-b' }), []);
  console.log('ok - flushPersistedProtocolDeliveryPlans recovers remaining items and removes completed plan');
}
