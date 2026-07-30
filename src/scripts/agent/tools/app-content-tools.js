import { normalizeMaidImageAttachments } from '../maid-attachment-parts.js';
import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../../storage/builtin-worldbooks.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOwn = (value, key) => isPlainObject(value) &&
  Object.prototype.hasOwnProperty.call(value, key);

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const normalizeKey = value => trim(value).toLowerCase().replace(/\s+/g, '');

const resolveMaidReferenceImages = (requested = [], context = {}) => {
  const references = (Array.isArray(requested) ? requested : []).map(item => trim(item)).filter(Boolean);
  const attachments = normalizeMaidImageAttachments(context?.maidAttachments);
  const urls = [];
  const missing = [];
  const seen = new Set();
  references.forEach((reference) => {
    const ordinal = reference.match(/^(?:图片|image)?\s*(\d+)$/i);
    const key = normalizeKey(reference);
    const attachment = (ordinal ? attachments[Number(ordinal[1]) - 1] : null) || attachments.find(item => (
      normalizeKey(item.id) === key || normalizeKey(item.name) === key
    ));
    if (!attachment?.url) {
      missing.push(reference);
      return;
    }
    if (seen.has(attachment.url)) return;
    seen.add(attachment.url);
    urls.push(attachment.url);
  });
  return {
    urls,
    missing,
    available: attachments.map((item, index) => ({
      index: index + 1,
      id: trim(item.id),
      name: trim(item.name),
    })),
  };
};

const listStoreItems = store => (
  typeof store?.getAll === 'function'
    ? store.getAll()
    : (typeof store?.listContacts === 'function' ? store.listContacts() : [])
).filter(Boolean);

const findStoreItem = (store, query = '') => {
  const raw = trim(query);
  if (!raw) return null;
  const direct = typeof store?.get === 'function'
    ? store.get(raw)
    : (typeof store?.getContact === 'function' ? store.getContact(raw) : null);
  if (direct) return direct;
  const key = normalizeKey(raw);
  return listStoreItems(store).find(item => (
    trim(item?.id) === raw ||
    trim(item?.name) === raw ||
    normalizeKey(item?.id) === key ||
    normalizeKey(item?.name) === key
  )) || null;
};

const getActiveStoreItem = store => {
  try {
    return typeof store?.getActive === 'function' ? store.getActive() : null;
  } catch {
    return null;
  }
};

const summarizeProfile = profile => ({
  id: trim(profile?.id),
  name: trim(profile?.name || profile?.id),
  description: trim(profile?.description),
});

const resolveProfileSwitchTarget = (args = {}, keys = []) => {
  for (const key of keys) {
    const value = trim(args?.[key]);
    if (value) return value;
  }
  return '';
};

const buildSwitchProfileResult = async ({
  kind = 'profile',
  args = {},
  store = null,
  switchProfile = null,
  targetKeys = ['target', 'id', 'name'],
} = {}) => {
  const target = resolveProfileSwitchTarget(args, targetKeys);
  if (!target) return { ok: false, switched: false, reason: 'missing_target' };
  const profile = findStoreItem(store, target);
  if (!profile?.id) {
    return {
      ok: false,
      switched: false,
      reason: `${kind}_not_found`,
      target,
    };
  }
  let switched = false;
  if (typeof switchProfile === 'function') {
    switched = await switchProfile(profile.id);
  } else if (typeof store?.setActive === 'function') {
    switched = await store.setActive(profile.id);
  }
  if (!switched) {
    return {
      ok: false,
      switched: false,
      reason: `${kind}_switch_failed`,
      target,
      profile: summarizeProfile(profile),
    };
  }
  return {
    ok: true,
    switched: true,
    [`${kind}Id`]: trim(profile.id),
    profile: summarizeProfile(profile),
  };
};

const normalizeWorldEntry = (entry = {}, index = 0) => {
  const source = isPlainObject(entry) ? entry : {};
  const title = trim(source.title || source.comment || source.name || source.id, `entry-${index + 1}`);
  const id = trim(source.id, title);
  const keys = Array.isArray(source.keys)
    ? source.keys
    : (Array.isArray(source.key) ? source.key : [title]);
  const keysecondary = Array.isArray(source.keysecondary)
    ? source.keysecondary
    : (Array.isArray(source.secondary) ? source.secondary : []);
  return {
    ...clone(source),
    id,
    comment: title,
    title,
    content: trim(source.content || source.description || title),
    key: keys.map(item => trim(item)).filter(Boolean),
    triggers: keys.map(item => trim(item)).filter(Boolean),
    keysecondary: keysecondary.map(item => trim(item)).filter(Boolean),
    secondary: keysecondary.map(item => trim(item)).filter(Boolean),
    order: Number.isFinite(Number(source.order ?? source.priority)) ? Number(source.order ?? source.priority) : 100 + index,
    priority: Number.isFinite(Number(source.order ?? source.priority)) ? Number(source.order ?? source.priority) : 100 + index,
    depth: Number.isFinite(Number(source.depth)) ? Number(source.depth) : 4,
    position: Number.isFinite(Number(source.position)) ? Number(source.position) : 0,
    selective: source.selective === true,
    selectiveLogic: Number.isFinite(Number(source.selectiveLogic)) ? Number(source.selectiveLogic) : 0,
    disable: source.disable === true,
    constant: source.constant !== false,
    probability: Number.isFinite(Number(source.probability)) ? Number(source.probability) : 100,
    useProbability: source.useProbability !== false,
  };
};

const normalizeStringList = value => {
  if (Array.isArray(value)) return value.map(item => trim(item)).filter(Boolean);
  const text = trim(value);
  return text ? [text] : [];
};

const truncateText = (value = '', maxLength = 2000) => {
  const text = trim(value);
  const limit = Math.max(120, Math.min(12000, Number(maxLength) || 2000));
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
};

const getWorldEntries = data => {
  if (Array.isArray(data?.entries)) return data.entries;
  if (data?.entries && typeof data.entries === 'object') return Object.values(data.entries);
  return [];
};

const readWorldEntryId = entry => trim(entry?.id || entry?.uid || entry?.comment || entry?.title || entry?.name);

const makeUniqueWorldEntryId = (baseEntry = {}, entries = [], index = 0) => {
  const existing = new Set((Array.isArray(entries) ? entries : []).map(readWorldEntryId).filter(Boolean));
  const base = trim(readWorldEntryId(baseEntry), `entry-${index + 1}`);
  if (!existing.has(base)) return base;
  let suffix = 2;
  let next = `${base}-${suffix}`;
  while (existing.has(next)) {
    suffix += 1;
    next = `${base}-${suffix}`;
  }
  return next;
};

const makeUniqueWorldbookName = async (baseName = '', {
  listWorlds = null,
  getWorldInfo = null,
} = {}) => {
  const base = trim(baseName, '女仆创建的世界书');
  const names = new Set();
  if (typeof listWorlds === 'function') {
    try {
      normalizeStringList(await listWorlds()).forEach(name => names.add(name));
    } catch {}
  }
  if (!names.has(base) && typeof getWorldInfo === 'function') {
    try {
      if (await getWorldInfo(base)) names.add(base);
    } catch {}
  }
  if (!names.has(base)) return base;
  let index = 2;
  let next = `${base} (${index})`;
  while (names.has(next)) {
    index += 1;
    next = `${base} (${index})`;
  }
  return next;
};

const normalizeWorldbookEntrySummary = (entry = {}, index = 0, { includeContent = false, maxContentLength = 2000 } = {}) => {
  const source = isPlainObject(entry) ? entry : {};
  const title = trim(source.title || source.comment || source.name || source.id, `entry-${index + 1}`);
  const keys = [
    ...normalizeStringList(source.key),
    ...normalizeStringList(source.keys),
    ...normalizeStringList(source.triggers),
  ];
  const secondaryKeys = [
    ...normalizeStringList(source.keysecondary),
    ...normalizeStringList(source.secondary),
  ];
  const summary = {
    id: trim(source.id),
    title,
    keys: Array.from(new Set(keys)),
    secondaryKeys: Array.from(new Set(secondaryKeys)),
    disabled: source.disable === true || source.disabled === true,
    constant: source.constant === true,
    order: Number.isFinite(Number(source.order ?? source.priority)) ? Number(source.order ?? source.priority) : undefined,
    position: Number.isFinite(Number(source.position)) ? Number(source.position) : undefined,
    contentLength: trim(source.content || source.description || '').length,
  };
  if (includeContent === true) {
    summary.content = truncateText(source.content || source.description || '', maxContentLength);
    summary.contentTruncated = trim(source.content || source.description || '').length > maxContentLength;
  }
  return summary;
};

const hasWorldbookEntryFilter = (args = {}) => Boolean(trim(
  args.entryId || args.entry || args.entryName || args.entryTitle || args.title || args.query,
));

const worldbookEntryMatches = (entry = {}, index = 0, args = {}) => {
  if (!hasWorldbookEntryFilter(args)) return true;
  const source = isPlainObject(entry) ? entry : {};
  const id = readWorldEntryId(source);
  const title = trim(source.title || source.comment || source.name || source.id, `entry-${index + 1}`);
  const keys = [
    ...normalizeStringList(source.key),
    ...normalizeStringList(source.keys),
    ...normalizeStringList(source.triggers),
    ...normalizeStringList(source.keysecondary),
    ...normalizeStringList(source.secondary),
  ];
  const entryId = trim(args.entryId || args.entry || args.entryName);
  if (entryId) {
    const target = normalizeKey(entryId);
    if ([id, title, ...keys].some(value => normalizeKey(value) === target)) return true;
  }
  const entryTitle = trim(args.entryTitle || args.title);
  if (entryTitle) {
    const target = normalizeKey(entryTitle);
    const normalizedTitle = normalizeKey(title);
    if (normalizedTitle === target || normalizedTitle.includes(target)) return true;
  }
  const query = trim(args.query);
  if (query) {
    const target = normalizeKey(query);
    const haystack = [id, title, ...keys, trim(source.content || source.description || '')]
      .map(normalizeKey)
      .join('\n');
    return haystack.includes(target);
  }
  return false;
};

const findWorldbookEntryIndex = (entries = [], update = {}) => {
  const source = isPlainObject(update) ? update : {};
  const exactTargets = [
    source.entryId,
    source.entry,
    source.entryName,
    source.entryTitle,
    source.target,
    source.id,
    source.title,
    source.comment,
    source.name,
  ].map(value => normalizeKey(value)).filter(Boolean);
  if (exactTargets.length) {
    const exactIndex = entries.findIndex((entry, index) => {
      const title = trim(entry?.title || entry?.comment || entry?.name || entry?.id, `entry-${index + 1}`);
      const keys = [
        ...normalizeStringList(entry?.key),
        ...normalizeStringList(entry?.keys),
        ...normalizeStringList(entry?.triggers),
        ...normalizeStringList(entry?.keysecondary),
        ...normalizeStringList(entry?.secondary),
      ];
      return [readWorldEntryId(entry), title, ...keys]
        .map(value => normalizeKey(value))
        .some(value => value && exactTargets.includes(value));
    });
    if (exactIndex >= 0) return exactIndex;
  }
  const query = normalizeKey(source.query);
  if (!query) return -1;
  return entries.findIndex((entry, index) => {
    const title = trim(entry?.title || entry?.comment || entry?.name || entry?.id, `entry-${index + 1}`);
    const haystack = [
      readWorldEntryId(entry),
      title,
      ...normalizeStringList(entry?.key),
      ...normalizeStringList(entry?.keys),
      ...normalizeStringList(entry?.triggers),
      trim(entry?.content || entry?.description || ''),
    ].map(value => normalizeKey(value)).join('\n');
    return haystack.includes(query);
  });
};

