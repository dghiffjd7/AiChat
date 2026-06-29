const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeKey = value => trim(value).toLowerCase().replace(/\s+/g, '');

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const isGroupLikeId = id => trim(id).startsWith('group:');
const isRpLikeId = id => trim(id).startsWith('rp:');

const resolveContactList = contactsStore => (
  contactsStore?.listContacts?.() ||
  []
).filter(Boolean);

const findContact = (contactsStore, query = '') => {
  const q = trim(query);
  if (!q) return null;
  const qKey = normalizeKey(q);
  return resolveContactList(contactsStore).find((contact) => {
    const id = trim(contact?.id);
    const name = trim(contact?.name);
    return id === q || name === q || normalizeKey(id) === qKey || normalizeKey(name) === qKey;
  }) || null;
};

const summarizeContact = contact => ({
  id: trim(contact?.id),
  name: trim(contact?.name || contact?.id),
  isGroup: contact?.isGroup === true || isGroupLikeId(contact?.id),
  memberCount: Array.isArray(contact?.members) ? contact.members.length : 0,
});

const resolveCreateSessionNames = (args = {}) => {
  const names = Array.isArray(args.names)
    ? args.names
    : (Array.isArray(args.nameList) ? args.nameList : []);
  const merged = [
    trim(args.name),
    ...names.map(item => trim(item)),
  ].filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 20);
};

const buildSessionNameHtmlFallback = (id, contact = null) => trim(contact?.name || id, id);

