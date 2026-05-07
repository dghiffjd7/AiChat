import assert from 'node:assert/strict';

import {
  bindPageNavButtons,
  bindPageSwipeNavigation,
  createPageSwitchRuntime,
} from '../../src/scripts/ui/page-navigation-runtime-utils.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    toggle: (token, force) => {
      if (force === true) {
        set.add(token);
        return true;
      }
      if (force === false) {
        set.delete(token);
        return false;
      }
      if (set.has(token)) {
        set.delete(token);
        return false;
      }
      set.add(token);
      return true;
    },
    contains: token => set.has(token),
    toArray: () => [...set],
  };
};

const createElement = ({ classes = [], dataset = {} } = {}) => {
  const listeners = new Map();
  return {
    classList: createClassList(classes),
    dataset: { ...dataset },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    scrollToCalls: [],
    scrollTo(options) {
      this.scrollToCalls.push(options);
    },
  };
};

const createIterableCollection = (items) => ({
  length: items.length,
  forEach: items.forEach.bind(items),
  [Symbol.iterator]: items[Symbol.iterator].bind(items),
});

{
  let activePage = 'chat';
  const navChat = createElement({ dataset: { page: 'chat' }, classes: ['active'] });
  const navMoments = createElement({ dataset: { page: 'moments' } });
  const pages = {
    chat: createElement({ classes: ['active'] }),
    moments: createElement(),
  };
  const chatRoomEl = createElement();
  const chatListEl = createElement({ classes: ['hidden'] });
  const calls = [];
  const switchPage = createPageSwitchRuntime({
    getActivePage: () => activePage,
    setActivePage: value => {
      activePage = value;
    },
    pageOrder: { chat: 0, moments: 1 },
    navButtons: createIterableCollection([navChat, navMoments]),
    pages,
    getReducedMotion: () => true,
    chatRoomEl,
    chatListEl,
    renderMoments: () => calls.push('renderMoments'),
    updateChatContentSearchVisibility: () => calls.push('updateChatSearch'),
    isUiStateArmed: () => true,
    saveUiState: () => calls.push('saveUiState'),
    uiLog: (event, payload) => calls.push([event, payload]),
    scheduleModeSwitchSync: () => calls.push('syncModeSwitch'),
  });

  assert.equal(switchPage('moments'), true);
  assert.equal(activePage, 'moments');
  assert.equal(navChat.classList.contains('active'), false);
  assert.equal(navMoments.classList.contains('active'), true);
  assert.equal(pages.chat.classList.contains('active'), false);
  assert.equal(pages.moments.classList.contains('active'), true);
  assert.equal(chatRoomEl.classList.contains('hidden'), true);
  assert.equal(chatListEl.classList.contains('hidden'), false);
  assert.deepEqual(calls, [
    'renderMoments',
    'saveUiState',
    ['switchPage', { activePage: 'moments' }],
    'syncModeSwitch',
  ]);
  console.log('ok - createPageSwitchRuntime updates active page nav shell and moments side effects for iterable nav collections');
}

{
  let activePage = 'moments';
  const pages = {
    chat: createElement(),
    moments: createElement({ classes: ['active'] }),
  };
  const timeoutCalls = [];
  const switchPage = createPageSwitchRuntime({
    getActivePage: () => activePage,
    setActivePage: value => {
      activePage = value;
    },
    pageOrder: { chat: 0, moments: 1 },
    navButtons: [],
    pages,
    getReducedMotion: () => false,
    updateChatContentSearchVisibility: () => {},
    isUiStateArmed: () => false,
    uiLog: () => {},
    scheduleModeSwitchSync: () => {},
    setTimeoutFn: (fn, ms) => {
      timeoutCalls.push(ms);
      fn();
    },
  });
  assert.equal(switchPage('chat', { animate: true }), true);
  assert.deepEqual(timeoutCalls, [350, 350]);
  assert.equal(pages.moments.classList.contains('page-exiting'), false);
  assert.equal(pages.chat.dataset.pageDir, undefined);
  console.log('ok - createPageSwitchRuntime cleans up animated page transition markers');
}

{
  let activePage = 'chat';
  let now = 100;
  const chatButton = createElement({ dataset: { page: 'chat' } });
  const contactsButton = createElement({ dataset: { page: 'contacts' } });
  const scrollTarget = createElement();
  const switched = [];
  bindPageNavButtons({
    navButtons: createIterableCollection([chatButton, contactsButton]),
    getActivePage: () => activePage,
    switchPage: (page) => {
      switched.push(page);
      activePage = page;
    },
    getScrollTarget: page => (page === 'chat' ? scrollTarget : null),
    getNow: () => now,
  });
  chatButton.emit('click');
  now = 200;
  chatButton.emit('click');
  now = 600;
  contactsButton.emit('click');
  assert.deepEqual(switched, ['chat', 'chat', 'contacts']);
  assert.deepEqual(scrollTarget.scrollToCalls, [{ top: 0, behavior: 'smooth' }]);
  console.log('ok - bindPageNavButtons handles repeated active-tab taps as scroll-to-top for iterable nav collections');
}

{
  let activePage = 'chat';
  let uiMode = 'chat';
  let inChatRoom = false;
  const appEl = createElement();
  const switched = [];
  bindPageSwipeNavigation({
    appEl,
    isChatRoomVisible: () => inChatRoom,
    getUiMode: () => uiMode,
    getActivePage: () => activePage,
    pageOrder: { chat: 0, contacts: 1, moments: 2 },
    pageNames: ['chat', 'contacts', 'moments'],
    switchPage: page => {
      switched.push(page);
      activePage = page;
    },
    isModeSwitchTarget: target => target?.id === 'mode-switch',
  });

  appEl.emit('touchstart', { touches: [{ clientX: 100, clientY: 10 }], target: { id: 'x' } });
  appEl.emit('touchend', { changedTouches: [{ clientX: 10, clientY: 15 }] });
  appEl.emit('touchstart', { touches: [{ clientX: 50, clientY: 10 }], target: { id: 'x' } });
  appEl.emit('touchend', { changedTouches: [{ clientX: 120, clientY: 12 }] });
  appEl.emit('touchstart', { touches: [{ clientX: 10, clientY: 10 }], target: { id: 'mode-switch' } });
  appEl.emit('touchend', { changedTouches: [{ clientX: 120, clientY: 12 }] });
  uiMode = 'rp';
  appEl.emit('touchstart', { touches: [{ clientX: 100, clientY: 10 }], target: { id: 'x' } });
  appEl.emit('touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });
  uiMode = 'chat';
  inChatRoom = true;
  appEl.emit('touchstart', { touches: [{ clientX: 100, clientY: 10 }], target: { id: 'x' } });
  appEl.emit('touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });

  assert.deepEqual(switched, ['contacts', 'chat']);
  console.log('ok - bindPageSwipeNavigation handles horizontal swipes and ignores locked contexts');
}
