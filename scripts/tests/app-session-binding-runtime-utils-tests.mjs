import assert from 'node:assert/strict';

import {
  bindAppSessionEntryNavigation,
  registerAppSessionEventListeners,
} from '../../src/scripts/ui/app-session-binding-runtime-utils.js';

{
  const listeners = new Map();
  const calls = [];
  registerAppSessionEventListeners({
    windowLike: {
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
    },
    onOpenSessionConfig: () => calls.push(['open']),
    onPresetChanged: async () => calls.push(['preset']),
    onRegexChanged: () => calls.push(['regex']),
    onSessionPanelClosed: (detail) => calls.push(['closed', detail]),
    onSessionChanged: async (id) => calls.push(['changed', id]),
  });

  listeners.get('open-session-config')();
  await listeners.get('preset-changed')();
  listeners.get('regex-changed')();
  listeners.get('session-panel-closed')({ detail: { jumpToContacts: true } });
  await listeners.get('session-changed')({ detail: { id: 'contact:1' } });

  assert.deepEqual(calls, [
    ['open'],
    ['preset'],
    ['regex'],
    ['closed', { jumpToContacts: true }],
    ['changed', 'contact:1'],
  ]);
  console.log('ok - registerAppSessionEventListeners wires session-level window events');
}

{
  const contactCalls = [];
  const contactListeners = {};
  bindAppSessionEntryNavigation({
    contactsUngroupedEl: {
      addEventListener(type, handler) {
        contactListeners[type] = handler;
      },
    },
    getActivePage: () => 'contacts',
    switchPage: (page, options) => contactCalls.push(['page', page, options]),
    enterChatRoom: (...args) => contactCalls.push(['enter', ...args]),
  });

  contactListeners.click({
    target: {
      closest(selector) {
        if (selector !== '.contact-item') return null;
        return {
          dataset: {
            session: 'contact:2',
            name: '好友乙',
          },
        };
      },
    },
  });

  assert.deepEqual(contactCalls, [
    ['page', 'chat', { animate: false }],
    ['enter', 'contact:2', '好友乙', 'contacts'],
  ]);

  const chatCalls = [];
  bindAppSessionEntryNavigation({
    chatListEl: {
      addEventListener(_type, handler) {
        handler({
          target: {
            closest(selector) {
              if (selector !== '.chat-list-item') return null;
              return {
                dataset: {
                  session: 'default',
                  name: '默认会话',
                },
              };
            },
          },
        });
      },
    },
    switchPage: (page, options) => chatCalls.push(['page', page, options]),
    enterChatRoom: (...args) => chatCalls.push(['enter', ...args]),
  });

  assert.deepEqual(chatCalls, [
    ['enter', 'default', '默认会话'],
    ['page', 'chat', undefined],
  ]);
  console.log('ok - bindAppSessionEntryNavigation routes chat and contact list clicks into session navigation');
}
