import assert from 'node:assert/strict';

const {
  buildCustomBundleArchiveConversationPayload,
  buildCustomBundleCurrentConversationPayload,
  buildCustomBundleLegacyRestoredArchives,
  buildCustomBundleRestoredArchiveMetas,
  buildCustomBundleRestoredCurrentSessionState,
  getCustomBundleImportedArchiveMessages,
  normalizeCustomBundleImportedArchivePayloads,
  normalizeCustomBundleCompactedSummary,
  normalizeCustomBundleSummaryList,
  selectCustomBundleConversationArchives,
} = await import('../../src/scripts/ui/custom-bundle-conversation-utils.js');

{
  assert.deepEqual(
    normalizeCustomBundleSummaryList([
      { at: '2', text: ' 二 ' },
      { at: '3', text: '   ' },
      null,
    ]),
    [{ at: 2, text: '二' }],
  );
  assert.deepEqual(
    normalizeCustomBundleCompactedSummary({ at: '4', text: ' 摘要 ', raw: ' 原文 ' }),
    { at: 4, text: '摘要', raw: '原文' },
  );
  assert.equal(normalizeCustomBundleCompactedSummary({ text: '' }), null);
  console.log('ok - custom bundle conversation normalizers preserve summary contracts');
}

{
  const raw = { source: 'raw' };
  const messages = [{ id: 'm1' }];
  const payload = buildCustomBundleCurrentConversationPayload({
    session: {
      draft: ' draft ',
      detachedSummaries: [{ at: 1, text: ' summary ' }],
      compactedSummary: { at: 2, text: ' compact ', raw: ' raw ' },
      compactedSummaryLastRaw: raw,
    },
    messages,
  });
  assert.deepEqual(payload, {
    exported: true,
    draft: ' draft ',
    messageCount: 1,
    detachedSummaries: [{ at: 1, text: 'summary' }],
    compactedSummary: { at: 2, text: 'compact', raw: 'raw' },
    compactedSummaryLastRaw: { source: 'raw' },
    messages,
  });
  payload.compactedSummaryLastRaw.source = 'changed';
  assert.equal(raw.source, 'raw');
  console.log('ok - buildCustomBundleCurrentConversationPayload preserves current chat payload fields');
}

{
  const snapshot = { rows: [{ id: 'row-1' }] };
  const payload = buildCustomBundleArchiveConversationPayload({
    archive: {
      id: ' old ',
      name: 'Archive fallback',
      timestamp: 1,
      messageCount: 0,
    },
    source: {
      name: 'Archive source',
      timestamp: '5',
      messageCount: '0',
      summaries: [{ at: '3', text: ' source summary ' }],
      compactedSummary: { at: '4', text: ' source compact ' },
      compactedSummaryLastRaw: { raw: 'source raw' },
      memoryTableSnapshot: snapshot,
    },
    messages: [{ id: 'm1' }, { id: 'm2' }],
    includeMemoryData: true,
  });

  assert.deepEqual(payload, {
    id: 'old',
    name: 'Archive source',
    timestamp: 5,
    messageCount: 2,
    summaries: [{ at: 3, text: 'source summary' }],
    compactedSummary: { at: 4, text: 'source compact' },
    compactedSummaryLastRaw: { raw: 'source raw' },
    memoryTableSnapshot: { rows: [{ id: 'row-1' }] },
    messages: [{ id: 'm1' }, { id: 'm2' }],
  });
  payload.memoryTableSnapshot.rows[0].id = 'changed';
  assert.equal(snapshot.rows[0].id, 'row-1');
  assert.equal(buildCustomBundleArchiveConversationPayload({ archive: { id: ' ' } }), null);
  console.log('ok - buildCustomBundleArchiveConversationPayload preserves archive payload and memory snapshot contracts');
}

{
  const selected = selectCustomBundleConversationArchives({
    archives: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    selection: { archives: { b: true, c: false, a: 1 } },
  });
  assert.deepEqual(selected.map(item => item.id), ['a', 'b']);
  console.log('ok - selectCustomBundleConversationArchives preserves descriptor order and truthy selection rules');
}

