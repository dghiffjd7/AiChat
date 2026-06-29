const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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

const normalizeWorldbookEntrySummary = (entry = {}, index = 0, { includeContent = true, maxContentLength = 2000 } = {}) => {
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
  };
  if (includeContent !== false) {
    summary.content = truncateText(source.content || source.description || '', maxContentLength);
  }
  return summary;
};

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
  enterChatRoom = null,
  refreshChatAndContacts = null,
  setActiveSession = null,
  sendChatMessage = null,
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
    description: 'Create or update a worldbook and optionally bind it to a character card.',
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
        personaId: { type: 'string', maxLength: 160 },
        personaName: { type: 'string', maxLength: 160 },
        bindToPersona: { type: 'boolean' },
      },
    },
    execute: async (args = {}) => {
      const personaQuery = trim(args.personaId || args.personaName);
      const persona = personaQuery
        ? findStoreItem(personaStore, personaQuery)
        : getActiveStoreItem(personaStore);
      const fallbackWorldName = trim(persona?.name || persona?.id)
        ? `${trim(persona?.name || persona?.id)} 世界书`
        : '女仆创建的世界书';
      const explicitName = trim(args.name);
      const name = trim(explicitName, fallbackWorldName);
      if (!Array.isArray(args.entries) || !args.entries.length) {
        return { ok: false, created: false, reason: 'missing_entries' };
      }
      if (typeof saveWorldInfo !== 'function') {
        return { ok: false, created: false, reason: 'worldbook_store_unavailable' };
      }
      const existing = typeof getWorldInfo === 'function' ? await getWorldInfo(name) : null;
      const entries = args.entries.map(normalizeWorldEntry);
      const payload = {
        ...(isPlainObject(existing) ? existing : {}),
        name,
        entries,
        updatedBy: 'maid',
        updatedAt: Number(now?.() || Date.now()) || Date.now(),
      };
      await saveWorldInfo(name, payload);
      let boundPersonaId = '';
      const shouldBindPersona = args.bindToPersona === true || Boolean(personaQuery) || (!explicitName && persona?.id);
      if (shouldBindPersona && persona?.id && typeof assignWorldToPersona === 'function') {
        await assignWorldToPersona(persona.id, name, { enabled: true });
        boundPersonaId = trim(persona.id);
      }
      return {
        ok: true,
        created: !existing,
        worldbookId: name,
        entryCount: entries.length,
        boundPersonaId,
      };
    },
    summarizeResult: result => `saved worldbook ${trim(result?.worldbookId, '-')} (${Number(result?.entryCount || 0)} entries)`,
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
      return {
        ok: true,
        ...summarizeWorldbook(worldbookId, data),
        entries: entries.slice(0, maxEntries).map((entry, index) => normalizeWorldbookEntrySummary(entry, index, {
          includeContent: args.includeContent !== false,
          maxContentLength,
        })),
        truncated: entries.length > maxEntries,
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
