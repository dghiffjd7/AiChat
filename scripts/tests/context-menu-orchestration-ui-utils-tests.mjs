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
      wrapper: { id: 'wrap' },
      message: { id: 'm1', meta: { reactions: [] } },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: () => ([
      { key: 'copy', label: '复制' },
      { key: 'reply', label: '回复' },
    ]),
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
  assert.equal(positioned.point.x, 12);

  await actionButtons[0].payload.onClick({ stopPropagation() {} });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].actionKey, 'copy');
  console.log('ok - showContextMenuCore builds reaction row action buttons and forwards dispatches');
}
