import assert from 'node:assert/strict';

const {
  buildCustomBundleChatImportedTarget,
  buildCustomBundleChatRoomProgressDetail,
  buildCustomBundleImportedContactRecord,
  buildCustomBundleRoomDiagnosticExtra,
  buildCustomBundleRoomRefCounts,
  buildCustomBundleRoomImportDiagnostic,
  buildCustomBundleRoomRestoreFailureNote,
  buildCustomBundleRpImportedTarget,
  buildCustomBundleRpRoomName,
  buildCustomBundleRpRoomProgressDetail,
  CUSTOM_BUNDLE_SHARED_SCOPE_KEY,
  getCustomBundleRoomMemoryFailureLogMessage,
  getCustomBundleRoomRestoreFailureLogMessage,
  getCustomBundleRoomSourceSessionId,
  getCustomBundleRpRoomDisplayName,
  getCustomBundleScopeIdFromTouchedKey,
  getCustomBundleTouchedScopeKey,
  markCustomBundleTouchedRuntime,
  mapCustomBundleImportedMemberIds,
  mapCustomBundleImportedWorldIds,
  planCustomBundleChatRoomImports,
  planCustomBundleRpRoomImport,
  resolveCustomBundlePersonaLockId,
  resolveCustomBundleContactAvatar,
} = await import('../../src/scripts/ui/custom-bundle-import-room-utils.js');
const {
  BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
} = await import('../../src/scripts/storage/builtin-worldbooks.js');

{
  assert.equal(getCustomBundleTouchedScopeKey(''), CUSTOM_BUNDLE_SHARED_SCOPE_KEY);
  assert.equal(getCustomBundleTouchedScopeKey('scope:alice'), 'scope:alice');
  assert.equal(getCustomBundleScopeIdFromTouchedKey(CUSTOM_BUNDLE_SHARED_SCOPE_KEY), '');
  assert.equal(getCustomBundleScopeIdFromTouchedKey('scope:alice'), 'scope:alice');

  const touchedScopes = new Set();
  const touchedRuntimes = new Map();
  const runtime = { id: 'runtime' };
  assert.equal(
    markCustomBundleTouchedRuntime({
      touchedScopes,
      touchedRuntimes,
      scopeId: '',
      runtime,
    }),
    CUSTOM_BUNDLE_SHARED_SCOPE_KEY,
  );
  markCustomBundleTouchedRuntime({
    touchedScopes,
    touchedRuntimes,
    scopeId: 'scope:alice',
    runtime: null,
  });
  assert.deepEqual(Array.from(touchedScopes), [CUSTOM_BUNDLE_SHARED_SCOPE_KEY, 'scope:alice']);
  assert.equal(touchedRuntimes.get(CUSTOM_BUNDLE_SHARED_SCOPE_KEY), runtime);
  assert.equal(touchedRuntimes.has('scope:alice'), false);
  console.log('ok - touched runtime helpers preserve shared scope key and runtime tracking policy');
}

{
  const calls = [];
  assert.equal(
    resolveCustomBundleContactAvatar({
      contactPayload: {
        avatarFile: 'assets/avatar.webp',
        avatarValue: 'data:image/png;base64,OLD',
      },
      getEntryDataUrl(file) {
        calls.push(file);
        return 'data:image/webp;base64,AAAA';
      },
    }),
    'data:image/webp;base64,AAAA',
  );
  assert.deepEqual(calls, ['assets/avatar.webp']);
  assert.equal(
    resolveCustomBundleContactAvatar({
      contactPayload: { avatarFile: 'assets/missing.webp', avatarValue: 'fallback' },
      getEntryDataUrl: () => '',
    }),
    '',
  );
  assert.equal(
    resolveCustomBundleContactAvatar({
      contactPayload: { avatarValue: ' data:image/png;base64,FALLBACK ' },
    }),
    'data:image/png;base64,FALLBACK',
  );
  console.log('ok - resolveCustomBundleContactAvatar preserves avatar file priority and fallback policy');
}

