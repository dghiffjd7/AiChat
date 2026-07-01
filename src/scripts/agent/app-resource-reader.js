export const SUPPORTED_APP_RESOURCES = Object.freeze([
  'chat',
  'worldbook',
  'regex',
  'variables',
  'memory',
  'preset',
  'config',
  'session',
  'persona',
  'user',
]);

const WORLD_AI_TEMPLATE_KEY = 'world_ai_template_v1';
const DEFAULT_WORLD_AI_TEMPLATE = `
name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "仅供参考，勿完全按照其输出"
  examples:
    - ""
    - ""
    - ""
`.trim();

const asArray = value => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const toText = value => String(value ?? '').trim();

const normalizeStringList = value => (
  Array.isArray(value)
    ? value.map(item => toText(item)).filter(Boolean)
    : (toText(value) ? [toText(value)] : [])
);

const isThenable = value => value && typeof value.then === 'function';

const resolveMaybe = async value => isThenable(value) ? value : value;

const callMethod = async (target, method, ...args) => {
  const fn = target?.[method];
  if (typeof fn !== 'function') return undefined;
  return resolveMaybe(fn.apply(target, args));
};

const getBridgeFromDeps = deps => deps.appBridge || globalThis.window?.appBridge || {};

const readAppLocalStorageText = (key = '') => {
  try {
    return toText(globalThis.localStorage?.getItem?.(key));
  } catch {
    return '';
  }
};

const readWorldAiGenerationSettings = () => {
  const storedTemplate = readAppLocalStorageText(WORLD_AI_TEMPLATE_KEY);
  const template = storedTemplate || DEFAULT_WORLD_AI_TEMPLATE;
  return {
    templateStorageKey: WORLD_AI_TEMPLATE_KEY,
    hasCustomTemplate: Boolean(storedTemplate),
    template: trimAppResourceText(template, 12000),
  };
};

const getUiModeFromDeps = deps => (
  typeof deps.getUiMode === 'function' ? deps.getUiMode() : deps.uiMode
);

export const clampAppResourceLimit = (value, fallback = 30, max = 200) => (
  Math.max(1, Math.min(max, Math.trunc(Number(value) || fallback)))
);

export const trimAppResourceText = (value = '', maxTextLength = 4000) => {
  const text = toText(value);
  const max = Math.max(120, Math.min(12000, Number(maxTextLength) || 4000));
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

export const isAppResourceSecretKey = key => (
  /api[-_ ]?key|token|secret|password|passwd|authorization|bearer|密钥|金鑰|密码/i.test(String(key || ''))
);

export const sanitizeAppResourceValue = (value, depth = 0) => {
  if (depth > 6) return '[MaxDepth]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map(item => sanitizeAppResourceValue(item, depth + 1));
  }
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    out[key] = isAppResourceSecretKey(key) ? '[redacted]' : sanitizeAppResourceValue(item, depth + 1);
  });
  return out;
};

export const normalizeAppResourceName = value => {
  const text = toText(value).toLowerCase().replace(/[_\s]+/g, '-');
  if (['message', 'messages', 'chat-message', 'chat-messages', 'reply', 'replies', 'ai-reply', 'ai-response'].includes(text)) return 'chat';
  if (['world', 'world-info', 'worldbook-settings', 'world-settings', 'worldbook-template', 'world-ai-template', 'world-generation-template'].includes(text)) return 'worldbook';
  if (['regexes', 'regexp', 'regular-expression', 'postprocess', 'post-processing'].includes(text)) return 'regex';
  if (['variable', 'vars', 'mvu', 'mvu-variable'].includes(text)) return 'variables';
  if (['memories', 'memory-table', 'memory-tables', 'memory-template', 'memory-templates'].includes(text)) return 'memory';
  if (['preset', 'presets', 'prompt', 'prompts'].includes(text)) return 'preset';
  if (['api', 'model', 'models', 'provider', 'providers'].includes(text)) return 'config';
  if (['sessions', 'contacts', 'contact', 'room', 'rooms'].includes(text)) return 'session';
  if (['personas', 'character', 'characters', 'role', 'roles', 'character-card'].includes(text)) return 'persona';
  if (['users', 'user-profile', 'user-profiles'].includes(text)) return 'user';
  return text;
};