const readWorldEntryTitle = (entry = {}, index = 0) => trim(
  entry?.title || entry?.comment || entry?.name || entry?.id,
  `entry-${index + 1}`,
);

const normalizeWorldbookEntrySelector = (selector = {}) => {
  if (isPlainObject(selector)) return selector;
  const text = trim(selector);
  return text ? { entryTitle: text } : {};
};

const buildWorldbookDeletePlan = (entries = [], args = {}) => {
  const deleteIndexes = new Map();
  const skippedDeletes = [];
  const addDeleteIndex = (index, reason = 'matched_selector') => {
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;
    if (deleteIndexes.has(index)) return;
    deleteIndexes.set(index, {
      index,
      reason,
      entry: normalizeWorldbookEntrySummary(entries[index], index),
    });
  };

  const selectors = [
    ...(Array.isArray(args.entries) ? args.entries : []),
    ...(Array.isArray(args.deletes) ? args.deletes : []),
  ];
  const explicitSelectorFields = ['entries', 'deletes']
    .filter(field => Array.isArray(args[field]) && args[field].length);
  if (args.dedupeByTitle === true && explicitSelectorFields.length) {
    return {
      deleteIndexes: new Set(),
      deletedEntries: [],
      skippedDeletes: [],
      deleteCount: 0,
      invalidReason: 'ambiguous_delete_mode',
      conflictingFields: [...explicitSelectorFields, 'dedupeByTitle'],
    };
  }
  selectors.forEach((selector, index) => {
    const criteria = normalizeWorldbookEntrySelector(selector);
    if (!Object.keys(criteria).length) {
      skippedDeletes.push({ index, reason: 'invalid_selector' });
      return;
    }
    const matchIndex = findWorldbookEntryIndex(entries, criteria);
    if (matchIndex >= 0) {
      addDeleteIndex(matchIndex, 'matched_selector');
      return;
    }
    skippedDeletes.push({
      index,
      reason: 'entry_not_found',
      target: trim(criteria.entryId || criteria.entryTitle || criteria.title || criteria.name || criteria.query, `delete-${index + 1}`),
    });
  });

  if (args.dedupeByTitle === true) {
    const keep = trim(args.keep, 'first') === 'last' ? 'last' : 'first';
    const titleFilters = new Set(
      normalizeStringList(args.duplicateTitles || args.titles)
        .map(normalizeKey)
        .filter(Boolean),
    );
    const groups = new Map();
    entries.forEach((entry, index) => {
      const title = readWorldEntryTitle(entry, index);
      const key = normalizeKey(title);
      if (!key || (titleFilters.size && !titleFilters.has(key))) return;
      const group = groups.get(key) || {
        title,
        indexes: [],
      };
      group.indexes.push(index);
      groups.set(key, group);
    });
    groups.forEach(group => {
      if (group.indexes.length <= 1) return;
      const keepIndex = keep === 'last'
        ? group.indexes[group.indexes.length - 1]
        : group.indexes[0];
      group.indexes.forEach(index => {
        if (index !== keepIndex) addDeleteIndex(index, 'duplicate_title');
      });
    });
  }

  const deletedEntries = Array.from(deleteIndexes.values())
    .sort((a, b) => a.index - b.index);
  return {
    deleteIndexes: new Set(deletedEntries.map(item => item.index)),
    deletedEntries,
    skippedDeletes,
    deleteCount: deletedEntries.length,
  };
};

const applyWorldbookEntryUpdate = (entry = {}, update = {}, index = 0) => {
  const source = isPlainObject(update) ? update : {};
  const next = isPlainObject(entry) ? clone(entry) : {};
  const title = trim(
    hasOwn(source, 'newTitle') ? source.newTitle :
      (hasOwn(source, 'title') ? source.title :
        (hasOwn(source, 'comment') ? source.comment : '')),
  );
  if (title) {
    next.title = title;
    next.comment = title;
  }
  const newId = trim(source.newId);
  if (newId) {
    next.id = newId;
  } else if (!trim(next.id)) {
    next.id = trim(next.title || next.comment || next.name, `entry-${index + 1}`);
  }
  if (hasOwn(source, 'content')) next.content = trim(source.content);
  if (!hasOwn(source, 'content') && hasOwn(source, 'description')) next.content = trim(source.description);
  const keys = hasOwn(source, 'keys') ? source.keys : (hasOwn(source, 'key') ? source.key : source.triggers);
  if (hasOwn(source, 'keys') || hasOwn(source, 'key') || hasOwn(source, 'triggers')) {
    const normalizedKeys = normalizeStringList(keys);
    next.key = normalizedKeys;
    next.keys = normalizedKeys;
    next.triggers = normalizedKeys;
  }
  const secondaryKeys = hasOwn(source, 'secondaryKeys')
    ? source.secondaryKeys
    : (hasOwn(source, 'keysecondary') ? source.keysecondary : source.secondary);
  if (hasOwn(source, 'secondaryKeys') || hasOwn(source, 'keysecondary') || hasOwn(source, 'secondary')) {
    const normalizedSecondary = normalizeStringList(secondaryKeys);
    next.keysecondary = normalizedSecondary;
    next.secondary = normalizedSecondary;
  }
  ['order', 'priority', 'depth', 'position', 'selectiveLogic', 'probability'].forEach((key) => {
    if (!hasOwn(source, key)) return;
    const numeric = Number(source[key]);
    if (Number.isFinite(numeric)) next[key] = numeric;
  });
  if (hasOwn(source, 'disabled')) next.disable = source.disabled === true;
  ['disable', 'selective', 'constant', 'useProbability'].forEach((key) => {
    if (hasOwn(source, key)) next[key] = source[key] === true;
  });
  return normalizeWorldEntry(next, index);
};

const hasWorldbookEntryOverwriteFields = (updates = []) => (
  (Array.isArray(updates) ? updates : []).some(update => (
    isPlainObject(update) &&
    ['content', 'description', 'title', 'newTitle', 'comment', 'name', 'keys', 'key', 'triggers', 'secondaryKeys', 'keysecondary', 'secondary']
      .some(key => hasOwn(update, key))
  ))
);

const summarizeWorldbook = (worldId = '', data = null, meta = {}) => {
  const entries = getWorldEntries(data);
  return {
    id: trim(worldId || data?.id || data?.name),
    name: trim(data?.name || worldId || data?.id),
    entryCount: entries.length,
    boundToCurrentSession: meta.boundToCurrentSession === true,
    global: meta.global === true,
  };
};