{
  const mapped = mapCustomBundleImportedMemberIds({
    members: [' source:a ', '', 'source:b', 'source:c'],
    sourceSessionIdMap: new Map([
      ['source:a', 'target:a'],
      ['source:b', ' target:b '],
    ]),
  });
  assert.deepEqual(mapped, ['target:a', 'target:b', 'source:c']);
  assert.deepEqual(
    mapCustomBundleImportedMemberIds({
      members: ['source:d'],
      sourceSessionIdMap: { 'source:d': 'target:d' },
    }),
    ['target:d'],
  );
  console.log('ok - mapCustomBundleImportedMemberIds remaps members and keeps descriptor order');
}

{
  const mapped = mapCustomBundleImportedWorldIds({
    worldIds: [' world:main ', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, 'world:global', 'world:main', 'world:raw'],
    worldIdMap: {
      'world:main': 'imported:main',
      'world:global': 'imported:global',
    },
  });
  assert.deepEqual(mapped, ['imported:main', 'imported:global', 'world:raw']);
  assert.deepEqual(
    mapCustomBundleImportedWorldIds({
      worldIds: ['world:a', 'world:b', 'world:a'],
      worldIdMap: new Map([['world:a', 'imported:a']]),
    }),
    ['imported:a', 'world:b'],
  );
  console.log('ok - mapCustomBundleImportedWorldIds normalizes maps and deduplicates world ids');
}

{
  const record = buildCustomBundleImportedContactRecord({
    contactPayload: {
      id: 'source:alice',
      name: ' Alice ',
      isGroup: true,
      description: 'desc',
      labels: ['friend', 7],
      libraryTags: ['tag'],
    },
    sessionId: 'contact:alice',
    avatar: 'data:image/png;base64,AAAA',
    mappedMembers: [' member:a ', '', 'member:b'],
    addedAt: 123,
  });
  assert.deepEqual(record, {
    id: 'contact:alice',
    name: 'Alice',
    avatar: 'data:image/png;base64,AAAA',
    isGroup: true,
    members: ['member:a', 'member:b'],
    description: 'desc',
    labels: ['friend', '7'],
    libraryTags: ['tag'],
    addedAt: 123,
    source: 'custom_bundle',
    isUserCreated: true,
  });
  assert.equal(
    buildCustomBundleImportedContactRecord({
      contactPayload: {},
      sessionId: 'contact:fallback',
      addedAt: 1,
    }).name,
    'contact:fallback',
  );
  console.log('ok - buildCustomBundleImportedContactRecord preserves contact upsert payload contract');
}

{
  const counts = buildCustomBundleRoomRefCounts([
    { chats: [' room:a ', '', 'room:b', 'room:a'] },
    { chats: ['room:b', 'room:c'] },
    { chats: null },
  ]);
  assert.deepEqual(Array.from(counts.entries()), [
    ['room:a', 2],
    ['room:b', 2],
    ['room:c', 1],
  ]);
  console.log('ok - buildCustomBundleRoomRefCounts preserves manifest chat room reference counts');
}

{
  assert.equal(
    getCustomBundleRoomSourceSessionId({
      contact: { id: ' source:contact ' },
      manifest: { sessionId: 'source:manifest' },
    }),
    'source:contact',
  );
  assert.equal(
    getCustomBundleRoomSourceSessionId({
      contact: {},
      manifest: { sessionId: ' source:manifest ' },
    }),
    'source:manifest',
  );
  assert.equal(
    resolveCustomBundlePersonaLockId({
      personaId: ' role:a ',
      currentSharedMode: false,
      roomRefCount: 99,
    }),
    'role:a',
  );
  assert.equal(
    resolveCustomBundlePersonaLockId({
      personaId: 'role:a',
      currentSharedMode: true,
      roomRefCount: 1,
    }),
    'role:a',
  );
  assert.equal(
    resolveCustomBundlePersonaLockId({
      personaId: 'role:a',
      currentSharedMode: true,
      roomRefCount: 2,
    }),
    '',
  );
  console.log('ok - source session id and persona lock helpers preserve custom bundle import policy');
}