export const summarizeAppChatMessage = (message = {}, maxTextLength = 4000) => ({
  id: toText(message?.id),
  role: toText(message?.role),
  type: toText(message?.type),
  name: toText(message?.name),
  time: toText(message?.time),
  timestamp: Number(message?.timestamp || message?.sentAt || message?.createdAt || 0) || 0,
  status: toText(message?.status),
  content: trimAppResourceText(message?.content || '', maxTextLength),
  rawOriginal: trimAppResourceText(message?.rawOriginal || message?.raw || '', maxTextLength),
  reasoning: trimAppResourceText(message?.reasoning || message?.reasoningContent || '', Math.min(maxTextLength, 3000)),
  displayText: trimAppResourceText(message?.displayText || message?.content || '', maxTextLength),
  hasSwipes: Array.isArray(message?.swipes) && message.swipes.length > 0,
});

const normalizeWorldId = value => toText(value?.id ?? value?.name ?? value);

const normalizeLookupText = value => toText(value).toLowerCase();

const readWorldEntryId = entry => toText(entry?.id || entry?.uid || entry?.comment || entry?.title || entry?.name);

const summarizeWorldbookEntry = (entry = {}, index = 0, {
  includeContent = false,
  maxContentLength = 2000,
} = {}) => {
  const title = toText(entry?.comment || entry?.title || entry?.name || entry?.id || `entry-${index + 1}`);
  const content = toText(entry?.content || '');
  const keys = [
    ...normalizeStringList(entry?.key),
    ...normalizeStringList(entry?.keys),
  ];
  const secondaryKeys = [
    ...normalizeStringList(entry?.keysecondary),
    ...normalizeStringList(entry?.secondaryKeys),
    ...normalizeStringList(entry?.secondary),
  ];
  const summary = {
    id: toText(entry?.id),
    title,
    keys: Array.from(new Set(keys)),
    secondaryKeys: Array.from(new Set(secondaryKeys)),
    position: Number.isFinite(Number(entry?.position)) ? Number(entry.position) : undefined,
    order: Number.isFinite(Number(entry?.order ?? entry?.priority)) ? Number(entry.order ?? entry.priority) : undefined,
    depth: Number.isFinite(Number(entry?.depth)) ? Number(entry.depth) : undefined,
    constant: entry?.constant === true,
    disabled: entry?.disable === true || entry?.disabled === true,
    contentLength: content.length,
  };
  if (includeContent) {
    summary.content = trimAppResourceText(content, maxContentLength);
    summary.contentTruncated = content.length > Math.max(120, Math.min(12000, Number(maxContentLength) || 4000));
  }
  return summary;
};

const worldEntryMatches = (entry = {}, index = 0, args = {}) => {
  const entryId = toText(args.entryId || args.entry || args.entryName);
  const entryTitle = toText(args.entryTitle || args.title);
  const query = toText(args.query);
  if (!entryId && !entryTitle && !query) return true;
  const id = readWorldEntryId(entry);
  const title = toText(entry?.comment || entry?.title || entry?.name || `entry-${index + 1}`);
  const keys = [
    ...normalizeStringList(entry?.key || entry?.keys),
    ...normalizeStringList(entry?.keysecondary || entry?.secondaryKeys || entry?.secondary),
  ];
  if (entryId) {
    const target = normalizeLookupText(entryId);
    if ([id, title, ...keys].map(normalizeLookupText).includes(target)) return true;
  }
  if (entryTitle) {
    const target = normalizeLookupText(entryTitle);
    if (normalizeLookupText(title) === target || normalizeLookupText(title).includes(target)) return true;
  }
  if (query) {
    const target = normalizeLookupText(query);
    const haystack = [id, title, ...keys, toText(entry?.content)].join('\n').toLowerCase();
    return haystack.includes(target);
  }
  return false;
};

