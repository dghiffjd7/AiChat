import assert from 'node:assert/strict';

const {
  buildExperiencePackArchiveMessageRestoreJobs,
  buildExperiencePackImportedConnectionProfileNameBase,
  buildExperiencePackImportedContactRecord,
  buildExperiencePackImportedPresetNameBase,
  buildExperiencePackImportSwitchConfirmOptions,
  buildExperiencePackLegacyRestoredArchives,
  buildExperiencePackPresetUpsertPayload,
  buildExperiencePackRemoteWallpaperSettings,
  buildExperiencePackRoomBaseSettings,
  buildExperiencePackRestoredSessionChatState,
  buildExperiencePackSavedWallpaperSettings,
  buildExperiencePackSessionChangedDetail,
  buildExperiencePackSessionSettings,
  buildExperiencePackWallpaperSaveRequest,
  getExperiencePackImportBaseName,
  mapExperiencePackImportedWorldIds,
  normalizeExperiencePackChatArchivePayloads,
  normalizeExperiencePackCompactedSummary,
  normalizeExperiencePackSummaryList,
} = await import('../../src/scripts/ui/experience-pack-import-utils.js');

{
  assert.equal(
    getExperiencePackImportBaseName({
      character: { contact: { name: ' Alice ' } },
      manifest: { character: { name: 'Manifest Alice' } },
    }),
    'Alice',
  );
  assert.equal(
    getExperiencePackImportBaseName({
      character: { contact: { name: '   ' } },
      manifest: { character: { name: ' Manifest Alice ' } },
    }),
    '角色',
  );
  assert.equal(
    getExperiencePackImportBaseName({
      character: { contact: { name: '' } },
      manifest: { character: { name: ' Manifest Alice ' } },
    }),
    'Manifest Alice',
  );
  assert.equal(getExperiencePackImportBaseName({}), '角色');
  console.log('ok - getExperiencePackImportBaseName preserves contact manifest fallback and blank-name trim policy');
}

{
  const record = buildExperiencePackImportedContactRecord({
    packageData: {
      character: {
        contact: {
          name: 'Alice Source',
          labels: ['friend', 7],
          description: 'desc',
        },
      },
    },
    sessionId: 'session:alice',
    baseName: 'Alice Imported',
    avatar: 'data:image/png;base64,AAAA',
    addedAt: 123,
  });
  assert.deepEqual(record, {
    id: 'session:alice',
    name: 'Alice Imported',
    avatar: 'data:image/png;base64,AAAA',
    isGroup: false,
    addedAt: 123,
    labels: ['friend', '7'],
    description: 'desc',
    source: 'experience_pack',
    isUserCreated: true,
  });
  assert.equal(
    buildExperiencePackImportedContactRecord({
      packageData: { character: { contact: { name: 'Fallback Name' } } },
      sessionId: 'session:fallback',
      addedAt: 1,
    }).name,
    'Fallback Name',
  );
  console.log('ok - buildExperiencePackImportedContactRecord preserves imported contact payload contract');
}

{
  assert.deepEqual(
    mapExperiencePackImportedWorldIds({
      worldIds: [' world:a ', '', 'world:b', 'world:a', 'world:raw'],
      worldIdMap: {
        'world:a': 'imported:a',
        'world:b': 'imported:b',
      },
    }),
    ['imported:a', 'imported:b', 'world:raw'],
  );
  assert.deepEqual(
    mapExperiencePackImportedWorldIds({
      worldIds: ['world:a', 'world:b'],
      worldIdMap: new Map([['world:a', 'ignored']]),
    }),
    ['world:a', 'world:b'],
  );
  console.log('ok - mapExperiencePackImportedWorldIds preserves object-map remap dedupe and raw fallback policy');
}

{
  assert.deepEqual(
    buildExperiencePackSessionSettings({
      sessionSettings: { theme: 'cozy' },
      importedPersona: { id: 'persona:alice' },
    }),
    { theme: 'cozy', personaLockId: 'persona:alice' },
  );
  assert.deepEqual(
    buildExperiencePackSessionSettings({
      sessionSettings: { theme: 'cozy' },
      importedPersona: null,
    }),
    { theme: 'cozy' },
  );
  console.log('ok - buildExperiencePackSessionSettings preserves persona lock merge policy');
}

{
  assert.deepEqual(
    buildExperiencePackImportSwitchConfirmOptions({ baseName: ' Alice ' }),
    {
      title: '导入完成',
      message: '已创建角色副本：Alice。是否切换到这个会话？',
      confirmText: '切换',
      cancelText: '稍后',
    },
  );
  assert.deepEqual(
    buildExperiencePackSessionChangedDetail('session:alice'),
    { id: 'session:alice' },
  );
  console.log('ok - experience pack switch prompt and session event helpers preserve copy and detail payload');
}

