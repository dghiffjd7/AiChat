import assert from 'node:assert/strict';

const {
  buildCustomBundleManifest,
  buildCustomBundlePersonaPayload,
  buildCustomBundleRoleManifest,
  buildCustomBundleRoomManifestEntries,
} = await import('../../src/scripts/ui/custom-bundle-manifest-utils.js');

{
  const roleManifest = buildCustomBundleRoleManifest({
    id: 'role:alice',
    name: 'Alice',
    scopeId: 'scope:alice',
    sharedContacts: true,
  });
  assert.deepEqual(roleManifest, {
    id: 'role:alice',
    name: 'Alice',
    scopeId: 'scope:alice',
    sharedContacts: true,
    hasMoments: false,
    chats: [],
    creativeWriting: '',
  });
  roleManifest.chats.push('room:one');
  assert.deepEqual(buildCustomBundleRoleManifest({}).chats, []);
  console.log('ok - buildCustomBundleRoleManifest preserves role manifest defaults');
}

{
  const source = { type: 'card', nested: { worldbookId: 'world:one' } };
  const payload = buildCustomBundlePersonaPayload({
    role: {
      id: 'role:alice',
      name: 'Alice',
      description: 'desc',
      source,
      userBubbleColor: '#fff',
      userTextColor: '#111',
      position: 2,
      depth: 7,
      roleValue: 'assistant',
      created: 1,
      updated: 2,
    },
    avatarFile: 'roles/alice/assets/avatar.png',
    avatarValue: '',
  });
  assert.deepEqual(payload, {
    id: 'role:alice',
    name: 'Alice',
    description: 'desc',
    avatarFile: 'roles/alice/assets/avatar.png',
    avatarValue: '',
    source,
    userBubbleColor: '#fff',
    userTextColor: '#111',
    position: 2,
    depth: 7,
    role: 'assistant',
    created: 1,
    updated: 2,
  });
  payload.source.nested.worldbookId = 'changed';
  assert.equal(source.nested.worldbookId, 'world:one');
  console.log('ok - buildCustomBundlePersonaPayload preserves persona payload fields and clones source');
}

{
  const rooms = buildCustomBundleRoomManifestEntries([
    {
      key: 'scope:room',
      sessionId: 'contact:alice',
      scopeId: 'scope:alice',
      uiMode: 'chat',
      basePath: 'rooms/ignored',
    },
  ]);
  assert.deepEqual(rooms, [{
    key: 'scope:room',
    sessionId: 'contact:alice',
    scopeId: 'scope:alice',
    uiMode: 'chat',
  }]);
  console.log('ok - buildCustomBundleRoomManifestEntries keeps only public room manifest fields');
}

{
  const options = {
    includeConversationContent: true,
    includeMemoryData: false,
    includeVariableState: true,
    hideServiceAddresses: false,
    extra: { value: 1 },
  };
  const manifest = buildCustomBundleManifest({
    format: 'chatapp.custom-bundle.v1',
    formatVersion: 1,
    exportedAt: '2026-05-08T00:00:00.000Z',
    mode: 'selected',
    options,
    summary: {
      roles: 2,
      chats: 3,
      creative: 1,
      archives: 4,
      momentScopes: 5,
      moments: 6,
      momentSummaries: 7,
      momentCompacted: 8,
    },
    roles: [{ id: 'role:alice' }],
    rooms: [{ key: 'room:alice', sessionId: 'contact:alice', scopeId: 'scope:alice', uiMode: 'chat' }],
  });

  assert.deepEqual(manifest, {
    format: 'chatapp.custom-bundle.v1',
    formatVersion: 1,
    exportedAt: '2026-05-08T00:00:00.000Z',
    exportedBy: 'OmniTavern',
    mode: 'selected',
    options,
    summary: {
      roles: 2,
      chats: 3,
      creative: 1,
      archives: 4,
      moments: 5,
      momentEntries: 6,
      momentSummaries: 7,
      momentCompacted: 8,
      includeConversationContent: true,
      includeMemoryData: false,
      includeVariableState: true,
      hideServiceAddresses: false,
    },
    roles: [{ id: 'role:alice' }],
    rooms: [{ key: 'room:alice', sessionId: 'contact:alice', scopeId: 'scope:alice', uiMode: 'chat' }],
  });
  manifest.options.extra.value = 2;
  assert.equal(options.extra.value, 1);
  console.log('ok - buildCustomBundleManifest preserves package manifest contract and clones options');
}