const resolveSessionId = async (deps, args = {}, { useId = true } = {}) => {
  const chatStore = deps.chatStore || {};
  const contactsStore = deps.contactsStore || {};
  const explicitId = toText(args.sessionId);
  if (explicitId) return { sessionId: explicitId, source: 'sessionId', matched: true };

  const query = toText(
    args.sessionName ||
    args.chatName ||
    args.target ||
    (useId ? args.id : ''),
  );
  if (!query) {
    return {
      sessionId: toText(chatStore.getCurrent?.()),
      source: 'current',
      matched: true,
    };
  }

  const ids = asArray(await callMethod(chatStore, 'listSessions')).map(toText).filter(Boolean);
  const exactId = ids.find(id => id === query);
  if (exactId) return { sessionId: exactId, source: 'sessionId', matched: true, query };

  const lowerQuery = normalizeLookupText(query);
  const caseId = ids.find(id => normalizeLookupText(id) === lowerQuery);
  if (caseId) return { sessionId: caseId, source: 'sessionId', matched: true, query };

  for (const id of ids) {
    const contact = await callMethod(contactsStore, 'getContact', id) || null;
    const names = [
      contact?.name,
      contact?.displayName,
      contact?.title,
      contact?.nickname,
      contact?.source?.name,
      contact?.source?.characterName,
    ].map(normalizeLookupText).filter(Boolean);
    if (names.includes(lowerQuery)) {
      return { sessionId: id, source: 'sessionName', matched: true, query };
    }
  }

  return { sessionId: query, source: 'query_fallback', matched: false, query };
};

const createChatReader = deps => async (args = {}) => {
  const chatStore = deps.chatStore || {};
  const session = await resolveSessionId(deps, args, { useId: true });
  const sid = session.sessionId;
  if (!sid) return { ok: false, resource: 'chat', reason: 'missing_session_id' };
  const limit = clampAppResourceLimit(args.limit, 20, 100);
  const maxTextLength = Number(args.maxTextLength || 4000) || 4000;
  const messages = asArray(await callMethod(chatStore, 'getMessages', sid))
    .slice(-limit)
    .map(message => summarizeAppChatMessage(message, maxTextLength));
  const summaries = typeof chatStore.getSummaries === 'function'
    ? asArray(await callMethod(chatStore, 'getSummaries', sid))
    : [];
  return {
    ok: true,
    resource: 'chat',
    sessionId: sid,
    sessionLookup: sanitizeAppResourceValue(session),
    currentSessionId: toText(chatStore.getCurrent?.()),
    count: messages.length,
    messages,
    compactedSummary: typeof chatStore.getCompactedSummary === 'function'
      ? toText(await callMethod(chatStore, 'getCompactedSummary', sid))
      : '',
    summaries: summaries.slice(-10).map(item => sanitizeAppResourceValue(item)),
    settings: sanitizeAppResourceValue(await callMethod(chatStore, 'getSessionSettings', sid) || {}),
  };
};

const createWorldbookReader = deps => async (args = {}) => {
  const bridge = getBridgeFromDeps(deps);
  await callMethod(bridge, 'waitForWorldStoreReady');
  const session = await resolveSessionId(deps, args, { useId: false });
  const sid = session.sessionId;
  const ids = [];
  ids.push(...asArray(await callMethod(bridge, 'getWorldIdsForSession', sid)).map(normalizeWorldId));
  ids.push(...asArray(await callMethod(bridge, 'getCurrentWorldIds', sid)).map(normalizeWorldId));
  ids.push(normalizeWorldId(await callMethod(bridge, 'getCurrentWorldId', sid)));
  ids.push(normalizeWorldId(await callMethod(bridge, 'getGlobalWorldId')));
  const list = asArray(await callMethod(bridge, 'listWorlds')).map(normalizeWorldId);
  const targetWorldId = toText(args.worldbookId || args.name || args.id);
  const uniqueIds = Array.from(new Set([targetWorldId, ...ids, ...list].filter(Boolean)));
  const limit = clampAppResourceLimit(args.limit, 30, 120);
  const maxEntries = clampAppResourceLimit(args.maxEntries, 30, 200);
  const maxContentLength = Number(args.maxContentLength || 2000) || 2000;
  const hasEntryFilter = Boolean(toText(args.entryId || args.entry || args.entryName || args.entryTitle || args.title || args.query));
  const includeContent = args.includeContent === true || hasEntryFilter;
  const worldbooks = [];
  for (const id of uniqueIds.slice(0, limit)) {
    const data = await callMethod(bridge, 'getWorldInfo', id);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const matchedEntries = entries.filter((entry, index) => worldEntryMatches(entry, index, args));
    const returnedEntries = matchedEntries.slice(0, maxEntries);
    worldbooks.push({
      id,
      name: toText(data?.name || id),
      entryCount: entries.length,
      returnedEntryCount: returnedEntries.length,
      truncated: matchedEntries.length > returnedEntries.length,
      contentMode: includeContent ? 'content' : 'summary',
      entries: returnedEntries.map((entry, index) => summarizeWorldbookEntry(entry, index, {
        includeContent,
        maxContentLength,
      })),
    });
  }
  return {
    ok: true,
    resource: 'worldbook',
    contentMode: includeContent ? 'content' : 'summary',
    contentHint: includeContent ? '' : '世界书正文默认省略；需要正文时再次读取并传 includeContent:true、entryId、entryTitle 或 query。',
    sessionId: sid,
    sessionLookup: sanitizeAppResourceValue(session),
    currentWorldIds: Array.from(new Set(ids.filter(Boolean))),
    globalWorldId: normalizeWorldId(await callMethod(bridge, 'getGlobalWorldId')),
    globalSettings: sanitizeAppResourceValue(await callMethod(bridge, 'getWorldGlobalSettings') || {}),
    aiGeneration: readWorldAiGenerationSettings(),
    count: uniqueIds.length,
    worldbooks,
  };
};