{
  assert.deepEqual(
    normalizeExperiencePackSummaryList([
      null,
      { at: '2', text: ' First ' },
      { at: 'bad', text: 'Second' },
      { at: 3, text: '' },
      { at: 4, text: 0 },
    ]),
    [
      { at: 2, text: 'First' },
      { at: 0, text: 'Second' },
    ],
  );
  assert.deepEqual(
    normalizeExperiencePackCompactedSummary({ at: '5', text: ' Compact ', raw: ' Raw text ' }),
    { at: 5, text: 'Compact', raw: 'Raw text' },
  );
  assert.equal(normalizeExperiencePackCompactedSummary({ text: '   ', raw: 'Raw text' }), null);
  console.log('ok - experience pack summary normalizers preserve trim numeric and empty filtering policy');
}

{
  const firstMessages = [{ id: 'first' }];
  const replacementMessages = [{ id: 'replacement' }];
  const payloads = normalizeExperiencePackChatArchivePayloads([
    { id: ' archive-a ', messages: firstMessages, name: 'first' },
    { id: '', messages: [{ id: 'skip' }] },
    { id: 'archive-b', messages: [{ id: 'b' }] },
    { id: 'archive-a', messages: replacementMessages, name: 'replacement' },
  ]);
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads.map(item => item.id), ['archive-a', 'archive-b']);
  assert.equal(payloads[0].name, 'replacement');
  assert.equal(payloads[0].messages, replacementMessages);
  console.log('ok - experience pack archive payload normalizer preserves trimmed id duplicate overwrite policy');
}

{
  const compactedRaw = { source: 'raw' };
  const memorySnapshot = { rows: [{ id: 'row-1' }] };
  const chatSession = {
    draft: ' draft ',
    current: {
      detachedSummaries: [{ at: '1', text: ' Detached ' }],
      compactedSummary: { at: '2', text: ' Current compact ', raw: ' Raw ' },
      compactedSummaryLastRaw: compactedRaw,
    },
    archives: [
      {
        id: ' archive-a ',
        name: 'Archive A',
        timestamp: '123',
        messageCount: '7',
        summaries: [{ at: '3', text: ' Archive summary ' }],
        compactedSummary: { at: '4', text: ' Archive compact ' },
        compactedSummaryLastRaw: { archive: true },
        memoryTableSnapshot: memorySnapshot,
      },
      { id: '   ', name: 'skip' },
    ],
  };

  const withoutMemory = buildExperiencePackRestoredSessionChatState(chatSession, {
    includeMemoryData: false,
  });
  assert.deepEqual(withoutMemory, {
    draft: ' draft ',
    detachedSummaries: [{ at: 1, text: 'Detached' }],
    compactedSummary: { at: 2, text: 'Current compact', raw: 'Raw' },
    compactedSummaryLastRaw: { source: 'raw' },
    currentArchiveId: null,
    archives: [{
      id: 'archive-a',
      name: 'Archive A',
      timestamp: 123,
      messageCount: 7,
      summaries: [{ at: 3, text: 'Archive summary' }],
      compactedSummary: { at: 4, text: 'Archive compact' },
      compactedSummaryLastRaw: { archive: true },
      memoryTableSnapshot: null,
    }],
  });
  assert.notEqual(withoutMemory.compactedSummaryLastRaw, compactedRaw);

  const withMemory = buildExperiencePackRestoredSessionChatState(chatSession, {
    includeMemoryData: true,
  });
  assert.deepEqual(withMemory.archives[0].memoryTableSnapshot, memorySnapshot);
  assert.notEqual(withMemory.archives[0].memoryTableSnapshot, memorySnapshot);
  console.log('ok - experience pack restored session chat state preserves metadata and memory snapshot gate');
}

{
  const archiveMetas = [
    { id: 'archive-a', name: 'A' },
    { id: 'archive-b', name: 'B' },
  ];
  const archivePayloads = [
    { id: 'archive-a', messages: [{ id: 'a1' }] },
    { id: 'archive-c', messages: [{ id: 'c1' }] },
  ];
  assert.deepEqual(
    buildExperiencePackLegacyRestoredArchives(archiveMetas, archivePayloads),
    [
      { id: 'archive-a', name: 'A', messages: [{ id: 'a1' }] },
      { id: 'archive-b', name: 'B', messages: [] },
    ],
  );
  assert.deepEqual(
    buildExperiencePackArchiveMessageRestoreJobs(archiveMetas, archivePayloads),
    [
      { archiveId: 'archive-a', messages: [{ id: 'a1' }] },
      { archiveId: 'archive-b', messages: [] },
    ],
  );
  console.log('ok - experience pack archive restore helpers preserve legacy archive messages and v2 jobs');
}

