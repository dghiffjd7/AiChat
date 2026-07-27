import assert from 'node:assert/strict';

import {
  createPendingUserMessage,
  getMessageSendText,
  restorePendingQueueToHistory,
  resolvePendingMessagesToSend,
} from '../../src/scripts/ui/chat/pending-message-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('createPendingUserMessage keeps sticker raw text and reply target metadata', () => {
  const replyTarget = { messageId: 'assistant-1' };
  const message = createPendingUserMessage({
    text: '/贴纸 开心',
    stickerKey: '开心',
    avatar: 'user.png',
    userName: ' 小明 ',
    time: '10:00',
    replyTarget,
  });

  assert.deepEqual(message, {
    role: 'user',
    type: 'sticker',
    content: '开心',
    raw: '/贴纸 开心',
    rawInput: '/贴纸 开心',
    status: 'pending',
    avatar: 'user.png',
    name: '小明',
    time: '10:00',
    meta: {
      replyTo: replyTarget,
    },
  });
});

test('createPendingUserMessage falls back to attachment placeholder and marks attachment-only messages', () => {
  const message = createPendingUserMessage({
    text: '',
    stickerKey: '',
    fallbackContent: '',
    attachmentsOnly: true,
    userName: '',
  });

  assert.deepEqual(message, {
    role: 'user',
    type: 'text',
    content: '[附件]',
    raw: undefined,
    rawInput: '',
    status: 'pending',
    avatar: '',
    name: '我',
    time: '',
    meta: {
      attachmentsOnly: true,
    },
  });
});

test('resolvePendingMessagesToSend returns the whole queue without a target id', () => {
  const pendingMessages = [{ id: 'm1' }, { id: 'm2' }];
  const result = resolvePendingMessagesToSend({ pendingMessages });

  assert.deepEqual(result, {
    messagesToSend: pendingMessages,
    errorMessage: '',
  });
  assert.notEqual(result.messagesToSend, pendingMessages);
});

test('resolvePendingMessagesToSend slices from the queue start to the clicked target', () => {
  const pendingMessages = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  const result = resolvePendingMessagesToSend({
    pendingMessages,
    targetMessageId: 'm2',
  });

  assert.deepEqual(result, {
    messagesToSend: [{ id: 'm1' }, { id: 'm2' }],
    errorMessage: '',
  });
});

test('resolvePendingMessagesToSend reports a missing target message', () => {
  const result = resolvePendingMessagesToSend({
    pendingMessages: [{ id: 'm1' }],
    targetMessageId: 'missing',
  });

  assert.deepEqual(result, {
    messagesToSend: [],
    errorMessage: '未找到指定消息',
  });
});

test('restorePendingQueueToHistory appends missing queued messages before removing queue entries', () => {
  const calls = [];
  const pendingQueue = [
    { id: 'existing', content: 'already in history' },
    { id: 'p1', content: 'queued-1', status: 'queued' },
    { id: '', content: 'no id' },
    { id: 'p2', content: 'queued-2' },
  ];

  const restored = restorePendingQueueToHistory({
    pendingQueue,
    existingMessages: [{ id: 'existing' }],
    sessionId: 'session-a',
    appendMessage(message, sessionId) {
      calls.push(['append', sessionId, message]);
      return { ...message, saved: true };
    },
    addMessageToUi(message) {
      calls.push(['ui', message.id]);
    },
    removePendingMessage(messageId, sessionId) {
      calls.push(['remove', sessionId, messageId]);
    },
  });

  assert.deepEqual(restored, [
    { id: 'p1', content: 'queued-1', status: 'pending', saved: true },
    { id: 'p2', content: 'queued-2', status: 'pending', saved: true },
  ]);
  assert.deepEqual(calls, [
    ['append', 'session-a', { id: 'p1', content: 'queued-1', status: 'pending' }],
    ['ui', 'p1'],
    ['append', 'session-a', { id: 'p2', content: 'queued-2', status: 'pending' }],
    ['ui', 'p2'],
    ['remove', 'session-a', 'existing'],
    ['remove', 'session-a', 'p1'],
    ['remove', 'session-a', ''],
    ['remove', 'session-a', 'p2'],
  ]);
});

test('restorePendingQueueToHistory safely ignores empty queue input', () => {
  const restored = restorePendingQueueToHistory({
    pendingQueue: null,
    appendMessage() {
      throw new Error('should not append');
    },
  });

  assert.deepEqual(restored, []);
});

test('getMessageSendText prioritizes raw text, attachments-only guard, and sticker token rendering', () => {
  const buildStickerToken = value => `[贴纸:${value}]`;

  assert.equal(
    getMessageSendText(
      {
        type: 'text',
        raw: '  原始内容  ',
        content: '不会使用',
      },
      buildStickerToken,
    ),
    '原始内容',
  );
  assert.equal(
    getMessageSendText(
      {
        type: 'text',
        content: '[图片]',
        meta: { attachmentsOnly: true },
      },
      buildStickerToken,
    ),
    '',
  );
  assert.equal(
    getMessageSendText(
      {
        type: 'sticker',
        content: '开心',
      },
      buildStickerToken,
    ),
    '[贴纸:开心]',
  );
});

test('getMessageSendText preserves media placeholders and document labels', () => {
  assert.equal(getMessageSendText({ type: 'image' }), '[图片]');
  assert.equal(getMessageSendText({ type: 'audio' }), '[语音]');
  assert.equal(getMessageSendText({ type: 'document', content: '资料.pdf' }), '[文件] 资料.pdf');
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