const formatNowTime = () => {
  try {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const createAppContentAgentTools = ({
  generateWithSubAgent = null,
  personaStore = null,
  userStore = null,
  contactsStore = null,
  chatStore = null,
  switchPersona = null,
  switchUserProfile = null,
  deletePersona = null,
  notifyPersonaChanged = null,
  saveWorldInfo = null,
  getWorldInfo = null,
  worldInfoExists = null,
  listWorlds = null,
  deleteWorldInfo = null,
  waitForWorldStoreReady = null,
  getCurrentWorldId = null,
  getCurrentWorldIds = null,
  getWorldIdsForSession = null,
  getWorldSessionMap = null,
  getGlobalWorldId = null,
  assignWorldToPersona = null,
  bindWorldToSession = null,
  enterChatRoom = null,
  refreshChatAndContacts = null,
  setActiveSession = null,
  sendChatMessage = null,
  generateChatImage = null,
  listModelProfiles = null,
  switchModelProfile = null,
  confirmDestructiveWrite = null,
  renderSessionNameHtml = (id, contact) => trim(contact?.name || id, id),
  getActiveUserName = () => '我',
  getActiveUserAvatar = () => '',
  now = Date.now,
} = {}) => {
  const getSessionWorldIds = async (sessionId = '') => {
    const sid = trim(sessionId || chatStore?.getCurrent?.());
    if (typeof getWorldIdsForSession === 'function') {
      return Array.from(new Set(normalizeStringList(await getWorldIdsForSession(sid))));
    }
    if (typeof getCurrentWorldIds === 'function') {
      return Array.from(new Set(normalizeStringList(await getCurrentWorldIds(sid))));
    }
    if (typeof getCurrentWorldId === 'function') {
      return Array.from(new Set(normalizeStringList(await getCurrentWorldId(sid))));
    }
    return [];
  };

  const getGlobalWorld = async () => (
    typeof getGlobalWorldId === 'function' ? trim(await getGlobalWorldId()) : ''
  );

  const resolveWorldbookId = async (args = {}) => {
    const explicit = trim(args.worldbookId || args.id || args.name);
    if (explicit) return explicit;
    const sessionIds = await getSessionWorldIds(args.sessionId);
    if (sessionIds.length) return sessionIds[0];
    return await getGlobalWorld();
  };

  const resolveWorldbookCreateTarget = async (args = {}) => {
    const personaQuery = trim(args.personaId || args.personaName);
    const persona = personaQuery
      ? findStoreItem(personaStore, personaQuery)
      : getActiveStoreItem(personaStore);
    const fallbackWorldName = trim(persona?.name || persona?.id)
      ? `${trim(persona?.name || persona?.id)} 世界书`
      : '女仆创建的世界书';
    const explicitName = trim(args.name);
    const name = trim(explicitName, fallbackWorldName);
    const existing = typeof getWorldInfo === 'function' ? await getWorldInfo(name) : null;
    const existingEntries = getWorldEntries(existing);
    const requestedMode = trim(args.mode, 'append');
    const mode = requestedMode === 'replace'
      ? 'replace'
      : (requestedMode === 'create_new' ? 'create_new' : 'append');
    return {
      personaQuery,
      persona,
      explicitName,
      name,
      existing,
      existingEntries,
      mode,
    };
  };

  const resolveWorldbookUpdateTarget = async (args = {}) => {
    const worldbookId = await resolveWorldbookId(args);
    const existing = worldbookId && typeof getWorldInfo === 'function'
      ? await getWorldInfo(worldbookId)
      : null;
    const existingEntries = getWorldEntries(existing);
    return {
      worldbookId,
      existing,
      existingEntries,
      updates: Array.isArray(args.updates) ? args.updates : [],
      createMissing: args.createMissing === true,
    };
  };

  const resolveWorldbookDeleteTarget = async (args = {}) => {
    const worldbookId = await resolveWorldbookId(args);
    const existing = worldbookId && typeof getWorldInfo === 'function'
      ? await getWorldInfo(worldbookId)
      : null;
    const existingEntries = getWorldEntries(existing);
    return {
      worldbookId,
      existing,
      existingEntries,
      deletePlan: buildWorldbookDeletePlan(existingEntries, args),
    };
  };

  const hasAllowedToolSafety = (context = {}, kind = '') => (
    context?.toolSafety?.decision === 'allow' &&
    (!kind || context?.toolSafety?.request?.kind === kind)
  );
  const hasFallbackToolSafety = (context = {}, kind = '') => (
    context?.toolSafety?.decision === 'fallback' &&
    (!kind || context?.toolSafety?.request?.kind === kind)
  );
  const isWorldbookUpdateAllowed = (context = {}) => hasAllowedToolSafety(context, 'worldbook.update_entries');
  const isWorldbookDeleteAllowed = (context = {}) => hasAllowedToolSafety(context, 'worldbook.delete_entries');
  const personaDeleteSnapshots = new WeakMap();
  const worldbookDeleteSnapshots = new WeakMap();

  const compactPersonaDeleteItem = (item = {}) => ({
    target: trim(item.target),
    personaId: trim(item.personaId),
    name: trim(item.name || item.target),
    status: trim(item.status),
    reason: trim(item.reason),
  });

  const buildPersonaDeleteSnapshot = async (args = {}) => {
    const requested = normalizeStringList(args.personas);
    const personas = listStoreItems(personaStore);
    const activePersonaId = trim(getActiveStoreItem(personaStore)?.id);
    const selectedIds = new Set();
    const items = requested.map(target => {
      const persona = findStoreItem(personaStore, target);
      const personaId = trim(persona?.id);
      if (!personaId) {
        return {
          target,
          personaId: '',
          name: target,
          avatar: '',
          status: 'missing',
          reason: 'persona_not_found',
        };
      }
      if (selectedIds.has(personaId)) {
        return {
          target,
          personaId,
          name: trim(persona?.name || personaId),
          avatar: trim(persona?.avatar),
          status: 'skipped',
          reason: 'duplicate_target',
        };
      }
      selectedIds.add(personaId);
      return {
        target,
        personaId,
        name: trim(persona?.name || personaId),
        avatar: trim(persona?.avatar),
        status: 'planned',
        reason: '',
      };
    });

    const remainingIds = personas
      .map(persona => trim(persona?.id))
      .filter(personaId => personaId && !selectedIds.has(personaId));
    if (!remainingIds.length && selectedIds.size) {
      const protectedPersonaId = selectedIds.has(activePersonaId)
        ? activePersonaId
        : trim(items.find(item => item.status === 'planned')?.personaId);
      const protectedItem = items.find(item => (
        item.status === 'planned' && item.personaId === protectedPersonaId
      ));
      if (protectedItem) {
        protectedItem.status = 'protected';
        protectedItem.reason = 'last_persona_protected';
      }
    }
    return {
      requested,
      items,
      plannedCount: items.filter(item => item.status === 'planned').length,
    };
  };

  const compactWorldbookDeleteItem = (item = {}) => ({
    target: trim(item.target),
    worldbookId: trim(item.worldbookId),
    name: trim(item.name || item.target),
    bindingCount: Math.max(0, Number(item.bindingCount) || 0),
    status: trim(item.status),
    reason: trim(item.reason),
  });

  const buildWorldbookDeleteSnapshot = async (args = {}) => {
    await waitForWorldStoreReady?.();
    const requested = normalizeStringList(args.worldbooks);
    const storedIds = typeof listWorlds === 'function'
      ? normalizeStringList(await listWorlds())
      : [];
    const worldSessionMap = typeof getWorldSessionMap === 'function'
      ? await getWorldSessionMap()
      : {};
    const globalWorldId = await getGlobalWorld();
    const personas = listStoreItems(personaStore);
    const selectedIds = new Set();
    const resolveStoredId = target => (
      storedIds.find(worldId => normalizeKey(worldId) === normalizeKey(target)) || target
    );
    const countBindings = worldbookId => {
      let count = 0;
      if (worldSessionMap && typeof worldSessionMap === 'object' && !Array.isArray(worldSessionMap)) {
        Object.values(worldSessionMap).forEach(value => {
          if (normalizeStringList(value).includes(worldbookId)) count += 1;
        });
      }
      if (globalWorldId === worldbookId) count += 1;
      personas.forEach(persona => {
        if (trim(persona?.source?.worldbookId) === worldbookId) count += 1;
      });
      return count;
    };

    const items = [];
    for (const target of requested) {
      const worldbookId = resolveStoredId(target);
      const isBuiltin = worldbookId === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID;
      const existing = typeof getWorldInfo === 'function'
        ? await getWorldInfo(worldbookId)
        : null;
      const exists = Boolean(existing) || storedIds.includes(worldbookId);
      const name = trim(existing?.name || worldbookId || target);
      if (isBuiltin) {
        items.push({
          target,
          worldbookId,
          name,
          bindingCount: countBindings(worldbookId),
          status: 'protected',
          reason: 'builtin_worldbook_protected',
        });
        continue;
      }
      if (!exists) {
        items.push({
          target,
          worldbookId: '',
          name: target,
          bindingCount: 0,
          status: 'missing',
          reason: 'worldbook_not_found',
        });
        continue;
      }
      if (selectedIds.has(worldbookId)) {
        items.push({
          target,
          worldbookId,
          name,
          bindingCount: countBindings(worldbookId),
          status: 'skipped',
          reason: 'duplicate_target',
        });
        continue;
      }
      selectedIds.add(worldbookId);
      items.push({
        target,
        worldbookId,
        name,
        bindingCount: countBindings(worldbookId),
        status: 'planned',
        reason: '',
      });
    }
    return {
      requested,
      items,
      plannedCount: items.filter(item => item.status === 'planned').length,
    };
  };

  const resolveSessionBindingTarget = async (value = '') => {
    const target = trim(value);
    if (!target) return { found: false, target, reason: 'missing_session_id' };
    const contact = findStoreItem(contactsStore, target);
    if (contact) {
      return {
        found: true,
        target,
        sessionId: trim(contact.id || target),
        sessionName: trim(contact.name || contact.id || target),
      };
    }
    const canListSessions = typeof chatStore?.listSessions === 'function';
    const sessionIds = canListSessions
      ? normalizeStringList(await chatStore.listSessions())
      : [];
    const targetKey = normalizeKey(target);
    const sessionId = sessionIds.find(id => normalizeKey(id) === targetKey);
    if (sessionId) {
      return {
        found: true,
        target,
        sessionId,
        sessionName: sessionId,
      };
    }
    const hasContactLookup = Boolean(
      contactsStore &&
      (typeof contactsStore.getContact === 'function' || typeof contactsStore.listContacts === 'function'),
    );
    if (hasContactLookup || canListSessions) {
      return { found: false, target, sessionId: target, reason: 'session_not_found' };
    }
    return { found: true, target, sessionId: target, sessionName: target };
  };

  return [
  {
    name: 'persona.create',
    title: 'Create character card',
    description: 'Create an APP character card/persona profile.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_delete',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'create',
      destructive: 'never',
      description: 'Creates a new character card or reuses an existing one; it does not overwrite existing profile content.',
    },
    schema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        description: { type: 'string', maxLength: 12000 },
        avatar: { type: 'string', maxLength: 500000 },
        setActive: { type: 'boolean' },
        allowDuplicate: { type: 'boolean' },
      },
    },
    execute: async (args = {}) => {
      const name = trim(args.name);
      if (!name) return { ok: false, created: false, reason: 'missing_name' };
      if (!personaStore || typeof personaStore.create !== 'function') {
        return { ok: false, created: false, reason: 'persona_store_unavailable' };
      }
      const existing = args.allowDuplicate === true ? null : findStoreItem(personaStore, name);
      const profile = existing || await personaStore.create({
        name,
        avatar: trim(args.avatar),
        description: trim(args.description),
        source: {
          type: 'character_card',
          cardName: name,
          characterName: name,
          importedBy: 'maid',
        },
      });
      if (args.setActive === true) {
        if (typeof switchPersona === 'function') await switchPersona(profile.id || name);
        else if (typeof personaStore.setActive === 'function') await personaStore.setActive(profile.id);
      }
      return {
        ok: true,
        created: !existing,
        personaId: trim(profile?.id),
        profile: summarizeProfile(profile),
      };
    },
    summarizeResult: result => result?.created
      ? `created character card ${trim(result?.profile?.name, '-')}`
      : `character card already exists ${trim(result?.profile?.name, '-')}`,
  },
  {
    name: 'persona.delete_many',
    title: 'Delete multiple character cards',
    description: 'Delete multiple explicit character cards with one structured confirmation. At least one character card is always retained, and independently stored worldbooks, regex sets, and scripts are preserved.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'high',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'none',
      confirmation: 'required',
    },
    safety: {
      operationType: 'delete_character_cards',
      destructive: 'conditional',
      description: 'Permanently deletes selected character cards and their persona-owned runtime data without deleting separately stored bound resources.',
      preflight: async (args = {}) => {
        const snapshot = await buildPersonaDeleteSnapshot(args);
        personaDeleteSnapshots.set(args, snapshot);
        if (args.preview === true || snapshot.plannedCount === 0) {
          return { destructive: false, operationType: 'delete_character_cards' };
        }
        return {
          destructive: true,
          kind: 'persona.delete_many',
          operationType: 'delete_character_cards',
          title: '批量删除角色卡',
          message: `将永久删除 ${snapshot.plannedCount} 张角色卡及其角色作用域、RP 会话和锁定关系；独立世界书、正则与脚本会保留。请确认列表范围。`,
          confirmText: '确认删除',
          cancelText: '取消',
          danger: true,
          allowAlways: false,
          details: {
            resource: 'persona',
            requestedCount: snapshot.requested.length,
            plannedCount: snapshot.plannedCount,
            items: snapshot.items.map(item => ({
              id: item.personaId || item.target,
              label: item.name,
              avatar: item.avatar,
              showAvatar: true,
              meta: item.personaId === trim(getActiveStoreItem(personaStore)?.id) ? '当前角色卡' : '角色卡',
              status: item.status,
              reason: item.reason,
            })),
          },
          onDeny: {
            action: 'skip',
            reason: 'persona_delete_cancelled',
            result: {
              ok: false,
              skipped: true,
              reason: 'persona_delete_cancelled',
              requestedCount: snapshot.requested.length,
              plannedCount: snapshot.plannedCount,
            },
          },
        };
      },
    },
    schema: {
      type: 'object',
      required: ['personas'],
      additionalProperties: false,
      properties: {
        personas: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
        preview: { type: 'boolean' },
      },
    },
    execute: async (args = {}, context = {}) => {
      const snapshot = personaDeleteSnapshots.get(args) || await buildPersonaDeleteSnapshot(args);
      if (args.preview === true) {
        return {
          ok: true,
          preview: true,
          requestedCount: snapshot.requested.length,
          plannedCount: snapshot.plannedCount,
          results: snapshot.items.map(compactPersonaDeleteItem),
        };
      }
      if (snapshot.plannedCount > 0 && !hasAllowedToolSafety(context, 'persona.delete_many')) {
        return {
          ok: false,
          reason: 'confirmation_required',
          requestedCount: snapshot.requested.length,
          plannedCount: snapshot.plannedCount,
          results: snapshot.items.map(compactPersonaDeleteItem),
        };
      }

      const results = [];
      const deletedItems = [];
      for (const item of snapshot.items) {
        if (item.status !== 'planned') {
          results.push(compactPersonaDeleteItem(item));
          continue;
        }
        const personaId = trim(item.personaId);
        const currentPersona = personaStore?.get?.(personaId);
        if (!currentPersona) {
          results.push(compactPersonaDeleteItem({
            ...item,
            status: 'skipped',
            reason: 'already_absent',
          }));
          continue;
        }
        if (listStoreItems(personaStore).length <= 1) {
          results.push(compactPersonaDeleteItem({
            ...item,
            status: 'protected',
            reason: 'last_persona_protected',
          }));
          continue;
        }
        if (typeof deletePersona !== 'function') {
          results.push(compactPersonaDeleteItem({
            ...item,
            status: 'failed',
            reason: 'persona_delete_unavailable',
          }));
          continue;
        }
        try {
          const deleted = await deletePersona(personaId, {
            deleteWorld: false,
            deleteRegex: false,
            deleteScripts: false,
            cleanupBindings: false,
            notify: false,
          });
          if (deleted?.deleted === false && deleted?.reason === 'already_absent') {
            results.push(compactPersonaDeleteItem({
              ...item,
              status: 'skipped',
              reason: 'already_absent',
            }));
            continue;
          }
          if (deleted?.deleted !== true || personaStore?.get?.(personaId)) {
            results.push(compactPersonaDeleteItem({
              ...item,
              status: 'failed',
              reason: trim(deleted?.reason, 'verification_failed'),
            }));
            continue;
          }
          results.push({
            ...compactPersonaDeleteItem({
              ...item,
              status: 'succeeded',
              reason: '',
            }),
            ...(Array.isArray(deleted?.warnings) && deleted.warnings.length
              ? { cleanupWarnings: clone(deleted.warnings) }
              : {}),
          });
          deletedItems.push({ id: personaId, name: item.name });
        } catch (error) {
          results.push({
            ...compactPersonaDeleteItem({
              ...item,
              status: 'failed',
              reason: 'delete_failed',
            }),
            errorMessage: trim(error?.message || error),
          });
        }
      }

      let notificationWarning = '';
      if (deletedItems.length && typeof notifyPersonaChanged === 'function') {
        try {
          await notifyPersonaChanged();
        } catch (error) {
          notificationWarning = trim(error?.message || error, 'persona_change_notification_failed');
        }
      }
      const succeededCount = results.filter(item => item.status === 'succeeded').length;
      const failed = results.filter(item => item.status === 'failed');
      const skippedCount = results.length - succeededCount - failed.length;
      return {
        ok: failed.length === 0,
        partial: failed.length > 0 && succeededCount > 0,
        preview: false,
        requestedCount: snapshot.requested.length,
        succeededCount,
        skippedCount,
        failedCount: failed.length,
        results,
        ...(notificationWarning ? { notificationWarning } : {}),
        retry: failed.length
          ? {
              toolName: 'persona.delete_many',
              args: { personas: failed.map(item => item.personaId || item.target).filter(Boolean) },
            }
          : null,
        audit: {
          kind: 'persona.delete_many',
          deletedAt: Number(now?.() || Date.now()) || Date.now(),
          items: deletedItems,
        },
      };
    },
    summarizeResult: result => [
      `batch character card deletion ${result?.ok ? 'completed' : 'incomplete'}`,
      `${Number(result?.succeededCount || 0)} succeeded`,
      `${Number(result?.skippedCount || 0)} skipped`,
      `${Number(result?.failedCount || 0)} failed`,
    ].join('; '),
  },
  {
    name: 'user.create',
    title: 'Create user profile',
    description: 'Create an APP user profile/name.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_delete',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'create',
      destructive: 'never',
      description: 'Creates a new user profile or reuses an existing one; it does not overwrite existing profile content.',
    },
    schema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        description: { type: 'string', maxLength: 12000 },
        avatar: { type: 'string', maxLength: 500000 },
        setActive: { type: 'boolean' },
        allowDuplicate: { type: 'boolean' },
      },
    },
    execute: async (args = {}) => {
      const name = trim(args.name);
      if (!name) return { ok: false, created: false, reason: 'missing_name' };
      if (!userStore || typeof userStore.create !== 'function') {
        return { ok: false, created: false, reason: 'user_store_unavailable' };
      }
      const existing = args.allowDuplicate === true ? null : findStoreItem(userStore, name);
      const profile = existing || await userStore.create({
        name,
        avatar: trim(args.avatar),
        description: trim(args.description),
      });
      if (args.setActive === true) {
        if (typeof switchUserProfile === 'function') await switchUserProfile(profile.id || name);
        else if (typeof userStore.setActive === 'function') await userStore.setActive(profile.id);
      }
      return {
        ok: true,
        created: !existing,
        userId: trim(profile?.id),
        profile: summarizeProfile(profile),
      };
    },
    summarizeResult: result => result?.created
      ? `created user ${trim(result?.profile?.name, '-')}`
      : `user already exists ${trim(result?.profile?.name, '-')}`,
  },
  {
    name: 'user.switch',
    title: 'Switch user profile',
    description: 'Switch the active APP user profile/name by id or display name.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_switch_back',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'switch_active',
      destructive: 'never',
      description: 'Switches active user profile without deleting or overwriting profile data.',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: { type: 'string', maxLength: 160 },
        id: { type: 'string', maxLength: 160 },
        userId: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
      },
    },
    execute: async (args = {}) => buildSwitchProfileResult({
      kind: 'user',
      args,
      store: userStore,
      switchProfile: switchUserProfile,
      targetKeys: ['target', 'userId', 'id', 'name'],
    }),
    summarizeResult: result => result?.switched
      ? `switched user to ${trim(result?.profile?.name, '-')}`
      : `switch user failed: ${trim(result?.reason, 'unknown')}`,
  },
  {
    name: 'persona.switch',
    title: 'Switch character card',
    description: 'Switch the active APP character card/persona by id or display name.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_switch_back',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'switch_active',
      destructive: 'never',
      description: 'Switches active character card without deleting or overwriting profile data.',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: { type: 'string', maxLength: 160 },
        id: { type: 'string', maxLength: 160 },
        personaId: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
      },
    },
    execute: async (args = {}) => buildSwitchProfileResult({
      kind: 'persona',
      args,
      store: personaStore,
      switchProfile: switchPersona,
      targetKeys: ['target', 'personaId', 'id', 'name'],
    }),
    summarizeResult: result => result?.switched
      ? `switched character card to ${trim(result?.profile?.name, '-')}`
      : `switch character card failed: ${trim(result?.reason, 'unknown')}`,
  },
  {
    name: 'worldbook.generate_entries',
    title: 'Generate worldbook entries (sub-agent)',
    description: 'Generate long worldbook entry content from outlines using a configured sub-agent model (or main model), then append to the worldbook. Maid passes outlines only, not full text.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'variable',
      undo: 'manual',
      modelContext: 'allowlist',
      confirmation: 'always',
    },
    schema: {
      type: 'object',
      required: ['name', 'entries'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            required: ['title', 'outline'],
            additionalProperties: false,
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 80 },
              outline: { type: 'string', minLength: 4, maxLength: 1200 },
              length: { type: 'integer', minimum: 50, maximum: 1200 },
              keys: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 12 },
            },
          },
        },
        subAgentId: { type: 'string', maxLength: 80 },
      },
    },
    execute: async (args = {}, context = {}) => {
      if (typeof generateWithSubAgent !== 'function') {
        return { ok: false, reason: 'generation_unavailable', message: '正文生成通道未接入。' };
      }
      if (typeof saveWorldInfo !== 'function') {
        return { ok: false, reason: 'worldbook_store_unavailable' };
      }
      const worldbookName = trim(args.name);
      const outlineEntries = (Array.isArray(args.entries) ? args.entries : []).slice(0, 8);
      const generated = [];
      let delegated = false;
      let modelUsed = '';
      let subAgentName = '';
      for (const item of outlineEntries) {
        const title = trim(item?.title);
        const length = Math.max(50, Math.min(1200, Math.trunc(Number(item?.length)) || 220));
        const prompt = [
          `为世界书「${worldbookName}」生成条目正文。`,
          `条目标题：${title}`,
          `要点大纲：${trim(item?.outline)}`,
          `要求：约 ${length} 字；只输出条目正文本身（纯文本，不要标题、不要解释、不要 markdown 代码块）。`,
        ].join('\n');
        const out = await generateWithSubAgent({
          subAgentId: trim(args.subAgentId),
          prompt,
          purposeLabel: `生成世界书条目「${title}」`,
          context,
        });
        if (!out?.ok || !trim(out.text)) {
          return {
            ok: false,
            reason: out?.reason || 'generation_failed',
            message: out?.message || `条目「${title}」生成失败。`,
            generatedCount: generated.length,
          };
        }
        delegated = out.delegated === true;
        modelUsed = trim(out.modelUsed);
        subAgentName = trim(out.subAgentName);
        generated.push({
          title,
          content: trim(out.text),
          keys: Array.isArray(item?.keys) ? item.keys : [],
        });
      }
      // 写入：已有同名世界书则追加，否则新建（不做 replace，安全语义最窄）
      await waitForWorldStoreReady?.();
      const existing = typeof getWorldInfo === 'function' ? await getWorldInfo(worldbookName) : null;
      const existingEntries = getWorldEntries(existing);
      const reserved = existingEntries.map(entry => clone(entry));
      const incoming = generated.map((entry, index) => {
        const normalized = normalizeWorldEntry(entry, index);
        normalized.id = makeUniqueWorldEntryId(normalized, reserved, index);
        reserved.push(normalized);
        return normalized;
      });
      const payload = {
        ...(isPlainObject(existing) ? existing : {}),
        name: worldbookName,
        entries: [...existingEntries.map(entry => clone(entry)), ...incoming],
        updatedBy: 'maid',
        updatedAt: Number(now?.() || Date.now()) || Date.now(),
      };
      await saveWorldInfo(worldbookName, payload);
      return {
        ok: true,
        created: !existing,
        appended: Boolean(existing),
        worldbook: worldbookName,
        entryCount: payload.entries.length,
        generatedCount: generated.length,
        delegated,
        ...(modelUsed ? { modelUsed } : {}),
        ...(subAgentName ? { subAgentName } : {}),
        generatedTitles: generated.map(entry => entry.title),
      };
    },
    summarizeResult: result => (result?.ok === false
      ? `worldbook generate failed: ${result?.reason || 'unknown'}`
      : `generated ${Number(result?.generatedCount || 0)} entries into ${result?.worldbook}${result?.delegated ? ` (delegated to ${result?.subAgentName || result?.modelUsed || 'sub-agent'})` : ''}`),
  },
  {
    name: 'worldbook.create',
    title: 'Create worldbook',
    description: 'Create a worldbook or append new entries to an existing worldbook. Replacing existing entries requires user confirmation.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_delete',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      required: ['entries'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        entries: { type: 'array', minItems: 1, maxItems: 50 },
        mode: { type: 'string', enum: ['append', 'create_new', 'replace'] },
        personaId: { type: 'string', maxLength: 160 },
        personaName: { type: 'string', maxLength: 160 },
        bindToPersona: { type: 'boolean' },
      },
    },
    safety: {
      operationType: 'append_or_replace_worldbook',
      destructive: 'conditional',
      preflight: async (args = {}) => {
        const target = await resolveWorldbookCreateTarget(args);
        if (target.mode !== 'replace' || !target.existingEntries.length) {
          return { destructive: false, operationType: target.mode };
        }
        return {
          destructive: true,
          kind: 'worldbook.replace',
          operationType: 'replace_existing',
          title: '覆盖世界书条目',
          message: `世界书「${target.name}」已有 ${target.existingEntries.length} 个条目。覆盖会用 ${args.entries.length} 个新条目替换原内容。`,
          confirmText: '覆盖',
          cancelText: '新建副本',
          danger: true,
          details: {
            worldbookId: target.name,
            currentEntryCount: target.existingEntries.length,
            nextEntryCount: args.entries.length,
          },
          onDeny: {
            action: 'replace_args',
            reason: 'fallback_create_new',
            args: {
              ...args,
              mode: 'create_new',
            },
          },
        };
      },
    },
    execute: async (args = {}, context = {}) => {
      const {
        personaQuery,
        persona,
        explicitName,
        name,
        existing,
        existingEntries,
        mode,
      } = await resolveWorldbookCreateTarget(args);
      if (!Array.isArray(args.entries) || !args.entries.length) {
        return { ok: false, created: false, reason: 'missing_entries' };
      }
      if (typeof saveWorldInfo !== 'function') {
        return { ok: false, created: false, reason: 'worldbook_store_unavailable' };
      }
      let targetName = mode === 'create_new' ? await makeUniqueWorldbookName(name, { listWorlds, getWorldInfo }) : name;
      let targetExisting = targetName === name ? existing : null;
      let overwritten = false;
      let fallbackCreated = hasFallbackToolSafety(context, 'worldbook.replace');
      if (mode === 'replace' && existingEntries.length) {
        const confirmed = hasAllowedToolSafety(context, 'worldbook.replace')
          ? true
          : (typeof confirmDestructiveWrite === 'function'
          ? await confirmDestructiveWrite({
            kind: 'worldbook.replace',
            title: '覆盖世界书条目',
            message: `世界书「${name}」已有 ${existingEntries.length} 个条目。覆盖会用 ${args.entries.length} 个新条目替换原内容。`,
            confirmText: '覆盖',
            cancelText: '新建副本',
            danger: true,
            worldbookId: name,
            currentEntryCount: existingEntries.length,
            nextEntryCount: args.entries.length,
          })
          : false);
        if (confirmed === true) {
          overwritten = true;
        } else {
          targetName = await makeUniqueWorldbookName(name, { listWorlds, getWorldInfo });
          targetExisting = null;
          fallbackCreated = true;
        }
      }
      const targetExistingEntries = getWorldEntries(targetExisting);
      const reservedEntries = mode === 'replace' && !fallbackCreated
        ? []
        : targetExistingEntries.map(entry => clone(entry));
      const incomingEntries = args.entries.map((entry, index) => {
        const normalized = normalizeWorldEntry(entry, index);
        normalized.id = makeUniqueWorldEntryId(normalized, reservedEntries, index);
        reservedEntries.push(normalized);
        return normalized;
      });
      const nextEntries = mode === 'append' && targetExisting
        ? [...targetExistingEntries.map(entry => clone(entry)), ...incomingEntries]
        : incomingEntries;
      const payload = {
        ...(isPlainObject(targetExisting) ? targetExisting : {}),
        name: targetName,
        entries: nextEntries,
        updatedBy: 'maid',
        updatedAt: Number(now?.() || Date.now()) || Date.now(),
      };
      await saveWorldInfo(targetName, payload);
      let boundPersonaId = '';
      const shouldBindPersona = args.bindToPersona === true || Boolean(personaQuery) || (!explicitName && persona?.id);
      if (shouldBindPersona && persona?.id && typeof assignWorldToPersona === 'function') {
        await assignWorldToPersona(persona.id, targetName, { enabled: true });
        boundPersonaId = trim(persona.id);
      }
      return {
        ok: true,
        created: !targetExisting,
        overwritten,
        fallbackCreated,
        mode: fallbackCreated ? 'create_new' : mode,
        worldbookId: targetName,
        previousWorldbookId: targetName === name ? '' : name,
        previousEntryCount: targetExistingEntries.length,
        addedEntryCount: incomingEntries.length,
        entryCount: nextEntries.length,
        boundPersonaId,
      };
    },
    // 取消覆盖会创建安全副本——摘要必须点名副本，模型才不会漏报这个副作用
    summarizeResult: result => (result?.fallbackCreated
      ? `replace cancelled; created safety copy ${trim(result?.worldbookId, '-')} (${Number(result?.entryCount || 0)} entries), original ${trim(result?.previousWorldbookId, '-')} untouched`
      : `saved worldbook ${trim(result?.worldbookId, '-')} (${Number(result?.entryCount || 0)} entries)`),
  },
  {
    name: 'worldbook.update_entries',
    title: 'Update worldbook entries',
    description: 'Update selected entries in an existing worldbook without replacing unrelated entries.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_restore',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      required: ['updates'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', maxLength: 160 },
        worldbookId: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
        sessionId: { type: 'string', maxLength: 160 },
        updates: { type: 'array', minItems: 1, maxItems: 50 },
        createMissing: { type: 'boolean' },
      },
    },
    safety: {
      operationType: 'update_worldbook_entries',
      destructive: 'conditional',
      preflight: async (args = {}) => {
        const target = await resolveWorldbookUpdateTarget(args);
        if (!target.worldbookId || !target.existingEntries.length || !hasWorldbookEntryOverwriteFields(target.updates)) {
          return { destructive: false, operationType: 'update_worldbook_entries' };
        }
        return {
          destructive: true,
          kind: 'worldbook.update_entries',
          operationType: 'update_existing_entries',
          title: '修改世界书条目',
          message: `世界书「${target.worldbookId}」已有 ${target.existingEntries.length} 个条目。此操作会修改匹配条目的正文、标题或关键词，但不会删除未指定条目。`,
          confirmText: '修改',
          cancelText: '取消',
          danger: true,
          details: {
            worldbookId: target.worldbookId,
            currentEntryCount: target.existingEntries.length,
            updateCount: target.updates.length,
          },
          onDeny: {
            action: 'skip',
            reason: 'worldbook_update_cancelled',
          },
        };
      },
    },
    execute: async (args = {}, context = {}) => {
      await waitForWorldStoreReady?.();
      const target = await resolveWorldbookUpdateTarget(args);
      if (!Array.isArray(args.updates) || !args.updates.length) {
        return { ok: false, updated: false, reason: 'missing_updates' };
      }
      if (!target.worldbookId) return { ok: false, updated: false, reason: 'missing_worldbook_id' };
      if (typeof getWorldInfo !== 'function' || typeof saveWorldInfo !== 'function') {
        return { ok: false, updated: false, reason: 'worldbook_store_unavailable', worldbookId: target.worldbookId };
      }
      if (!target.existing) {
        return { ok: false, updated: false, reason: 'worldbook_not_found', worldbookId: target.worldbookId };
      }
      const requiresConfirmation = target.existingEntries.length > 0 && hasWorldbookEntryOverwriteFields(args.updates);
      if (requiresConfirmation && !isWorldbookUpdateAllowed(context)) {
        const confirmed = typeof confirmDestructiveWrite === 'function'
          ? await confirmDestructiveWrite({
            kind: 'worldbook.update_entries',
            title: '修改世界书条目',
            message: `世界书「${target.worldbookId}」已有 ${target.existingEntries.length} 个条目。此操作会修改匹配条目的正文、标题或关键词，但不会删除未指定条目。`,
            confirmText: '修改',
            cancelText: '取消',
            danger: true,
            worldbookId: target.worldbookId,
            currentEntryCount: target.existingEntries.length,
            updateCount: args.updates.length,
          })
          : false;
        if (confirmed !== true) {
          return {
            ok: false,
            updated: false,
            skipped: true,
            reason: 'worldbook_update_cancelled',
            worldbookId: target.worldbookId,
          };
        }
      }

      const nextEntries = target.existingEntries.map(entry => clone(entry));
      const skippedUpdates = [];
      const updatedEntries = [];
      let createdEntryCount = 0;
      args.updates.forEach((update, index) => {
        if (!isPlainObject(update)) {
          skippedUpdates.push({ index, reason: 'invalid_update' });
          return;
        }
        const matchIndex = findWorldbookEntryIndex(nextEntries, update);
        if (matchIndex < 0) {
          if (args.createMissing === true) {
            const normalized = normalizeWorldEntry(update, nextEntries.length);
            normalized.id = makeUniqueWorldEntryId(normalized, nextEntries, nextEntries.length);
            nextEntries.push(normalized);
            createdEntryCount += 1;
            updatedEntries.push(normalizeWorldbookEntrySummary(normalized, nextEntries.length - 1));
            return;
          }
          skippedUpdates.push({
            index,
            reason: 'entry_not_found',
            target: trim(update.entryId || update.entryTitle || update.title || update.name || update.query, `update-${index + 1}`),
          });
          return;
        }
        const nextEntry = applyWorldbookEntryUpdate(nextEntries[matchIndex], update, matchIndex);
        nextEntries[matchIndex] = nextEntry;
        updatedEntries.push(normalizeWorldbookEntrySummary(nextEntry, matchIndex));
      });

      if (!updatedEntries.length && !createdEntryCount) {
        return {
          ok: false,
          updated: false,
          reason: 'no_matching_entries',
          worldbookId: target.worldbookId,
          skippedUpdates,
        };
      }
      const payload = {
        ...(isPlainObject(target.existing) ? target.existing : {}),
        name: trim(target.existing?.name || target.worldbookId),
        entries: nextEntries,
        updatedBy: 'maid',
        updatedAt: Number(now?.() || Date.now()) || Date.now(),
      };
      await saveWorldInfo(target.worldbookId, payload);
      return {
        ok: true,
        updated: true,
        worldbookId: target.worldbookId,
        updatedEntryCount: updatedEntries.length - createdEntryCount,
        createdEntryCount,
        entryCount: nextEntries.length,
        skippedUpdates,
        updatedEntries,
      };
    },
    summarizeResult: result => result?.ok === false
      ? `update worldbook entries failed: ${trim(result?.reason, 'unknown')}`
      : `updated worldbook ${trim(result?.worldbookId, '-')} (${Number(result?.updatedEntryCount || 0)} updated, ${Number(result?.createdEntryCount || 0)} created)`,
  },
  {
    name: 'worldbook.delete_entries',
    title: 'Delete worldbook entries',
    description: 'Delete selected entries from an existing worldbook, including duplicate entries by title. Requires user confirmation.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'high',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_restore',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', maxLength: 160 },
        worldbookId: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
        sessionId: { type: 'string', maxLength: 160 },
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          description: 'Explicit deletion selectors. Do not combine with dedupeByTitle:true.',
        },
        deletes: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          description: 'Explicit deletion selectors. Do not combine with dedupeByTitle:true.',
        },
        dedupeByTitle: {
          type: 'boolean',
          description: 'Deduplicate by duplicateTitles/titles while preserving keep:first/last. Do not combine with entries/deletes.',
        },
        duplicateTitles: { type: 'array', maxItems: 50 },
        titles: { type: 'array', maxItems: 50 },
        keep: { type: 'string', enum: ['first', 'last'] },
      },
    },
    safety: {
      operationType: 'delete_worldbook_entries',
      destructive: 'conditional',
      preflight: async (args = {}) => {
        const target = await resolveWorldbookDeleteTarget(args);
        if (!target.worldbookId || !target.existingEntries.length || !target.deletePlan.deleteCount) {
          return { destructive: false, operationType: 'delete_worldbook_entries' };
        }
        const titles = Array.from(new Set(
          target.deletePlan.deletedEntries
            .map(item => trim(item.entry?.title || item.entry?.id))
            .filter(Boolean),
        )).slice(0, 8);
        return {
          destructive: true,
          kind: 'worldbook.delete_entries',
          operationType: 'delete_entries',
          title: '删除世界书条目',
          message: `世界书「${target.worldbookId}」将删除 ${target.deletePlan.deleteCount} 个条目。删除后会保留未匹配条目，请确认目标正确。`,
          confirmText: '删除',
          cancelText: '取消',
          danger: true,
          details: {
            worldbookId: target.worldbookId,
            currentEntryCount: target.existingEntries.length,
            deleteCount: target.deletePlan.deleteCount,
            keep: trim(args.keep, 'first') === 'last' ? 'last' : 'first',
            titles,
          },
          onDeny: {
            action: 'skip',
            reason: 'worldbook_delete_cancelled',
          },
        };
      },
    },
    execute: async (args = {}, context = {}) => {
      await waitForWorldStoreReady?.();
      const target = await resolveWorldbookDeleteTarget(args);
      if (!target.worldbookId) return { ok: false, deleted: false, reason: 'missing_worldbook_id' };
      if (target.deletePlan.invalidReason) {
        return {
          ok: false,
          deleted: false,
          reason: target.deletePlan.invalidReason,
          worldbookId: target.worldbookId,
          conflictingFields: target.deletePlan.conflictingFields,
        };
      }
      if (typeof getWorldInfo !== 'function' || typeof saveWorldInfo !== 'function') {
        return { ok: false, deleted: false, reason: 'worldbook_store_unavailable', worldbookId: target.worldbookId };
      }
      if (!target.existing) {
        return { ok: false, deleted: false, reason: 'worldbook_not_found', worldbookId: target.worldbookId };
      }
      if (!target.deletePlan.deleteCount) {
        return {
          ok: false,
          deleted: false,
          reason: 'no_matching_entries',
          worldbookId: target.worldbookId,
          skippedDeletes: target.deletePlan.skippedDeletes,
        };
      }
      if (!isWorldbookDeleteAllowed(context)) {
        const confirmed = typeof confirmDestructiveWrite === 'function'
          ? await confirmDestructiveWrite({
            kind: 'worldbook.delete_entries',
            title: '删除世界书条目',
            message: `世界书「${target.worldbookId}」将删除 ${target.deletePlan.deleteCount} 个条目。删除后会保留未匹配条目，请确认目标正确。`,
            confirmText: '删除',
            cancelText: '取消',
            danger: true,
            worldbookId: target.worldbookId,
            currentEntryCount: target.existingEntries.length,
            deleteCount: target.deletePlan.deleteCount,
          })
          : false;
        if (confirmed !== true) {
          return {
            ok: false,
            deleted: false,
            skipped: true,
            reason: 'worldbook_delete_cancelled',
            worldbookId: target.worldbookId,
          };
        }
      }
      const nextEntries = target.existingEntries
        .filter((entry, index) => !target.deletePlan.deleteIndexes.has(index))
        .map(entry => clone(entry));
      const payload = {
        ...(isPlainObject(target.existing) ? target.existing : {}),
        name: trim(target.existing?.name || target.worldbookId),
        entries: nextEntries,
        updatedBy: 'maid',
        updatedAt: Number(now?.() || Date.now()) || Date.now(),
      };
      await saveWorldInfo(target.worldbookId, payload);
      return {
        ok: true,
        deleted: true,
        worldbookId: target.worldbookId,
        previousEntryCount: target.existingEntries.length,
        deletedEntryCount: target.deletePlan.deleteCount,
        entryCount: nextEntries.length,
        deletedEntries: target.deletePlan.deletedEntries,
        skippedDeletes: target.deletePlan.skippedDeletes,
      };
    },
    summarizeResult: result => result?.ok === false
      ? `delete worldbook entries failed: ${trim(result?.reason, 'unknown')}`
      : `deleted ${Number(result?.deletedEntryCount || 0)} worldbook entries from ${trim(result?.worldbookId, '-')}`,
  },
  {
    name: 'worldbook.delete_many',
    title: 'Delete multiple worldbooks',
    description: 'Delete multiple explicit worldbooks with one structured confirmation. Existing session, global, and character-card bindings are removed by the shared worldbook lifecycle; the built-in phone-format worldbook is protected.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'high',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'none',
      confirmation: 'required',
    },
    safety: {
      operationType: 'delete_worldbooks',
      destructive: 'conditional',
      description: 'Permanently deletes selected worldbooks and unbinds them from sessions, global scope, and character cards.',
      preflight: async (args = {}) => {
        const snapshot = await buildWorldbookDeleteSnapshot(args);
        worldbookDeleteSnapshots.set(args, snapshot);
        if (args.preview === true || snapshot.plannedCount === 0) {
          return { destructive: false, operationType: 'delete_worldbooks' };
        }
        return {
          destructive: true,
          kind: 'worldbook.delete_many',
          operationType: 'delete_worldbooks',
          title: '批量删除世界书',
          message: `将永久删除 ${snapshot.plannedCount} 本世界书；现有聊天室、全局与角色卡绑定会自动解除。请确认列表与绑定影响。`,
          confirmText: '确认删除',
          cancelText: '取消',
          danger: true,
          allowAlways: false,
          details: {
            resource: 'worldbook',
            requestedCount: snapshot.requested.length,
            plannedCount: snapshot.plannedCount,
            items: snapshot.items.map(item => ({
              id: item.worldbookId || item.target,
              label: item.name,
              showAvatar: false,
              meta: item.bindingCount > 0 ? `绑定中 ×${item.bindingCount}` : '未绑定',
              status: item.status,
              reason: item.reason,
            })),
          },
          onDeny: {
            action: 'skip',
            reason: 'worldbook_batch_delete_cancelled',
            result: {
              ok: false,
              skipped: true,
              reason: 'worldbook_batch_delete_cancelled',
              requestedCount: snapshot.requested.length,
              plannedCount: snapshot.plannedCount,
            },
          },
        };
      },
    },
    schema: {
      type: 'object',
      required: ['worldbooks'],
      additionalProperties: false,
      properties: {
        worldbooks: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
        preview: { type: 'boolean' },
      },
    },
    execute: async (args = {}, context = {}) => {
      const snapshot = worldbookDeleteSnapshots.get(args) || await buildWorldbookDeleteSnapshot(args);
      if (args.preview === true) {
        return {
          ok: true,
          preview: true,
          requestedCount: snapshot.requested.length,
          plannedCount: snapshot.plannedCount,
          results: snapshot.items.map(compactWorldbookDeleteItem),
        };
      }
      if (snapshot.plannedCount > 0 && !hasAllowedToolSafety(context, 'worldbook.delete_many')) {
        return {
          ok: false,
          reason: 'confirmation_required',
          requestedCount: snapshot.requested.length,
          plannedCount: snapshot.plannedCount,
          results: snapshot.items.map(compactWorldbookDeleteItem),
        };
      }

      const results = [];
      const deletedItems = [];
      for (const item of snapshot.items) {
        if (item.status !== 'planned') {
          results.push(compactWorldbookDeleteItem(item));
          continue;
        }
        const worldbookId = trim(item.worldbookId);
        const existsBeforeDelete = typeof worldInfoExists === 'function'
          ? await worldInfoExists(worldbookId)
          : Boolean(typeof getWorldInfo === 'function'
            ? await getWorldInfo(worldbookId)
            : null);
        if (!existsBeforeDelete) {
          results.push(compactWorldbookDeleteItem({
            ...item,
            status: 'skipped',
            reason: 'already_absent',
          }));
          continue;
        }
        if (worldbookId === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID) {
          results.push(compactWorldbookDeleteItem({
            ...item,
            status: 'protected',
            reason: 'builtin_worldbook_protected',
          }));
          continue;
        }
        if (typeof deleteWorldInfo !== 'function') {
          results.push(compactWorldbookDeleteItem({
            ...item,
            status: 'failed',
            reason: 'worldbook_delete_unavailable',
          }));
          continue;
        }
        try {
          await deleteWorldInfo(worldbookId);
          const stillExists = typeof worldInfoExists === 'function'
            ? await worldInfoExists(worldbookId)
            : Boolean(typeof getWorldInfo === 'function'
              ? await getWorldInfo(worldbookId)
              : null);
          if (stillExists) {
            results.push(compactWorldbookDeleteItem({
              ...item,
              status: 'failed',
              reason: 'verification_failed',
            }));
            continue;
          }
          results.push(compactWorldbookDeleteItem({
            ...item,
            status: 'succeeded',
            reason: '',
          }));
          deletedItems.push({ id: worldbookId, name: item.name });
        } catch (error) {
          results.push({
            ...compactWorldbookDeleteItem({
              ...item,
              status: 'failed',
              reason: 'delete_failed',
            }),
            errorMessage: trim(error?.message || error),
          });
        }
      }

      const succeededCount = results.filter(item => item.status === 'succeeded').length;
      const failed = results.filter(item => item.status === 'failed');
      const skippedCount = results.length - succeededCount - failed.length;
      return {
        ok: failed.length === 0,
        partial: failed.length > 0 && succeededCount > 0,
        preview: false,
        requestedCount: snapshot.requested.length,
        succeededCount,
        skippedCount,
        failedCount: failed.length,
        results,
        retry: failed.length
          ? {
              toolName: 'worldbook.delete_many',
              args: { worldbooks: failed.map(item => item.worldbookId || item.target).filter(Boolean) },
            }
          : null,
        audit: {
          kind: 'worldbook.delete_many',
          deletedAt: Number(now?.() || Date.now()) || Date.now(),
          items: deletedItems,
        },
      };
    },
    summarizeResult: result => [
      `batch worldbook deletion ${result?.ok ? 'completed' : 'incomplete'}`,
      `${Number(result?.succeededCount || 0)} succeeded`,
      `${Number(result?.skippedCount || 0)} skipped`,
      `${Number(result?.failedCount || 0)} failed`,
    ].join('; '),
  },
  {
    name: 'worldbook.list',
    title: 'List worldbooks',
    description: 'List saved APP worldbooks and mark current-session/global bindings when available.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: false,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'allowlist',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string', maxLength: 160 },
        includeGlobal: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
    execute: async (args = {}) => {
      await waitForWorldStoreReady?.();
      const sessionIds = await getSessionWorldIds(args.sessionId);
      const globalId = args.includeGlobal === false ? '' : await getGlobalWorld();
      const storedIds = typeof listWorlds === 'function' ? normalizeStringList(await listWorlds()) : [];
      const ids = Array.from(new Set([...storedIds, ...sessionIds, globalId].filter(Boolean)));
      const limit = Math.max(1, Math.min(200, Number(args.limit || 80) || 80));
      const worldbooks = [];
      for (const id of ids.slice(0, limit)) {
        const data = typeof getWorldInfo === 'function' ? await getWorldInfo(id) : null;
        worldbooks.push(summarizeWorldbook(id, data, {
          boundToCurrentSession: sessionIds.includes(id),
          global: Boolean(globalId && id === globalId),
        }));
      }
      return {
        ok: true,
        count: ids.length,
        worldbooks,
      };
    },
    summarizeResult: result => `listed ${Number(result?.worldbooks?.length || 0)} worldbook(s)`,
  },
  {
    name: 'worldbook.bind_session',
    title: 'Bind worldbook to chat session',
    description: 'Enable a saved worldbook for a specific chat session without deleting or editing worldbook entries.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_unbind',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'bind_worldbook_to_session',
      destructive: 'never',
      description: 'Adds a worldbook binding to a chat session. Default mode preserves any existing session worldbook bindings.',
    },
    schema: {
      type: 'object',
      required: ['worldbookId'],
      additionalProperties: false,
      properties: {
        worldbookId: { type: 'string', minLength: 1, maxLength: 160 },
        id: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        chatName: { type: 'string', maxLength: 160 },
        mode: { type: 'string', enum: ['append', 'replace'] },
      },
    },
    execute: async (args = {}) => {
      await waitForWorldStoreReady?.();
      const rawSessionId = trim(args.sessionId || args.sessionName || args.target || args.chatName || chatStore?.getCurrent?.());
      const session = await resolveSessionBindingTarget(rawSessionId);
      const sessionId = trim(session.sessionId);
      if (!session.found) return { ok: false, bound: false, reason: session.reason, sessionId };
      const worldbookId = trim(args.worldbookId || args.id || args.name);
      if (!worldbookId) return { ok: false, bound: false, reason: 'missing_worldbook_id', sessionId };
      if (typeof bindWorldToSession !== 'function') {
        return { ok: false, bound: false, reason: 'worldbook_session_binding_unavailable', sessionId, worldbookId };
      }
      if (typeof getWorldInfo === 'function') {
        const world = await getWorldInfo(worldbookId);
        if (!world) return { ok: false, bound: false, reason: 'worldbook_not_found', sessionId, worldbookId };
      }
      const currentIds = await getSessionWorldIds(sessionId);
      const mode = trim(args.mode, 'append') === 'replace' ? 'replace' : 'append';
      const nextIds = mode === 'replace'
        ? [worldbookId]
        : Array.from(new Set([...currentIds, worldbookId].filter(Boolean)));
      await bindWorldToSession(sessionId, nextIds, { silent: false });
      refreshChatAndContacts?.({ immediate: true });
      return {
        ok: true,
        bound: true,
        added: !currentIds.includes(worldbookId),
        mode,
        sessionId,
        sessionName: trim(session.sessionName || sessionId),
        worldbookId,
        previousWorldbookIds: currentIds,
        worldbookIds: nextIds,
      };
    },
    summarizeResult: result => result?.ok === false
      ? `bind worldbook to session failed: ${trim(result?.reason, 'unknown')}`
      : `bound worldbook ${trim(result?.worldbookId, '-')} to ${trim(result?.sessionName || result?.sessionId, '-')}`,
  },
  {
    name: 'worldbook.bind_sessions',
    title: 'Bind worldbook to multiple chat sessions',
    description: 'Preview or bind one saved worldbook to multiple explicit chat sessions, with per-session verification and partial-failure reporting.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_restore_bindings',
      modelContext: 'none',
      confirmation: 'required',
    },
    safety: {
      operationType: 'batch_bind_worldbook_to_sessions',
      destructive: 'conditional',
      description: 'Changes worldbook bindings for multiple chat sessions in one operation.',
      preflight: async (args = {}) => {
        if (args.preview === true) return { destructive: false };
        const sessions = normalizeStringList(args.sessions);
        const mode = trim(args.mode, 'append') === 'replace' ? 'replace' : 'append';
        return {
          requiresConfirmation: true,
          kind: 'worldbook.bind_sessions',
          operationType: 'batch_bind_worldbook_to_sessions',
          title: '确认批量绑定世界书',
          message: mode === 'replace'
            ? `将把 ${sessions.length} 个聊天室的现有世界书绑定替换为「${trim(args.worldbookId)}」。`
            : `将把世界书「${trim(args.worldbookId)}」追加绑定到 ${sessions.length} 个聊天室。`,
          confirmText: '确认绑定',
          cancelText: '取消',
          danger: mode === 'replace',
          argsPreview: {
            worldbookId: trim(args.worldbookId),
            sessions,
            mode,
          },
          onDeny: {
            action: 'skip',
            reason: 'batch_binding_cancelled',
            result: {
              ok: false,
              skipped: true,
              reason: 'batch_binding_cancelled',
              worldbookId: trim(args.worldbookId),
              requestedCount: sessions.length,
            },
          },
        };
      },
    },
    schema: {
      type: 'object',
      required: ['worldbookId', 'sessions'],
      additionalProperties: false,
      properties: {
        worldbookId: { type: 'string', minLength: 1, maxLength: 160 },
        sessions: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
        mode: { type: 'string', enum: ['append', 'replace'] },
        preview: { type: 'boolean' },
      },
    },
    execute: async (args = {}) => {
      await waitForWorldStoreReady?.();
      const worldbookId = trim(args.worldbookId);
      const targets = normalizeStringList(args.sessions).slice(0, 100);
      const mode = trim(args.mode, 'append') === 'replace' ? 'replace' : 'append';
      const preview = args.preview === true;
      if (!worldbookId) return { ok: false, reason: 'missing_worldbook_id', results: [] };
      if (!targets.length) return { ok: false, reason: 'missing_sessions', results: [] };

      let worldbook = null;
      if (typeof getWorldInfo === 'function') {
        try {
          worldbook = await getWorldInfo(worldbookId);
        } catch (error) {
          return {
            ok: false,
            reason: 'worldbook_read_failed',
            worldbookId,
            errorMessage: trim(error?.message || error),
            results: targets.map(target => ({ target, status: 'failed', reason: 'worldbook_read_failed' })),
          };
        }
        if (!worldbook) {
          return {
            ok: false,
            reason: 'worldbook_not_found',
            worldbookId,
            results: targets.map(target => ({ target, status: 'failed', reason: 'worldbook_not_found' })),
          };
        }
      }
      if (!preview && typeof bindWorldToSession !== 'function') {
        return {
          ok: false,
          reason: 'worldbook_session_binding_unavailable',
          worldbookId,
          results: targets.map(target => ({
            target,
            status: 'failed',
            reason: 'worldbook_session_binding_unavailable',
          })),
        };
      }

      const results = [];
      const compensationSessions = [];
      const seenSessionIds = new Set();
      for (const target of targets) {
        const session = await resolveSessionBindingTarget(target);
        const sessionId = trim(session.sessionId);
        if (!session.found) {
          results.push({
            target,
            sessionId,
            status: 'failed',
            reason: session.reason,
          });
          continue;
        }
        if (seenSessionIds.has(sessionId)) {
          results.push({
            target,
            sessionId,
            sessionName: trim(session.sessionName || sessionId),
            status: 'skipped',
            reason: 'duplicate_target',
          });
          continue;
        }
        seenSessionIds.add(sessionId);

        let previousWorldbookIds = [];
        try {
          previousWorldbookIds = await getSessionWorldIds(sessionId);
        } catch (error) {
          results.push({
            target,
            sessionId,
            sessionName: trim(session.sessionName || sessionId),
            status: 'failed',
            reason: 'binding_state_read_failed',
            errorMessage: trim(error?.message || error),
          });
          continue;
        }
        const nextWorldbookIds = mode === 'replace'
          ? [worldbookId]
          : Array.from(new Set([...previousWorldbookIds, worldbookId].filter(Boolean)));
        const unchanged = nextWorldbookIds.length === previousWorldbookIds.length &&
          nextWorldbookIds.every((id, index) => id === previousWorldbookIds[index]);
        if (unchanged) {
          results.push({
            target,
            sessionId,
            sessionName: trim(session.sessionName || sessionId),
            status: 'skipped',
            reason: 'already_bound',
            verified: true,
            mode,
            previousWorldbookIds,
            worldbookIds: previousWorldbookIds,
          });
          continue;
        }
        if (preview) {
          results.push({
            target,
            sessionId,
            sessionName: trim(session.sessionName || sessionId),
            status: 'planned',
            reason: 'preview_only',
            verified: false,
            mode,
            previousWorldbookIds,
            worldbookIds: nextWorldbookIds,
          });
          continue;
        }

        try {
          await bindWorldToSession(sessionId, nextWorldbookIds, { silent: false });
        } catch (error) {
          results.push({
            target,
            sessionId,
            sessionName: trim(session.sessionName || sessionId),
            status: 'failed',
            reason: 'bind_failed',
            errorMessage: trim(error?.message || error),
            mode,
            previousWorldbookIds,
            worldbookIds: nextWorldbookIds,
          });
          continue;
        }
        compensationSessions.push({
          sessionId,
          sessionName: trim(session.sessionName || sessionId),
          previousWorldbookIds,
        });

        let observedWorldbookIds = [];
        try {
          observedWorldbookIds = await getSessionWorldIds(sessionId);
        } catch {}
        const verified = mode === 'replace'
          ? observedWorldbookIds.length === 1 && observedWorldbookIds[0] === worldbookId
          : previousWorldbookIds.every(id => observedWorldbookIds.includes(id)) &&
            observedWorldbookIds.includes(worldbookId);
        results.push({
          target,
          sessionId,
          sessionName: trim(session.sessionName || sessionId),
          status: verified ? 'succeeded' : 'failed',
          reason: verified ? '' : 'verification_failed',
          verified,
          added: !previousWorldbookIds.includes(worldbookId),
          mode,
          previousWorldbookIds,
          worldbookIds: observedWorldbookIds,
          expectedWorldbookIds: nextWorldbookIds,
        });
      }

      if (compensationSessions.length) {
        await refreshChatAndContacts?.({ immediate: true });
      }
      const succeededCount = results.filter(item => item.status === 'succeeded').length;
      const skippedCount = results.filter(item => item.status === 'skipped').length;
      const failed = results.filter(item => item.status === 'failed');
      const plannedCount = results.filter(item => item.status === 'planned').length;
      const verifiedCount = results.filter(item => item.verified === true).length;
      return {
        ok: failed.length === 0,
        partial: failed.length > 0 && (succeededCount > 0 || skippedCount > 0),
        preview,
        worldbookId,
        mode,
        requestedCount: targets.length,
        succeededCount,
        skippedCount,
        failedCount: failed.length,
        plannedCount,
        verifiedCount,
        results,
        retry: failed.length
          ? {
              toolName: 'worldbook.bind_sessions',
              args: {
                worldbookId,
                sessions: failed.map(item => item.target),
                mode,
              },
            }
          : null,
        compensation: compensationSessions.length
          ? {
              kind: 'restore_previous_worldbook_bindings',
              available: 'manual',
              sessions: compensationSessions,
            }
          : null,
      };
    },
    summarizeResult: result => {
      if (result?.skipped && result?.reason === 'batch_binding_cancelled') return 'batch worldbook binding cancelled';
      return [
        `batch worldbook binding ${result?.ok ? 'completed' : 'incomplete'}`,
        `${Number(result?.succeededCount || 0)} succeeded`,
        `${Number(result?.skippedCount || 0)} skipped`,
        `${Number(result?.failedCount || 0)} failed`,
      ].join('; ');
    },
  },
  {
    name: 'worldbook.read',
    title: 'Read worldbook',
    description: 'Read a saved APP worldbook by name/id, or the current session worldbook when omitted.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: false,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'allowlist',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', maxLength: 160 },
        worldbookId: { type: 'string', maxLength: 160 },
        name: { type: 'string', maxLength: 160 },
        sessionId: { type: 'string', maxLength: 160 },
        entryId: { type: 'string', maxLength: 160 },
        entryTitle: { type: 'string', maxLength: 160 },
        query: { type: 'string', maxLength: 200 },
        includeContent: { type: 'boolean' },
        maxEntries: { type: 'integer', minimum: 1, maximum: 200 },
        maxContentLength: { type: 'integer', minimum: 120, maximum: 12000 },
      },
    },
    execute: async (args = {}) => {
      await waitForWorldStoreReady?.();
      const worldbookId = await resolveWorldbookId(args);
      if (!worldbookId) return { ok: false, reason: 'missing_worldbook_id' };
      if (typeof getWorldInfo !== 'function') {
        return { ok: false, reason: 'worldbook_store_unavailable', worldbookId };
      }
      const data = await getWorldInfo(worldbookId);
      if (!data) return { ok: false, reason: 'worldbook_not_found', worldbookId };
      const entries = getWorldEntries(data);
      const maxEntries = Math.max(1, Math.min(200, Number(args.maxEntries || 50) || 50));
      const maxContentLength = Math.max(120, Math.min(12000, Number(args.maxContentLength || 2000) || 2000));
      const includeContent = args.includeContent === true || hasWorldbookEntryFilter(args);
      const matchedEntries = entries.filter((entry, index) => worldbookEntryMatches(entry, index, args));
      const returnedEntries = matchedEntries.slice(0, maxEntries);
      return {
        ok: true,
        ...summarizeWorldbook(worldbookId, data),
        contentMode: includeContent ? 'content' : 'summary',
        contentHint: includeContent ? '' : '世界书正文默认省略；需要正文时再次读取并传 includeContent:true、entryId、entryTitle 或 query。',
        returnedEntryCount: returnedEntries.length,
        entries: returnedEntries.map((entry, index) => normalizeWorldbookEntrySummary(entry, index, {
          includeContent,
          maxContentLength,
        })),
        truncated: matchedEntries.length > maxEntries,
      };
    },
    summarizeResult: result => result?.ok === false
      ? `read worldbook failed: ${trim(result?.reason, 'unknown')}`
      : `read worldbook ${trim(result?.name || result?.id, '-')} (${Number(result?.entries?.length || 0)} entries)`,
  },
  {
    name: 'chat.send_message',
    title: 'Send chat message',
    description: 'Append a chat message to a private or group chat session and optionally open it.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'manual_delete',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'append_message',
      destructive: 'never',
      description: 'Appends a new chat message; it does not edit or delete existing messages.',
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        chatName: { type: 'string', maxLength: 160 },
        content: { type: 'string', minLength: 1, maxLength: 4000 },
        message: { type: 'string', minLength: 1, maxLength: 4000 },
        text: { type: 'string', minLength: 1, maxLength: 4000 },
        role: { type: 'string', enum: ['user', 'assistant', 'system'] },
        name: { type: 'string', maxLength: 120 },
        avatar: { type: 'string', maxLength: 500000 },
        open: { type: 'boolean' },
        triggerReply: { type: 'boolean' },
      },
    },
    execute: async (args = {}) => {
      const content = trim(args.content || args.message || args.text);
      if (!content) return { ok: false, sent: false, reason: 'missing_content' };
      const rawSessionId = trim(args.sessionId || args.sessionName || args.target || args.chatName || chatStore?.getCurrent?.());
      const contact = findStoreItem(contactsStore, rawSessionId);
      const sessionId = trim(contact?.id || rawSessionId);
      if (!sessionId) return { ok: false, sent: false, reason: 'missing_session_id' };
      if (!contact && contactsStore && typeof contactsStore.getContact === 'function') {
        return { ok: false, sent: false, reason: 'session_not_found', sessionId };
      }
      const role = ['assistant', 'system'].includes(trim(args.role)) ? trim(args.role) : 'user';
      const shouldTriggerReply = role === 'user' && args.triggerReply !== false && typeof sendChatMessage === 'function';
      if (shouldTriggerReply) {
        chatStore?.switchSession?.(sessionId);
        setActiveSession?.(sessionId);
        if (args.open !== false && typeof enterChatRoom === 'function') {
          const title = renderSessionNameHtml?.(sessionId, contact) || contact?.name || sessionId;
          await enterChatRoom(sessionId, title, 'chat', { suppressInitialAutoScroll: true });
        }
        const sendResult = await sendChatMessage(content, {
          sessionId,
          source: 'maid',
          open: args.open !== false,
          waitForReply: false,
        });
        const sent = sendResult === true || sendResult?.ok === true || sendResult?.sent === true;
        if (!sent) {
          return {
            ok: false,
            sent: false,
            requested: false,
            requestTriggered: false,
            reason: trim(sendResult?.reason || sendResult?.message, 'send_pipeline_failed'),
            ...(sendResult?.cancelled === true ? { cancelled: true } : {}),
            ...(trim(sendResult?.message) ? { message: trim(sendResult.message) } : {}),
            sessionId,
            role,
            content,
          };
        }
        refreshChatAndContacts?.({ immediate: true });
        return {
          ok: true,
          sent: true,
          requested: true,
          requestTriggered: true,
          sessionId,
          role,
          content,
        };
      }
      if (typeof chatStore?.appendMessage !== 'function') {
        return { ok: false, sent: false, reason: 'chat_store_unavailable', sessionId };
      }
      const message = {
        role,
        content,
        name: trim(args.name) || (role === 'user' ? trim(getActiveUserName?.(), '我') : trim(contact?.name || sessionId, sessionId)),
        avatar: trim(args.avatar) || (role === 'user' ? trim(getActiveUserAvatar?.()) : trim(contact?.avatar)),
        time: formatNowTime(),
        sentAt: Number(now?.() || Date.now()) || Date.now(),
      };
      if (role === 'system') message.type = 'meta';
      chatStore.appendMessage(message, sessionId);
      if (args.open !== false) {
        chatStore.switchSession?.(sessionId);
        setActiveSession?.(sessionId);
        if (typeof enterChatRoom === 'function') {
          const title = renderSessionNameHtml?.(sessionId, contact) || contact?.name || sessionId;
          await enterChatRoom(sessionId, title, 'chat', { suppressInitialAutoScroll: true });
        }
      }
      refreshChatAndContacts?.({ immediate: true });
      return {
        ok: true,
        sent: true,
        requested: false,
        requestTriggered: false,
        sessionId,
        role,
        content,
      };
    },
    summarizeResult: result => result?.sent
      ? `sent message to ${trim(result?.sessionId, '-')}`
      : `send message failed: ${trim(result?.reason, 'unknown')}`,
  },
  {
    name: 'chat.generate_image',
    title: 'Generate image into chat',
    description: 'Generate an image, optionally using referenced maid image attachments, and post it into a chat session as the user.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: false,
      write: true,
      network: true,
      cost: 'variable',
      undo: 'manual_delete',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'append_message',
      destructive: 'never',
      description: 'Generates a new image and appends it as a chat message; it does not edit or delete existing content.',
    },
    timeoutMs: 180000,
    schema: {
      type: 'object',
      required: ['prompt'],
      additionalProperties: false,
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 4000 },
        sessionId: { type: 'string', maxLength: 160 },
        sessionName: { type: 'string', maxLength: 160 },
        target: { type: 'string', maxLength: 160 },
        negativePrompt: { type: 'string', maxLength: 2000 },
        referenceImages: {
          type: 'array',
          maxItems: 4,
          items: { type: ['string', 'integer'], minLength: 1, maxLength: 160, minimum: 1, maximum: 4 },
        },
      },
    },
    execute: async (args = {}, context = {}) => {
      if (typeof generateChatImage !== 'function') {
        return { ok: false, generated: false, reason: 'image_generation_unavailable' };
      }
      const prompt = trim(args.prompt);
      if (!prompt) return { ok: false, generated: false, reason: 'missing_prompt' };
      const rawSessionId = trim(args.sessionId || args.sessionName || args.target || chatStore?.getCurrent?.());
      const contact = findStoreItem(contactsStore, rawSessionId);
      const sessionId = trim(contact?.id || rawSessionId);
      if (!sessionId) return { ok: false, generated: false, reason: 'missing_session_id' };
      if (!contact && contactsStore && typeof contactsStore.getContact === 'function') {
        return { ok: false, generated: false, reason: 'session_not_found', sessionId };
      }
      const references = resolveMaidReferenceImages(args.referenceImages, context);
      if (references.missing.length) {
        return {
          ok: false,
          generated: false,
          reason: 'reference_image_not_found',
          sessionId,
          missingReferenceImages: references.missing,
          availableReferenceImages: references.available,
        };
      }
      const result = await generateChatImage({
        prompt,
        sessionId,
        negativePrompt: trim(args.negativePrompt),
        referenceImages: references.urls,
      });
      if (result !== true && result?.ok !== true) {
        return {
          ok: false,
          generated: false,
          reason: trim(result?.reason || result?.message, 'image_generation_failed'),
          sessionId,
          prompt,
          referenceImageCount: references.urls.length,
        };
      }
      return {
        ok: true,
        generated: true,
        sessionId,
        prompt,
        referenceImageCount: references.urls.length,
      };
    },
    summarizeResult: result => result?.generated
      ? `generated image into ${trim(result?.sessionId, '-')}`
      : `generate image failed: ${trim(result?.reason, 'unknown')}`,
  },
  {
    name: 'config.list_profiles',
    title: 'List model profiles',
    description: 'List saved model channel profiles (chat or image scope) with the currently active one.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: true,
      write: false,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'none',
      confirmation: 'none',
    },
    schema: {
      type: 'object',
      required: ['scope'],
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['chat', 'image'] },
      },
    },
    execute: async (args = {}) => {
      if (typeof listModelProfiles !== 'function') {
        return { ok: false, reason: 'model_profiles_unavailable' };
      }
      const scope = trim(args.scope);
      const data = await listModelProfiles({ scope });
      if (!data) return { ok: false, reason: 'unsupported_scope', scope };
      return {
        ok: true,
        scope,
        activeProfileId: data.activeId || '',
        profiles: (data.profiles || []).map(p => ({
          ...p,
          active: Boolean(p.id) && p.id === data.activeId,
        })),
      };
    },
    summarizeResult: result => result?.ok === false
      ? `list profiles failed: ${trim(result?.reason, 'unknown')}`
      : `listed ${Number(result?.profiles?.length || 0)} ${trim(result?.scope, '-')} profiles`,
  },
  {
    name: 'config.switch_profile',
    title: 'Switch model profile',
    description: 'Switch the active model channel profile for chat or image generation.',
    source: 'maid-app-content',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: true,
      write: true,
      network: false,
      cost: 'none',
      undo: 'switch_back',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    safety: {
      operationType: 'switch_profile',
      destructive: 'never',
      description: 'Changes which saved model profile is active; profiles themselves are not modified.',
    },
    schema: {
      type: 'object',
      required: ['scope'],
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['chat', 'image'] },
        profileId: { type: 'string', maxLength: 160 },
        profileName: { type: 'string', maxLength: 160 },
      },
    },
    execute: async (args = {}) => {
      if (typeof listModelProfiles !== 'function' || typeof switchModelProfile !== 'function') {
        return { ok: false, switched: false, reason: 'model_profiles_unavailable' };
      }
      const scope = trim(args.scope);
      const query = trim(args.profileId || args.profileName);
      if (!query) return { ok: false, switched: false, reason: 'missing_profile', scope };
      const data = await listModelProfiles({ scope });
      if (!data) return { ok: false, switched: false, reason: 'unsupported_scope', scope };
      const profiles = data.profiles || [];
      const lowered = query.toLowerCase();
      let matches = profiles.filter(p => p.id === query);
      if (!matches.length) matches = profiles.filter(p => p.name === query);
      if (!matches.length) matches = profiles.filter(p => p.name.toLowerCase() === lowered);
      if (!matches.length) matches = profiles.filter(p => p.name.toLowerCase().includes(lowered) || p.model.toLowerCase().includes(lowered));
      if (!matches.length) {
        return { ok: false, switched: false, reason: 'profile_not_found', scope, query, available: profiles.map(p => p.name) };
      }
      if (matches.length > 1) {
        return { ok: false, switched: false, reason: 'profile_ambiguous', scope, query, candidates: matches.map(p => p.name) };
      }
      const target = matches[0];
      const from = profiles.find(p => p.id === data.activeId) || null;
      if (target.id === data.activeId) {
        return { ok: true, switched: false, alreadyActive: true, scope, active: { name: target.name, provider: target.provider, model: target.model } };
      }
      const result = await switchModelProfile({ scope, profileId: target.id });
      if (result?.ok !== true) {
        return { ok: false, switched: false, reason: trim(result?.reason, 'switch_failed'), scope, query };
      }
      return {
        ok: true,
        switched: true,
        scope,
        from: from ? { name: from.name, provider: from.provider, model: from.model } : null,
        to: { name: target.name, provider: target.provider, model: target.model },
      };
    },
    summarizeResult: result => {
      if (result?.ok === false) return `switch profile failed: ${trim(result?.reason, 'unknown')}`;
      if (result?.alreadyActive) return `profile already active: ${trim(result?.active?.name, '-')}`;
      return `switched ${trim(result?.scope, '-')} profile to ${trim(result?.to?.name, '-')}`;
    },
  },
  ];
};

export const registerAppContentAgentTools = (registry, deps = {}) => {
  const tools = createAppContentAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
