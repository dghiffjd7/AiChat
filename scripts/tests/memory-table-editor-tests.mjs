import assert from 'node:assert/strict';

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
const originalLocalStorage = globalThis.localStorage;
const originalSetTimeout = globalThis.setTimeout;

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

try {
  const events = [];
  const syncCalls = [];
  const listeners = new Map();
  const localItems = new Map();
  globalThis.setTimeout = () => 0;
  globalThis.localStorage = {
    getItem: key => localItems.get(String(key)) ?? null,
    setItem: (key, value) => {
      localItems.set(String(key), String(value));
    },
    removeItem: key => {
      localItems.delete(String(key));
    },
  };
  globalThis.CustomEvent = TestCustomEvent;
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: event => {
      events.push(event);
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    appBridge: {
      syncCurrentMemoryStateAfterTimelineRepair: async (...args) => {
        syncCalls.push(args);
        return true;
      },
    },
    toastr: {
      warning: () => {},
    },
  };

  const { MemoryTableEditor } = await import('../../src/scripts/ui/memory-table-editor.js');
  const editor = new MemoryTableEditor({
    getContext: () => ({ type: 'contact', contactId: 'contact:1', uiMode: 'chat' }),
  });
  editor.template = { meta: { id: 'default-v1' } };
  editor.container = { style: {} };
  let renderCalls = 0;
  editor.renderPreservingScroll = async () => {
    renderCalls += 1;
  };

  const synced = await editor.syncManualMemoryMutation(
    { type: 'contact', contactId: 'contact:1', uiMode: 'chat' },
    { source: 'manual_memory_delete' },
  );

  assert.equal(synced, true);
  assert.deepEqual(syncCalls, [
    ['contact:1', { source: 'manual_memory_delete' }],
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'memory-rows-updated');
  assert.deepEqual(events[0].detail, {
    sessionId: 'contact:1',
    templateId: 'default-v1',
  });
  assert.equal(renderCalls, 0);
  window.dispatchEvent(new TestCustomEvent('memory-rows-updated', {
    detail: { sessionId: 'contact:1', templateId: 'default-v1' },
  }));
  assert.equal(renderCalls, 1);
  editor.destroy();
  console.log('ok - MemoryTableEditor syncs manual memory mutations into current turn snapshot without double-rendering itself');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  globalThis.setTimeout = originalSetTimeout;
}
