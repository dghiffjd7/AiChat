import assert from 'node:assert/strict';

const {
  buildCustomBundleRoomEntryPayloads,
  buildCustomBundleRoomManifestPayload,
  slugifyCustomBundleEntrySegment,
} = await import('../../src/scripts/ui/custom-bundle-room-entry-utils.js');

{
  assert.equal(slugifyCustomBundleEntrySegment(' archive:/一  二 ', 'archive'), 'archive_一_二');
  assert.equal(slugifyCustomBundleEntrySegment('   ', 'archive'), 'archive');
  console.log('ok - slugifyCustomBundleEntrySegment preserves custom bundle archive path rules');
}

{
  const payload = buildCustomBundleRoomManifestPayload({
    key: 'scope:room',
    sessionId: 'contact:alice',
    scopeId: 'scope:alice',
    uiMode: 'chat',
    content: { current: {} },
    memoryData: { rows: [] },
    roomConfig: { variables: { state: { affection: 1 } } },
  });
  assert.deepEqual(payload, {
    key: 'scope:room',
    sessionId: 'contact:alice',
    scopeId: 'scope:alice',
    uiMode: 'chat',
    hasConversationContent: true,
    hasMemoryData: true,
    hasVariableState: true,
  });
  console.log('ok - buildCustomBundleRoomManifestPayload preserves room manifest flags');
}

{
  const room = {
    basePath: 'rooms/scope_contact_alice',
    key: 'scope:room',
    sessionId: 'contact:alice',
    scopeId: 'scope:alice',
    uiMode: 'chat',
    roomConfig: { variables: { state: null } },
    contactPayload: { id: 'contact:alice' },
    memoryData: { rows: [] },
    content: {
      current: { messageCount: 1 },
      archives: [
        { id: ' old:/one ', messages: [{ id: 'm1' }] },
        { id: '', messages: [] },
      ],
    },
  };
  const entries = buildCustomBundleRoomEntryPayloads(room);
  assert.deepEqual(entries.map(entry => entry.name), [
    'rooms/scope_contact_alice/manifest.json',
    'rooms/scope_contact_alice/room.json',
    'rooms/scope_contact_alice/contact.json',
    'rooms/scope_contact_alice/memory_data.json',
    'rooms/scope_contact_alice/chat_current.json',
    'rooms/scope_contact_alice/archives/old_one.json',
    'rooms/scope_contact_alice/archives/archive.json',
  ]);
  assert.equal(entries[0].payload.hasVariableState, false);
  assert.equal(entries[1].payload, room.roomConfig);
  assert.equal(entries[5].payload, room.content.archives[0]);
  console.log('ok - buildCustomBundleRoomEntryPayloads preserves room entry order and archive paths');
}

{
  const entries = buildCustomBundleRoomEntryPayloads({
    basePath: 'rooms/rp',
    roomConfig: {},
    rpGreetingPayload: { greetings: [] },
  });
  assert.deepEqual(entries.map(entry => entry.name), [
    'rooms/rp/manifest.json',
    'rooms/rp/room.json',
    'rooms/rp/rp_greetings.json',
  ]);
  console.log('ok - buildCustomBundleRoomEntryPayloads includes rp greetings only when present');
}
