import assert from 'node:assert/strict';

import {
  loadConversationExportMessages,
  runSessionConversationExportFlow,
} from '../../src/scripts/ui/session-conversation-export-utils.js';

{
  const calls = [];
  const messages = await loadConversationExportMessages({
    sessionId: 's1',
    current: true,
    chatStore: {
      getCurrentArchiveId: () => 'a-current',
      exportThreadMessages: async (sid, aid) => {
        calls.push(['export', sid, aid]);
        return [];
      },
      getMessages: () => [{ id: 'visible', role: 'user', content: 'fallback' }],
      prefetchRawOriginalsForMessages: async list => calls.push(['prefetch', list.length]),
    },
  });
  assert.deepEqual(calls, [['export', 's1', 'a-current'], ['prefetch', 1]]);
  assert.equal(messages[0].content, 'fallback');
  console.log('ok - loadConversationExportMessages falls back to visible current messages');
}

{
  const calls = [];
  const ok = await runSessionConversationExportFlow({
    sessionId: 's1',
    archive: { id: 'a1', name: '旧档' },
    chatStore: {
      exportThreadMessages: async (sid, aid) => {
        calls.push(['export', sid, aid]);
        return [{ role: 'assistant', content: '正文', rawOriginal: '完整' }];
      },
      prefetchRawOriginalsForMessages: async list => calls.push(['prefetch', list.length]),
    },
    appChoiceFn: async options => {
      calls.push(['choice', options.defaultActionId, options.actions.length]);
      return 'txt-full';
    },
    exportTextFile: async ({ text, filename, format, onSuccess }) => {
      calls.push(['file', format, filename, /完整/.test(text)]);
      onSuccess?.('done');
      return true;
    },
    now: () => new Date('2026-06-13T01:02:03'),
    toastSuccess: text => calls.push(['success', text]),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls[0], ['choice', 'md-body', 4]);
  assert.deepEqual(calls[1], ['export', 's1', 'a1']);
  assert.deepEqual(calls[2], ['prefetch', 1]);
  assert.equal(calls[3][0], 'file');
  assert.equal(calls[3][1], 'txt');
  assert.equal(calls[3][3], true);
  assert.deepEqual(calls[4], ['success', 'done']);
  console.log('ok - runSessionConversationExportFlow exports selected archive with chosen mode');
}
