import assert from 'node:assert/strict';

import {
  createAppChatroomRuntime,
  formatWorldIndicatorLabel,
} from '../../src/scripts/ui/app-chatroom-runtime-utils.js';

{
  assert.equal(
    formatWorldIndicatorLabel({
      globalIds: ['g1', 'g2', 'g3'],
      roleIds: ['r1', 'r2', 'r3'],
      currentIds: ['c1'],
    }),
    '全局:g1 + g2 + ... / 角色:r1 + r2 + ... / 会话:c1',
  );
  assert.equal(formatWorldIndicatorLabel(), '未启用');
  console.log('ok - formatWorldIndicatorLabel composes world source labels and fallback text');
}

{
  const calls = [];
  const runtime = createAppChatroomRuntime({
    showWarning: (message) => calls.push(['warn', message]),
    isStickerAllowed: () => false,
    showInfo: (message) => calls.push(['info', message]),
    addMessage: (message) => calls.push(['add', message]),
    appendMessage: (message, sessionId) => calls.push(['append', sessionId, message]),
  });

  assert.equal(runtime.handleSticker('[bqb-hi]'), null);
  assert.equal(await runtime.handleDocumentFile(null), null);
  assert.deepEqual(calls, [
    ['info', '创意写作界面不支持贴图'],
    ['warn', '未选择文档'],
  ]);
  console.log('ok - createAppChatroomRuntime blocks stickers and warns on empty document input');
}

{
  const calls = [];
  const runtime = createAppChatroomRuntime({
    showInfo: (message) => calls.push(['info', message]),
    getCurrentSessionId: () => 'session-1',
    bumpStickerUsage: (tag) => calls.push(['bump', tag]),
    getActiveUserName: () => 'Alice',
    getUserAvatar: () => 'avatar-user',
    formatNowTime: () => '09:30',
    formatFileSize: (size) => `${size} B`,
    extractDocumentText: async () => ({
      text: '文档正文',
      truncated: true,
      supported: false,
    }),
    readFileAsBase64: async () => 'YmFzZTY0',
    saveAttachmentBytes: async (payload) => {
      calls.push(['save-bytes', payload]);
      return { path: '/tmp/doc.txt', bytes: 7 };
    },
    addMessage: (message) => calls.push(['add', message]),
    appendMessage: (message, sessionId) => calls.push(['append', sessionId, message]),
    addComposerAttachment: (attachment) => calls.push(['attach', attachment]),
    getBridge: () => ({
      globalWorldId: 'global-world',
      globalWorldIds: ['global-world', 'global-extra'],
      getRoleWorldIds: () => ['role-a', 'role-b'],
      currentWorldIds: ['scene-a', 'scene-b', 'scene-c'],
    }),
    setWorldIndicatorName: (label) => calls.push(['world', label]),
  });

  const sticker = runtime.handleSticker('[bqb-hi]');
  assert.equal(sticker.type, 'sticker');
  assert.deepEqual(calls.slice(0, 3), [
    ['bump', '[bqb-hi]'],
    ['add', sticker],
    ['append', 'session-1', sticker],
  ]);

  const attachment = runtime.handleImage(' https://example.com/a.jpg ', ' cover ');
  assert.deepEqual(attachment, {
    kind: 'image',
    url: 'https://example.com/a.jpg',
    name: 'cover',
  });
  assert.deepEqual(calls[3], ['attach', attachment]);
  assert.equal(runtime.handleImage('   '), null);

  const music = runtime.handleMusicFile('data:audio/mp3;base64,abc', 'song.mp3');
  assert.equal(music.type, 'music');
  assert.equal(music.meta.url, 'data:audio/mp3;base64,abc');
  assert.deepEqual(calls.slice(4, 6), [
    ['add', music],
    ['append', 'session-1', music],
  ]);

  const documentAttachment = await runtime.handleDocumentFile({
    name: 'notes.txt',
    type: 'text/plain',
    size: 7,
  });
  assert.deepEqual(documentAttachment, {
    kind: 'document',
    name: 'notes.txt',
    mime: 'text/plain',
    size: 7,
    sizeLabel: '7 B',
    text: '文档正文',
    textTruncated: true,
    localPath: '/tmp/doc.txt',
    localBytes: 7,
    originalName: 'notes.txt',
  });
  assert.deepEqual(calls[6], ['info', '该文件类型暂不支持解析，将仅发送文件信息']);
  assert.deepEqual(calls[7], ['save-bytes', {
    sessionId: 'session-1',
    base64: 'YmFzZTY0',
    fileName: 'notes.txt',
  }]);
  assert.deepEqual(calls[8], ['attach', documentAttachment]);

  const label = runtime.updateWorldIndicator();
  assert.equal(label, '全局:global-world + global-extra / 角色:role-a + role-b / 会话:scene-a + scene-b + ...');
  assert.deepEqual(calls[9], ['world', label]);
  console.log('ok - createAppChatroomRuntime handles sticker/image/music/document input and updates world indicator labels');
}
