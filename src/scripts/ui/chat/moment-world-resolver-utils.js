import { estimateTokens } from '../../memory/memory-prompt-utils.js';

const normalizeText = value => String(value || '').trim();

const isInternalSessionId = value => normalizeText(value).toLowerCase().startsWith('rp:');

const normalizeNameKey = value => normalizeText(value).toLowerCase();

export const normalizeMomentMentionTarget = (value = {}) => {
  if (!value || typeof value !== 'object') return null;
  const id = normalizeText(value.id || value.sessionId || value.contactId || value.groupId);
  const name = normalizeText(value.name || value.label || id);
  if (!id && !name) return null;
  if (isInternalSessionId(id) || isInternalSessionId(name)) return null;
  const isGroup = value.type === 'group' || value.isGroup === true || id.startsWith('group:');
  return {
    id,
    name: name || id,
    type: isGroup ? 'group' : 'contact',
  };
};

const getContactAliases = (contact = {}) => {
  const values = [
    contact?.name,
    contact?.id,
    contact?.alias,
    contact?.nickname,
    contact?.remark,
    contact?.displayName,
    ...(Array.isArray(contact?.aliases) ? contact.aliases : []),
    ...(Array.isArray(contact?.sourceAliases) ? contact.sourceAliases : []),
  ];
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
};

const normalizeContactTarget = (contact = {}) => {
  if (!contact || typeof contact !== 'object') return null;
  const id = normalizeText(contact.id);
  const name = normalizeText(contact.name || id);
  if (!id && !name) return null;
  if (isInternalSessionId(id) || isInternalSessionId(name)) return null;
  const isGroup = contact.type === 'group' || contact.isGroup === true || id.startsWith('group:');
  return {
    id,
    name: name || id,
    type: isGroup ? 'group' : 'contact',
    aliases: getContactAliases(contact),
  };
};

