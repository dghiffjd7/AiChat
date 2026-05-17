import assert from 'node:assert/strict';

import {
  buildChatToMomentsMemoryShareContext,
  buildChatToRpMemoryShareContext,
  buildMomentsToChatMemoryShareContext,
  buildRpToMomentsMemoryShareContext,
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
  const template = {
    tables: [
      { id: 'moment_summary', name: '动态摘要' },
      { id: 'moment_outline', name: '动态大纲' },
      { id: 'character_profile', name: '私聊角色档案' },
      { id: 'relationship', name: '私聊关系记录' },
      { id: 'events', name: '私聊重要事件' },
      { id: 'items', name: '私聊重要物品' },
      { id: 'chat_summary', name: '私聊摘要' },
      { id: 'chat_outline', name: '私聊大纲' },
      { id: 'important_people', name: '群聊重要人物表' },
      { id: 'group_consensus', name: '群聊共识' },
      { id: 'group_summary', name: '群聊摘要' },
      { id: 'group_outline', name: '群聊大纲' },
      { id: 'rp_important_people', name: 'RP 重要人物表' },
      { id: 'rp_tasks', name: 'RP 任务' },
      { id: 'rp_summary', name: 'RP 摘要' },
      { id: 'rp_outline', name: 'RP 大纲' },
    ],
  };
  const momentsToChat = await buildMomentsToChatMemoryShareContext({
    resolveTemplateDefinition: async () => template,
    resolveTemplateId: async () => 'default-v1',
    loadGlobalRows: async () => [{ table_id: 'moment_summary' }, { table_id: 'moment_outline' }],
    getGlobalSettings: () => ({
      memoryBridgeMomentsToChatEnabled: true,
      memoryBridgeMomentsToChatLimit: 1,
    }),
  });
  assert.equal(momentsToChat.mode, 'moments_to_chat');
  assert.deepEqual(momentsToChat.entries.map(entry => [entry.tableId, entry.rowCount, entry.actualCount]), [
    ['moment_summary', 1, 1],
    ['moment_outline', 1, 1],
  ]);

  const chatToMoments = await buildChatToMomentsMemoryShareContext({
    resolveTemplateDefinition: async () => template,
    resolveTemplateId: async () => 'default-v1',
    listSocialSessions: () => ['chat:1', 'group:1'],
    loadRows: async (sourceId) => sourceId === 'chat:1'
      ? [
        { table_id: 'character_profile' },
        { table_id: 'relationship' },
        { table_id: 'events' },
        { table_id: 'items' },
        { table_id: 'chat_summary' },
      ]
      : [
        { table_id: 'important_people' },
        { table_id: 'group_consensus' },
        { table_id: 'group_outline' },
        { table_id: 'group_outline' },
      ],
    getGlobalSettings: () => ({
      memoryBridgeChatToMomentsEnabled: true,
      memoryBridgeChatToMomentsLimit: 1,
    }),
  });
  assert.equal(chatToMoments.mode, 'chat_to_moments');
  assert.deepEqual(chatToMoments.entries.map(entry => [entry.tableId, entry.rowCount, entry.actualCount]), [
    ['character_profile', 1, 1],
    ['relationship', 1, 1],
    ['events', 1, 1],
    ['items', 1, 1],
    ['chat_summary', 1, 1],
    ['chat_outline', 0, 0],
    ['important_people', 1, 1],
    ['group_consensus', 1, 1],
    ['group_summary', 0, 0],
    ['group_outline', 2, 1],
  ]);
  assert.equal(chatToMoments.tableSettings.character_profile.enabled, true);
  assert.equal(chatToMoments.tableSettings.relationship.enabled, true);
  assert.equal(chatToMoments.tableSettings.events.enabled, true);
  assert.equal(chatToMoments.tableSettings.items.enabled, false);
  assert.equal(chatToMoments.tableSettings.important_people.enabled, false);
  assert.equal(chatToMoments.tableSettings.group_consensus.enabled, false);

  const rpToMoments = await buildRpToMomentsMemoryShareContext({
    resolveTemplateDefinition: async () => template,
    resolveTemplateId: async () => 'default-v1',
    listRpSessions: () => ['rp:hero'],
    loadRows: async () => [
      { table_id: 'rp_important_people' },
      { table_id: 'rp_tasks' },
      { table_id: 'rp_outline' },
      { table_id: 'rp_outline' },
    ],
    getGlobalSettings: () => ({
      memoryBridgeRpToMomentsEnabled: true,
      memoryBridgeRpToMomentsLimit: 1,
    }),
  });
  assert.equal(rpToMoments.mode, 'rp_to_moments');
  assert.deepEqual(rpToMoments.entries.map(entry => [entry.tableId, entry.rowCount, entry.actualCount]), [
    ['rp_important_people', 1, 1],
    ['rp_tasks', 1, 1],
    ['rp_summary', 0, 0],
    ['rp_outline', 2, 1],
  ]);
  assert.equal(rpToMoments.tableSettings.rp_important_people.enabled, true);
  assert.equal(rpToMoments.tableSettings.rp_tasks.enabled, true);
  console.log('ok - dynamic memory-share contexts build cross-source table counts and limits');
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
