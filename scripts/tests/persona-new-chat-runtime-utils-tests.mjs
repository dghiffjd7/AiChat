import assert from 'node:assert/strict';

import {
  applyPersonaGlobalMemorySnapshot,
  buildPersonaGlobalMemorySnapshot,
  clearPersonaGlobalMemoriesForNewChat,
  collectPersonaNewChatTargets,
  restorePersonaRoleArchive,
  runPersonaNewChatFlow,
} from '../../src/scripts/ui/persona-new-chat-runtime-utils.js';

{
  const targets = collectPersonaNewChatTargets({
    chatStore: {
      listSessions: () => ['contact:a', 'group:g', 'rp:persona_a'],
      hasSession: id => ['contact:a', 'group:g', 'rp:persona_a'].includes(id),
    },
    contactsStore: {
      listContacts: () => [
        { id: 'contact:a', name: 'A' },
        { id: 'contact:b', name: 'B' },
        { id: 'group:g', name: 'G', isGroup: true },
      ],
      getContact: id => ({ 'group:g': { isGroup: true } }[id] || null),
    },
    rpSessionId: 'rp:persona_a',
  });
  assert.deepEqual(
    targets.map(item => ({
      sessionId: item.sessionId,
      isGroup: item.isGroup,
      sessionMode: item.sessionMode,
      hasSession: item.hasSession,
    })),
    [
      { sessionId: 'rp:persona_a', isGroup: false, sessionMode: 'rp', hasSession: true },
      { sessionId: 'contact:a', isGroup: false, sessionMode: 'chat', hasSession: true },
      { sessionId: 'group:g', isGroup: true, sessionMode: 'chat', hasSession: true },
      { sessionId: 'contact:b', isGroup: false, sessionMode: 'chat', hasSession: false },
    ],
  );
  console.log('ok - collectPersonaNewChatTargets includes scoped chat contact group rp and memory-only contacts');
}