const createRegexReader = deps => async (args = {}) => {
  const bridge = getBridgeFromDeps(deps);
  await callMethod(bridge, 'waitForRegexStoreReady');
  const session = await resolveSessionId(deps, args, { useId: false });
  const sid = session.sessionId;
  const sets = asArray(await callMethod(bridge, 'listRegexLocalSets'));
  const targetId = toText(args.id);
  return {
    ok: true,
    resource: 'regex',
    sessionId: sid,
    sessionLookup: sanitizeAppResourceValue(session),
    session: sanitizeAppResourceValue(await callMethod(bridge, 'getRegexSession', sid) || null),
    count: sets.length,
    sets: sets
      .filter(set => !targetId || toText(set?.id) === targetId || toText(set?.name) === targetId)
      .slice(0, clampAppResourceLimit(args.limit, 50, 200))
      .map(set => sanitizeAppResourceValue(set)),
  };
};

const createVariablesReader = deps => async (args = {}) => {
  const chatStore = deps.chatStore || {};
  const session = await resolveSessionId(deps, args, { useId: false });
  const sid = session.sessionId;
  return {
    ok: true,
    resource: 'variables',
    sessionId: sid,
    sessionLookup: sanitizeAppResourceValue(session),
    variables: sanitizeAppResourceValue(await callMethod(chatStore, 'listVariables', sid) || {}),
    initialVariables: sanitizeAppResourceValue(await callMethod(chatStore, 'listInitialVariables', sid) || {}),
    schemas: sanitizeAppResourceValue(await callMethod(chatStore, 'listVariableSchemas', sid) || {}),
    rules: sanitizeAppResourceValue(await callMethod(chatStore, 'listVariableRules', sid) || []),
    globalVariables: sanitizeAppResourceValue(await callMethod(chatStore, 'listGlobalVariables') || {}),
    stageSchema: sanitizeAppResourceValue(await callMethod(chatStore, 'getStageSchema', sid) || null),
  };
};

const createMemoryReader = deps => async (args = {}) => {
  const memoryTemplateStore = deps.memoryTemplateStore || {};
  const memoryTableStore = deps.memoryTableStore || {};
  const session = await resolveSessionId(deps, args, { useId: false });
  const sid = session.sessionId;
  const limit = clampAppResourceLimit(args.limit, 50, 200);
  const templates = asArray(await callMethod(memoryTemplateStore, 'getTemplates', {}));
  const templateId = toText(args.id);
  let rows = [];
  try {
    rows = asArray(await callMethod(memoryTableStore, 'getMemories', {
      template_id: templateId || undefined,
      limit,
    }));
  } catch {
    rows = [];
  }
  return {
    ok: true,
    resource: 'memory',
    sessionId: sid,
    sessionLookup: sanitizeAppResourceValue(session),
    scopeId: toText(memoryTableStore?.scopeId),
    templates: templates.slice(0, limit).map(item => sanitizeAppResourceValue(item)),
    rows: rows.slice(0, limit).map(item => sanitizeAppResourceValue(item)),
  };
};

