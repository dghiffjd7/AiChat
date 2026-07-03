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
  personaStore = null,
  userStore = null,
  contactsStore = null,
  chatStore = null,
  switchPersona = null,
  switchUserProfile = null,
  saveWorldInfo = null,
  getWorldInfo = null,
  listWorlds = null,
  waitForWorldStoreReady = null,
  getCurrentWorldId = null,
  getCurrentWorldIds = null,
  getWorldIdsForSession = null,
  getGlobalWorldId = null,
  assignWorldToPersona = null,
  bindWorldToSession = null,
  enterChatRoom = null,
  refreshChatAndContacts = null,
  setActiveSession = null,
  sendChatMessage = null,
  confirmDestructiveWrite = null,
  renderSessionNameHtml = (id, contact) => trim(contact?.name || id, id),
  getActiveUserName = () => '我',
  getActiveUserAvatar = () => '',
  now = Date.now,
} = {}) => {
  const getSessionWorldIds = async (sessionId = '') => {
    const sid = trim(sessionId || chatStore?.getCurrent?.());
    const ids = [];
    if (typeof getWorldIdsForSession === 'function') {
      ids.push(...normalizeStringList(await getWorldIdsForSession(sid)));
    }
    if (!ids.length && typeof getCurrentWorldIds === 'function') {
      ids.push(...normalizeStringList(await getCurrentWorldIds(sid)));
    }
    if (!ids.length && typeof getCurrentWorldId === 'function') {
      ids.push(...normalizeStringList(await getCurrentWorldId(sid)));
    }
    return Array.from(new Set(ids));
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
    summarizeResult: result => `saved worldbook ${trim(result?.worldbookId, '-')} (${Number(result?.entryCount || 0)} entries)`,
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
        entries: { type: 'array', minItems: 1, maxItems: 100 },
        deletes: { type: 'array', minItems: 1, maxItems: 100 },
        dedupeByTitle: { type: 'boolean' },
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
      const contact = findStoreItem(contactsStore, rawSessionId);
      const sessionId = trim(contact?.id || rawSessionId);
      if (!sessionId) return { ok: false, bound: false, reason: 'missing_session_id' };
      if (!contact && contactsStore && typeof contactsStore.getContact === 'function') {
        return { ok: false, bound: false, reason: 'session_not_found', sessionId };
      }
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
        sessionName: trim(contact?.name || sessionId),
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
  ];
};

export const registerAppContentAgentTools = (registry, deps = {}) => {
  const tools = createAppContentAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