{
  const deleted = [];
  const events = [];
  const result = await clearPersonaGlobalMemoriesForNewChat({
    keepNonSummary: true,
    memoryTableStore: {
      getMemories: async query => {
        assert.deepEqual(query, { scope: 'global', template_id: 'default-v1' });
        return [
          { id: 'g1', table_id: 'chat_summary' },
          { id: 'g2', table_id: 'moment_outline' },
          { id: 'g3', table_id: 'facts' },
        ];
      },
      batchDeleteMemories: async ids => deleted.push(...ids),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    notifyRowsUpdated: detail => events.push(detail),
  });
  assert.equal(result, true);
  assert.deepEqual(deleted, ['g1', 'g2']);
  assert.deepEqual(events, [{ sessionId: 'moments', templateId: 'default-v1' }]);
  console.log('ok - clearPersonaGlobalMemoriesForNewChat keeps non-summary global tables when requested');
}

{
  const calls = [];
  const rows = [
    { id: 'c-summary', scope: 'contact', contact_id: 'contact:a', table_id: 'chat_summary' },
    { id: 'c-fact', scope: 'contact', contact_id: 'contact:a', table_id: 'facts' },
    { id: 'b-summary', scope: 'contact', contact_id: 'contact:b', table_id: 'chat_summary' },
    { id: 'g-summary', scope: 'group', group_id: 'group:g', table_id: 'group_summary' },
    { id: 'rp-summary', scope: 'contact', contact_id: 'rp:persona_a', table_id: 'rp_summary' },
    { id: 'global-moment', scope: 'global', table_id: 'moment_summary' },
    { id: 'global-fact', scope: 'global', table_id: 'facts' },
  ];
  const memoryTableStore = {
    getMemories: async (query) => {
      calls.push(['getMemories', query]);
      return rows.filter((row) => {
        if (query.scope && row.scope !== query.scope) return false;
        if (query.contact_id && row.contact_id !== query.contact_id) return false;
        if (query.group_id && row.group_id !== query.group_id) return false;
        return true;
      });
    },
    batchDeleteMemories: async ids => calls.push(['delete', ids]),
  };
  const momentsState = [{ id: 'm1' }, { id: 'm2' }];
  const result = await runPersonaNewChatFlow({
    personaId: 'persona_a',
    personaName: 'A',
    rpSessionId: 'rp:persona_a',
    chatStore: {
      listSessions: () => ['contact:a', 'group:g', 'rp:persona_a'],
      hasSession: id => ['contact:a', 'group:g', 'rp:persona_a'].includes(id),
      startNewChat: (sessionId, archiveName, options) => {
        calls.push(['start', sessionId, archiveName, options]);
        return `arc:${sessionId}`;
      },
    },
    contactsStore: {
      listContacts: () => [
        { id: 'contact:a' },
        { id: 'contact:b' },
        { id: 'group:g', isGroup: true },
      ],
      getContact: id => ({ 'group:g': { isGroup: true } }[id] || null),
    },
    momentsStore: {
      list: () => momentsState,
      clearAll: () => calls.push(['clearMoments']),
      flush: async () => calls.push(['flushMoments']),
    },
    momentSummaryStore: {
      clearSummaries: () => calls.push(['clearMomentSummaries']),
      clearCompactedSummary: () => calls.push(['clearMomentCompacted']),
    },
    memoryTableStore,
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    getMemoryStorageMode: place => (['chat', 'rp', 'moments'].includes(place) ? 'table' : 'off'),
    askMemoryTableNewChatMode: async () => {
      calls.push(['askMemory']);
      return 'keep';
    },
    promptForArchiveName: async () => {
      calls.push(['promptArchive']);
      return 'Role Reset';
    },
    buildMemoryTableSnapshot: async ({ sessionId, isGroup }) => {
      calls.push(['snapshot', sessionId, isGroup]);
      return { sessionId, isGroup };
    },
    captureArchivePointer: async (sessionId, options) => {
      calls.push(['capture', sessionId, options.source]);
      return { sessionId };
    },
    persistArchivePointer: async (sessionId, archiveId, pointer, options) =>
      calls.push(['persist', sessionId, archiveId, pointer, options.source]),
    restoreMemoryForActiveThread: async (sessionId, options) => calls.push(['restore', sessionId, options.source]),
    notifyRowsUpdated: detail => calls.push(['notify', detail]),
    clearMemoryOnlyTargets: true,
    clearMoments: true,
    clearGlobalMemories: true,
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
  });

  assert.equal(result.started, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.startedSessions, 3);
  assert.equal(result.memoryOnlyTargets, 1);
  assert.equal(result.skippedMemoryOnlyTargets, 0);
  assert.equal(result.clearedMoments, 2);
  assert.equal(result.keepNonSummary, true);
  assert.deepEqual(result.archiveIdMap, {
    'rp:persona_a': 'arc:rp:persona_a',
    'contact:a': 'arc:contact:a',
    'group:g': 'arc:group:g',
  });
  assert.deepEqual(
    calls.filter(item => item[0] === 'askMemory'),
    [['askMemory']],
  );
  assert.deepEqual(
    calls.filter(item => item[0] === 'promptArchive'),
    [['promptArchive']],
  );
  assert.deepEqual(
    calls.filter(item => item[0] === 'delete').map(item => item[1]),
    [
      ['rp-summary'],
      ['c-summary'],
      ['g-summary'],
      ['b-summary'],
      ['global-moment'],
    ],
  );
  assert.deepEqual(
    calls.filter(item => item[0] === 'start').map(item => [item[1], item[2]]),
    [
      ['rp:persona_a', 'Role Reset'],
      ['contact:a', 'Role Reset'],
      ['group:g', 'Role Reset'],
    ],
  );
  assert.ok(calls.some(item => item[0] === 'clearMoments'));
  assert.ok(calls.some(item => item[0] === 'clearMomentSummaries'));
  console.log('ok - runPersonaNewChatFlow resets scoped sessions memory-only contacts moments and global summary rows');
}

{
  const calls = [];
  let roleArchivePayload = null;
  const rows = [
    { id: 'b-summary', scope: 'contact', contact_id: 'contact:b', table_id: 'chat_summary' },
    { id: 'global-moment', scope: 'global', table_id: 'moment_summary' },
  ];
  const result = await runPersonaNewChatFlow({
    personaId: 'persona_pack',
    personaName: 'Pack',
    rpSessionId: 'rp:persona_pack',
    chatStore: {
      listSessions: () => ['rp:persona_pack', 'contact:a'],
      hasSession: id => ['rp:persona_pack', 'contact:a'].includes(id),
      startNewChat: (sessionId) => `arc:${sessionId}`,
    },
    contactsStore: {
      listContacts: () => [{ id: 'contact:b' }],
      getContact: () => null,
    },
    momentsStore: {
      exportState: () => ({ moments: [{ id: 'moment-1', content: '动态' }] }),
      list: () => [{ id: 'moment-1' }],
      clearAll: () => calls.push(['clearMoments']),
      flush: async () => calls.push(['flushMoments']),
    },
    momentSummaryStore: {
      exportState: () => ({ summaries: [{ at: 1, text: '摘要' }], compactedSummary: { at: 2, text: '总', raw: 'raw' } }),
      clearSummaries: () => calls.push(['clearMomentSummaries']),
      clearCompactedSummary: () => calls.push(['clearMomentCompacted']),
    },
    memoryTableStore: {
      getMemories: async (query) => rows.filter((row) => {
        if (query.scope && row.scope !== query.scope) return false;
        if (query.contact_id && row.contact_id !== query.contact_id) return false;
        return true;
      }),
      batchDeleteMemories: async ids => calls.push(['delete', ids]),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'clear',
    promptForArchiveName: async () => 'Role Pack',
    buildMemoryTableSnapshot: async ({ sessionId }) => ({ templateId: 'default-v1', rows: [{ id: `snap:${sessionId}`, table_id: 'chat_summary' }] }),
    createRoleArchive: async (payload) => {
      roleArchivePayload = payload;
      return { id: 'role-archive-1', ...payload };
    },
    requireRoleArchiveForExtras: true,
    clearMemoryOnlyTargets: true,
    clearMoments: true,
    clearGlobalMemories: true,
  });
  assert.equal(result.started, true);
  assert.equal(result.roleArchive.id, 'role-archive-1');
  assert.deepEqual(
    roleArchivePayload.sessionArchives.map(item => [item.sessionId, item.archiveId, item.sessionMode]),
    [
      ['rp:persona_pack', 'arc:rp:persona_pack', 'rp'],
      ['contact:a', 'arc:contact:a', 'chat'],
    ],
  );
  assert.deepEqual(roleArchivePayload.momentsSnapshot, { moments: [{ id: 'moment-1', content: '动态' }] });
  assert.deepEqual(roleArchivePayload.momentSummarySnapshot.summaries, [{ at: 1, text: '摘要' }]);
  assert.deepEqual(roleArchivePayload.memoryOnlySnapshots.map(item => item.sessionId), ['contact:b']);
  assert.deepEqual(roleArchivePayload.globalMemorySnapshot.rows.map(row => row.id), ['global-moment']);
  assert.ok(calls.some(item => item[0] === 'clearMoments'));
  assert.deepEqual(calls.filter(item => item[0] === 'delete').map(item => item[1]), [
    ['b-summary'],
    ['global-moment'],
  ]);
  console.log('ok - runPersonaNewChatFlow packs role archive snapshots before clearing moments and memory-only/global rows');
}

{
  const calls = [];
  const archive = {
    id: 'role-archive-1',
    sessionArchives: [
      { sessionId: 'rp:persona_pack', archiveId: 'arc:rp:persona_pack', sessionMode: 'rp', isGroup: false },
      { sessionId: 'contact:a', archiveId: 'arc:contact:a', sessionMode: 'chat', isGroup: false },
    ],
    memoryOnlySnapshots: [
      { sessionId: 'contact:b', isGroup: false, sessionMode: 'chat', snapshot: { templateId: 'default-v1', rows: [{ id: 'b', table_id: 'chat_summary' }] } },
    ],
    globalMemorySnapshot: { templateId: 'default-v1', rows: [{ id: 'g', table_id: 'moment_summary' }] },
    momentsSnapshot: { moments: [{ id: 'moment-1' }] },
    momentSummarySnapshot: { summaries: [{ at: 1, text: '摘要' }] },
  };
  const result = await restorePersonaRoleArchive({
    archive,
    chatStore: {
      getArchives: sessionId => [{ id: `arc:${sessionId}`, memoryTableSnapshot: { rows: [{ id: `row:${sessionId}` }] } }],
    },
    getMemoryStorageMode: place => (place === 'rp' || place === 'chat' ? 'table' : 'off'),
    buildMemoryTableSnapshot: async payload => {
      calls.push(['snapshot', payload]);
      return { rows: [{ id: 'current' }] };
    },
    captureArchivePointer: async (sessionId, options) => {
      calls.push(['capture', sessionId, options.source]);
      return { sessionId };
    },
    loadArchivedMessages: async (archiveId, sessionId, options) => {
      calls.push(['load', archiveId, sessionId, options]);
      return true;
    },
    getLastArchiveTransition: sessionId => ({ archivedCurrentId: `current:${sessionId}` }),
    persistArchivePointer: async (sessionId, archiveId, pointer, options) => calls.push(['persist', sessionId, archiveId, options.source]),
    applyMemoryTableSnapshot: async payload => {
      calls.push(['applyMemory', payload]);
      return true;
    },
    applyGlobalMemorySnapshot: async payload => {
      calls.push(['applyGlobal', payload.snapshot]);
      return true;
    },
    restoreArchivePointerForLoadedThread: async (sessionId, options) => calls.push(['restore', sessionId, options.source]),
    momentsStore: {
      importState: state => calls.push(['importMoments', state]),
    },
    momentSummaryStore: {
      importState: state => calls.push(['importMomentSummary', state]),
    },
  });
  assert.equal(result.loaded, true);
  assert.equal(result.loadedSessions, 2);
  assert.equal(result.restoredMemoryOnly, 1);
  assert.equal(result.restoredGlobalMemory, true);
  assert.equal(result.restoredMoments, true);
  assert.equal(result.restoredMomentSummary, true);
  assert.deepEqual(calls.filter(item => item[0] === 'load').map(item => [item[1], item[2]]), [
    ['arc:rp:persona_pack', 'rp:persona_pack'],
    ['arc:contact:a', 'contact:a'],
  ]);
  assert.ok(calls.some(item => item[0] === 'applyMemory' && item[1].sessionId === 'contact:b'));
  assert.ok(calls.some(item => item[0] === 'applyGlobal'));
  assert.ok(calls.some(item => item[0] === 'importMoments'));
  console.log('ok - restorePersonaRoleArchive restores session archives moments summaries and memory snapshots');
}

{
  const memoryTableStore = {
    getMemories: async query => {
      if (query.scope === 'global') return [{ id: 'old', table_id: 'moment_summary', row_data: { a: 1 } }];
      return [];
    },
    batchDeleteMemories: async ids => {
      assert.deepEqual(ids, ['old']);
    },
    batchCreateMemories: async inputs => {
      assert.deepEqual(inputs.map(item => item.id), ['new']);
    },
  };
  const snapshot = await buildPersonaGlobalMemorySnapshot({
    memoryTableStore,
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
  });
  assert.deepEqual(snapshot.rows.map(row => row.id), ['old']);
  const applied = await applyPersonaGlobalMemorySnapshot({
    snapshot: { templateId: 'default-v1', rows: [{ id: 'new', table_id: 'moment_summary', row_data: { b: 2 } }] },
    memoryTableStore,
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
  });
  assert.equal(applied, true);
  console.log('ok - persona global memory snapshots can be built and applied');
}

{
  const calls = [];
  const result = await runPersonaNewChatFlow({
    personaId: 'persona_safe',
    rpSessionId: 'rp:persona_safe',
    chatStore: {
      listSessions: () => ['contact:a'],
      hasSession: id => id === 'contact:a',
      startNewChat: (sessionId) => {
        calls.push(['start', sessionId]);
        return `arc:${sessionId}`;
      },
    },
    contactsStore: {
      listContacts: () => [{ id: 'contact:b' }],
      getContact: () => null,
    },
    momentsStore: {
      list: () => [{ id: 'm1' }],
      clearAll: () => calls.push(['clearMoments']),
      flush: async () => calls.push(['flushMoments']),
    },
    momentSummaryStore: {
      clearSummaries: () => calls.push(['clearMomentSummaries']),
      clearCompactedSummary: () => calls.push(['clearMomentCompacted']),
    },
    memoryTableStore: {
      getMemories: async query => {
        calls.push(['getMemories', query]);
        if (query.contact_id === 'contact:b') return [{ id: 'b-summary', table_id: 'chat_summary' }];
        return [];
      },
      batchDeleteMemories: async ids => calls.push(['delete', ids]),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'clear',
    promptForArchiveName: async () => '',
    buildMemoryTableSnapshot: async () => ({ rows: [] }),
  });
  assert.equal(result.started, true);
  assert.equal(result.skippedMemoryOnlyTargets, 2);
  assert.equal(result.skippedMoments, true);
  assert.equal(result.skippedGlobalMemories, true);
  assert.equal(calls.some(item => item[0] === 'clearMoments'), false);
  assert.equal(calls.some(item => item[0] === 'clearMomentSummaries'), false);
  assert.equal(
    calls.some(item => item[0] === 'delete' && item[1]?.includes?.('b-summary')),
    false,
  );
  assert.equal(
    calls.some(item => item[0] === 'getMemories' && item[1]?.scope === 'global'),
    false,
  );
  console.log('ok - runPersonaNewChatFlow keeps moments and global memories by default for reversible role new-chat');
}

{
  const calls = [];
  const result = await runPersonaNewChatFlow({
    chatStore: {
      listSessions: () => ['contact:a'],
      hasSession: () => true,
      startNewChat: () => calls.push(['start']),
    },
    contactsStore: { listContacts: () => [], getContact: () => null },
    memoryTableStore: { getMemories: async () => [] },
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'cancel',
    promptForArchiveName: () => calls.push(['prompt']),
  });
  assert.deepEqual(result, {
    started: false,
    cancelled: true,
    targets: [{
      sessionId: 'contact:a',
      isGroup: false,
      sessionMode: 'chat',
      hasSession: true,
      source: 'chat',
    }],
    archiveIdMap: {},
  });
  assert.deepEqual(calls, []);
  console.log('ok - runPersonaNewChatFlow exits before archive prompt when memory choice is cancelled');
}