{
  const roomMap = new Map([
    ['room:a', { contact: { id: ' source:a ', name: 'Alice' } }],
    ['room:b', { manifest: { sessionId: ' source:b ' }, contact: { name: 'Bob' } }],
    ['room:c', { contact: { id: 'source:c', name: 'Carol' } }],
  ]);
  const allocated = [];
  const plan = planCustomBundleChatRoomImports({
    chatRoomKeys: [' room:a ', '', 'room:missing', 'room:b', 'room:c'],
    roomMap,
    sharedImportedRooms: new Map([['room:b', { sessionId: 'existing:b' }]]),
    currentSharedMode: true,
    allocateSessionId(roomPackage, roomKey) {
      const sessionId = `target:${roomKey.slice(-1)}`;
      allocated.push([roomKey, roomPackage]);
      return sessionId;
    },
  });
  assert.deepEqual(
    plan.roomEntries.map(entry => entry.roomKey),
    ['room:a', 'room:c'],
  );
  assert.deepEqual(Array.from(plan.plannedChatSessions.entries()), [
    ['room:a', 'target:a'],
    ['room:c', 'target:c'],
  ]);
  assert.deepEqual(Array.from(plan.sourceSessionIdMap.entries()), [
    ['source:a', 'target:a'],
    ['source:c', 'target:c'],
  ]);
  assert.deepEqual(allocated.map(([roomKey]) => roomKey), ['room:a', 'room:c']);
  console.log('ok - planCustomBundleChatRoomImports skips missing and shared rooms while planning mappings');
}

{
  const roomMap = new Map([
    ['room:a', { contact: { id: 'source:a' } }],
  ]);
  let index = 0;
  const plan = planCustomBundleChatRoomImports({
    chatRoomKeys: ['room:a', 'room:a'],
    roomMap,
    allocateSessionId() {
      index += 1;
      return `target:a-${index}`;
    },
  });
  assert.deepEqual(
    plan.roomEntries.map(entry => entry.roomKey),
    ['room:a', 'room:a'],
  );
  assert.deepEqual(Array.from(plan.plannedChatSessions.entries()), [
    ['room:a', 'target:a-2'],
  ]);
  assert.deepEqual(Array.from(plan.sourceSessionIdMap.entries()), [
    ['source:a', 'target:a-2'],
  ]);
  console.log('ok - planCustomBundleChatRoomImports preserves duplicate room planning overwrite behavior');
}

{
  const importedPersona = { id: 'role:alice', name: 'Alice' };
  assert.deepEqual(
    buildCustomBundleChatImportedTarget({
      importedPersona,
      scopeId: 'scope:alice',
      sessionId: 'session:alice',
      contactPayload: { name: '  ' },
    }),
    {
      personaId: 'role:alice',
      personaName: 'Alice',
      scopeId: 'scope:alice',
      sessionId: 'session:alice',
      roomName: '  ',
      isRp: false,
    },
  );
  assert.deepEqual(
    buildCustomBundleChatImportedTarget({
      importedPersona,
      scopeId: '',
      sessionId: 'session:fallback',
      contactPayload: { name: '' },
    }).roomName,
    'session:fallback',
  );
  console.log('ok - buildCustomBundleChatImportedTarget preserves chat target payload and name fallback policy');
}

{
  assert.equal(getCustomBundleRpRoomDisplayName({ name: ' Alice ' }), 'Alice');
  assert.equal(getCustomBundleRpRoomDisplayName({ name: '   ' }), '角色');
  assert.equal(buildCustomBundleRpRoomName({ name: ' Alice ' }), 'Alice·创意写作');
  assert.deepEqual(
    buildCustomBundleRpImportedTarget({
      importedPersona: { id: 'role:alice', name: ' Alice ' },
      scopeId: 'scope:alice',
      sessionId: 'rp:role:alice',
    }),
    {
      personaId: 'role:alice',
      personaName: ' Alice ',
      scopeId: 'scope:alice',
      sessionId: 'rp:role:alice',
      roomName: 'Alice·创意写作',
      isRp: true,
    },
  );
  console.log('ok - buildCustomBundleRpImportedTarget preserves rp target payload and display name policy');
}

