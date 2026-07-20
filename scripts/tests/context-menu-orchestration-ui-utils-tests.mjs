import assert from 'node:assert/strict';

import { showContextMenuCore } from '../../src/scripts/ui/chat/context-menu-orchestration-ui-utils.js';

{
  const hidden = showContextMenuCore({
    selectionMode: true,
    contextMenu: {},
  });
  assert.equal(hidden, false);
  console.log('ok - showContextMenuCore bails out while selection mode is active');
}

{
  const appended = [];
  const dispatched = [];
  const contextMenu = {
    style: { display: 'block' },
    innerHTML: 'stale',
    appendChild(node) {
      appended.push(node);
    },
  };
  let positioned = null;
  let actionOptions = null;
  const actionButtons = [];
  const shown = showContextMenuCore({
    event: { target: {}, clientX: 12, clientY: 34 },
    message: { id: 'm1' },
    selectionMode: false,
    contextMenu,
    navigatorLike: { vibrate() {} },
    scrollEl: {},
    hideReactionPicker() {},
    resolveContextMenuContext: () => ({
      wrapper: {
        id: 'wrap',
        classList: { contains: token => token === 'has-rp-message-chrome' },
      },
      message: { id: 'm1', meta: { reactions: [] } },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: (nextMessage, options) => {
      actionOptions = options;
      return [
        { key: 'copy', label: '复制' },
        { key: 'reply', label: '回复' },
      ];
    },
    isThreadingEnabledForMessage: () => true,
    normalizeReactionEntries: value => value || [],
    createContextMenuReactionRow: payload => ({ kind: 'reaction-row', payload }),
    defaultReactionEmojis: ['👍'],
    isSelfReaction: () => false,
    createContextMenuActionButton: payload => {
      const node = { kind: 'button', payload };
      actionButtons.push(node);
      return node;
    },
    dispatchContextMenuAction: async payload => {
      dispatched.push(payload);
    },
    getPoint: () => ({ x: 12, y: 34 }),
    positionContextMenu: (menu, point) => { positioned = { menu, point }; },
    actionHandler: async () => true,
    clearLongPress() {},
    openCodeViewer() {},
    getBubbleCopyText() {},
    copyToClipboard() {},
    startInlineEdit() {},
    enterSelectionMode() {},
    successToast() {},
    warningToast() {},
    documentLike: {},
    windowLike: { innerWidth: 400 },
  });
  assert.equal(shown, true);
  assert.equal(contextMenu.innerHTML, '');
  assert.equal(appended.length, 3);
  assert.equal(appended[0].kind, 'reaction-row');
  assert.equal(actionButtons.length, 2);
  assert.equal(actionOptions.hasRpMessageActions, true);
  assert.equal(positioned.point.x, 12);

  await actionButtons[0].payload.onClick({ stopPropagation() {} });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].actionKey, 'copy');
  console.log('ok - showContextMenuCore builds reaction row action buttons and forwards dispatches');
}

{
  const actionButtons = [];
  const dispatched = [];
  const cleared = [];
  let rafHandler = null;
  const contextMenu = {
    style: { display: 'block' },
    innerHTML: '',
    appendChild(node) {
      actionButtons.push(node);
    },
  };
  showContextMenuCore({
    event: { target: {}, clientX: 0, clientY: 0 },
    message: { id: 'm-download', type: 'image' },
    contextMenu,
    resolveContextMenuContext: () => ({
      wrapper: { id: 'wrap' },
      message: { id: 'm-download', type: 'image' },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: () => ([
      { key: 'download', label: '下载' },
    ]),
    createContextMenuActionButton: payload => ({ payload }),
    dispatchContextMenuAction: async payload => {
      dispatched.push(payload);
    },
    getPoint: () => ({ x: 0, y: 0 }),
    positionContextMenu() {
      contextMenu.style.display = 'block';
    },
    clearLongPress: () => cleared.push('clear'),
    documentLike: {},
    windowLike: {
      requestAnimationFrame(handler) {
        rafHandler = handler;
      },
    },
  });
  assert.equal(actionButtons.length, 1);
  const clickPromise = actionButtons[0].payload.onClick({
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(contextMenu.style.display, 'none');
  assert.deepEqual(cleared, ['clear']);
  assert.equal(dispatched.length, 0);
  rafHandler();
  await clickPromise;
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].actionKey, 'download');
  assert.equal(contextMenu.style.display, 'none');
  console.log('ok - showContextMenuCore hides menu and yields a frame before dispatching slow actions');
}
