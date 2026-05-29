const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = value => String(value ?? '').trim();

const cloneValue = (value) => {
  if (value === null || value === undefined) return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) return value.map(item => cloneValue(item));
    if (isPlainObject(value)) return { ...value };
    return value;
  }
};

const readEntryId = (entry = null, fallback = '') => {
  if (!entry || typeof entry !== 'object') return trim(fallback);
  return trim(entry.id ?? entry.uid ?? fallback);
};

const readEntryTitle = (entry = null, fallback = '') => {
  if (!entry || typeof entry !== 'object') return trim(fallback);
  return trim(entry.comment || entry.title || entry.name || readEntryId(entry, fallback));
};

const normalizeWorldbookActionType = action => trim(action?.action || action?.type)
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const resolveActionEntryId = (action = null) => trim(
  action?.entryId
  ?? action?.entry_id
  ?? action?.targetEntryId
  ?? action?.target_entry_id
  ?? action?.id
  ?? action?.uid
  ?? action?.entry?.id
  ?? action?.entry?.uid,
);

const resolveActionEntryIndex = (action = null) => {
  const raw = action?.entryIndex ?? action?.entry_index ?? action?.targetIndex ?? action?.target_index;
  if (!Number.isFinite(Number(raw))) return -1;
  return Math.trunc(Number(raw));
};

const findEntryIndex = (entries = [], action = null) => {
  const id = resolveActionEntryId(action);
  if (id) {
    const index = entries.findIndex(entry => readEntryId(entry) === id);
    if (index >= 0) return index;
  }
  const fallbackIndex = resolveActionEntryIndex(action);
  return fallbackIndex >= 0 && fallbackIndex < entries.length ? fallbackIndex : -1;
};

const resolveInsertIndex = (action = null, length = 0) => {
  const raw = action?.index ?? action?.entryIndex ?? action?.entry_index ?? action?.position;
  const position = trim(action?.position).toLowerCase();
  if (position === 'top' || position === 'start' || action?.prepend === true) return 0;
  if (position === 'bottom' || position === 'end' || action?.append === true) return length;
  if (!Number.isFinite(Number(raw))) return length;
  return Math.max(0, Math.min(length, Math.trunc(Number(raw))));
};

const makePreviewEntryId = (entries = [], index = 0) => {
  const existing = new Set(entries.map(entry => readEntryId(entry)).filter(Boolean));
  let id = `entry-preview-${index + 1}`;
  let suffix = 1;
  while (existing.has(id)) {
    suffix += 1;
    id = `entry-preview-${index + 1}-${suffix}`;
  }
  return id;
};

const normalizeInsertEntry = (action = null, entries = [], index = 0) => {
  const src = isPlainObject(action?.entry)
    ? action.entry
    : (isPlainObject(action?.data) ? action.data : {});
  const entry = cloneValue(src) || {};
  if (!readEntryId(entry)) {
    entry.id = makePreviewEntryId(entries, index);
  }
  const id = readEntryId(entry);
  if (entry.uid == null && /^\d+$/.test(id)) entry.uid = Number(id);
  return entry;
};

const resolvePatch = (action = null) => {
  if (isPlainObject(action?.patch)) return cloneValue(action.patch) || {};
  if (isPlainObject(action?.entry)) return cloneValue(action.entry) || {};
  if (isPlainObject(action?.data)) return cloneValue(action.data) || {};
  return {};
};

const sameValue = (a, b) => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

const changedFields = (before = {}, after = {}) => {
  const keys = new Set([
    ...Object.keys(isPlainObject(before) ? before : {}),
    ...Object.keys(isPlainObject(after) ? after : {}),
  ]);
  return Array.from(keys).filter(key => !sameValue(before?.[key], after?.[key])).sort();
};

const buildPreviewEntry = ({
  index = 0,
  action = null,
  kind = 'skip',
  entryIndex = -1,
  before = null,
  after = null,
  reason = '',
} = {}) => {
  const entry = after || before || action?.entry || null;
  const entryId = readEntryId(entry, resolveActionEntryId(action));
  const title = readEntryTitle(entry, entryId || `entry-${index}`);
  return {
    index,
    action: normalizeWorldbookActionType(action) || 'unknown',
    kind,
    skipped: kind === 'skip',
    reason: kind === 'skip' ? trim(reason || 'skipped') : '',
    entryIndex,
    entryId,
    title,
    diff: kind === 'skip'
      ? null
      : {
        before,
        after,
        changedFields: before && after ? changedFields(before, after) : [],
      },
  };
};

const applyInsertPreview = ({ action, actionIndex, entries }) => {
  const entry = normalizeInsertEntry(action, entries, actionIndex);
  const insertAt = resolveInsertIndex(action, entries.length);
  entries.splice(insertAt, 0, entry);
  return buildPreviewEntry({
    index: actionIndex,
    action,
    kind: 'insert',
    entryIndex: insertAt,
    before: null,
    after: cloneValue(entry),
  });
};

