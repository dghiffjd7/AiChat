import assert from 'node:assert/strict';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.get(String(key)) ?? null,
  setItem: (key, value) => {
    memoryStorage.set(String(key), String(value));
  },
  removeItem: key => {
    memoryStorage.delete(String(key));
  },
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.toastr = { warning() {}, info() {} };

const createElement = () => ({
  children: [],
  className: '',
  style: {},
  textContent: '',
  innerHTML: '',
  classList: {
    add() {},
    remove() {},
    toggle() {},
  },
  appendChild(child) {
    this.children.push(child);
    return child;
  },
  addEventListener() {},
  querySelector() {
    return null;
  },
});

globalThis.document = {
  createElement,
  body: createElement(),
};

const { SessionPanel, __sessionPanelInternals } = await import('../../src/scripts/ui/session-panel.js');

{
  const internals = __sessionPanelInternals;
  assert.equal(internals.isSharedContactCandidate({ id: 'friend' }), true);
  assert.equal(internals.isSharedContactCandidate({ id: 'group:1768668321145-6210c5', isGroup: true }), false);
  assert.equal(internals.isSharedContactCandidate({ id: 'rp:persona_1' }), false);
  assert.equal(internals.isScopedDataMatch({ contacts: {} }, 'persona_1'), false);
  assert.equal(internals.isScopedDataMatch({ contacts: {} }, 'default'), true);
  assert.equal(internals.isScopedDataMatch({ contacts: {}, scopeId: 'persona_1' }, 'persona_1'), true);
  console.log('ok - session panel helpers reject group/shared legacy leakage candidates');
}

{
  const currentList = createElement();
  const sharedList = createElement();
  const panel = new SessionPanel(
    {
      listSessions: () => ['group:1768668321145-6210c5', 'leaked-contact'],
      getCurrent: () => '',
      getLastMessage: () => null,
      getUnreadCount: () => 0,
    },
    {
      scopeId: 'persona_1',
      ready: null,
      listContacts: () => [],
      getContact: () => null,
    },
    {},
  );
  panel.listElCurrent = currentList;
  panel.listElShared = sharedList;

  panel.refresh();

  assert.equal(currentList.children.length, 1);
  assert.equal(currentList.children[0].textContent, '暂无好友/群组');
  console.log('ok - session panel current contacts do not fall back to polluted chat sessions');
}