{
  const sourceSettings = {
    theme: 'cozy',
    personaLockId: 'persona:source',
    wallpaper: { url: 'https://old.example/wallpaper.png' },
  };
  const settings = buildExperiencePackRoomBaseSettings({
    sessionSettings: sourceSettings,
  });
  assert.deepEqual(settings, {
    theme: 'cozy',
    wallpaper: { url: 'https://old.example/wallpaper.png' },
  });
  assert.notEqual(settings, sourceSettings);
  assert.notEqual(settings.wallpaper, sourceSettings.wallpaper);
  console.log('ok - buildExperiencePackRoomBaseSettings clones settings and strips persona lock');
}

{
  assert.deepEqual(
    buildExperiencePackWallpaperSaveRequest({
      sessionId: 'session:alice',
      dataUrl: 'data:image/png;base64,AAAA',
      wallpaper: {
        file: 'room/wallpaper.png',
        meta: { name: '' },
      },
    }),
    {
      sessionId: 'session:alice',
      dataUrl: 'data:image/png;base64,AAAA',
      fileName: 'wallpaper.png',
    },
  );
  assert.deepEqual(
    buildExperiencePackWallpaperSaveRequest({
      sessionId: 'session:alice',
      dataUrl: 'data:image/png;base64,AAAA',
      wallpaper: {
        file: 'room/wallpaper.png',
        meta: { name: ' Custom Name ' },
      },
    }).fileName,
    ' Custom Name ',
  );
  console.log('ok - buildExperiencePackWallpaperSaveRequest preserves file name fallback policy');
}

{
  const wallpaper = {
    meta: {
      name: 'Wallpaper',
      zoom: '2',
      rotate: '15',
      offsetX: '3',
      offsetY: '4',
      width: '800',
      height: '600',
      opacity: '0.35',
      saveOriginal: true,
    },
  };
  assert.deepEqual(
    buildExperiencePackSavedWallpaperSettings({
      wallpaper,
      savedPath: ' /tmp/wallpaper.png ',
    }),
    {
      path: '/tmp/wallpaper.png',
      name: 'Wallpaper',
      zoom: 2,
      rotate: 15,
      offsetX: 3,
      offsetY: 4,
      width: 800,
      height: 600,
      opacity: 0.35,
      saveOriginal: true,
    },
  );
  assert.deepEqual(
    buildExperiencePackRemoteWallpaperSettings({
      currentWallpaper: { fit: 'cover', saveOriginal: true },
      wallpaper: {
        remoteUrl: 'https://example.test/wallpaper.png',
        meta: {
          name: 'Remote',
          zoom: 'bad',
          rotate: '',
        },
      },
    }),
    {
      fit: 'cover',
      saveOriginal: true,
      url: 'https://example.test/wallpaper.png',
      name: 'Remote',
      zoom: 1,
      rotate: 0,
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0,
      opacity: 1,
    },
  );
  console.log('ok - experience pack wallpaper settings helpers preserve local and remote contracts');
}

{
  assert.equal(
    buildExperiencePackImportedPresetNameBase({
      packageData: { manifest: { character: { name: ' Alice ' } } },
      settings: { name: 'Settings Name' },
      presetPayload: { name: 'Preset Name' },
      type: 'sysprompt',
    }),
    'Preset Name',
  );
  assert.equal(
    buildExperiencePackImportedPresetNameBase({
      packageData: { manifest: { character: { name: '   ' } } },
      settings: { name: ' Settings Name ' },
      presetPayload: {},
      type: 'context',
    }),
    'context',
  );
  assert.equal(
    buildExperiencePackImportedConnectionProfileNameBase({
      manifest: { character: { name: ' Alice ' } },
    }),
    'Alice·连线',
  );
  assert.equal(buildExperiencePackImportedConnectionProfileNameBase({}), '角色·连线');
  console.log('ok - experience pack imported preset names dedupe by source name while connection profiles keep character prefixes');
}

{
  const sourceData = { messages: [{ role: 'system', content: 'prompt' }] };
  const payload = buildExperiencePackPresetUpsertPayload({
    presetPayload: { data: sourceData },
    presetName: 'Alice·Preset',
  });
  assert.deepEqual(payload, {
    name: 'Alice·Preset',
    data: sourceData,
    makeActive: false,
  });
  assert.notEqual(payload.data, sourceData);
  console.log('ok - buildExperiencePackPresetUpsertPayload preserves upsert payload and clones data');
}
