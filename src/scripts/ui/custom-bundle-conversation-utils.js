const ensureArray = value => (Array.isArray(value) ? value : []);

const cloneJson = (value, fallback = null) => {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
};

const uniqueCustomBundleById = (items = []) => {
  const map = new Map();
  ensureArray(items).forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    map.set(id, item);
  });
  return Array.from(map.values());
};

export const normalizeCustomBundleSummaryList = (list = []) =>
  ensureArray(list)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || '').trim();
      if (!text) return null;
      return {
        at: Number(item.at || 0) || 0,
        text,
      };
    })
    .filter(Boolean);

export const normalizeCustomBundleCompactedSummary = (value) => {
  if (!value || typeof value !== 'object') return null;
  const text = String(value.text || '').trim();
  if (!text) return null;
  const out = {
    at: Number(value.at || 0) || 0,
    text,
  };
  const raw = String(value.raw || '').trim();
  if (raw) out.raw = raw;
  return out;
};

export const buildCustomBundleCurrentConversationPayload = ({
  session = {},
  messages = [],
} = {}) => {
  const list = ensureArray(messages);
  return {
    exported: true,
    draft: String(session?.draft || ''),
    messageCount: list.length,
    detachedSummaries: normalizeCustomBundleSummaryList(session?.detachedSummaries || []),
    compactedSummary: normalizeCustomBundleCompactedSummary(session?.compactedSummary || null),
    compactedSummaryLastRaw: cloneJson(session?.compactedSummaryLastRaw || null, null),
    messages: list,
  };
};

export const buildCustomBundleArchiveConversationPayload = ({
  archive = {},
  source = {},
  messages = [],
  includeMemoryData = false,
} = {}) => {
  const archiveId = String(archive?.id || '').trim();
  if (!archiveId) return null;
  const list = ensureArray(messages);
  return {
    id: archiveId,
    name: String(source?.name || archive?.name || ''),
    timestamp: Number(source?.timestamp || archive?.timestamp || 0) || 0,
    messageCount: Number(source?.messageCount || archive?.messageCount || list.length) || list.length,
    summaries: normalizeCustomBundleSummaryList(source?.summaries || []),
    compactedSummary: normalizeCustomBundleCompactedSummary(source?.compactedSummary || null),
    compactedSummaryLastRaw: cloneJson(source?.compactedSummaryLastRaw || null, null),
    memoryTableSnapshot: includeMemoryData ? cloneJson(source?.memoryTableSnapshot || null, null) : null,
    messages: list,
  };
};

export const selectCustomBundleConversationArchives = ({
  archives = [],
  selection = {},
} = {}) => (
  ensureArray(archives).filter(archive => selection?.archives?.[archive?.id])
);

export const normalizeCustomBundleImportedArchivePayloads = (archives = []) => (
  uniqueCustomBundleById(
    ensureArray(archives)
      .map((item) => ({
        ...item,
        id: String(item?.id || '').trim(),
      }))
      .filter(item => item.id)
  )
);

export const buildCustomBundleRestoredCurrentSessionState = ({
  currentPayload = {},
} = {}) => ({
  draft: String(currentPayload?.draft || ''),
  detachedSummaries: normalizeCustomBundleSummaryList(currentPayload?.detachedSummaries || []),
  compactedSummary: normalizeCustomBundleCompactedSummary(currentPayload?.compactedSummary || null),
  compactedSummaryLastRaw: cloneJson(currentPayload?.compactedSummaryLastRaw || null, null),
  currentArchiveId: null,
  currentMessages: ensureArray(currentPayload?.messages),
});

export const buildCustomBundleRestoredArchiveMetas = ({
  archivesPayload = [],
  includeMemoryData = false,
} = {}) => (
  ensureArray(archivesPayload)
    .map((archive) => ({
      id: String(archive?.id || '').trim(),
      name: String(archive?.name || ''),
      timestamp: Number(archive?.timestamp || 0) || 0,
      messageCount: Number(archive?.messageCount || 0) || 0,
      summaries: normalizeCustomBundleSummaryList(archive?.summaries || []),
      compactedSummary: normalizeCustomBundleCompactedSummary(archive?.compactedSummary || null),
      compactedSummaryLastRaw: cloneJson(archive?.compactedSummaryLastRaw || null, null),
      memoryTableSnapshot: includeMemoryData ? cloneJson(archive?.memoryTableSnapshot || null, null) : null,
    }))
    .filter(archive => archive.id)
);

export const getCustomBundleImportedArchiveMessages = ({
  archivesPayload = [],
  archiveId = '',
} = {}) => {
  const id = String(archiveId || '').trim();
  const payload = ensureArray(archivesPayload).find(archive => String(archive?.id || '').trim() === id);
  return ensureArray(payload?.messages);
};

export const buildCustomBundleLegacyRestoredArchives = ({
  archiveMetas = [],
  archivesPayload = [],
} = {}) => {
  const archiveMessageMap = new Map(
    ensureArray(archivesPayload).map(archive => [
      String(archive?.id || '').trim(),
      ensureArray(archive?.messages),
    ])
  );
  return ensureArray(archiveMetas).map((archive) => ({
    ...archive,
    messages: archiveMessageMap.get(String(archive?.id || '').trim()) || [],
  }));
};
