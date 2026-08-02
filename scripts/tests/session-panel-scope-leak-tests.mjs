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
  dataset: {},
  style: {},
  textContent: '',
  innerHTML: '',
  classList: {
    values: new Set(),
    add(...names) { names.forEach(name => this.values.add(name)); },
    remove(...names) { names.forEach(name => this.values.delete(name)); },
    toggle(name, force) {
      const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
      if (enabled) this.values.add(name);
      else this.values.delete(name);
    },
    contains(name) { return this.values.has(name); },
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
  assert.equal(internals.isSessionPanelMotionReduced({
    documentRef: { body: { dataset: { reducedMotion: 'on' } } },
    matchMediaFn: () => ({ matches: false }),
  }), true);
  assert.equal(internals.isSessionPanelMotionReduced({
    documentRef: { body: { dataset: {} } },
    matchMediaFn: () => ({ matches: true }),
  }), true);
  const shortPull = internals.resolveRecommendPullFeedback(44, 188);
  const armedPull = internals.resolveRecommendPullFeedback(210, 188);
  assert.equal(shortPull.armed, false);
  assert.equal(shortPull.progress > 0 && shortPull.progress < 1, true);
  assert.equal(shortPull.visualOffset > 0 && shortPull.visualOffset < armedPull.visualOffset, true);
  assert.equal(armedPull.armed, true);
  assert.equal(armedPull.progress, 1);
  assert.equal(internals.shouldCommitRecommendPullRefresh({
    eligible: true,
    armed: false,
    atBottom: true,
    loading: false,
  }), false);
  assert.equal(internals.shouldCommitRecommendPullRefresh({
    eligible: true,
    armed: true,
    atBottom: true,
    loading: false,
  }), true);
  assert.equal(internals.shouldCommitRecommendPullRefresh({
    eligible: true,
    armed: true,
    atBottom: true,
    loading: true,
  }), false);
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

{
  const panel = new SessionPanel({}, { scopeId: 'persona_1' }, {});
  const shell = createElement();
  const contactsView = createElement();
  const recommendView = createElement();
  shell.style.display = 'flex';
  shell.querySelector = selector => selector === '.session-list-split' ? contactsView : null;
  panel.panel = shell;
  panel.recommendSection = recommendView;
  document.body.dataset.reducedMotion = 'on';

  panel.setRecommendMode(true);
  assert.equal(shell.classList.contains('is-recommend-mode'), true);
  assert.equal(shell.classList.contains('is-recommend-transitioning'), false);
  panel.setRecommendMode(false);
  assert.equal(shell.classList.contains('is-recommend-mode'), false);

  delete document.body.dataset.reducedMotion;
  console.log('ok - reduced-motion recommendation switches commit without transitional classes');
}

{
  const panel = new SessionPanel({}, { scopeId: 'persona_1' }, {});
  const shell = createElement();
  const sharedList = createElement();
  shell.classList.add('has-shared');
  panel.panel = shell;
  panel.listElShared = sharedList;
  panel.otherContacts = [{ contact: { id: 'cached-friend' } }];
  panel.sharedLoading = true;

  panel.renderSharedList();

  assert.equal(shell.classList.contains('has-shared'), true);
  assert.equal(sharedList.children[0]?.textContent, '载入中…');
  console.log('ok - cached shared contacts keep the stable split layout while refreshing');
}

{
  const panel = new SessionPanel({}, { scopeId: 'persona_1' }, {});
  const shell = createElement();
  const overlay = createElement();
  shell.style.display = 'none';
  overlay.style.display = 'none';
  shell.classList.add('is-recommend-mode');
  panel.panel = shell;
  panel.overlay = overlay;
  panel.recommendMode = true;
  panel.refresh = () => {};
  document.body.dataset.reducedMotion = 'on';

  panel.show();

  assert.equal(panel.recommendMode, false);
  assert.equal(shell.classList.contains('is-recommend-mode'), false);
  delete document.body.dataset.reducedMotion;
  console.log('ok - a fresh add-friend opening always starts in contacts mode');
}

{
  let savedContact = null;
  let markedCharacter = '';
  let ensuredWorldSession = '';
  let updated = 0;
  const panel = new SessionPanel(
    {},
    {
      scopeId: 'persona_1',
      getContact: id => savedContact?.id === id ? savedContact : null,
      upsertContact: contact => {
        savedContact = contact;
      },
    },
    {},
    { onUpdated: () => { updated += 1; } },
  );
  panel.characterStore = {
    markAdded: id => {
      markedCharacter = id;
    },
  };
  panel.ensureWorldBookForCharacter = async (_character, sessionId) => {
    ensuredWorldSession = sessionId;
  };
  panel.refresh = () => {};

  const result = await panel.addCharacterFromLibrary({
    id: 'library_friend',
    name: '测试角色',
    source: '测试作品',
    tags: ['温柔'],
  });

  assert.deepEqual(result, { ok: true, sessionId: '测试角色', name: '测试角色' });
  assert.equal(savedContact?.id, '测试角色');
  assert.equal(markedCharacter, 'library_friend');
  assert.equal(ensuredWorldSession, '测试角色');
  assert.equal(updated, 1);
  console.log('ok - adding a recommended friend returns navigation data for the success action');
}

{
  const entered = [];
  let successOptions = null;
  let hidden = 0;
  const panel = new SessionPanel(
    {},
    { scopeId: 'persona_1' },
    {},
    {
      enterChatRoom: async (...args) => entered.push(args),
    },
  );
  panel.resolveAvatarSrc = () => '';
  panel.addCharacterFromLibrary = async () => ({ ok: true, sessionId: '雪乃', name: '雪乃' });
  panel.ensureAddFriendFeedbackUi = () => ({
    requestAdd: async ({ run }) => run(),
    showSuccess: options => { successOptions = options; },
  });
  panel.hide = () => { hidden += 1; };

  await panel.confirmAddCharacter({ id: 'yukino', name: '雪乃' });
  await successOptions.onAction();

  assert.deepEqual(entered, [['雪乃', '雪乃', 'chat']]);
  assert.equal(hidden, 1);
  console.log('ok - add-friend success action enters the created chat room before closing the panel');
}