{
  const roomPackage = { manifest: { uiMode: 'rp' } };
  const roomMap = new Map([
    ['rp:room', roomPackage],
  ]);
  const plan = planCustomBundleRpRoomImport({
    creativeWritingRoomKey: ' rp:room ',
    roomMap,
    importedPersona: { id: ' role:alice ', name: ' Alice ' },
    targetScopeId: 'scope:alice',
    currentSharedMode: false,
  });
  assert.deepEqual(plan, {
    roomKey: 'rp:room',
    roomPackage,
    scopeId: 'scope:alice',
    sessionId: 'rp:role:alice',
    displayName: 'Alice·创意写作',
    personaLockId: ' role:alice ',
  });
  assert.equal(
    planCustomBundleRpRoomImport({
      creativeWritingRoomKey: 'rp:room',
      roomMap,
      importedPersona: { id: 'role:alice', name: 'Alice' },
      targetScopeId: 'scope:alice',
      currentSharedMode: true,
    }).scopeId,
    '',
  );
  assert.equal(
    planCustomBundleRpRoomImport({
      creativeWritingRoomKey: '',
      roomMap,
      importedPersona: { id: 'role:alice' },
    }),
    null,
  );
  assert.equal(
    planCustomBundleRpRoomImport({
      creativeWritingRoomKey: 'rp:missing',
      roomMap,
      importedPersona: { id: 'role:alice' },
    }),
    null,
  );
  console.log('ok - planCustomBundleRpRoomImport preserves rp room planning and missing-room policy');
}

{
  assert.deepEqual(
    buildCustomBundleChatRoomProgressDetail({
      completedRoomUnits: 1,
      totalRoomUnits: 4,
      contactPayload: { name: 'Chat A' },
      sessionId: 'session:a',
      fileName: 'bundle.zip',
    }),
    {
      phase: 'rooms',
      progress: 44,
      status: '正在恢复聊天室 1/4：Chat A',
      fileName: 'bundle.zip',
    },
  );
  assert.deepEqual(
    buildCustomBundleRpRoomProgressDetail({
      completedRoomUnits: 2,
      totalRoomUnits: 4,
      importedPersona: { name: ' Alice ' },
      fileName: 'bundle.zip',
    }),
    {
      phase: 'rooms',
      progress: 58,
      status: '正在恢复创意写作 2/4：Alice',
      fileName: 'bundle.zip',
    },
  );
  console.log('ok - custom bundle room progress detail helpers preserve status copy and progress formula');
}

