import assert from 'node:assert/strict';

import {
  deliverProtocolDeliveryItem,
  flushPersistedProtocolDeliveryPlans,
  getProtocolDeliveryPlanDiskKey,
  getProtocolDeliveryPlanStorageKey,
  readProtocolDeliveryPlansWithFallback,
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

class QuotaStorage extends MemoryStorage {
  setItem() {
    const err = new Error('quota exceeded');
    err.name = 'QuotaExceededError';
    throw err;
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
  const storage = new QuotaStorage();
  const fallbackWrites = [];
  const fallbackCache = new Map();
  const scopeId = 'scope:quota';
  const fallbackReadSync = key => fallbackCache.get(key) || null;
  const fallbackWrite = (key, payload) => {
    fallbackWrites.push([key, payload]);
    fallbackCache.set(key, payload);
  };
  const plan = upsertProtocolDeliveryPlan({
    storage,
    scopeId,
    fallbackReadSync,
    fallbackWrite,
    logger: { debug() {}, warn() {} },
    plan: {
      id: 'plan-quota',
      sessionId: 'c-quota',
      items: [
        {
          message: { id: 'm-quota', role: 'assistant', content: 'hello' },
          delivery: { kind: 'private', targetSessionId: 'c-quota', isMe: false },
        },
      ],
    },
  });
  assert.equal(plan.id, 'plan-quota');
  assert.equal(fallbackWrites[0][0], getProtocolDeliveryPlanDiskKey(scopeId));
  assert.equal(fallbackWrites[0][1].plans[0].id, 'plan-quota');
  assert.equal(
    updateProtocolDeliveryPlanCursor({
      storage,
      scopeId,
      planId: 'plan-quota',
      cursor: 1,
      fallbackReadSync,
      fallbackWrite,
      logger: { debug() {}, warn() {} },
    }),
    true,
  );
  assert.equal(fallbackWrites.at(-1)[1].plans[0].cursor, 1);
  assert.equal(
    removeProtocolDeliveryPlan({
      storage,
      scopeId,
      planId: 'plan-quota',
      fallbackReadSync,
      fallbackWrite,
      logger: { debug() {}, warn() {} },
    }),
    true,
  );
  assert.deepEqual(fallbackWrites.at(-1)[1], { plans: [] });
  console.log('ok - protocol delivery plans fall back to disk payload when localStorage quota is exceeded');
}

{
  const diskKey = getProtocolDeliveryPlanDiskKey('scope-disk');
  const plans = await readProtocolDeliveryPlansWithFallback({
    storage: new MemoryStorage(),
    scopeId: 'scope-disk',
    fallbackRead: async key => {
      assert.equal(key, diskKey);
      return {
        plans: [
          {
            id: 'plan-disk',
            sessionId: 'c-disk',
            items: [
              {
                message: { id: 'm-disk', role: 'assistant', content: 'disk' },
                delivery: { kind: 'private', targetSessionId: 'c-disk', isMe: false },
              },
            ],
          },
        ],
      };
    },
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, 'plan-disk');
  console.log('ok - protocol delivery plans read from disk fallback when localStorage has no plan');
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
