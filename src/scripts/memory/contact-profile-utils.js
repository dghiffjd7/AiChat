import {
  clampText,
  estimateTokens,
} from './memory-prompt-utils.js';
import {
  formatMemoryPromptText,
  getMemoryPromptClauseSeparator,
  getMemoryPromptListSeparator,
  joinMemoryPromptLabel,
} from './memory-prompt-locale.js';

export const CONTACT_PROFILE_DEFAULT_SETTINGS = Object.freeze({
  weakTriggerEnabled: true,
  memoryWeakTriggerEnabled: true,
  injectProfileHeader: true,
  weakTriggerThreshold: 2,
  weakTriggerHighThreshold: 5,
  profileHeaderThreshold: 5,
  maxCandidates: 6,
  maxInjectedContacts: 3,
  maxRowsPerContact: 3,
  maxProfileHeaderTokens: 120,
  backgroundUpdateEnabled: false,
  backgroundUpdateProfileId: '',
  backgroundAutoSave: false,
  backgroundRequireConfirm: true,
  backgroundSummaryEveryN: 3,
  backgroundOutlineEveryN: 3,
  backgroundMemoryRowsEveryN: 5,
  backgroundMaxTokens: 1200,
});

const normalizeString = value => String(value ?? '').trim();
const normalizeKey = value => normalizeString(value).toLowerCase();

const uniqueStrings = (items = []) => {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : [items]).forEach((item) => {
    const text = normalizeString(item);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
};

const normalizePositiveInteger = (value, fallback, min = 0, max = 1000) => {
  const raw = Math.trunc(Number(value));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
};

const normalizeFiniteNumber = (value, fallback, min = 0, max = 1000) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
};

export const normalizeContactProfileSettings = (settings = {}) => {
  const src = settings && typeof settings === 'object' ? settings : {};
  return {
    ...CONTACT_PROFILE_DEFAULT_SETTINGS,
    weakTriggerEnabled: src.weakTriggerEnabled !== false,
    memoryWeakTriggerEnabled: src.memoryWeakTriggerEnabled !== false,
    injectProfileHeader: src.injectProfileHeader !== false,
    weakTriggerThreshold: normalizeFiniteNumber(
      src.weakTriggerThreshold,
      CONTACT_PROFILE_DEFAULT_SETTINGS.weakTriggerThreshold,
      0,
      100,
    ),
    weakTriggerHighThreshold: normalizeFiniteNumber(
      src.weakTriggerHighThreshold,
      CONTACT_PROFILE_DEFAULT_SETTINGS.weakTriggerHighThreshold,
      0,
      100,
    ),
    profileHeaderThreshold: normalizeFiniteNumber(
      src.profileHeaderThreshold,
      CONTACT_PROFILE_DEFAULT_SETTINGS.profileHeaderThreshold,
      0,
      100,
    ),
    maxCandidates: normalizePositiveInteger(
      src.maxCandidates,
      CONTACT_PROFILE_DEFAULT_SETTINGS.maxCandidates,
      0,
      100,
    ),
    maxInjectedContacts: normalizePositiveInteger(
      src.maxInjectedContacts,
      CONTACT_PROFILE_DEFAULT_SETTINGS.maxInjectedContacts,
      0,
      50,
    ),
    maxRowsPerContact: normalizePositiveInteger(
      src.maxRowsPerContact,
      CONTACT_PROFILE_DEFAULT_SETTINGS.maxRowsPerContact,
      0,
      50,
    ),
    maxProfileHeaderTokens: normalizePositiveInteger(
      src.maxProfileHeaderTokens,
      CONTACT_PROFILE_DEFAULT_SETTINGS.maxProfileHeaderTokens,
      0,
      2000,
    ),
    backgroundUpdateEnabled: src.backgroundUpdateEnabled === true,
    backgroundUpdateProfileId: normalizeString(src.backgroundUpdateProfileId),
    backgroundAutoSave: src.backgroundAutoSave === true,
    backgroundRequireConfirm: src.backgroundRequireConfirm !== false,
    backgroundSummaryEveryN: normalizePositiveInteger(
      src.backgroundSummaryEveryN,
      CONTACT_PROFILE_DEFAULT_SETTINGS.backgroundSummaryEveryN,
      1,
      1000,
    ),
    backgroundOutlineEveryN: normalizePositiveInteger(
      src.backgroundOutlineEveryN,
      CONTACT_PROFILE_DEFAULT_SETTINGS.backgroundOutlineEveryN,
      1,
      1000,
    ),
    backgroundMemoryRowsEveryN: normalizePositiveInteger(
      src.backgroundMemoryRowsEveryN,
      CONTACT_PROFILE_DEFAULT_SETTINGS.backgroundMemoryRowsEveryN,
      1,
      1000,
    ),
    backgroundMaxTokens: normalizePositiveInteger(
      src.backgroundMaxTokens,
      CONTACT_PROFILE_DEFAULT_SETTINGS.backgroundMaxTokens,
      100,
      200000,
    ),
  };
};

