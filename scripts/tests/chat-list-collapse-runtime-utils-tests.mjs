import assert from 'node:assert/strict';

import {
  CHAT_LIST_COLLAPSED_STORAGE_KEY,
  createChatListCollapseRuntime,
} from '../../src/scripts/ui/chat-list-collapse-runtime-utils.js';

const createHandle = () => {
  const attributes = new Map();
  const listeners = new Map();
  return {
    attributes,
    listeners,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    click() {
      listeners.get('click')?.();
    },
  };
};

{
  const writes = [];
  const root = { dataset: {} };
  const handle = createHandle();
  const storage = {
    getItem: key => key === CHAT_LIST_COLLAPSED_STORAGE_KEY ? '1' : null,
    setItem: (key, value) => writes.push([key, value]),
  };
  const runtime = createChatListCollapseRuntime({ root, handle, storage });
  assert.equal(runtime.isCollapsed(), true);
  assert.equal(root.dataset.chatListCollapsed, 'true');
  assert.equal(handle.attributes.get('aria-expanded'), 'false');
  assert.equal(handle.attributes.get('aria-label'), '展开聊天列表');

  runtime.setUnreadCount(3);
  assert.equal(runtime.getUnreadCount(), 3);
  assert.equal(root.dataset.chatListHasUnread, 'true');
  assert.equal(handle.attributes.get('aria-label'), '展开聊天列表，有 3 条未读消息');

  handle.click();
  assert.equal(runtime.isCollapsed(), false);
  assert.equal('chatListCollapsed' in root.dataset, false);
  assert.equal(handle.attributes.get('aria-expanded'), 'true');
  assert.equal(handle.attributes.get('aria-label'), '收合聊天列表');
  assert.deepEqual(writes, [[CHAT_LIST_COLLAPSED_STORAGE_KEY, '0']]);

  runtime.setUnreadCount(-1);
  assert.equal(runtime.getUnreadCount(), 0);
  assert.equal('chatListHasUnread' in root.dataset, false);

  runtime.destroy();
  assert.equal(handle.listeners.has('click'), false);
  console.log('ok - desktop chat list collapse restores, toggles, persists, and updates accessibility state');
}

{
  const root = { dataset: {} };
  const handle = createHandle();
  const runtime = createChatListCollapseRuntime({
    root,
    handle,
    storage: {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    },
  });
  assert.equal(runtime.isCollapsed(), false);
  assert.doesNotThrow(() => runtime.setCollapsed(true));
  assert.equal(root.dataset.chatListCollapsed, 'true');
  assert.doesNotThrow(() => runtime.setUnreadCount(Number.NaN));
  assert.equal(runtime.getUnreadCount(), 0);
  console.log('ok - desktop chat list collapse remains usable when local storage is unavailable');
}
