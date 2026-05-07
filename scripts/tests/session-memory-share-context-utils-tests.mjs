import assert from 'node:assert/strict';

import {
  buildChatToRpMemoryShareContext,
  buildRpToChatMemoryShareContext,
  listSocialSessionIds,
  loadMemoryShareRows,
  resolveDefaultRpBridgeSourceId,
  resolveRpDisplayName,
  resolveSessionDisplayName,
} from '../../src/scripts/ui/session-memory-share-context-utils.js';

{
  const display = resolveRpDisplayName({
    sessionId: 'rp:hero',
    getRpCharacterNameForSession: () => '',
    getContact: () => ({ name: '测试角色' }),
  });
  assert.equal(display, '测试角色');
  console.log('ok - resolveRpDisplayName prefers saved non-rp contact name when bridge name is absent');
}

{
  const display = resolveSessionDisplayName({
    sessionId: 'chat:1',
    getContact: () => ({ name: '联系人A' }),
    getRpDisplayName: () => '角色A',
  });
  assert.equal(display, '联系人A');
  assert.deepEqual(listSocialSessionIds({
    listSessions: () => ['chat:1', 'rp:hero', 'group:1', '', ' chat:2 '],
  }), ['chat:1', 'group:1', 'chat:2']);
  console.log('ok - resolveSessionDisplayName and listSocialSessionIds normalize session labels and exclude rp sessions');
}

{
  const sourceId = resolveDefaultRpBridgeSourceId({
    sessionId: 'chat:1',
    getRpSessionIdForSession: () => '',
    getRpSessionIdForActivePersona: () => 'rp:active',
  });
  assert.equal(sourceId, 'rp:active');
  console.log('ok - resolveDefaultRpBridgeSourceId falls back to active persona rp session');
}

{
  const rows = await loadMemoryShareRows({
    memoryTableStore: {
      async getMemories() {
        return [
          { id: '1', is_active: true },
          { id: '2', is_active: false },
          { id: '3' },
        ];
      },
    },
    sourceId: 'group:1',
    templateId: 'default-v1',
    sourceIsGroup: true,
  });
  assert.deepEqual(rows.map((row) => row.id), ['1', '3']);
  console.log('ok - loadMemoryShareRows filters inactive rows and supports group scope');
}

{
  const context = await buildChatToRpMemoryShareContext({
    sessionId: 'rp:hero',
    rawSourceId: '',
    resolveTemplateDefinition: async () => ({
      tables: [
        { id: 'chat_summary', name: '私聊总结' },
        { id: 'group_summary', name: '群聊总结' },
      ],
    }),
    resolveTemplateId: async () => 'default-v1',
    getSessionSettings: () => ({}),
    listSocialSessions: () => ['chat:1', 'group:1'],
    loadRows: async (sourceId) => sourceId === 'chat:1'
      ? [{ table_id: 'chat_summary' }, { table_id: 'chat_summary' }]
      : [{ table_id: 'group_summary' }],
    getSessionDisplayName: (sid) => ({ 'chat:1': '私聊A', 'group:1': '群聊A' }[sid] || sid),
    fallbackEnabled: true,
  });
  assert.equal(context.mode, 'chat_to_rp');
  assert.equal(context.sourceMode, 'all_social');
  assert.equal(context.summarySourceText, '来源：所有聊天室（默认）');
  assert.deepEqual(
    context.entries.map((entry) => [entry.tableId, entry.shortLabel, entry.rowCount]),
    [
      ['chat_summary', '私聊总结', 2],
      ['group_summary', '群聊总结', 1],
    ],
  );
  console.log('ok - buildChatToRpMemoryShareContext builds social-source table counts and labels');
}

{
  const context = await buildRpToChatMemoryShareContext({
    sessionId: 'chat:1',
    resolveTemplateDefinition: async () => ({
      tables: [
        { id: 'rp_summary', name: '角色总结' },
        { id: 'rp_outline', name: '角色大纲' },
      ],
    }),
    resolveTemplateId: async () => 'default-v1',
    getSessionSettings: () => ({}),
    getDefaultSourceId: () => 'rp:hero',
    getRpDisplayName: () => '角色A',
    loadRows: async () => [{ table_id: 'rp_summary' }, { table_id: 'rp_summary' }, { table_id: 'rp_outline' }],
    fallbackEnabled: true,
    fallbackLimit: 2,
  });
  assert.equal(context.mode, 'rp_to_chat');
  assert.equal(context.sourceLabel, '角色A');
  assert.equal(context.summarySourceText, '来源：角色A');
  assert.deepEqual(
    context.entries.map((entry) => [entry.tableId, entry.rowCount, entry.actualCount]),
    [
      ['rp_summary', 2, 2],
      ['rp_outline', 1, 1],
    ],
  );
  console.log('ok - buildRpToChatMemoryShareContext builds rp-source table counts and source labels');
}
