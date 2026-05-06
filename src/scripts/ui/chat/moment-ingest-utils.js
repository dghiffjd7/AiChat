export const resolveMomentAuthorId = (
  authorName,
  {
    userName = '',
    sessionId = '',
    characterName = '',
    normalizeName = value => String(value || '').trim(),
    normalizeLoose = value => String(value || '').trim(),
    getContactById = () => null,
    listContacts = () => [],
  } = {},
) => {
  const raw = normalizeName(authorName);
  if (!raw) return '';
  if (raw === userName) return 'user';
  if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者') return sessionId;

  const charLoose = normalizeLoose(characterName);
  const rawLoose = normalizeLoose(raw);
  if (
    rawLoose &&
    charLoose &&
    (rawLoose === charLoose || rawLoose.includes(charLoose) || charLoose.includes(rawLoose))
  ) {
    return sessionId;
  }

  const byId = getContactById(raw);
  if (byId?.id) return byId.id;

  const list = Array.isArray(listContacts()) ? listContacts() : [];
  const exact = list.find(contact => normalizeName(contact?.name) === raw);
  if (exact?.id) return exact.id;

  const key = normalizeLoose(raw);
  const fuzzy = list.find(contact => (
    normalizeLoose(contact?.name) === key || normalizeLoose(contact?.id) === key
  ));
  if (fuzzy?.id) return fuzzy.id;

  let best = null;
  let bestLen = 0;
  for (const contact of list) {
    const contactName = normalizeLoose(contact?.name);
    if (!contactName) continue;
    if (key.includes(contactName) || contactName.includes(key)) {
      const len = Math.min(contactName.length, key.length);
      if (len > bestLen) {
        bestLen = len;
        best = contact;
      }
    }
  }
  return best?.id || '';
};

export const normalizeMomentAuthorDisplay = (
  authorName,
  {
    userName = '',
    characterName = '',
    normalizeName = value => String(value || '').trim(),
  } = {},
) => {
  const raw = normalizeName(authorName);
  if (!raw) return normalizeName(characterName) || '角色';
  if (raw === userName) return userName;
  if (raw === '发言人' || raw === '角色' || raw === '角色名' || raw === '作者') {
    return normalizeName(characterName) || raw;
  }
  return raw;
};

export const ingestMomentsForStore = (
  moments = [],
  {
    contactCount = 0,
    userAvatar = '',
    sessionId = '',
    normalizeAuthorDisplay = value => String(value || '').trim(),
    resolveAuthorId = () => '',
    resolveContactAvatar = () => '',
    normalizeStats = (stats) => stats,
    normalizeMomentRecord = value => value,
  } = {},
) => {
  const list = Array.isArray(moments) ? moments : [];
  return list.map(moment => {
    const author = normalizeAuthorDisplay(moment?.author);
    const authorId = resolveAuthorId(author);
    let authorAvatar = '';
    if (authorId === 'user') authorAvatar = userAvatar;
    else if (authorId) authorAvatar = resolveContactAvatar(authorId);
    const stats = normalizeStats({ views: moment?.views, likes: moment?.likes }, contactCount);
    return normalizeMomentRecord(
      { ...(moment || {}), ...stats, author, authorId, authorAvatar, originSessionId: sessionId },
      { regexMode: 'output', depth: 0 },
    );
  });
};
