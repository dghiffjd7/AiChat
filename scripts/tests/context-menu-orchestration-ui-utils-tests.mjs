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
  const reactionToggles = [];
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
        classList: { contains: token => token === 'has-rp-message-actions' },
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
    toggleReaction: (nextMessage, emoji) => reactionToggles.push([nextMessage.id, emoji]),
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
  appended[0].payload.onToggle('👍');
  assert.deepEqual(reactionToggles, [['m1', '👍']]);

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

{
  const appended = [];
  const handled = [];
  const contextMenu = {
    style: { display: 'block' },
    innerHTML: '',
    appendChild(node) { appended.push(node); },
  };
  let speakRowPayload = null;
  showContextMenuCore({
    event: { target: {}, clientX: 5, clientY: 5 },
    message: { id: 'a1' },
    selectionMode: false,
    contextMenu,
    resolveContextMenuContext: () => ({
      wrapper: { id: 'wrap', classList: { contains: () => false } },
      message: { id: 'a1', role: 'assistant', meta: {} },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: () => [],
    isThreadingEnabledForMessage: () => false,
    createContextMenuSpeakRow: (payload) => {
      speakRowPayload = payload;
      return { kind: 'speak-row' };
    },
    resolveSpeakQuickVoices: () => [{ voiceRef: 'voice_a', label: 'A' }],
    createContextMenuActionButton: payload => ({ kind: 'button', payload }),
    getPoint: () => ({ x: 5, y: 5 }),
    positionContextMenu: () => {},
    actionHandler: async (key, message, payload) => { handled.push([key, message.id, payload]); },
    clearLongPress() {},
    documentLike: {},
    windowLike: {},
  });
  assert.equal(appended.some(node => node.kind === 'speak-row'), true, 'assistant 消息必须渲染朗读复合行');
  assert.deepEqual(speakRowPayload.quickVoices, [{ voiceRef: 'voice_a', label: 'A' }]);
  speakRowPayload.onSpeak(null);
  speakRowPayload.onSpeak('voice_a');
  speakRowPayload.onMore();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(handled.map(([key, id, payload]) => [key, id, payload?.voiceRefOverride ?? null]), [
    ['speak', 'a1', null],
    ['speak', 'a1', 'voice_a'],
    ['select-voice', 'a1', null],
  ]);
  console.log('ok - speak row dispatches default speak, quick override, and picker actions');
}

{
  const appended = [];
  const contextMenu = {
    style: { display: 'block' },
    innerHTML: '',
    appendChild(node) { appended.push(node); },
  };
  showContextMenuCore({
    event: { target: {}, clientX: 5, clientY: 5 },
    message: { id: 'u1' },
    selectionMode: false,
    contextMenu,
    resolveContextMenuContext: () => ({
      wrapper: { id: 'wrap', classList: { contains: () => false } },
      message: { id: 'u1', role: 'user', meta: {} },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: () => [],
    isThreadingEnabledForMessage: () => false,
    createContextMenuSpeakRow: () => ({ kind: 'speak-row' }),
    resolveSpeakQuickVoices: () => [],
    createContextMenuActionButton: payload => ({ kind: 'button', payload }),
    getPoint: () => ({ x: 5, y: 5 }),
    positionContextMenu: () => {},
    actionHandler: async () => {},
    clearLongPress() {},
    documentLike: {},
    windowLike: {},
  });
  assert.equal(appended.some(node => node.kind === 'speak-row'), false, '用户消息不渲染朗读行');
  console.log('ok - speak row is assistant-only');
}

{
  let speakRowPayload = null;
  showContextMenuCore({
    event: { target: {}, clientX: 5, clientY: 5 },
    message: { id: 'a2' },
    selectionMode: false,
    contextMenu: { style: { display: 'block' }, innerHTML: '', appendChild() {} },
    resolveContextMenuContext: () => ({
      wrapper: { id: 'wrap', classList: { contains: token => token === 'has-rp-message-actions' } },
      message: { id: 'a2', role: 'assistant', meta: {} },
      codeBlock: null,
      hasCode: false,
    }),
    buildContextMenuActions: () => [],
    isThreadingEnabledForMessage: () => false,
    createContextMenuSpeakRow: (payload) => { speakRowPayload = payload; return { kind: 'speak-row' }; },
    resolveSpeakQuickVoices: () => [],
    createContextMenuActionButton: payload => ({ kind: 'button', payload }),
    getPoint: () => ({ x: 5, y: 5 }),
    positionContextMenu: () => {},
    actionHandler: async () => {},
    clearLongPress() {},
    documentLike: {},
    windowLike: {},
  });
  assert.equal(speakRowPayload.showSpeakButton, false, '气泡自带朗读按钮时菜单行不得重复显示朗读');
  console.log('ok - speak row hides the duplicate speak button for bubbles with their own action bar');
}