const formatNowTime = () => {
  try {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const createAppSessionAgentTools = ({
  contactsStore = null,
  chatStore = null,
  enterChatRoom = null,
  refreshChatAndContacts = null,
  setActiveSession = null,
  showSessionConfig = null,
  renderSessionNameHtml = buildSessionNameHtmlFallback,
  defaultAvatar = '',
  now = Date.now,
} = {}) => {
  const openSession = async (sessionId = '', { originPage = 'chat', suppressInitialAutoScroll = true } = {}) => {
    const sid = trim(sessionId);
    if (!sid) return { ok: false, reason: 'missing_session_id' };
    const contact = contactsStore?.getContact?.(sid) || null;
    chatStore?.switchSession?.(sid);
    setActiveSession?.(sid);
    refreshChatAndContacts?.({ immediate: true });
    if (typeof enterChatRoom === 'function') {
      const title = renderSessionNameHtml?.(sid, contact) || contact?.name || sid;
      const enterResult = await enterChatRoom(sid, title, originPage, { suppressInitialAutoScroll });
      return {
        ok: enterResult?.blocked === true ? false : true,
        sessionId: sid,
        contact: contact ? summarizeContact(contact) : null,
        enterResult: clone(enterResult),
      };
    }
    return {
      ok: true,
      sessionId: sid,
      contact: contact ? summarizeContact(contact) : null,
    };
  };

  const createOneSession = async (name = '', args = {}) => {
    const sessionName = trim(name);
    if (!sessionName) return { ok: false, created: false, reason: 'missing_name' };
    if (isGroupLikeId(sessionName) || isRpLikeId(sessionName)) {
      return { ok: false, created: false, reason: 'reserved_prefix', name: sessionName };
    }
    const existing = contactsStore?.getContact?.(sessionName) || findContact(contactsStore, sessionName);
    if (existing) {
      const sid = trim(existing.id || sessionName);
      const opened = args.open === false ? null : await openSession(sid);
      return {
        ok: true,
        created: false,
        existing: true,
        sessionId: sid,
        contact: summarizeContact(existing),
        opened,
      };
    }
    const contact = {
      id: sessionName,
      name: sessionName,
      avatar: trim(args.avatar || defaultAvatar),
      isGroup: false,
      addedAt: Number(now?.() || Date.now()) || Date.now(),
      labels: [],
      isUserCreated: true,
    };
    contactsStore?.upsertContact?.(contact);
    chatStore?.switchSession?.(sessionName);
    setActiveSession?.(sessionName);
    const time = formatNowTime();
    if (typeof chatStore?.appendMessage === 'function') {
      try {
        chatStore.appendMessage({
          role: 'system',
          type: 'meta',
          content: `你创建了聊天室「${sessionName}」`,
          name: '系统',
          avatar: '',
          time,
        }, sessionName);
      } catch {}
    }
    refreshChatAndContacts?.({ immediate: true });
    const opened = args.open === false ? null : await openSession(sessionName);
    return {
      ok: true,
      created: true,
      sessionId: sessionName,
      contact: summarizeContact(contact),
      opened,
    };
  };

  return [
    {
      name: 'session.list',
      title: 'List chat sessions',
      description: 'List contacts and groups available as chat sessions.',
      source: 'maid-app-session',
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
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          includeGroups: { type: 'boolean' },
        },
      },
      execute: async (args = {}) => {
        const limit = Math.max(1, Math.min(100, Math.trunc(Number(args.limit) || 30)));
        const includeGroups = args.includeGroups !== false;
        const contacts = resolveContactList(contactsStore)
          .filter(contact => includeGroups || !(contact?.isGroup === true || isGroupLikeId(contact?.id)))
          .slice(0, limit)
          .map(summarizeContact);
        return {
          count: contacts.length,
          contacts,
          currentSessionId: trim(chatStore?.getCurrent?.()),
        };
      },
      summarizeResult: result => `listed ${Number(result?.count || 0)} session(s)`,
    },
    {
      name: 'session.create',
      title: 'Create chat session',
      description: 'Create a private contact and chat session, then optionally open it.',
      source: 'maid-app-session',
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
          name: { type: 'string', minLength: 1, maxLength: 80 },
          names: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          nameList: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          avatar: { type: 'string', maxLength: 500000 },
          open: { type: 'boolean' },
        },
      },
      execute: async (args = {}) => {
        const names = resolveCreateSessionNames(args);
        if (names.length > 1) {
          const sessions = [];
          for (const name of names) {
            const result = await createOneSession(name, args);
            sessions.push(result);
          }
          const failed = sessions.find(item => item?.ok === false);
          if (failed) {
            return {
              ok: false,
              created: false,
              reason: failed.reason || 'session_create_failed',
              failed,
              sessions,
            };
          }
          return {
            ok: true,
            created: sessions.some(item => item?.created === true),
            createdCount: sessions.filter(item => item?.created === true).length,
            count: sessions.length,
            sessions,
            sessionIds: sessions.map(item => item.sessionId).filter(Boolean),
          };
        }
        const name = names[0] || '';
        return createOneSession(name, args);
      },
      summarizeResult: result => {
        if (Array.isArray(result?.sessions)) {
          return `created ${Number(result.createdCount || 0)} of ${Number(result.count || result.sessions.length || 0)} session(s): ${result.sessionIds?.join(', ') || '-'}`;
        }
        return result?.created
          ? `created session ${trim(result.sessionId, '-')}`
          : `session already exists ${trim(result?.sessionId, '-')}`;
      },
    },
    {
      name: 'session.open',
      title: 'Open chat session',
      description: 'Open a private or group chat session by id or display name.',
      source: 'maid-app-session',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'none',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['sessionId'],
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', minLength: 1, maxLength: 160 },
        },
      },
      execute: async (args = {}) => {
        const contact = findContact(contactsStore, args.sessionId);
        const sid = trim(contact?.id || args.sessionId);
        if (!sid) return { ok: false, reason: 'missing_session_id' };
        if (!contact && contactsStore && typeof contactsStore.getContact === 'function') {
          return { ok: false, reason: 'session_not_found', sessionId: sid };
        }
        return openSession(sid);
      },
      summarizeResult: result => result?.ok === false
        ? `open session failed: ${trim(result.reason, 'unknown')}`
        : `opened session ${trim(result?.sessionId, '-')}`,
    },
    {
      name: 'session.open_config',
      title: 'Open session config',
      description: 'Open the session configuration panel for current or specified session.',
      source: 'maid-app-session',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: false,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'none',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', maxLength: 160 },
        },
      },
      execute: async (args = {}) => {
        const raw = trim(args.sessionId);
        const contact = raw ? findContact(contactsStore, raw) : null;
        const sid = trim(contact?.id || raw || chatStore?.getCurrent?.());
        if (!sid) return { ok: false, opened: false, reason: 'missing_session_id' };
        if (typeof showSessionConfig !== 'function') {
          return { ok: false, opened: false, reason: 'session_config_unavailable', sessionId: sid };
        }
        await showSessionConfig({ sessionId: sid });
        return { ok: true, opened: true, sessionId: sid };
      },
      summarizeResult: result => result?.opened
        ? `opened session config ${trim(result.sessionId, '-')}`
        : `open session config failed: ${trim(result?.reason, 'unknown')}`,
    },
  ];
};

export const registerAppSessionAgentTools = (registry, deps = {}) => {
  const tools = createAppSessionAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