{
  assert.equal(
    getCustomBundleRoomMemoryFailureLogMessage('chat'),
    'import memory snapshot for custom bundle chat failed',
  );
  assert.equal(
    getCustomBundleRoomMemoryFailureLogMessage('rp'),
    'import memory snapshot for custom bundle rp failed',
  );
  assert.equal(
    getCustomBundleRoomMemoryFailureLogMessage(' rp '),
    'import memory snapshot for custom bundle chat failed',
  );
  assert.equal(
    getCustomBundleRoomRestoreFailureLogMessage('chat'),
    'import chat history for custom bundle chat failed',
  );
  assert.equal(
    getCustomBundleRoomRestoreFailureLogMessage('rp'),
    'import chat history for custom bundle rp failed',
  );
  assert.equal(
    buildCustomBundleRoomRestoreFailureNote({
      restoreFailureKind: 'chat',
      restoreFailureName: 'Alice Chat',
      sessionId: 'session:fallback',
      error: new Error('restore boom'),
    }),
    'chat restore failed: Alice Chat -> restore boom',
  );
  assert.equal(
    buildCustomBundleRoomRestoreFailureNote({
      restoreFailureKind: 'rp',
      restoreFailureName: '',
      sessionId: 'rp:role:alice',
      error: 'raw boom',
    }),
    'rp restore failed: rp:role:alice -> raw boom',
  );
  assert.equal(
    buildCustomBundleRoomRestoreFailureNote({
      restoreFailureKind: 'chat',
      restoreFailureName: '',
      sessionId: '',
      error: null,
    }),
    'chat restore failed:  -> unknown error',
  );

  const mappedWorldIds = ['world:a'];
  const mappedMembers = ['member:a'];
  assert.deepEqual(
    buildCustomBundleRoomDiagnosticExtra({
      roomKey: 'room:a',
      restoreMs: 42,
      mappedWorldIds,
      isGroup: true,
      mappedMembers,
    }),
    {
      roomKey: 'room:a',
      restoreMs: 42,
      mappedWorldIds,
      isGroup: true,
      mappedMembers,
    },
  );
  assert.deepEqual(
    buildCustomBundleRoomDiagnosticExtra({
      roomKey: 'room:a',
      restoreMs: 0,
      mappedWorldIds,
      isGroup: false,
    }),
    {
      roomKey: 'room:a',
      restoreMs: 0,
      mappedWorldIds,
      isGroup: false,
    },
  );
  console.log('ok - custom bundle room failure helpers preserve log note and diagnostic extra contracts');
}

{
  const runtime = {
    scopeId: 'fallback-scope',
    chatStore: {
      scopeId: ' role:alice ',
      state: {
        sessions: {
          'session:alice': {
            _loadedThreadKey: 'archive:a',
            archives: [
              { id: ' archive:a ', name: 'Archive A', messageCount: 2 },
              { id: '', name: 'ignored', messageCount: 9 },
            ],
          },
        },
      },
      _v2: {
        getThreadTotal(sessionId, archiveId) {
          if (sessionId === 'session:alice' && archiveId === '') return 3;
          if (sessionId === 'session:alice' && archiveId === 'archive:a') return 2;
          return 0;
        },
      },
    },
    contactsStore: {
      getContact(sessionId) {
        if (sessionId !== 'session:alice') return null;
        return { members: [' member:a ', '', 'member:b'] };
      },
    },
  };
  const diagnostic = buildCustomBundleRoomImportDiagnostic({
    runtime,
    sessionId: ' session:alice ',
    roomPackage: {
      manifest: { sessionId: 'source:fallback', displayName: 'Manifest Room', uiMode: ' rp ' },
      contact: { id: ' source:alice ', name: 'Alice Room' },
      chatCurrent: { messages: ['m1', 'm2', 'm3'] },
      archives: [
        { id: ' archive:a ', name: 'Archive A', messages: ['a1', 'a2'] },
        { id: '', name: 'ignored', messages: ['x'] },
      ],
      roomConfig: {
        world: {
          worldIds: [' world:a ', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, 'world:a', 'world:b'],
        },
      },
    },
    extra: { restoreMs: 42, scopeId: 'must-not-win' },
    getSessionWorldIds: () => ['stored:a', ' stored:b ', ''],
  });
  assert.deepEqual(diagnostic, {
    restoreMs: 42,
    scopeId: 'role_alice',
    sessionId: 'session:alice',
    sourceSessionId: 'source:alice',
    roomName: 'Alice Room',
    uiMode: 'rp',
    hasContact: true,
    contactMembers: ['member:a', 'member:b'],
    currentExpectedMessages: 3,
    currentStoredMessages: 3,
    currentLoadedThreadKey: 'archive:a',
    stateArchiveCount: 1,
    expectedArchives: [
      { id: 'archive:a', name: 'Archive A', expectedMessages: 2 },
    ],
    storedArchives: [
      { id: 'archive:a', name: 'Archive A', storedMetaMessages: 2, v2Messages: 2 },
    ],
    expectedWorldIds: ['world:a', 'world:b'],
    storedWorldIds: ['stored:a', 'stored:b'],
  });
  console.log('ok - buildCustomBundleRoomImportDiagnostic preserves room restore diagnostics shape');
}
