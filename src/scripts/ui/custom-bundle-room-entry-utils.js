const ensureArray = value => (Array.isArray(value) ? value : []);

export const slugifyCustomBundleEntrySegment = (value, fallback = 'item') => {
  const raw = String(value || '').trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
};

export const buildCustomBundleRoomManifestPayload = (room = {}) => ({
  key: room?.key,
  sessionId: room?.sessionId,
  scopeId: room?.scopeId,
  uiMode: room?.uiMode,
  hasConversationContent: Boolean(room?.content),
  hasMemoryData: Boolean(room?.memoryData),
  hasVariableState: Boolean(room?.roomConfig?.variables?.state),
});

export const buildCustomBundleRoomEntryPayloads = (room = {}) => {
  const basePath = room?.basePath;
  const entries = [
    {
      name: `${basePath}/manifest.json`,
      payload: buildCustomBundleRoomManifestPayload(room),
    },
    {
      name: `${basePath}/room.json`,
      payload: room?.roomConfig,
    },
  ];
  if (room?.contactPayload) {
    entries.push({ name: `${basePath}/contact.json`, payload: room.contactPayload });
  }
  if (room?.rpGreetingPayload) {
    entries.push({ name: `${basePath}/rp_greetings.json`, payload: room.rpGreetingPayload });
  }
  if (room?.memoryData) {
    entries.push({ name: `${basePath}/memory_data.json`, payload: room.memoryData });
  }
  if (room?.content) {
    entries.push({ name: `${basePath}/chat_current.json`, payload: room.content.current });
    for (const archive of ensureArray(room.content.archives)) {
      entries.push({
        name: `${basePath}/archives/${slugifyCustomBundleEntrySegment(archive?.id, 'archive')}.json`,
        payload: archive,
      });
    }
  }
  return entries;
};