const listMomentContactTargets = (contactsStore = null, contacts = null) => {
  const rawStoreContacts = contactsStore?.listContacts?.();
  const rawStoreGroups = contactsStore?.listGroups?.();
  const storeContacts = Array.isArray(rawStoreContacts)
    ? rawStoreContacts
    : [];
  const storeGroups = Array.isArray(rawStoreGroups)
    ? rawStoreGroups.map((group) => {
        const rawId = String(group?.id || '').trim();
        return {
          ...(group || {}),
          id: rawId && !rawId.startsWith('group:') ? `group:${rawId}` : rawId,
          isGroup: true,
        };
      })
    : [];
  const raw = Array.isArray(contacts)
    ? contacts
    : [...storeContacts, ...storeGroups];
  const seen = new Set();
  return raw
    .map(normalizeContactTarget)
    .filter((target) => {
      const key = normalizeText(target?.id || target?.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const addUniqueTarget = (out, value) => {
  const target = normalizeMomentMentionTarget(value);
  if (!target) return false;
  const key = `${target.type}:${normalizeText(target.id || target.name)}`;
  if (out.some(item => `${item.type}:${normalizeText(item.id || item.name)}` === key)) return false;
  out.push(target);
  return true;
};

export const buildMomentStructuredMentions = ({
  text = '',
  selectedMentions = [],
  contactsStore = null,
  contacts = null,
} = {}) => {
  const out = [];
  const source = String(text || '').toLowerCase();
  const selectedList = Array.isArray(selectedMentions) ? selectedMentions : [];
  selectedList.forEach((item) => {
    const target = normalizeMomentMentionTarget(item);
    if (!target) return;
    const nameKey = normalizeNameKey(target.name);
    const idKey = normalizeNameKey(target.id);
    if (
      source &&
      !source.includes(`@${nameKey}`) &&
      (!idKey || !source.includes(`@${idKey}`))
    ) {
      return;
    }
    addUniqueTarget(out, target);
  });
  if (source.includes('@')) {
    listMomentContactTargets(contactsStore, contacts).forEach((target) => {
      const aliases = Array.isArray(target.aliases) ? target.aliases : [];
      const matched = aliases.some(alias => alias && source.includes(`@${normalizeNameKey(alias)}`));
      if (matched) addUniqueTarget(out, target);
    });
  }
  return out;
};

const containsExactName = (text = '', name = '') => {
  const source = normalizeNameKey(text);
  const key = normalizeNameKey(name);
  if (!source || !key) return false;
  return source.includes(key);
};

const reasonPriority = {
  mention: 0,
  exact_name: 1,
  reply_target: 2,
  comment_author: 3,
  publish_target: 3,
};

const normalizeReason = reason => normalizeText(reason) || 'exact_name';

export const resolveMomentWorldStrongSources = ({
  text = '',
  mentions = [],
  contactsStore = null,
  contacts = null,
  targetSessionId = '',
  targetName = '',
  replyToAuthor = '',
  mode = '',
  maxSources = 3,
  getWorldIdsForSession = () => [],
} = {}) => {
  const contactTargets = listMomentContactTargets(contactsStore, contacts);
  const byId = new Map(contactTargets.map(target => [normalizeText(target.id), target]));
  const byName = new Map();
  contactTargets.forEach((target) => {
    (Array.isArray(target.aliases) ? target.aliases : [target.name]).forEach((alias) => {
      const key = normalizeNameKey(alias);
      if (key && !byName.has(key)) byName.set(key, target);
    });
  });

  const candidates = [];
  const addCandidate = (rawTarget, reason) => {
    const normalized = normalizeMomentMentionTarget(rawTarget);
    if (!normalized) return;
    const fromId = byId.get(normalizeText(normalized.id));
    const fromName = byName.get(normalizeNameKey(normalized.name));
    const target = fromId || fromName || normalized;
    const sessionId = normalizeText(target.id || normalized.id);
    if (!sessionId) return;
    const key = `${target.type || normalized.type}:${sessionId}`;
    const existing = candidates.find(item => item.key === key);
    const nextReason = normalizeReason(reason);
    if (existing) {
      if (!existing.reasons.includes(nextReason)) existing.reasons.push(nextReason);
      existing.priority = Math.min(existing.priority, reasonPriority[nextReason] ?? 9);
      return;
    }
    candidates.push({
      key,
      sessionId,
      name: normalizeText(target.name || normalized.name || sessionId),
      type: target.type || normalized.type,
      reasons: [nextReason],
      priority: reasonPriority[nextReason] ?? 9,
    });
  };

  (Array.isArray(mentions) ? mentions : []).forEach(mention => addCandidate(mention, 'mention'));

  const sourceText = String(text || '');
  if (sourceText.trim()) {
    contactTargets.forEach((target) => {
      const aliases = Array.isArray(target.aliases) ? target.aliases : [];
      if (aliases.some(alias => containsExactName(sourceText, alias))) {
        addCandidate(target, 'exact_name');
      }
    });
  }

  const targetId = normalizeText(targetSessionId);
  if (targetId) {
    const target = byId.get(targetId) || {
      id: targetId,
      name: normalizeText(targetName || targetId),
      type: targetId.startsWith('group:') ? 'group' : 'contact',
    };
    const taskMode = normalizeText(mode).toLowerCase();
    const reason = replyToAuthor
      ? 'reply_target'
      : (taskMode === 'published_moment' || taskMode === 'moment_publish' || taskMode === 'publish_comment'
          ? 'publish_target'
          : 'comment_author');
    addCandidate(target, reason);
  }

  const withWorlds = candidates
    .map((item, index) => {
      const rawWorldIds = getWorldIdsForSession(item.sessionId);
      const worldIds = Array.from(new Set(
        (Array.isArray(rawWorldIds) ? rawWorldIds : [])
          .map(normalizeText)
          .filter(Boolean),
      ));
      return {
        ...item,
        index,
        worldIds,
      };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.index - b.index;
    });

  const selectedSources = withWorlds
    .filter(item => item.worldIds.length > 0)
    .slice(0, Math.max(0, Math.trunc(Number(maxSources) || 0)));

  return {
    candidates: withWorlds,
    selectedSources,
  };
};

export const resolveMomentSessionWorldBudgetTokens = (
  worldBudgetTokens,
  {
    ratio = 0.3,
    fallback = 1600,
    max = 2000,
  } = {},
) => {
  const base = Number(worldBudgetTokens);
  if (Number.isFinite(base) && base > 0) {
    return Math.max(0, Math.min(Math.trunc(Number(max) || 0), Math.floor(base * ratio)));
  }
  return Math.max(0, Math.trunc(Number(fallback) || 0));
};

export const limitMomentWorldEntriesByBudget = (
  entries = [],
  {
    budgetTokens = 1600,
    tokenMode = 'rough',
  } = {},
) => {
  const list = Array.isArray(entries) ? entries : [];
  const budget = Math.max(0, Math.trunc(Number(budgetTokens) || 0));
  if (!budget) {
    return {
      entries: [],
      trimmedEntries: list.slice(),
      usedTokens: 0,
      budgetTokens: budget,
      overflowed: list.length > 0,
    };
  }
  let usedTokens = 0;
  const kept = [];
  const trimmed = [];
  list.forEach((entry) => {
    const cost = estimateTokens(String(entry?.content || ''), tokenMode);
    if (usedTokens + cost > budget) {
      trimmed.push(entry);
      return;
    }
    usedTokens += cost;
    kept.push(entry);
  });
  return {
    entries: kept,
    trimmedEntries: trimmed,
    usedTokens,
    budgetTokens: budget,
    overflowed: trimmed.length > 0,
  };
};