const normalizeSourceRefs = refs => uniqueStrings(refs).slice(0, 100);

const normalizeProfileListItems = (items = []) => (
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') {
        const label = normalizeString(item);
        return label ? { label, sourceRefs: [] } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const label = normalizeString(item.label || item.name || item.text || item.value);
      if (!label) return null;
      return {
        ...item,
        label,
        weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : undefined,
        sourceRefs: normalizeSourceRefs(item.sourceRefs),
      };
    })
    .filter(Boolean)
);

export const normalizeContactProfile = (profile = {}) => {
  const src = profile && typeof profile === 'object' ? profile : {};
  const contactId = normalizeString(src.contactId || src.contact_id || src.sessionId || src.id);
  const displayName = normalizeString(src.displayName || src.name || src.label || contactId);
  if (!contactId && !displayName) return null;
  const relationship = src.relationship && typeof src.relationship === 'object' && !Array.isArray(src.relationship)
    ? src.relationship
    : {};
  return {
    id: normalizeString(src.id || contactId || displayName),
    contactId: contactId || displayName,
    scopeId: normalizeString(src.scopeId || src.scope_id),
    displayName: displayName || contactId,
    aliases: uniqueStrings([
      ...(Array.isArray(src.aliases) ? src.aliases : []),
      src.alias,
      src.nickname,
      src.remark,
    ]),
    relationship: {
      current: normalizeString(relationship.current),
      user_dynamic: normalizeString(relationship.user_dynamic || relationship.userDynamic),
      confidence: Number.isFinite(Number(relationship.confidence))
        ? Math.max(0, Math.min(1, Number(relationship.confidence)))
        : undefined,
      sourceRefs: normalizeSourceRefs(relationship.sourceRefs),
    },
    stable_traits: normalizeProfileListItems(src.stable_traits || src.stableTraits),
    important_events: normalizeProfileListItems(src.important_events || src.importantEvents),
    interaction_focus: uniqueStrings(src.interaction_focus || src.interactionFocus).slice(0, 50),
    trigger_keywords: uniqueStrings(src.trigger_keywords || src.triggerKeywords).slice(0, 100),
    negative_or_sensitive: uniqueStrings(src.negative_or_sensitive || src.negativeOrSensitive).slice(0, 50),
    updatedAt: Number.isFinite(Number(src.updatedAt || src.updated_at))
      ? Number(src.updatedAt || src.updated_at)
      : Date.now(),
    version: normalizePositiveInteger(src.version, 1, 1, 1000000),
    sourceRefs: normalizeSourceRefs(src.sourceRefs),
  };
};