const createPresetReader = deps => async (args = {}) => {
  const presetStore = deps.presetStore || {};
  const type = toText(args.scope || args.id);
  const session = await resolveSessionId(deps, args, { useId: false });
  const context = {
    sessionId: session.sessionId,
    uiMode: getUiModeFromDeps(deps),
  };
  const types = type ? [type] : ['openai', 'sysprompt', 'context', 'instruct', 'reasoning'];
  const presets = {};
  for (const item of types) {
    const resolved = await callMethod(presetStore, 'getResolvedActive', item, context) || null;
    const resolvedId = await callMethod(presetStore, 'getResolvedActiveId', item, context);
    presets[item] = sanitizeAppResourceValue({
      activeId: resolvedId?.presetId || await callMethod(presetStore, 'getActiveId', item) || '',
      resolved,
    });
  }
  return { ok: true, resource: 'preset', context, sessionLookup: sanitizeAppResourceValue(session), presets };
};

const createConfigReader = deps => async () => {
  const bridge = getBridgeFromDeps(deps);
  const configPanel = deps.configPanel || {};
  const draft = await callMethod(configPanel, 'getDraftConfig', { tab: 'chat' })
    || await callMethod(bridge, 'getConfig')
    || {};
  const activeProfileId = await callMethod(bridge?.config, 'getActiveProfileId') || '';
  return {
    ok: true,
    resource: 'config',
    config: sanitizeAppResourceValue({
      provider: draft.provider,
      model: draft.model,
      baseUrl: draft.baseUrl || draft.baseURL || draft.endpoint,
      transport: draft.transport || draft.transportMode,
      activeProfileId,
    }),
  };
};

const createSessionReader = deps => async (args = {}) => {
  const chatStore = deps.chatStore || {};
  const contactsStore = deps.contactsStore || {};
  const ids = asArray(await callMethod(chatStore, 'listSessions'));
  const target = normalizeLookupText(args.sessionName || args.chatName || args.target || args.query || args.id);
  const limit = clampAppResourceLimit(args.limit, 50, 200);
  const sessions = [];
  for (const id of ids) {
    const contact = await callMethod(contactsStore, 'getContact', id) || null;
    const names = [
      id,
      contact?.name,
      contact?.displayName,
      contact?.title,
      contact?.nickname,
      contact?.source?.name,
      contact?.source?.characterName,
    ].map(normalizeLookupText).filter(Boolean);
    if (target && !names.includes(target)) continue;
    const messages = asArray(await callMethod(chatStore, 'getMessages', id));
    sessions.push(sanitizeAppResourceValue({
      id,
      name: contact?.name || id,
      isGroup: contact?.isGroup === true,
      messageCount: messages.length,
      settings: await callMethod(chatStore, 'getSessionSettings', id) || null,
    }));
    if (sessions.length >= limit) break;
  }
  return {
    ok: true,
    resource: 'session',
    currentSessionId: toText(chatStore.getCurrent?.()),
    count: ids.length,
    sessions,
  };
};

const createProfileReader = (deps, kind = 'persona') => async (args = {}) => {
  const store = kind === 'user' ? deps.userStore || {} : deps.personaStore || {};
  const items = asArray(await callMethod(store, 'getAll'));
  const active = await callMethod(store, 'getActive') || null;
  const target = toText(args.id || args.query);
  const list = target
    ? items.filter(item => toText(item?.id) === target || toText(item?.name) === target)
    : items.slice(0, clampAppResourceLimit(args.limit, 80, 200));
  return {
    ok: true,
    resource: kind,
    activeId: toText(active?.id),
    count: items.length,
    items: list.map(item => sanitizeAppResourceValue(item)),
  };
};

export const createAppResourceReader = (deps = {}) => {
  const readers = {
    chat: createChatReader(deps),
    worldbook: createWorldbookReader(deps),
    regex: createRegexReader(deps),
    variables: createVariablesReader(deps),
    memory: createMemoryReader(deps),
    preset: createPresetReader(deps),
    config: createConfigReader(deps),
    session: createSessionReader(deps),
    persona: createProfileReader(deps, 'persona'),
    user: createProfileReader(deps, 'user'),
  };

  return async (args = {}) => {
    const resource = normalizeAppResourceName(args.resource);
    const reader = readers[resource];
    if (!reader) {
      return {
        ok: false,
        resource,
        reason: 'unsupported_resource',
        supportedResources: [...SUPPORTED_APP_RESOURCES],
      };
    }
    return reader(args);
  };
};
