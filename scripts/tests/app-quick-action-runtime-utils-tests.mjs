import assert from 'node:assert/strict';

import {
  bindQuickActionButtons,
  createQuickActionRuntime,
  openSessionRawReplyFlow,
} from '../../src/scripts/ui/app-quick-action-runtime-utils.js';

{
  const warnings = [];
  const shown = [];
  const ok = openSessionRawReplyFlow({
    sessionId: 'contact:1',
    getContact: () => ({ name: '好友甲' }),
    getLastRawResponse: () => '',
    getLastRawAt: () => '',
    showRawReplyModal: (...args) => shown.push(args),
    notifyWarning: (message) => warnings.push(message),
  });
  assert.equal(ok, false);
  assert.deepEqual(warnings, ['暂无原始回复记录（请先让 AI 回复一次）']);
  assert.deepEqual(shown, []);
  console.log('ok - openSessionRawReplyFlow warns when no raw reply exists');
}

{
  const shown = [];
  const ok = openSessionRawReplyFlow({
    sessionId: 'contact:2',
    getContact: () => ({ name: '好友乙' }),
    getLastRawResponse: () => 'raw-text',
    getLastRawAt: () => '2026-05-07T08:09:10.000Z',
    getRepairDetails: (sessionId) => ({ runId: `run:${sessionId}` }),
    showRawReplyModal: (...args) => shown.push(args),
    notifyWarning: () => {},
  });
  assert.equal(ok, true);
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], 'raw-text');
  assert.equal(shown[0][1].includes('好友乙'), true);
  assert.deepEqual(shown[0][2], { runId: 'run:contact:2' });
  console.log('ok - openSessionRawReplyFlow opens modal with session label and timestamp meta');
}

{
  const calls = [];
  const prompts = ['歌名A', '歌手B', 'https://audio.test/a.mp3'];
  const runtime = createQuickActionRuntime({
    mediaPicker: {
      pickFile: async (kind) => calls.push(['pick', kind]),
    },
    appConfirm: async () => false,
    promptFn: () => prompts.shift(),
    addMessage: (msg) => calls.push(['add', msg]),
    appendMessage: (msg) => calls.push(['append', msg]),
    getActiveUserName: () => '我',
    getActiveUserAvatar: () => 'avatar:user',
    formatNowTime: () => '10:00',
    setStickerPanelOpen: (value) => calls.push(['sticker-open', value]),
    isStickerAllowed: () => false,
    setActionPanelOpen: (value) => calls.push(['action-open', value]),
    generateImage: async () => calls.push(['generate-image']),
    notifyInfo: (message) => calls.push(['info', message]),
  });

  runtime.runQuickAction('generate-image');
  runtime.runQuickAction('music');
  runtime.runQuickAction('sticker');
  runtime.runQuickAction('unknown');

  await Promise.resolve();

  assert.deepEqual(calls, [
    ['action-open', false],
    ['generate-image'],
    ['action-open', false],
    ['action-open', false],
    ['info', '创意写作界面不支持贴图'],
    ['info', '快捷操作占位：unknown'],
    ['add', {
      role: 'user',
      type: 'music',
      content: '歌名A',
      meta: { artist: '歌手B', url: 'https://audio.test/a.mp3' },
      name: '我',
      avatar: 'avatar:user',
      time: '10:00',
    }],
    ['append', {
      role: 'user',
      type: 'music',
      content: '歌名A',
      meta: { artist: '歌手B', url: 'https://audio.test/a.mp3' },
      name: '我',
      avatar: 'avatar:user',
      time: '10:00',
    }],
  ]);
  console.log('ok - createQuickActionRuntime routes music sticker and unknown quick actions');
}

{
  const listeners = [];
  const createButton = (action = '') => ({
    dataset: { action },
    addEventListener(type, handler) {
      listeners.push([type, action, handler]);
    },
  });
  const actionButtons = [createButton('image'), createButton('document')];
  const stickerBtn = createButton('sticker-button');
  const actionChips = [createButton('transfer')];
  const calls = [];
  bindQuickActionButtons({
    actionButtons,
    chatStickerBtn: stickerBtn,
    actionChips,
    runQuickAction: (action) => calls.push(action),
  });

  listeners[0][2]();
  listeners[1][2]();
  listeners[2][2]();
  listeners[3][2]();

  assert.deepEqual(calls, ['image', 'document', 'sticker', 'transfer']);
  console.log('ok - bindQuickActionButtons routes action buttons sticker shortcut and action chips');
}