const applyUpdatePreview = ({ action, actionIndex, entries }) => {
  const targetIndex = findEntryIndex(entries, action);
  if (targetIndex < 0) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: -1,
      reason: 'missingEntry',
    });
  }
  const patch = resolvePatch(action);
  if (!Object.keys(patch).length) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: targetIndex,
      before: cloneValue(entries[targetIndex]),
      reason: 'emptyPatch',
    });
  }
  const before = cloneValue(entries[targetIndex]);
  const after = { ...entries[targetIndex], ...patch };
  if (sameValue(before, after)) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: targetIndex,
      before,
      after: cloneValue(after),
      reason: 'unchanged',
    });
  }
  entries[targetIndex] = after;
  return buildPreviewEntry({
    index: actionIndex,
    action,
    kind: 'update',
    entryIndex: targetIndex,
    before,
    after: cloneValue(after),
  });
};

const applyDeletePreview = ({ action, actionIndex, entries }) => {
  const targetIndex = findEntryIndex(entries, action);
  if (targetIndex < 0) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: -1,
      reason: 'missingEntry',
    });
  }
  const before = cloneValue(entries[targetIndex]);
  entries.splice(targetIndex, 1);
  return buildPreviewEntry({
    index: actionIndex,
    action,
    kind: 'delete',
    entryIndex: targetIndex,
    before,
    after: null,
  });
};

const applyTogglePreview = ({
  action,
  actionIndex,
  entries,
  forceDisabled = null,
} = {}) => {
  const targetIndex = findEntryIndex(entries, action);
  if (targetIndex < 0) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: -1,
      reason: 'missingEntry',
    });
  }
  const before = cloneValue(entries[targetIndex]);
  const explicit = action?.disabled ?? action?.disable;
  const nextDisabled = forceDisabled !== null
    ? forceDisabled
    : (typeof explicit === 'boolean' ? explicit : !Boolean(before?.disable));
  const after = { ...entries[targetIndex], disable: Boolean(nextDisabled) };
  if (sameValue(before, after)) {
    return buildPreviewEntry({
      index: actionIndex,
      action,
      kind: 'skip',
      entryIndex: targetIndex,
      before,
      after: cloneValue(after),
      reason: 'unchanged',
    });
  }
  entries[targetIndex] = after;
  return buildPreviewEntry({
    index: actionIndex,
    action,
    kind: 'update',
    entryIndex: targetIndex,
    before,
    after: cloneValue(after),
  });
};

export const buildWorldbookActionBatchPreview = ({
  worldId = '',
  worldData = null,
  actions = [],
  includeNextWorldData = false,
} = {}) => {
  const list = Array.isArray(actions) ? actions : [];
  const originalWorldData = isPlainObject(worldData) ? cloneValue(worldData) : {};
  const originalEntries = Array.isArray(originalWorldData.entries) ? originalWorldData.entries : [];
  const nextEntries = originalEntries.map(entry => cloneValue(entry));
  const totals = { inserted: 0, updated: 0, deleted: 0, skipped: 0 };
  const entries = [];

  list.forEach((action, index) => {
    const type = normalizeWorldbookActionType(action);
    let preview = null;
    if (['insert', 'insert_entry', 'add', 'add_entry', 'create', 'create_entry'].includes(type)) {
      preview = applyInsertPreview({ action, actionIndex: index, entries: nextEntries });
    } else if (['update', 'update_entry', 'patch', 'patch_entry', 'set', 'set_entry'].includes(type)) {
      preview = applyUpdatePreview({ action, actionIndex: index, entries: nextEntries });
    } else if (['delete', 'delete_entry', 'remove', 'remove_entry'].includes(type)) {
      preview = applyDeletePreview({ action, actionIndex: index, entries: nextEntries });
    } else if (['toggle', 'toggle_entry'].includes(type)) {
      preview = applyTogglePreview({ action, actionIndex: index, entries: nextEntries });
    } else if (['disable', 'disable_entry'].includes(type)) {
      preview = applyTogglePreview({ action, actionIndex: index, entries: nextEntries, forceDisabled: true });
    } else if (['enable', 'enable_entry'].includes(type)) {
      preview = applyTogglePreview({ action, actionIndex: index, entries: nextEntries, forceDisabled: false });
    } else {
      preview = buildPreviewEntry({
        index,
        action,
        kind: 'skip',
        reason: 'unsupportedAction',
      });
    }

    if (preview.kind === 'insert') totals.inserted += 1;
    else if (preview.kind === 'update') totals.updated += 1;
    else if (preview.kind === 'delete') totals.deleted += 1;
    else totals.skipped += 1;
    entries.push(preview);
  });

  const result = {
    worldId: trim(worldId || originalWorldData.id || originalWorldData.name),
    entryCountBefore: originalEntries.length,
    entryCountAfter: nextEntries.length,
    ...totals,
    changed: totals.inserted + totals.updated + totals.deleted,
    entries,
    rollbackSnapshot: {
      worldId: trim(worldId || originalWorldData.id || originalWorldData.name),
      worldData: originalWorldData,
    },
  };
  if (includeNextWorldData) {
    result.nextWorldData = {
      ...cloneValue(originalWorldData),
      entries: nextEntries.map(entry => cloneValue(entry)),
    };
  }
  return result;
};
