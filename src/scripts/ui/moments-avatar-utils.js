import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';

export const resolveMomentContactAvatar = (contact, { fallbackName = '', defaultAvatar = '' } = {}) => {
  const target = contact || {};
  const name = String(target?.name || fallbackName || target?.id || '').trim() || '未知';
  const tags = Array.isArray(target?.libraryTags) && target.libraryTags.length
    ? target.libraryTags
    : Array.isArray(target?.labels)
      ? target.labels
      : [];
  return resolveLineAvatar({
    avatar: target?.avatar || defaultAvatar || FEATHER_DEFAULT,
    name,
    tags,
    size: 96,
  });
};

export const getMomentAvatarByName = (
  name,
  {
    contactsStore = null,
    defaultAvatar = '',
    userAvatar = '',
    resolveContactAvatar = resolveMomentContactAvatar,
  } = {},
) => {
  const raw = String(name || '').trim();
  const fallbackAvatar = defaultAvatar || FEATHER_DEFAULT;
  if (!raw) {
    return resolveLineAvatar({ avatar: fallbackAvatar, name: '未知', tags: [], size: 96 });
  }
  if (raw === '我' || raw.toLowerCase() === 'user' || raw === '用户') {
    return userAvatar || fallbackAvatar;
  }
  try {
    const byId = contactsStore?.getContact?.(raw);
    if (byId) return resolveContactAvatar(byId, { fallbackName: raw, defaultAvatar: fallbackAvatar });
  } catch {}
  const normalize = value =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  const normalizeLoose = value => normalize(value).replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
  const key = normalize(raw);
  const looseKey = normalizeLoose(raw);
  try {
    const list = contactsStore?.listContacts?.() || [];
    const exact = list.find(item => String(item?.name || '').trim() === raw || String(item?.id || '').trim() === raw);
    if (exact) return resolveContactAvatar(exact, { fallbackName: raw, defaultAvatar: fallbackAvatar });
    const fuzzy = list.find(item => normalize(item?.name) === key || normalize(item?.id) === key);
    if (fuzzy) return resolveContactAvatar(fuzzy, { fallbackName: raw, defaultAvatar: fallbackAvatar });
    const loose = list.find(item => normalizeLoose(item?.name) === looseKey || normalizeLoose(item?.id) === looseKey);
    if (loose) return resolveContactAvatar(loose, { fallbackName: raw, defaultAvatar: fallbackAvatar });
    return resolveLineAvatar({ avatar: fallbackAvatar, name: raw, tags: [], size: 96 });
  } catch {
    return resolveLineAvatar({ avatar: fallbackAvatar, name: raw, tags: [], size: 96 });
  }
};

export const resolveMomentAvatar = (
  moment,
  {
    contactsStore = null,
    defaultAvatar = '',
    userAvatar = '',
    resolveContactAvatar = resolveMomentContactAvatar,
    getAvatarByName = getMomentAvatarByName,
  } = {},
) => {
  const target = moment || {};
  const snapshot = String(target?.authorAvatar || '').trim();
  if (snapshot) {
    return resolveLineAvatar({
      avatar: snapshot,
      name: target?.author || target?.authorId || target?.originSessionId || '',
      tags: [],
      size: 96,
    });
  }
  const authorId = String(target?.authorId || '').trim();
  const fallbackAvatar = defaultAvatar || FEATHER_DEFAULT;
  if (authorId === 'user') return userAvatar || fallbackAvatar;
  if (authorId) {
    try {
      const contact = contactsStore?.getContact?.(authorId);
      if (contact) return resolveContactAvatar(contact, { fallbackName: authorId, defaultAvatar: fallbackAvatar });
    } catch {}
  }
  const originSessionId = String(target?.originSessionId || '').trim();
  if (originSessionId) {
    try {
      const contact = contactsStore?.getContact?.(originSessionId);
      if (contact) return resolveContactAvatar(contact, { fallbackName: originSessionId, defaultAvatar: fallbackAvatar });
    } catch {}
  }
  return getAvatarByName(target?.author, {
    contactsStore,
    defaultAvatar: fallbackAvatar,
    userAvatar,
    resolveContactAvatar,
  });
};