{
  const duplicateFirst = { id: ' a ', name: 'First' };
  const duplicateLast = { id: 'a', name: 'Last' };
  const payloads = normalizeCustomBundleImportedArchivePayloads([
    duplicateFirst,
    { id: ' b ', name: 'Bee' },
    { id: '   ', name: 'Skip' },
    duplicateLast,
  ]);
  assert.deepEqual(payloads, [
    { id: 'a', name: 'Last' },
    { id: 'b', name: 'Bee' },
  ]);
  assert.equal(duplicateFirst.id, ' a ');
  console.log('ok - normalizeCustomBundleImportedArchivePayloads preserves duplicate overwrite and id trim policy');
}

{
  const raw = { source: 'raw' };
  const messages = [{ id: 'm1' }];
  const state = buildCustomBundleRestoredCurrentSessionState({
    currentPayload: {
      draft: ' draft ',
      detachedSummaries: [{ at: 2, text: ' summary ' }],
      compactedSummary: { at: 3, text: ' compact ', raw: ' raw ' },
      compactedSummaryLastRaw: raw,
      messages,
    },
  });
  assert.deepEqual(state, {
    draft: ' draft ',
    detachedSummaries: [{ at: 2, text: 'summary' }],
    compactedSummary: { at: 3, text: 'compact', raw: 'raw' },
    compactedSummaryLastRaw: { source: 'raw' },
    currentArchiveId: null,
    currentMessages: messages,
  });
  state.compactedSummaryLastRaw.source = 'changed';
  assert.equal(raw.source, 'raw');
  console.log('ok - buildCustomBundleRestoredCurrentSessionState preserves restore current-session fields');
}

{
  const snapshot = { rows: [{ id: 'row-1' }] };
  const metas = buildCustomBundleRestoredArchiveMetas({
    archivesPayload: [
      {
        id: ' a ',
        name: 'Archive A',
        timestamp: '5',
        messageCount: '0',
        summaries: [{ at: '3', text: ' summary ' }],
        compactedSummary: { at: '4', text: ' compact ' },
        compactedSummaryLastRaw: { raw: 'last raw' },
        memoryTableSnapshot: snapshot,
        messages: [{ id: 'not-stored-in-meta' }],
      },
      { id: '', name: 'Skip' },
    ],
    includeMemoryData: true,
  });
  assert.deepEqual(metas, [
    {
      id: 'a',
      name: 'Archive A',
      timestamp: 5,
      messageCount: 0,
      summaries: [{ at: 3, text: 'summary' }],
      compactedSummary: { at: 4, text: 'compact' },
      compactedSummaryLastRaw: { raw: 'last raw' },
      memoryTableSnapshot: { rows: [{ id: 'row-1' }] },
    },
  ]);
  metas[0].memoryTableSnapshot.rows[0].id = 'changed';
  assert.equal(snapshot.rows[0].id, 'row-1');
  assert.equal(
    buildCustomBundleRestoredArchiveMetas({
      archivesPayload: [{ id: 'a', memoryTableSnapshot: snapshot }],
      includeMemoryData: false,
    })[0].memoryTableSnapshot,
    null,
  );
  console.log('ok - buildCustomBundleRestoredArchiveMetas preserves archive restore meta contract');
}

{
  const archivesPayload = [
    { id: 'a', messages: [{ id: 'a1' }] },
    { id: ' b ', messages: [{ id: 'b1' }] },
    { id: 'c', messages: null },
  ];
  assert.deepEqual(
    getCustomBundleImportedArchiveMessages({ archivesPayload, archiveId: ' b ' }),
    [{ id: 'b1' }],
  );
  assert.deepEqual(
    getCustomBundleImportedArchiveMessages({ archivesPayload, archiveId: 'missing' }),
    [],
  );
  assert.deepEqual(
    buildCustomBundleLegacyRestoredArchives({
      archiveMetas: [
        { id: 'a', name: 'Archive A' },
        { id: 'b', name: 'Archive B' },
        { id: 'c', name: 'Archive C' },
        { id: 'missing', name: 'Missing' },
      ],
      archivesPayload,
    }),
    [
      { id: 'a', name: 'Archive A', messages: [{ id: 'a1' }] },
      { id: 'b', name: 'Archive B', messages: [{ id: 'b1' }] },
      { id: 'c', name: 'Archive C', messages: [] },
      { id: 'missing', name: 'Missing', messages: [] },
    ],
  );
  console.log('ok - legacy archive restore helpers preserve archive message mapping contract');
}
