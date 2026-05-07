import assert from 'node:assert/strict';

import {
  bindAppChatMenuToggle,
  bindAppSheetToggleButtons,
  bindChatTitleMenuActions,
  bindChatroomMenuActions,
  bindQuickMenuActions,
  bindSettingsMenuActions,
} from '../../src/scripts/ui/app-menu-binding-runtime-utils.js';

const createButton = (action = '') => {
  const listeners = {};
  return {
    dataset: { action },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    trigger(type = 'click', event = {}) {
      listeners[type]?.({
        currentTarget: this,
        target: this,
        stopPropagation() {},
        ...event,
      });
    },
  };
};

const createMenu = (buttons = []) => ({
  querySelectorAll(selector) {
    return selector === 'button' ? buttons : [];
  },
  classList: {
    toggled: [],
    added: [],
    toggle(token) {
      this.toggled.push(token);
    },
    add(token) {
      this.added.push(token);
    },
  },
});

{
  const calls = [];
  const avatarBtn = createButton();
  const settingsBtn = createButton();
  const plusBtn = createButton();
  const momentsBtn = createButton();
  bindAppSheetToggleButtons({
    avatarBtns: [avatarBtn],
    settingsBtns: [settingsBtn],
    plusBtns: [plusBtn],
    momentsSettingsBtn: momentsBtn,
    renderPersonaSwitcher: () => calls.push(['render-persona']),
    toggleSheetAt: (...args) => calls.push(['toggle', ...args]),
    personaSwitcherMenu: 'persona-menu',
    settingsMenu: 'settings-menu',
    quickMenu: 'quick-menu',
    momentsMenu: 'moments-menu',
  });
  avatarBtn.trigger();
  settingsBtn.trigger();
  plusBtn.trigger();
  momentsBtn.trigger();

  assert.deepEqual(calls, [
    ['render-persona'],
    ['toggle', 'persona-menu', avatarBtn, { kind: 'persona' }],
    ['toggle', 'settings-menu', settingsBtn, { alignRight: true, kind: 'settings' }],
    ['toggle', 'quick-menu', plusBtn, { alignRight: true, kind: 'quick' }],
    ['toggle', 'moments-menu', momentsBtn, { alignRight: true, kind: 'moments' }],
  ]);
  console.log('ok - bindAppSheetToggleButtons wires avatar settings quick and moments sheet toggles');
}

{
  const calls = [];
  const menu = createMenu();
  const settingsMenu = createMenu();
  const quickMenu = createMenu();
  const chatMenuBtn = createButton();
  bindAppChatMenuToggle({
    chatMenuBtn,
    getActiveMenu: () => menu,
    positionSheet: (...args) => calls.push(['position', ...args]),
    settingsMenu,
    quickMenu,
  });
  chatMenuBtn.trigger();
  assert.deepEqual(calls, [['position', menu, chatMenuBtn, 0, 4, true]]);
  assert.deepEqual(menu.classList.toggled, ['hidden']);
  assert.deepEqual(settingsMenu.classList.added, ['hidden']);
  assert.deepEqual(quickMenu.classList.added, ['hidden']);
  console.log('ok - bindAppChatMenuToggle positions active menu and hides sibling menus');
}

{
  const calls = [];
  const settingsMenu = createMenu([
    createButton('settings'),
    createButton('preset'),
    createButton('world-global'),
    createButton('extensions'),
    createButton('config'),
    createButton('session-config'),
  ]);
  bindSettingsMenuActions({
    settingsMenu,
    openSettings: () => calls.push('settings'),
    openPreset: () => calls.push('preset'),
    openWorldGlobal: () => calls.push('world'),
    openExtensions: () => calls.push('extensions'),
    openConfig: () => calls.push('config'),
    openSessionConfig: () => calls.push('session-config'),
    hideMenus: () => calls.push('hide'),
  });
  settingsMenu.querySelectorAll('button').forEach((button) => button.trigger());
  assert.deepEqual(calls, [
    'settings', 'hide',
    'preset', 'hide',
    'world', 'hide',
    'extensions', 'hide',
    'config', 'hide',
    'session-config', 'hide',
  ]);
  console.log('ok - bindSettingsMenuActions dispatches settings menu actions then hides menus');
}

{
  const calls = [];
  const quickMenu = createMenu([
    createButton('add-friend'),
    createButton('create-group'),
    createButton('new-group'),
  ]);
  bindQuickMenuActions({
    quickMenu,
    openAddFriend: () => calls.push('friend'),
    openCreateGroup: () => calls.push('create-group'),
    openNewGroup: () => calls.push('new-group'),
    hideMenus: () => calls.push('hide'),
  });
  quickMenu.querySelectorAll('button').forEach((button) => button.trigger());
  assert.deepEqual(calls, [
    'friend', 'hide',
    'create-group', 'hide',
    'new-group', 'hide',
  ]);
  console.log('ok - bindQuickMenuActions dispatches quick menu actions then hides menus');
}

{
  const calls = [];
  const menu = createMenu([
    createButton('world'),
    createButton('regex'),
    createButton('vars'),
    createButton('chat-settings'),
    createButton('prompt-preview'),
    createButton('raw-reply'),
  ]);
  bindChatroomMenuActions({
    menuEl: menu,
    openWorld: () => calls.push('world'),
    openRegex: () => calls.push('regex'),
    openVars: () => calls.push('vars'),
    openChatSettings: () => calls.push('chat-settings'),
    openPromptPreview: () => calls.push('prompt-preview'),
    openRawReply: () => calls.push('raw-reply'),
    hideMenus: () => calls.push('hide'),
  });
  menu.querySelectorAll('button').forEach((button) => button.trigger());
  assert.deepEqual(calls, [
    'world', 'hide',
    'regex', 'hide',
    'vars', 'hide',
    'chat-settings', 'hide',
    'prompt-preview', 'hide',
    'raw-reply', 'hide',
  ]);
  console.log('ok - bindChatroomMenuActions dispatches chatroom menu actions then hides menus');
}

{
  const calls = [];
  const currentChatTitle = createButton();
  const chatTitleMenu = createMenu([
    createButton('contact-settings'),
    createButton('session-config'),
  ]);
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      if (id !== 'group-management-dropdown') return null;
      return { style: { display: 'none' } };
    },
  };
  bindChatTitleMenuActions({
    currentChatTitle,
    chatTitleMenu,
    getCurrentSessionMeta: () => ({ sessionId: 'group:1', isGroup: true }),
    hideMenus: () => calls.push('hide'),
    renderGroupDropdown: (...args) => calls.push(['group', ...args]),
    toggleTitleMenu: () => calls.push('toggle'),
    openContactSettings: () => calls.push('contact-settings'),
    openSessionConfig: () => calls.push('session-config'),
  });
  currentChatTitle.trigger();
  chatTitleMenu.querySelectorAll('button').forEach((button) => button.trigger());
  globalThis.document = originalDocument;
  assert.deepEqual(calls, [
    'hide',
    ['group', 'group:1', currentChatTitle],
    'contact-settings', 'hide',
    'session-config', 'hide',
  ]);
  console.log('ok - bindChatTitleMenuActions routes group title clicks and title-menu actions');
}