const CJK_RE = /[\u3400-\u9fff]/;
const SPLIT_RE = /[\s\r\n\t,，.。!！?？;；:：、/\\|()[\]{}<>《》"'“”‘’`~@#%^&*_+=，]+/g;
const STOP_TERMS = new Set([
  '今天',
  '这个',
  '那个',
  '一下',
  '我们',
  '你们',
  '他们',
  '她们',
  '因为',
  '所以',
  '还是',
  '可以',
  '不是',
  '没有',
  '感觉',
  '时候',
  '动态',
  '评论',
  '回复',
  '真的',
  '现在',
]);

export const extractWeakTriggerTerms = (text = '') => {
  const source = normalizeKey(text);
  if (!source) return [];
  const terms = new Set();
  const chunks = source.split(SPLIT_RE).map(item => item.trim()).filter(Boolean);
  chunks.forEach((chunk) => {
    if (chunk.length >= 2 && chunk.length <= 40 && !STOP_TERMS.has(chunk)) terms.add(chunk);
    if (!CJK_RE.test(chunk)) return;
    const chars = Array.from(chunk);
    for (let size = 2; size <= 4; size += 1) {
      if (chars.length < size) continue;
      for (let i = 0; i <= chars.length - size; i += 1) {
        const term = chars.slice(i, i + size).join('');
        if (!STOP_TERMS.has(term)) terms.add(term);
      }
    }
  });
  return Array.from(terms);
};

const termMatchesSource = ({ sourceKey, sourceTerms, term, allowShort = false }) => {
  const key = normalizeKey(term);
  if (!key) return false;
  if (!allowShort && key.length < 2) return false;
  if (sourceKey.includes(key)) return true;
  if (sourceTerms.has(key)) return true;
  return Array.from(sourceTerms).some(sourceTerm => sourceTerm.length >= 2 && key.includes(sourceTerm));
};

const collectProfileFields = (profile = {}) => {
  const relationship = profile.relationship || {};
  return [
    { field: 'displayName', weight: 3, reason: 'alias', allowShort: true, terms: [profile.displayName, profile.contactId, ...(profile.aliases || [])] },
    { field: 'trigger_keywords', weight: 3, reason: 'keyword_match', terms: profile.trigger_keywords || [] },
    { field: 'interaction_focus', weight: 2, reason: 'profile_tag_match', terms: profile.interaction_focus || [] },
    { field: 'stable_traits', weight: 2, reason: 'profile_tag_match', terms: (profile.stable_traits || []).map(item => item.label) },
    { field: 'important_events', weight: 2, reason: 'profile_tag_match', terms: (profile.important_events || []).map(item => item.label) },
    { field: 'relationship', weight: 1, reason: 'profile_tag_match', terms: [relationship.current, relationship.user_dynamic] },
    { field: 'negative_or_sensitive', weight: 1, reason: 'profile_tag_match', terms: profile.negative_or_sensitive || [] },
  ];
};

const scoreProfile = ({ profile, sourceKey, sourceTerms }) => {
  const matchedFields = [];
  const matchedTerms = [];
  const reasons = new Set();
  let score = 0;
  collectProfileFields(profile).forEach((field) => {
    const hits = [];
    uniqueStrings(field.terms).forEach((term) => {
      if (!termMatchesSource({ sourceKey, sourceTerms, term, allowShort: field.allowShort })) return;
      hits.push(term);
    });
    if (!hits.length) return;
    const cappedHits = hits.slice(0, 3);
    score += field.weight * cappedHits.length;
    matchedFields.push(field.field);
    matchedTerms.push(...cappedHits);
    reasons.add(field.reason);
  });
  return {
    score,
    matchedFields: uniqueStrings(matchedFields),
    matchedTerms: uniqueStrings(matchedTerms),
    reasons: Array.from(reasons),
  };
};

const normalizeMemoryRecord = (record = {}) => {
  if (!record || typeof record !== 'object') return null;
  const contactId = normalizeString(record.contactId || record.sourceId || record.sessionId || record.id);
  if (!contactId) return null;
  return {
    contactId,
    contactName: normalizeString(record.contactName || record.sourceName || record.name || contactId),
    aliases: uniqueStrings(record.aliases || []),
    rows: (Array.isArray(record.rows) ? record.rows : [])
      .map((row) => {
        const raw = row?.row && typeof row.row === 'object' ? row.row : row;
        const id = normalizeString(row?.id || raw?.id);
        const tableId = normalizeString(row?.tableId || raw?.table_id || raw?.tableId);
        const rowText = normalizeString(row?.rowText || row?.text || row?.summary);
        if (!rowText) return null;
        return {
          id,
          tableId,
          tableName: normalizeString(row?.tableName || row?.label || tableId),
          rowText,
          rowSummary: clampText(row?.rowSummary || rowText, 120),
          updatedAt: Number.isFinite(Number(row?.updatedAt || raw?.updated_at))
            ? Number(row?.updatedAt || raw?.updated_at)
            : 0,
          sourceRef: normalizeString(row?.sourceRef || (id ? `memory_row:${id}` : '')),
        };
      })
      .filter(Boolean),
  };
};

const scoreMemoryRows = ({ rows = [], sourceTerms, maxRows = 3 }) => {
  const scored = [];
  rows.forEach((row) => {
    const rowKey = normalizeKey(row?.rowText);
    if (!rowKey) return;
    const hits = [];
    sourceTerms.forEach((term) => {
      const key = normalizeKey(term);
      if (key.length < 2 || STOP_TERMS.has(key)) return;
      if (rowKey.includes(key)) hits.push(term);
    });
    const uniqueHits = uniqueStrings(hits).slice(0, 5);
    if (!uniqueHits.length) return;
    scored.push({
      ...row,
      score: uniqueHits.length,
      matchedTerms: uniqueHits,
    });
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return scored.slice(0, Math.max(0, maxRows));
};

export const buildContactProfileHeader = (profile = {}, {
  maxTokens = CONTACT_PROFILE_DEFAULT_SETTINGS.maxProfileHeaderTokens,
  tokenMode = 'rough',
} = {}) => {
  const p = normalizeContactProfile(profile);
  if (!p) return '';
  const name = p.displayName || p.contactId;
  const parts = [];
  const current = normalizeString(p.relationship?.current);
  if (current) parts.push(current);
  const listSeparator = getMemoryPromptListSeparator();
  const focus = uniqueStrings(p.interaction_focus).slice(0, 2);
  if (focus.length) parts.push(formatMemoryPromptText(
    'memory.profile.recent_topics',
    '近期主题：{values}',
    { values: focus.join(listSeparator) },
  ));
  const traits = (p.stable_traits || []).map(item => normalizeString(item.label)).filter(Boolean).slice(0, 2);
  if (traits.length) parts.push(formatMemoryPromptText(
    'memory.profile.stable_traits',
    '稳定特征：{values}',
    { values: traits.join(listSeparator) },
  ));
  const events = (p.important_events || []).map(item => normalizeString(item.label)).filter(Boolean).slice(0, 1);
  if (events.length) parts.push(formatMemoryPromptText(
    'memory.profile.important_events',
    '重要事件：{values}',
    { values: events.join(listSeparator) },
  ));
  let text = joinMemoryPromptLabel(name, parts.join(getMemoryPromptClauseSeparator())).trim();
  if (estimateTokens(text, tokenMode) <= maxTokens) return text;
  while (parts.length > 1 && estimateTokens(text, tokenMode) > maxTokens) {
    parts.pop();
    text = joinMemoryPromptLabel(name, parts.join(getMemoryPromptClauseSeparator())).trim();
  }
  return clampText(text, Math.max(40, maxTokens * 2));
};

export const resolveContactProfileWeakTriggers = ({
  text = '',
  profiles = [],
  records = [],
  settings = {},
  scopeId = '',
} = {}) => {
  const normalizedSettings = normalizeContactProfileSettings(settings);
  const sourceKey = normalizeKey(text);
  const sourceTerms = new Set(extractWeakTriggerTerms(text));
  const normalizedProfiles = (Array.isArray(profiles) ? profiles : [])
    .map(normalizeContactProfile)
    .filter(Boolean);
  const profileByContact = new Map();
  normalizedProfiles.forEach((profile) => {
    const key = normalizeString(profile.contactId);
    if (key && !profileByContact.has(key)) profileByContact.set(key, profile);
  });
  const normalizedRecords = (Array.isArray(records) ? records : [])
    .map(normalizeMemoryRecord)
    .filter(Boolean);
  const recordByContact = new Map();
  normalizedRecords.forEach((record) => {
    if (!recordByContact.has(record.contactId)) recordByContact.set(record.contactId, record);
  });
  const allContactIds = Array.from(new Set([
    ...normalizedProfiles.map(profile => profile.contactId),
    ...normalizedRecords.map(record => record.contactId),
  ].filter(Boolean)));

  const threshold = normalizedSettings.weakTriggerThreshold;
  const maxRows = normalizedSettings.memoryWeakTriggerEnabled === false ? 0 : normalizedSettings.maxRowsPerContact;
  const candidates = allContactIds.map((contactId, index) => {
    const profile = profileByContact.get(contactId) || null;
    const record = recordByContact.get(contactId) || null;
    const displayName = normalizeString(profile?.displayName || record?.contactName || contactId);
    const syntheticProfile = profile || normalizeContactProfile({
      contactId,
      displayName,
      aliases: record?.aliases || [],
    });
    const profileScore = normalizedSettings.weakTriggerEnabled === false
      ? { score: 0, matchedFields: [], matchedTerms: [], reasons: [] }
      : scoreProfile({ profile: syntheticProfile, sourceKey, sourceTerms });
    const rowMatches = maxRows > 0
      ? scoreMemoryRows({ rows: record?.rows || [], sourceTerms, maxRows })
      : [];
    const rowScore = rowMatches.reduce((sum, row) => sum + Math.min(3, Number(row.score) || 0), 0);
    const score = profileScore.score + rowScore;
    const rowTerms = rowMatches.flatMap(row => row.matchedTerms || []);
    const matchedTerms = uniqueStrings([...profileScore.matchedTerms, ...rowTerms]);
    const reasons = new Set(profileScore.reasons || []);
    if (rowMatches.length) reasons.add('memory_row_match');
    const status = score >= threshold ? 'active' : 'blocked';
    return {
      contactId,
      name: displayName || contactId,
      scopeId: normalizeString(profile?.scopeId || scopeId),
      profileId: profile?.id || '',
      hasProfile: Boolean(profile),
      score,
      status,
      blockedReason: status === 'blocked' ? 'threshold_block' : '',
      reasons: Array.from(reasons),
      matchedFields: profileScore.matchedFields,
      matchedTerms,
      matchedRows: rowMatches,
      profileHeader: profile ? buildContactProfileHeader(profile, normalizedSettings) : '',
      sourceRefs: normalizeSourceRefs([
        ...(profile?.sourceRefs || []),
        ...rowMatches.map(row => row.sourceRef).filter(Boolean),
      ]),
      index,
    };
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  const limitedCandidates = candidates.slice(0, normalizedSettings.maxCandidates);
  const selectedSources = limitedCandidates
    .filter(item => item.status === 'active')
    .slice(0, normalizedSettings.maxInjectedContacts);
  const injectedRows = selectedSources.flatMap(source => (
    (source.matchedRows || []).map(row => ({
      contactId: source.contactId,
      contactName: source.name,
      score: row.score,
      matchedTerms: row.matchedTerms || [],
      row,
    }))
  ));

  return {
    enabled: normalizedSettings.weakTriggerEnabled !== false || normalizedSettings.memoryWeakTriggerEnabled !== false,
    scopeId: normalizeString(scopeId),
    threshold,
    highThreshold: normalizedSettings.weakTriggerHighThreshold,
    profileHeaderThreshold: normalizedSettings.profileHeaderThreshold,
    candidates: limitedCandidates.map(({ index, ...item }) => item),
    selectedSources: selectedSources.map(({ index, ...item }) => item),
    blockedCandidates: limitedCandidates.filter(item => item.status === 'blocked').map(({ index, ...item }) => item),
    injectedRows,
  };
};

export const buildContactProfileWeakTriggerPrompt = (resolution = {}, {
  settings = {},
} = {}) => {
  const normalizedSettings = normalizeContactProfileSettings(settings);
  const selected = Array.isArray(resolution?.selectedSources) ? resolution.selectedSources : [];
  if (!selected.length) return '';
  const lines = [
    formatMemoryPromptText('memory.profile.weak_header', '【动态弱触发｜联系人记忆】'),
    formatMemoryPromptText(
      'memory.profile.weak_note',
      '以下内容仅用于理解本次动态/评论相关上下文；不要向无关对象泄露私聊信息。',
    ),
  ];
  selected.forEach((source) => {
    const name = normalizeString(source?.name || source?.contactId)
      || formatMemoryPromptText('memory.profile.unknown_contact', '未知联系人');
    const rows = Array.isArray(source?.matchedRows) ? source.matchedRows : [];
    const profileHeader = normalizeString(source?.profileHeader);
    const allowHeader =
      normalizedSettings.injectProfileHeader !== false &&
      profileHeader &&
      Number(source?.score || 0) >= normalizedSettings.profileHeaderThreshold;
    if (!allowHeader && !rows.length) return;
    lines.push(`【${name}】`);
    if (allowHeader) lines.push(formatMemoryPromptText(
      'memory.profile.profile_line',
      '- 画像：{profile}',
      { profile: profileHeader },
    ));
    rows.forEach((row) => {
      const label = normalizeString(row?.tableName || row?.tableId);
      const text = normalizeString(row?.rowSummary || row?.rowText);
      if (!text) return;
      lines.push(`- ${label ? `${joinMemoryPromptLabel(label, '')}` : ''}${text}`);
    });
  });
  return lines.length > 2 ? lines.join('\n').trim() : '';
};
