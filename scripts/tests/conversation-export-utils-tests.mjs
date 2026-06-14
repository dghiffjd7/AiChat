import assert from 'node:assert/strict';

import {
  buildConversationExportFilename,
  exportConversationTextFile,
  formatConversationExport,
  getConversationMessageText,
  getConversationReasoningText,
  resolveConversationExportMessage,
} from '../../src/scripts/ui/chat/conversation-export-utils.js';

{
  const message = {
    role: 'assistant',
    content: 'display text',
    rawOriginal: '<think>raw thought</think>\nraw body',
    meta: { reasoningDisplay: 'visible thought' },
  };
  assert.equal(getConversationMessageText(message, { mode: 'body' }), 'display text');
  assert.equal(getConversationMessageText(message, { mode: 'full' }), '<think>raw thought</think>\nraw body');
  assert.equal(getConversationReasoningText(message), 'visible thought');
  console.log('ok - conversation export picks display body and full raw assistant text');
}

{
  const message = {
    role: 'assistant',
    content: 'first',
    rawOriginal: 'first raw original',
    meta: {
      reasoningDisplay: 'first reasoning',
      activeSwipe: 1,
      swipes: [
        { content: 'first', raw: 'first raw', reasoningDisplay: 'first branch reasoning' },
        { content: 'second', raw: 'second raw' },
      ],
    },
  };
  const resolved = resolveConversationExportMessage(message);
  assert.equal(resolved.content, 'second');
  assert.equal(resolved.raw, 'second raw');
  assert.equal(resolved.rawOriginal, undefined);
  assert.equal(getConversationReasoningText(resolved), '');
  console.log('ok - conversation export does not leak first swipe reasoning into later swipes');
}

{
  const text = formatConversationExport({
    title: '测试聊天',
    sourceLabel: '当前聊天',
    mode: 'full',
    format: 'md',
    exportedAt: new Date('2026-06-13T12:00:00Z'),
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '显示', rawOriginal: '原文', meta: { reasoningDisplay: '推理' } },
    ],
  });
  assert.match(text, /^# 测试聊天/);
  assert.match(text, /导出模式：完整/);
  assert.match(text, /\*\*请求推理\*\*/);
  assert.match(text, /原文/);
  console.log('ok - formatConversationExport builds readable markdown with reasoning section');
}

{
  const filename = buildConversationExportFilename({
    title: '角色/聊天室:*?',
    mode: 'body',
    format: 'txt',
    now: new Date('2026-06-13T01:02:03'),
  });
  assert.match(filename, /^角色_聊天室_-body-\d{14}\.txt$/);
  console.log('ok - buildConversationExportFilename sanitizes names and appends format extension');
}

{
  const calls = [];
  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      return node;
    },
  };
  const link = {
    style: {},
    click() {
      calls.push(['click', this.download]);
    },
    remove() {
      calls.push(['remove']);
    },
  };
  const saved = await exportConversationTextFile({
    text: 'hello',
    filename: 'chat.md',
    format: 'md',
    globalRef: {},
    documentRef: {
      body,
      createElement: () => link,
    },
    BlobRef: class BlobMock {
      constructor(parts, options) {
        calls.push(['blob', parts, options]);
      }
    },
    URLRef: {
      createObjectURL: () => 'blob://1',
      revokeObjectURL: url => calls.push(['revoke', url]),
    },
    onSuccess: text => calls.push(['success', text]),
  });
  assert.equal(saved, true);
  assert.deepEqual(calls[0], ['blob', ['hello'], { type: 'text/markdown;charset=utf-8' }]);
  assert.deepEqual(calls[1], ['click', 'chat.md']);
  assert.equal(calls.at(-1)[0], 'success');
  console.log('ok - exportConversationTextFile downloads markdown in browser mode');
}
